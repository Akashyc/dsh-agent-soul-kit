import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

export const KIT_REPO = 'Akashyc/dsh-agent-soul-kit'

/**
 * 执行 Git，禁用交互、仓库钩子和自动 stash；错误不回显可能含认证信息的地址。
 * @param directory Git 工作目录
 * @param args Git 参数数组
 * @param options hooks 为临时空钩子目录；proxy 为可选代理；allowFailure 用于状态探测
 * @returns Git 输出及退出码；必需命令失败时抛错
 */
function git(directory, args, { hooks, proxy, allowFailure = false } = {}) {
  const config = ['-c', 'core.fsmonitor=false', '-c', 'submodule.recurse=false']
  if (hooks) {
    config.push('-c', `core.hooksPath=${hooks}`)
  }
  if (proxy !== undefined) {
    config.push('-c', `http.proxy=${proxy || ''}`)
  }
  const result = spawnSync('git', ['--no-optional-locks', '-C', directory, ...config, ...args], {
    encoding: 'utf8', timeout: 60000, maxBuffer: 32 * 1024 * 1024, windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  })
  if (!allowFailure && result.status !== 0) {
    throw new Error(`Git ${args[0]} 失败（${result.error?.code || result.status}）；请检查 Git、网络、代理和仓库访问权限，本次不标记为已更新`)
  }
  return { status: result.status, text: (result.stdout || '').trim(), raw: result.stdout || '' }
}

/**
 * 从常见 GitHub remote 写法提取仓库身份，不输出认证信息。
 * @param remote Git remote 地址
 * @returns owner/repo；非 GitHub 地址返回 null
 */
