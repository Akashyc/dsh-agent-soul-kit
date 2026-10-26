import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { updateKit } from '../lib/kit-update.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 在临时 Git 仓库运行测试命令，隔离用户的签名和提交钩子。
 * @param directory 临时工作目录
 * @param args Git 子命令参数
 * @returns 命令标准输出
 */
function git(directory, ...args) {
  const result = spawnSync('git', ['-C', directory,
    '-c', 'user.name=Kit Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=disabled-hooks', ...args
  ], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

/**
 * 写入临时源码或本地定制。
 * @param directory 素材根目录
 * @param file 相对文件路径
 * @param content 文件文本
 */
function put(directory, file, content) {
  fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true })
  fs.writeFileSync(path.join(directory, file), content)
}

/**
 * 提交素材以构造真实的 Git 提交关系。
 * @param directory 临时 Git 仓库
 * @returns 新提交号
 */
function commit(directory) {
  git(directory, 'add', '-A')
  git(directory, 'commit', '-qm', 'fixture')
  return git(directory, 'rev-parse', 'HEAD')
}

/**
 * 创建离线发布源与 clone，所有更新只操作临时目录。
 * @param t Node 测试上下文
 * @param cli 是否使用真实入口源码，供进程分流测试
 * @returns 工作区、发布源和更新调用
 */
function fixture(t, cli = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'soul-kit-update-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const source = path.join(root, 'remote')
  const kit = path.join(root, 'kit 中文')
  const output = path.join(root, 'reports')
  fs.mkdirSync(source)
  git(source, 'init', '-q', '-b', 'main')
  for (const file of ['install.mjs', 'lib/kit-iterate.mjs', 'AGENT-ITERATE.md', 'README.md']) {
    put(source, file, 'fixture baseline\n')
  }
  put(source, '.gitignore', 'logs/\nbackups/\n')
  if (cli) {
    fs.copyFileSync(path.join(ROOT, 'install.mjs'), path.join(source, 'install.mjs'))
    fs.cpSync(path.join(ROOT, 'lib'), path.join(source, 'lib'), { recursive: true })
  }
  const before = commit(source)
  git(root, 'clone', '-q', '--', source, kit)
  const update = (extra = {}) => updateKit({ kit, source, output, ...extra })
  return { root, source, kit, output, before, update }
}

/**
 * 计算包括 .git 在内的完整文件指纹，用于检查干跑零写入。
 * @param directory 本地 kit 根目录
 * @returns 文件名和内容哈希组成的稳定清单
 */
function inventory(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory()
      ? inventory(file).map((item) => `${entry.name}/${item}`)
      : [`${entry.name}:${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`]
  })
}

test('kit 没有新提交时不改工作区、不生成报告，保留本地修改', (t) => {
  const f = fixture(t)
  put(f.kit, 'README.md', 'local customization')
  const before = inventory(f.kit)
  const result = f.update()
  assert.equal(result.status, 'current')
  assert.equal(result.ready, true)
  assert.equal(result.targetSha, f.before)
  assert.deepEqual(inventory(f.kit), before)
  assert.equal(fs.existsSync(f.output), false)
})

test('干净同源分支快进到固定提交，保存差异且保留日志和备份', (t) => {
  const f = fixture(t)
  put(f.source, 'README.md', 'new release')
  put(f.source, 'new-feature.mjs', 'throw new Error("不得执行发布源脚本")')
  const sha = commit(f.source)
  put(f.kit, 'logs/local.txt', 'local log')
  put(f.kit, 'backups/local.txt', 'local backup')
  const result = f.update()
  assert.equal(result.status, 'updated')
  assert.equal(result.ready, false)
  assert.equal(git(f.kit, 'rev-parse', 'HEAD'), sha)
  assert.equal(fs.readFileSync(path.join(f.kit, 'README.md'), 'utf8'), 'new release')
  assert.equal(fs.readFileSync(path.join(f.kit, 'backups/local.txt'), 'utf8'), 'local backup')
  assert.equal(fs.readFileSync(path.join(f.kit, 'logs/local.txt'), 'utf8'), 'local log')
  assert.ok(result.changes.some((item) => item.file === 'new-feature.mjs' && item.kind === 'added'))
  assert.equal(JSON.parse(fs.readFileSync(path.join(result.directory, 'report.json'))).status, 'updated')
  assert.equal(fs.existsSync(path.join(result.directory, 'target/.git')), false)
  assert.equal(f.update().status, 'current')
})

