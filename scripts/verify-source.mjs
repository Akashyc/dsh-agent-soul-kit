// node scripts/verify-source.mjs：临时 Git 远端验证「只读本地作者仓库 + 核对最新」，不访问真实作者仓库。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { cachedSource, localSource } from '../lib/source/source-cache.mjs'

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kit-source-')))
const remote = path.join(root, 'remote')
const kit = path.join(root, 'kit')
const repo = 'fixture/author'
const origin = `https://github.com/${repo}.git`
const cache = path.join(kit, 'upstream', 'author')
const moduleUrl = new URL('../lib/source/source-cache.mjs', import.meta.url).href
const oldEnv = { ...process.env }
const steps = []

/** 在本次临时样本执行 Git，失败时保留断言上下文。 */
function git(dir, args) {
  const result = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' })
  assert.equal(result.status, 0, `${args[0]}: ${result.stderr}`)
  return result.stdout.trim()
}

/** 只修改临时作者样本并创建版本，真实来源目录始终不写。 */
function commit(text) {
  fs.writeFileSync(path.join(remote, 'package.json'), JSON.stringify({ name: 'fixture', description: text }))
  git(remote, ['add', 'package.json'])
  git(remote, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', text])
  return git(remote, ['rev-parse', 'HEAD'])
}

/** 每个快照使用独立临时目录，模拟安装器的清理边界。 */
function context(ref = 'main') {
  return { kit, repo, ref, temp: fs.mkdtempSync(path.join(root, 'snapshot-')) }
}

/** 独立进程模拟下一轮操作，不能被进程内状态复用掩盖。 */
function nextRun(ref = 'main', code = 0) {
  const script = `import { cachedSource } from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(cachedSource(${JSON.stringify(context(ref))})))`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 20000 })
  assert.equal(result.status, code, result.stderr)
  return code ? result.stderr : JSON.parse(result.stdout)
}

