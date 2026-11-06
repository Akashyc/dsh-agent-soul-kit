// 把问卷答案接给上游的三个装配工具。kit 自己不渲染 soul 文件 —— 那是上游的活：
//   tools/init.mjs            → 书房根下 5 份骨架（00-authority / 01-echo / 02-vital / 03-self / 04-doctor）
//   kit/echo/scaffold.mjs     → 书房 11 个目录（含 65-声音），幂等、绝不覆盖
//   plugins/tools/self/self.mjs --check → SELF 体检（三条判据）
// kit 只做四件：拼参数、写人设文件、核对生成物、把「还剩多少 <...>」报出来。
//
// 两个根（书房 / 记忆中枢）不猜：上游 echo-config 的规矩是「能推断的自动推，推不出来的报错停下」，
// 所以这里必须由答案给，缺一条就报错退出。

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 答案 → init.mjs 的 8 个 key（缺一个它就用默认值，等于没问）。 */
export function toInitAnswers(setup, soulPath) {
  const lines = []
  for (const item of setup.hardLines || []) lines.push(typeof item === 'string' ? item : item.name)
  for (const item of setup.customHardLines || []) if (item && item.name) lines.push(item.name)
  return {
    agentName: setup.name || '',
    userName: setup.user || '',
    authorityDir: soulPath ? path.basename(soulPath) : 'soul',
    hardLines: [...new Set(lines)].join(','),
    multiSession: setup.multiSession ? 'y' : 'n',
    hasIndex: setup.hasIndex ? 'y' : 'n',
    windowSize: setup.windowSize ? String(setup.windowSize) : '',
    note: setup.purpose || '',
  }
}

/** init.mjs 写到 dirname(soulPath)，目录名由 authorityDir 决定 —— 换路径不用改上游。 */
export function initArgs(upstreamDir, answersFile, soulPath) {
  return [path.join(upstreamDir, 'tools', 'init.mjs'), '--answers', answersFile, '--out', path.dirname(soulPath)]
}

/** 书房骨架：两个根走命令行参数（优先级高于 echo.config.json）。 */
export function scaffoldArgs(upstreamDir, apply, soulPath, memoryPath) {
  const args = [path.join(upstreamDir, 'kit', 'echo', 'scaffold.mjs')]
  if (soulPath) args.push('--soul', soulPath)
  if (memoryPath) args.push('--memory', memoryPath)
  if (apply) args.push('--apply')
  return args
}

/** 记忆中枢的 hub 目录：SELF.src.md / SELF.md / state.json / index 都在它下面。 */
export function hubPath(memoryPath) {
  return path.join(memoryPath, 'hub')
}

/** 第一步：把插件真正 spawn 的那几个脚本装进 hub，并记来源（同时建出 hub/）。 */
export function installKitArgs(upstreamDir, memoryPath) {
  return [path.join(upstreamDir, 'kit', 'echo', 'install-kit.mjs'), '--hub', hubPath(memoryPath)]
}

/** SELF 体检：SELF.md 在 hub 下 —— 上游注释写明「scaffold 把它写在 memory/hub/」。 */
export function selfCheckEnv(memoryPath) {
  return { SELF_FILE: path.join(hubPath(memoryPath), 'SELF.md') }
}

/**
 * 人设文件：上游没有「人设文件」这层结构，但书房有 65-声音/ 这一格（"你说话的样子"）。
 * 空答案就不建文件 —— 不留空壳。
 * 答案可以是多行文本，也可以是一行人设文件路径（可带「见」前缀、可带引号、可 ~ 开头）：
 * 路径存在就原样复制（保留它自己的文件名），不存在就报错 —— 不静默写成一行路径。
 */