test('干跑查到新版本，但包括 Git 元数据在内的本地文件全部不变', (t) => {
  const f = fixture(t)
  put(f.source, 'README.md', 'new release')
  commit(f.source)
  const before = inventory(f.kit)
  const result = f.update({ dryRun: true })
  assert.equal(result.status, 'available')
  assert.equal(result.ready, false)
  assert.deepEqual(inventory(f.kit), before)
  assert.equal(fs.existsSync(f.output), false)
})

test('未提交、暂存和未跟踪修改均保留并生成合入材料', (t) => {
  for (const kind of ['dirty', 'staged', 'untracked']) {
    const f = fixture(t)
    put(f.source, 'README.md', 'new release')
    commit(f.source)
    const file = kind === 'untracked' ? 'setups/私人方案.txt' : 'README.md'
    put(f.kit, file, 'keep this')
    if (kind === 'staged') {
      git(f.kit, 'add', file)
    }
    const before = inventory(f.kit)
    const result = f.update()
    assert.equal(result.status, 'review-required')
    assert.match(result.reason, /未提交修改/)
    assert.deepEqual(inventory(f.kit), before)
    assert.equal(fs.readFileSync(path.join(result.directory, 'target/README.md'), 'utf8'), 'new release')
  }
})

test('本地额外提交保留；历史分叉时交给 Agent 合入', (t) => {
  const f = fixture(t)
  put(f.kit, 'local.txt', 'local commit')
  const local = commit(f.kit)
  assert.equal(f.update().status, 'ahead')
  put(f.source, 'README.md', 'new release')
  commit(f.source)
  const result = f.update()
  assert.equal(result.status, 'review-required')
  assert.match(result.reason, /历史分叉/)
  assert.equal(git(f.kit, 'rev-parse', 'HEAD'), local)
})

test('下载版提供完整新版对比，不覆盖本地方案和修改', (t) => {
  const f = fixture(t)
  fs.rmSync(path.join(f.kit, '.git'), { recursive: true })
  put(f.kit, 'setups/私人方案.txt', 'keep setup')
  put(f.source, 'README.md', 'new release')
  commit(f.source)
  const before = inventory(f.kit)
  const result = f.update()
  assert.equal(result.status, 'review-required')
  assert.equal(result.beforeSha, null)
  assert.deepEqual(inventory(f.kit), before)
  assert.equal(fs.readFileSync(path.join(result.directory, 'target/README.md'), 'utf8'), 'new release')
})

test('不同 origin 和非发布分支不自动改写', (t) => {
  for (const kind of ['remote', 'branch', 'detached']) {
    const f = fixture(t)
    put(f.source, 'README.md', 'new release')
    commit(f.source)
    if (kind === 'remote') {
      git(f.kit, 'remote', 'set-url', 'origin', 'https://github.com/example/another-kit.git')
    }
    if (kind === 'branch') {
      git(f.kit, 'switch', '-qc', 'feature')
    }
    if (kind === 'detached') {
      git(f.kit, 'checkout', '-q', '--detach')
    }
    assert.equal(f.update().status, 'review-required')
    assert.equal(git(f.kit, 'rev-parse', 'HEAD'), f.before)
  }
})

test('被忽略文件与新版冲突时拒绝覆盖，不自动 stash', (t) => {
  const f = fixture(t)
  put(f.source, 'backups/local.txt', 'remote file')
  git(f.source, 'add', '-f', 'backups/local.txt')
  commit(f.source)
  put(f.kit, 'backups/local.txt', 'private backup')
  assert.throws(() => f.update(), /Git merge 失败/)
  assert.equal(git(f.kit, 'rev-parse', 'HEAD'), f.before)
  assert.equal(fs.readFileSync(path.join(f.kit, 'backups/local.txt'), 'utf8'), 'private backup')
  assert.equal(git(f.kit, 'stash', 'list'), '')
})