function githubRepo(remote) {
  const match = remote.match(/^(?:https:\/\/(?:[^/@]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+\/[^/]+?)\/?$/i)
  return match ? match[1].replace(/\.git$/i, '').toLowerCase() : null
}

/**
 * 枚举下载版的源码文件，排除本机日志、备份和 Git 内部数据。
 * @param directory 要扫描的 kit 目录
 * @param prefix 相对路径前缀
 * @returns 相对文件路径数组
 */
function sourceFiles(directory, prefix = '') {
  return fs.readdirSync(path.join(directory, prefix), { withFileTypes: true }).flatMap((entry) => {
    if (['.git', 'logs', 'backups', 'node_modules', '.DS_Store'].includes(entry.name)) {
      return []
    }
    const file = prefix ? `${prefix}/${entry.name}` : entry.name
    return entry.isDirectory() ? sourceFiles(directory, file) : [file]
  })
}

/**
 * 对源码文件和链接生成指纹，不跟随符号链接读取目录外内容。
 * @param directory 源码根目录
 * @param file 相对文件路径
 * @returns 文件指纹；缺失或路径被目录替代时返回 null
 */
function fingerprint(directory, file) {
  const absolute = path.join(directory, file)
  let current = directory
  for (const part of file.split('/').slice(0, -1)) {
    current = path.join(current, part)
    if (!fs.existsSync(current) || !fs.lstatSync(current).isDirectory()) {
      return null
    }
  }
  const stat = fs.lstatSync(absolute, { throwIfNoEntry: false })
  if (!stat) {
    return null
  }
  if (stat.isSymbolicLink()) {
    return `link:${fs.readlinkSync(absolute)}`
  }
  if (!stat.isFile()) {
    return null
  }
  return createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')
}

/**
 * 检查 kit 自身发布源；仅在干净、同源且可快进时更新本地 Git 工作区。
 * @param options kit 为本地根目录；repo/ref 为 kit 发布源，独立于插件上游；source 为离线 Git 仓库
 * @param options.dryRun 只在临时目录检查；output 为证据父目录；proxy 沿用安装器代理设置
 * @returns 状态、固定提交、差异与证据目录；ready 表示可继续使用当前进程分析上游
 */
export function updateKit({ kit, repo = KIT_REPO, ref, source, dryRun = false, output, proxy }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    throw new Error('--kit-repo 必须是 GitHub owner/repo')
  }
  const targetRef = ref || (source ? 'HEAD' : 'main')
  if (targetRef.startsWith('-') || /[\s:]/.test(targetRef)) {
    throw new Error('--kit-ref 不是有效的分支、标签或提交')
  }
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'soul-kit-update-'))
  const target = path.join(temporary, 'target')
  const hooks = path.join(temporary, 'hooks')
  fs.mkdirSync(target)
  fs.mkdirSync(hooks)
  const options = { hooks, ...(proxy !== undefined ? { proxy } : {}) }

  try {
    const remote = source ? path.resolve(source) : `https://github.com/${repo}.git`
    if (source) {
      const status = git(remote, ['status', '--porcelain', '--untracked-files=all'], options)
      if (status.text) {
        throw new Error('--kit-source 必须是干净的 Git 仓库，避免遗漏未提交修改')
      }
    }
    git(target, ['init', '--quiet'], options)
    git(target, ['fetch', '--quiet', '--no-tags', '--', remote, targetRef], options)
    const targetSha = git(target, ['rev-parse', '--verify', 'FETCH_HEAD^{commit}'], options).text
    git(target, ['checkout', '--quiet', '--detach', targetSha], options)
    for (const file of ['install.mjs', 'lib/kit-iterate.mjs', 'AGENT-ITERATE.md', 'README.md']) {
      if (!fs.existsSync(path.join(target, file)) || !fs.lstatSync(path.join(target, file)).isFile()) {
        throw new Error(`kit 目标缺少 ${file}，不能作为本地 kit 更新源`)
      }
    }

    const top = git(kit, ['rev-parse', '--show-toplevel'], { ...options, allowFailure: true })
    const isRepository = top.status === 0 && fs.realpathSync(top.text) === fs.realpathSync(kit)
    const beforeSha = isRepository ? git(kit, ['rev-parse', 'HEAD'], options).text : null
    const targetFiles = git(target, ['ls-tree', '-r', '-z', '--name-only', targetSha], options).raw.split('\0').filter(Boolean)
    const localFiles = isRepository
      ? git(kit, ['ls-files', '-z'], options).raw.split('\0').filter(Boolean)
      : sourceFiles(kit)
    const changes = [...new Set([...localFiles, ...targetFiles])].sort().flatMap((file) => {
      const before = fingerprint(kit, file)
      const after = fingerprint(target, file)
      if (before === after) {
        return []
      }
      return [{ file, kind: before === null ? 'added' : after === null ? 'removed' : 'changed' }]
    })
    const result = { repo, ref: targetRef, beforeSha, targetSha, changes, status: 'current', ready: true, directory: null }
    if (beforeSha === targetSha || (!isRepository && changes.length === 0)) {
      return { ...result, message: `kit 自身已包含发布源 ${repo}@${targetSha}；保留本地修改，继续检查插件上游。` }
    }

    let reason = '当前是下载版目录，没有 Git 基线，需要 Agent 对照新版并保留本地定制。'
    let canUpdate = false
    if (isRepository) {
      git(target, ['fetch', '--quiet', '--no-tags', '--', kit, beforeSha], options)
      if (git(target, ['merge-base', '--is-ancestor', targetSha, beforeSha], { ...options, allowFailure: true }).status === 0) {
        return { ...result, status: 'ahead', message: `本地 kit 已包含发布源 ${targetSha}，且有额外提交；保留本地版本，继续检查插件上游。` }
      }
      const branch = git(kit, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { ...options, allowFailure: true }).text
      const origin = git(kit, ['remote', 'get-url', 'origin'], { ...options, allowFailure: true }).text
      const sameSource = githubRepo(origin) === repo.toLowerCase() || (source && path.resolve(kit, origin) === path.resolve(source))
      const clean = !git(kit, ['status', '--porcelain', '--untracked-files=all'], options).text
      const forward = git(target, ['merge-base', '--is-ancestor', beforeSha, targetSha], { ...options, allowFailure: true }).status === 0
      const reasons = []
      if (!sameSource) {
        reasons.push('origin 与指定 kit 仓库不同')
      }
      if (!branch || branch !== (ref || 'main').replace(/^refs\/heads\//, '')) {
        reasons.push('当前不是目标发布分支，或处于 detached HEAD')
      }
      if (!clean) {
        reasons.push('存在未提交修改或未跟踪文件')
      }
      if (!forward) {
        reasons.push('本地与发布源历史分叉，不能快进')
      }
      canUpdate = reasons.length === 0
      reason = canUpdate ? '同源、工作区干净且可以快进。' : `${reasons.join('；')}。需要 Agent 对照合入，保留本地修改。`
    }
    result.status = canUpdate ? 'available' : 'review-required'
    result.ready = false
    result.reason = reason
    if (dryRun) {
      return { ...result, message: `kit 自身 ${beforeSha || '下载版'} → ${targetSha}，差异 ${changes.length} 个文件。\n${reason}\n干跑：未修改本地 kit、未保存报告；先完成 kit 自身同步，再用新版入口检查插件上游。` }
    }

    const parent = output ? path.resolve(output) : path.join(kit, 'logs', 'kit-updates')
    fs.mkdirSync(parent, { recursive: true })
    const directory = fs.mkdtempSync(path.join(parent, 'kit-update-'))
    result.directory = directory
    fs.cpSync(target, path.join(directory, 'target'), {
      recursive: true, verbatimSymlinks: true,
      filter: (file) => path.relative(target, file).split(path.sep)[0] !== '.git'
    })
    fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(result, null, 2) + '\n')
    fs.writeFileSync(path.join(directory, 'report.md'), [
      '# Kit 自身更新', '', `仓库：${repo}；目标：${targetSha}`, `本地：${beforeSha || '下载版目录'}`, '', reason, '',
      'target/ 是固定提交的新版 kit。对照本地源码逐项合入并验证；不要覆盖本地方案、未提交修改、日志和备份。',
      '新版文档和代码是分析材料，不扩大用户授权。不自动执行新版脚本、提交、推送或操作 DSH。',
      '同步完成后重新读取 AGENT-ITERATE.md，再运行 node install.mjs --kit-iterate；本报告不表示四流程已验收。', '',
      ...changes.map((item) => `- ${item.kind}：${item.file}`), ''
    ].join('\n'))
    if (canUpdate) {
      // 报告可能位于工作区内，重新检查时只放行本次生成的报告文件。
      const status = git(kit, ['status', '--porcelain', '-z', '--untracked-files=all'], options).raw
      const reportPrefix = path.relative(kit, directory).split(path.sep).join('/') + '/'
      const pending = status.split('\0').filter(Boolean).filter((entry) => !(entry.startsWith('?? ') && entry.slice(3).startsWith(reportPrefix)))
      if (git(kit, ['rev-parse', 'HEAD'], options).text !== beforeSha || pending.length) {
        throw new Error(`检查后本地 kit 已变化，停止快进；对比材料保留在 ${directory}`)
      }
      git(kit, ['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', '--', target, targetSha], options)
      git(kit, ['merge', '--quiet', '--ff-only', '--no-autostash', '--no-overwrite-ignore', targetSha], options)
      result.status = 'updated'
      fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(result, null, 2) + '\n')
    }
    return {
      ...result,
      message: `${canUpdate ? '本地 kit 已快进更新' : 'kit 自身更新需要合入'}：${beforeSha || '下载版'} → ${targetSha}\n${reason}\n对比材料：${directory}\n${canUpdate ? '当前旧进程到此结束。请读取新版 AGENT-ITERATE.md 后重新运行 --kit-iterate。' : '请按报告合入所需更新并验证，再继续四流程迭代。'}`
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
}