export function personaFile(setup, soulPath) {
  const NL = String.fromCharCode(10)
  const raw = String(setup && setup.persona ? setup.persona : '').trim()
  if (!raw) return null
  const lines = raw.split(NL)
  const first = lines[0].trim()
  const unquoted = first.replace(/^见\s*[:：]?\s*/, '').replace(/^['"]|['"]$/g, '')
  const isWindowsPath = /^[A-Za-z]$/.test(unquoted.slice(0, 1)) && unquoted.slice(1, 2) === ':' && (unquoted.slice(2, 3) === '/' || unquoted.slice(2, 3) === String.fromCharCode(92))
  const looksPath = lines.length === 1 && (
    unquoted.startsWith('/') || unquoted.startsWith('./') || unquoted.startsWith('../') ||
    unquoted.startsWith('~') || isWindowsPath || /\.(md|txt)$/i.test(unquoted)
  )
  if (looksPath) {
    const abs = unquoted.startsWith('~') ? path.join(process.env.HOME || '', unquoted.slice(1)) : unquoted
    if (!fs.existsSync(abs)) return { error: '人设文件不存在：' + abs }
    return { file: path.join(soulPath, '65-声音', path.basename(abs)), content: fs.readFileSync(abs, 'utf8'), copiedFrom: abs }
  }
  const file = path.join(soulPath, '65-声音', String(setup.name || 'agent').replace(/[\\/:*?"<>|]/g, '_') + '-声音.md')
  return { file, content: '# ' + (setup.name || 'agent') + ' 的声音' + NL + NL + raw + NL }
}

/**
 * memory 插件的两条路径。
 * ★ 必须指到 hub 下：上游 echo-doctor 的注释点名过一个坑 ——
 *   memory 默认 selfPath 是 './SELF.md'，而 scaffold 把 SELF 写在 memory/hub/，
 *   两边对不上时「装了、没报错、但每轮注入的是空」，doctor 只会报一条虚警。
 */
export function memoryConfig(memoryPath) {
  return {
    selfPath: path.join(hubPath(memoryPath), 'SELF.md'),
    statePath: path.join(hubPath(memoryPath), 'state.json'),
  }
}

/**
 * 核对生成物：生成了哪几份、每份还剩多少 <...>、SELF.md 装了没有。
 * 占位符不是错误 —— 那是「只有用户能答的部分」，但必须报数，不许当完成了。
 */
export function inspect(soulPath, memoryPath) {
  const dir = soulPath
  if (!dir || !fs.existsSync(dir)) return { exists: false, files: [], placeholders: 0, selfAssembled: false }
  const files = []
  let total = 0
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.md')) continue
    const text = fs.readFileSync(path.join(dir, name), 'utf8')
    const count = (text.match(/<\.\.\.>/g) || []).length
    total += count
    files.push({ name, bytes: Buffer.byteLength(text, 'utf8'), placeholders: count })
  }
  const selfFile = memoryPath ? path.join(hubPath(memoryPath), 'SELF.md') : null
  return { exists: true, files, placeholders: total, selfAssembled: Boolean(selfFile && fs.existsSync(selfFile)) }
}

// ── 可执行入口 ─────────────────────────────────────────────────────────
//   node kit/setup/scaffold.mjs --answers <answers.json> --instance <dir> --dsh-home <dir> --upstream <dir>
//   默认只打印计划；--run 才动；--scaffold-apply 才真建书房目录。

function argvParser(argv) {
  const opt = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i]
    if (item.startsWith('--')) {
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) { opt[item] = next; i++ } else { opt[item] = true }
    } else opt._.push(item)
  }
  return opt
}

async function main() {
  const os = await import('node:os')
  const { spawnSync } = await import('node:child_process')
  const opt = argvParser(process.argv.slice(2))
  const answersFile = opt['--answers'] ? path.resolve(opt['--answers']) : null
  const instance = opt['--instance'] ? path.resolve(opt['--instance']) : null
  const dshHome = path.resolve(opt['--dsh-home'] || path.join(os.homedir(), '.dsh'))
  const upstream = opt['--upstream'] ? path.resolve(opt['--upstream']) : null
  const run = Boolean(opt['--run'])
  const scaffoldApply = Boolean(opt['--scaffold-apply'])

  const fail = (message) => { console.error(JSON.stringify({ ok: false, error: message }, null, 2)); process.exit(1) }
  if (!answersFile || !fs.existsSync(answersFile)) fail('要用 --answers <answers.json>')
  if (!instance) fail('要用 --instance <data/<profile>/<instance>>')
  if (!upstream || !fs.existsSync(path.join(upstream, 'tools', 'init.mjs'))) fail('要用 --upstream 指向作者仓库副本')

  const answers = JSON.parse(fs.readFileSync(answersFile, 'utf8'))
  if (!answers.setup) fail('answers.json 里没有 setup：先按 v2 问卷答完')
  const paths = answers.paths || {}
  const soulPath = path.resolve(opt['--soul'] || paths.soul || '')
  const memoryPath = path.resolve(opt['--memory'] || paths.memory || '')
  if (!paths.soul && !opt['--soul']) fail('answers.paths.soul 缺失：书房根只能由人给（上游 echo-config 的规矩：推不出来就报错，不猜）')
  if (!paths.memory && !opt['--memory']) fail('answers.paths.memory 缺失：记忆中枢根只能由人给')

  const answersInit = path.join(instance, 'answers.init.json')
  const plan = {
    ok: true,
    dry: !run,
    soulPath,
    memoryPath,
    answersInit,
    steps: [
      { tool: 'kit/echo/install-kit.mjs', args: installKitArgs(upstream, memoryPath), writes: hubPath(memoryPath) + '/{echo-doctor,echo-config}.mjs + .kit-origin.json', note: 'hub 不存在时由它建出来' },
      { tool: 'tools/init.mjs', args: initArgs(upstream, answersInit, soulPath), writes: soulPath + '/{00-authority,01-echo,02-vital,03-self,04-doctor}.md', note: '已存在的跳过，不覆盖' },
      { tool: 'kit/echo/scaffold.mjs', args: scaffoldArgs(upstream, scaffoldApply, soulPath, memoryPath), writes: '书房 11 个目录（含 65-声音）', note: scaffoldApply ? '会真建目录' : '干跑；--scaffold-apply 才建' },
      { tool: 'plugins/tools/self/self.mjs --check', env: selfCheckEnv(memoryPath), writes: '不写盘', note: 'SELF.md 不存在时报错' },
      { tool: '(kit)', writes: personaFile(answers.setup, soulPath) ? personaFile(answers.setup, soulPath).file : '不建（人设为空）', note: '人设是数据文件，不是插件' },
    ],
    initAnswers: toInitAnswers(answers.setup, soulPath),
  }
  if (!run) { process.stdout.write(JSON.stringify(plan, null, 2) + String.fromCharCode(10)); return }

  fs.mkdirSync(instance, { recursive: true })
  fs.writeFileSync(answersInit, JSON.stringify(plan.initAnswers, null, 2) + String.fromCharCode(10), 'utf8')

  const kitRun = spawnSync(process.execPath, installKitArgs(upstream, memoryPath), { encoding: 'utf8' })
  const initRun = spawnSync(process.execPath, initArgs(upstream, answersInit, soulPath), { encoding: 'utf8' })
  const scaffoldRun = spawnSync(process.execPath, scaffoldArgs(upstream, scaffoldApply, soulPath, memoryPath), { encoding: 'utf8' })
  const selfRun = spawnSync(process.execPath, [path.join(upstream, 'plugins', 'tools', 'self', 'self.mjs'), '--check'], { encoding: 'utf8', env: { ...process.env, ...selfCheckEnv(memoryPath) } })

  const pf = personaFile(answers.setup, soulPath)
  let persona = { written: false }
  if (pf && pf.error) persona = { written: false, error: pf.error }
  else if (pf) {
    fs.mkdirSync(path.dirname(pf.file), { recursive: true })
    if (fs.existsSync(pf.file)) persona = { written: false, reason: '已存在，不覆盖', file: pf.file }
    else { fs.writeFileSync(pf.file, pf.content, 'utf8'); persona = { written: true, file: pf.file, copiedFrom: pf.copiedFrom || null } }
  }

  const lines = (text) => (text || '').trim().split(String.fromCharCode(10)).slice(-6)
  process.stdout.write(JSON.stringify({
    ok: initRun.status === 0 && kitRun.status === 0,
    installKit: { status: kitRun.status, tail: lines((kitRun.stdout || '') + (kitRun.stderr || '')) },
    init: { status: initRun.status, tail: lines(initRun.stdout), err: lines(initRun.stderr) },
    scaffold: { status: scaffoldRun.status, applied: scaffoldApply, tail: lines((scaffoldRun.stdout || '') + (scaffoldRun.stderr || '')) },
    self: { status: selfRun.status, tail: lines((selfRun.stdout || '') + (selfRun.stderr || '')) },
    persona,
    inspect: inspect(soulPath, memoryPath),
    next: '把 ' + path.join(soulPath, '03-self.md') + ' 的「我是谁」与硬线正文写完，并补 ' + path.join(hubPath(memoryPath), 'SELF.src.md') + '，再跑 self.mjs --check；memory 的 selfPath 指向 ' + path.join(hubPath(memoryPath), 'SELF.md'),
  }, null, 2) + String.fromCharCode(10))
  process.exit(initRun.status === 0 ? 0 : 1)
}

// 用 fileURLToPath：路径里带空格（例如 "DSH NEXT.app"）时 .pathname 是 %20，判定就永远为假
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (invokedDirectly) main().catch((e) => { console.error('✗ ' + (e && e.message ? e.message : e)); process.exit(1) })

export default { toInitAnswers, initArgs, scaffoldArgs, selfCheckEnv, personaFile, memoryConfig, inspect }