test('源不可读、源不干净、缺少 kit 文件或目标不存在都如实失败', (t) => {
  const f = fixture(t)
  assert.throws(() => f.update({ source: path.join(f.root, 'missing') }), /Git status 失败/)
  assert.throws(() => f.update({ ref: 'missing-ref' }), /Git fetch 失败/)
  put(f.source, 'README.md', 'not committed')
  assert.throws(() => f.update(), /必须是干净的 Git 仓库/)
  fs.unlinkSync(path.join(f.source, 'install.mjs'))
  commit(f.source)
  assert.throws(() => f.update(), /kit 目标缺少 install.mjs/)
  assert.equal(git(f.kit, 'rev-parse', 'HEAD'), f.before)
  assert.equal(fs.existsSync(f.output), false)
})

test('迭代入口先同步 kit 并结束旧进程，不下载插件上游或访问 DSH', (t) => {
  const f = fixture(t, true)
  put(f.source, 'install.mjs', 'throw new Error("旧进程不得自动执行新版入口")\n')
  const sha = commit(f.source)
  const dsh = path.join(f.root, 'uninstalled-dsh')
  const result = spawnSync(process.execPath, [path.join(f.kit, 'install.mjs'),
    '--kit-iterate', '--kit-source', f.source, '--out', f.output, '--dsh-home', dsh
  ], { encoding: 'utf8', timeout: 20000 })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /旧进程到此结束/)
  assert.doesNotMatch(result.stdout, /下载 https:\/\/codeload/)
  assert.equal(git(f.kit, 'rev-parse', 'HEAD'), sha)
  assert.equal(fs.existsSync(dsh), false)
  assert.equal(fs.existsSync(path.join(f.kit, 'kit-iteration.json')), false)
})

test('kit 独立更新入口校验参数，干跑不触碰真实工作区', (t) => {
  const f = fixture(t, true)
  for (const args of [
    ['--kit-update', '--update'], ['--kit-update', '--skip-kit-update'], ['--kit-update', '--questions'],
    ['--kit-source', f.source], ['--kit-update', '--source', f.source], ['--kit-update', '--kit-ref'],
    ['--kit-iterate', '--skip-kit-update', '--kit-source', f.source]
  ]) {
    const result = spawnSync(process.execPath, [path.join(f.kit, 'install.mjs'), ...args], { encoding: 'utf8' })
    assert.equal(result.status, 2, args.join(' '))
  }
  put(f.source, 'README.md', 'new release')
  commit(f.source)
  const result = spawnSync(process.execPath, [path.join(f.kit, 'install.mjs'),
    '--kit-update', '--kit-source', f.source, '--dry-run'
  ], { encoding: 'utf8', timeout: 20000 })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /干跑：未修改本地 kit/)
  assert.equal(git(f.kit, 'rev-parse', 'HEAD'), f.before)
  assert.equal(fs.existsSync(path.join(f.kit, 'logs')), false)
})

test('kit 已同步时继续插件上游报告，两个仓库和版本参数各自独立', (t) => {
  const f = fixture(t, true)
  const upstream = path.join(f.root, 'plugin-upstream')
  put(upstream, 'package.json', '{"name":"dsh-agent-soul"}')
  put(upstream, 'README.md', 'upstream fixture')
  git(upstream, 'init', '-q', '-b', 'main')
  const sha = commit(upstream)
  const result = spawnSync(process.execPath, [path.join(f.kit, 'install.mjs'),
    '--kit-iterate', '--kit-source', f.source, '--kit-ref', 'main',
    '--source', upstream, '--base-source', upstream, '--ref', sha, '--out', f.output
  ], { encoding: 'utf8', timeout: 20000 })
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(fs.readFileSync(path.join(f.output, fs.readdirSync(f.output)[0], 'report.json')))
  assert.equal(report.kitUpdate.status, 'current')
  assert.equal(report.kitUpdate.repo, 'Akashyc/dsh-agent-soul-kit')
  assert.equal(report.kitUpdate.targetSha, f.before)
  assert.equal(report.kitUpdate.ref, 'main')
  assert.equal(report.repo, 'cyanwell/dsh-agent-soul')
  assert.equal(report.target.sha, sha)
  assert.equal(report.target.ref, sha)
})