try {
  fs.mkdirSync(remote)
  fs.mkdirSync(kit)
  git(remote, ['init', '-q', '-b', 'main'])
  const first = commit('author-v1')
  const count = Number(process.env.GIT_CONFIG_COUNT || 0)
  process.env.GIT_CONFIG_COUNT = String(count + 1)
  process.env[`GIT_CONFIG_KEY_${count}`] = `url.file://${remote}.insteadOf`
  process.env[`GIT_CONFIG_VALUE_${count}`] = origin

  const initial = cachedSource(context())
  assert.equal(initial.sha, first)
  assert.equal(git(cache, ['remote', 'get-url', '--push', 'origin']), `file://${remote}`)
  assert.equal(fs.readFileSync(path.join(cache, '.git/config'), 'utf8').includes(origin), true)
  assert.equal(git(cache, ['status', '--porcelain']), '')
  assert.equal(cache.startsWith(kit), true, '作者仓库落在 kit/upstream/ 下')
  steps.push('首次克隆到 kit/upstream/、来源身份核对、固定提交导出')

  const second = commit('author-v2')
  assert.match(nextRun('main', 1), /本地作者仓库不是最新/)
  assert.equal(git(cache, ['rev-parse', 'HEAD']), first, 'kit 不替用户拉代码')
  git(cache, ['pull', '-q', '--ff-only'])
  assert.equal(git(cache, ['rev-parse', 'HEAD']), second)
  assert.equal(nextRun().sha, second)
  steps.push('本地落后就停止并给出拉取命令，拉好后照常导出')

  const pinned = nextRun(first)
  assert.equal(pinned.sha, first)
  assert.equal(git(cache, ['rev-parse', 'HEAD']), second, '旧版本只导出，不切换作者工作区')
  assert.match(nextRun('0'.repeat(40), 1), /本地作者仓库里没有/)
  steps.push('固定旧提交可导出；不存在的提交直接报错，不联网抓')

  const original = fs.readFileSync(path.join(cache, 'package.json'), 'utf8')
  fs.writeFileSync(path.join(cache, 'package.json'), 'local-edit')
  assert.match(nextRun('main', 1), /本地改动/)
  assert.equal(fs.readFileSync(path.join(cache, 'package.json'), 'utf8'), 'local-edit')
  fs.writeFileSync(path.join(cache, 'package.json'), original)
  fs.writeFileSync(path.join(cache, 'untracked.txt'), 'keep')
  assert.match(nextRun('main', 1), /未跟踪/)
  fs.unlinkSync(path.join(cache, 'untracked.txt'))
  steps.push('拒绝覆盖已修改和未跟踪文件')

  git(cache, ['checkout', '-qb', 'local-work'])
  assert.match(nextRun('main', 1), /不在 main/)
  assert.equal(git(cache, ['branch', '--show-current']), 'local-work')
  git(cache, ['checkout', '-q', 'main'])
  git(cache, ['remote', 'set-url', 'origin', 'https://github.com/other/repo.git'])
  assert.match(nextRun('main', 1), /origin 不匹配/)
  git(cache, ['remote', 'set-url', 'origin', origin])
  steps.push('分支和来源不符时停止，不自动切换')

  const movedRemote = remote + '-offline'
  fs.renameSync(remote, movedRemote)
  const offlineHit = nextRun()
  assert.equal(offlineHit.sha, second, '远端不可用也照本地 HEAD 导出，不拦着办事')
  fs.renameSync(movedRemote, remote)
  steps.push('远端不可用时按本地 HEAD 继续，并说明可能不是最新')

  fs.writeFileSync(path.join(cache, 'local.txt'), 'local commit')
  git(cache, ['add', 'local.txt'])
  git(cache, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'local commit'])
  const localCommit = git(cache, ['rev-parse', 'HEAD'])
  assert.match(nextRun('main', 1), /本地作者仓库不是最新/)
  assert.equal(git(cache, ['rev-parse', 'HEAD']), localCommit)
  steps.push('已提交的本地改造冒充不了作者最新版')

  const plain = path.join(root, 'plain')
  fs.mkdirSync(plain)
  fs.writeFileSync(path.join(plain, 'index.js'), 'original')
  const copied = localSource(plain, fs.mkdtempSync(path.join(root, 'copy-')), 'main', /(^|\/)\.git(\/|$)/)
  fs.writeFileSync(path.join(copied.dir, 'index.js'), 'adapted')
  assert.equal(fs.readFileSync(path.join(plain, 'index.js'), 'utf8'), 'original')
  const offline = localSource(cache, fs.mkdtempSync(path.join(root, 'offline-')), first, /\.git/)
  assert.equal(offline.sha, first)
  assert.equal(git(cache, ['status', '--porcelain']), '')
  fs.symlinkSync(path.join(plain, 'index.js'), path.join(plain, 'link.js'))
  assert.throws(() => localSource(plain, fs.mkdtempSync(path.join(root, 'link-')), 'main', /\.git/), /符号链接/)
  steps.push('离线目录临时副本、Git 固定提交、符号链接保护')

  const kitRoot = fileURLToPath(new URL('../', import.meta.url))
  for (const file of ['AGENTS.md', 'AGENT-INSTALL.md', 'AGENT-ITERATE.md', 'README.md']) {
    const text = fs.readFileSync(path.join(kitRoot, file), 'utf8')
    assert.match(text, /作者仓库只读|不得直接修改拉下来的作者仓库源码/)
    assert.doesNotMatch(text, /node fix\.mjs|有修复（修复 id）|修复检查：按/)
  }
  steps.push('Agent 手册持久只读约束，无装后修复命令')
  for (const step of steps) console.log('✓ ' + step)
} finally {
  for (const key of Object.keys(process.env)) if (!(key in oldEnv)) delete process.env[key]
  Object.assign(process.env, oldEnv)
  fs.rmSync(root, { recursive: true, force: true })
}