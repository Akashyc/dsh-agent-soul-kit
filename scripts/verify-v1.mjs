import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dataPaths, saveContext, operationDir } from '../lib/core/data-paths.mjs'
import { migrationPlan, applyMigration } from '../lib/core/migrate-data.mjs'
import { loadIssues, putIssue, saveIssues, retireIssues, refreshCleanup } from '../lib/diagnose/issues.mjs'
import { judge } from '../lib/diagnose/detect.mjs'
import { allFailures } from '../lib/diagnose/evidence.mjs'
import { renderText } from '../lib/diagnose/text.mjs'
import { renderProblems } from '../lib/diagnose/report.mjs'
import { KIT_VERSION } from '../lib/core/version.mjs'
import { updateKit } from '../lib/iterate/kit-update.mjs'
import { writeTarGz } from '../lib/backup/tar.mjs'
import { extractTarGz } from '../lib/source/tar.mjs'
import { resolveAuthor } from '../lib/source/diagnose-source.mjs'

const kit = fileURLToPath(new URL('../', import.meta.url))
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-v1-'))
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text) }
const json = (file, value) => write(file, JSON.stringify(value))
const fakeKit = path.join(root, 'kit'), home = path.join(root, 'DSH 空格')
const context = { home, logs: path.join(home, 'logs'), install: { kitVersion: '6.2' } }
const author = { dir: path.join(root, 'author'), sha: 'a'.repeat(40) }
let scenarios = 0
function check(label, fn) { fn(); scenarios++; console.log('✓ ' + label) }
try {
  const data = dataPaths(fakeKit, home, 'desktop')
  check('profile、同名 profile 不同 DSH、符号链接归档隔离', () => {
    assert.notEqual(data.root, dataPaths(fakeKit, home, 'web').root)
    assert.notEqual(data.root, dataPaths(fakeKit, home + '-other', 'desktop').root)
    assert.throws(() => dataPaths(fakeKit, home, '../desktop'))
    assert.throws(() => dataPaths(fakeKit, home, '_kit'))
    saveContext(fakeKit, data)
    fs.symlinkSync(root, path.join(data.root, 'reports'))
    assert.throws(() => dataPaths(fakeKit, home, 'desktop'), /符号链接/)
  })
  fs.unlinkSync(path.join(data.root, 'reports'))
  check('旧清单清点只读、冲突拒绝、精确迁移与重复执行', () => {
    const old = path.join(home, 'dsh-soul/fix/desktop/issues.json')
    json(old, { format: 2, issues: {} })
    const plan = migrationPlan(fakeKit, home, 'desktop')
    assert.ok(fs.existsSync(old))
    json(data.issues, { sentinel: true })
    assert.throws(() => applyMigration(plan), /冲突/)
    fs.unlinkSync(data.issues)
    const result = applyMigration(plan)
    assert.equal(result.completed.length, 1)
    assert.equal(fs.existsSync(old), false)
    assert.equal(applyMigration(plan).completed.length, 1)
  })
  const entry = { title: '加载失败', pkg: 'example', sig: 'missing-one', file: 'profiles/desktop/node_modules/example/index.js', upstreamFile: 'plugins/example/index.js', problem: 'BROKEN', solution: '// 本机修\nFIXED', authorFixed: 'AUTHOR_FIXED', kind: 'crash', impact: '入口不可用', when: '启动时', verify: ['真实加载'] }
  const store = loadIssues(data.issues)
  check('登记字段、路径和非法签名校验', () => {
    putIssue(store, 'example-one', entry, 'now')
    assert.equal(store.issues['example-one'].upstreamFile, entry.upstreamFile)
    assert.throws(() => putIssue(store, '__proto__', entry, 'now'))
    assert.throws(() => putIssue(store, 'escape', { file: '../outside' }, 'now'))
    assert.throws(() => putIssue(store, 'bad-sig', { sig: '[' }, 'now'))
  })
  check('open → patched → retired 与作者回归后的重新判定', () => {
    write(path.join(home, entry.file), 'BROKEN')
    write(path.join(author.dir, entry.upstreamFile), 'BROKEN')
    assert.equal(judge(entry, context, author).state, 'open')
    write(path.join(home, entry.file), entry.solution)
    assert.equal(judge(entry, context, author).state, 'patched')
    write(path.join(author.dir, entry.upstreamFile), 'AUTHOR_FIXED')
    const row = store.issues['example-one']; row.state = judge(entry, context, author).state
    retireIssues(store, 'now', author.sha)
    assert.equal(refreshCleanup(store, () => true).length, 1)
    write(path.join(author.dir, entry.upstreamFile), 'BROKEN')
    row.state = judge(entry, context, author).state
    retireIssues(store, 'later', author.sha)
    assert.equal(row.state, 'patched')
    assert.equal(row.retiredAt, undefined)
    write(path.join(home, entry.file), 'REWRITTEN')
    assert.equal(judge(entry, context, author).state, 'unknown', '锚点消失不能直接判成已修')
    assert.equal(judge({ ...entry, scope: 'REWRITTEN' }, context, author).state, 'local-changed')
  })
  check('同一插件多种错误逐条匹配，未识别错误不被整包掩盖', () => {
    write(path.join(home, entry.file), 'BROKEN')
    const rows = ['missing-one', 'missing-two'].map((detail) => ({ message: 'loader (example): failed to import: ' + detail, time: '2026-11-05T00:00:00Z', runId: 'test' }))
    write(path.join(context.logs, 'test.jsonl'), rows.map(JSON.stringify).join('\n'))
    assert.equal(allFailures(context.logs).get('example').length, 2)
    const output = renderText({ context, author, issues: store, install: context.install })
    assert.match(output, /正在发生（1）/)
    assert.match(output, /新发现（1）/)
  })
  check('反馈清单包含源码位置、现象、触发与核实字段', () => {
    const report = renderProblems({ items: [{ ...entry, id: 'example-one', entry }], author, home, install: context.install, at: 'now' })
    for (const part of ['plugins/example/index.js:1', '入口不可用', '启动时', '真实加载']) assert.ok(report.markdown.includes(part), part)
  })
  check('CLI 默认只读、显式登记与状态保存，作者源码不变', () => {
    json(path.join(home, 'profiles/desktop/package.json'), { name: 'isolated-profile' })
    json(path.join(home, 'profiles/desktop/node_modules/dsh-agent-soul/package.json'), { name: 'dsh-agent-soul' })
    json(path.join(home, 'dsh-soul/.install-state.json'), { profile: 'desktop', kitVersion: '6.2', upstream: { repo: 'cyanwell/dsh-agent-soul', sha: author.sha } })
    for (const args of [['init', '-b', 'main'], ['add', '-A'], ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture']]) {
      const result = spawnSync('git', ['-C', author.dir, ...args], { encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr)
    }
    const actualData = dataPaths(kit, home, 'desktop')
    const cli = (...args) => {
      const result = spawnSync(process.execPath, [path.join(kit, 'soul-fix.mjs'), '--dsh-home', home, '--source', author.dir, ...args], { encoding: 'utf8' })
      assert.equal(result.status, 0, result.stderr)
      return result.stdout
    }
    cli()
    assert.equal(fs.existsSync(actualData.root), false)
    cli('--add', 'example-one=' + JSON.stringify(entry))
    const before = fs.readFileSync(actualData.issues, 'utf8')
    cli()
    assert.equal(fs.readFileSync(actualData.issues, 'utf8'), before)
    cli('--write')
    assert.equal(loadIssues(actualData.issues).issues['example-one'].state, 'open')
    assert.equal(spawnSync('git', ['-C', author.dir, 'status', '--porcelain'], { encoding: 'utf8' }).stdout.trim(), '')
    const cached = path.join(root, 'dsh-agent-soul')
    assert.equal(spawnSync('git', ['clone', author.dir, cached], { encoding: 'utf8' }).status, 0)
    assert.throws(() => resolveAuthor({ kit: fakeKit }), /origin/)
    assert.equal(spawnSync('git', ['-C', cached, 'remote', 'set-url', 'origin', 'https://github.com/cyanwell/dsh-agent-soul.git'], { encoding: 'utf8' }).status, 0)
    const snapshot = resolveAuthor({ kit: fakeKit })
    assert.match(snapshot.sha, /^[0-9a-f]{40}$/)
    snapshot.cleanup()
    fs.rmSync(actualData.root, { recursive: true })
  })
  check('kit 自更新保留私有 data，拒绝跟踪私有数据的发布源', () => {
    const upstream = path.join(root, 'kit-source'), local = path.join(root, 'kit-local')
    fs.mkdirSync(upstream)
    const git = (directory, ...args) => {
      const result = spawnSync('git', ['-C', directory, ...args], { encoding: 'utf8' })
      assert.equal(result.status, 0, result.stderr)
    }
    const commit = () => {
      git(upstream, 'add', '-A')
      git(upstream, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture')
    }
    git(upstream, 'init', '-b', 'main')
    for (const file of ['install.mjs', 'lib/iterate/kit-iterate.mjs', 'AGENT-ITERATE.md', 'README.md']) write(path.join(upstream, file), 'fixture\n')
    write(path.join(upstream, '.gitignore'), '/data/\n')
    commit()
    git(root, 'clone', upstream, local)
    const privateFile = path.join(local, 'data/desktop/local/fix/issues.json')
    write(privateFile, '私人清单')
    write(path.join(upstream, 'README.md'), 'next\n'); commit()
    const updated = updateKit({ kit: local, source: upstream })
    assert.equal(updated.status, 'updated')
    assert.equal(fs.readFileSync(privateFile, 'utf8'), '私人清单')
    write(path.join(upstream, 'data/unsafe.txt'), '不应发布')
    git(upstream, 'add', '-f', 'data/unsafe.txt'); commit()
    assert.throws(() => updateKit({ kit: local, source: upstream }), /私有 data/)
    assert.equal(fs.readFileSync(privateFile, 'utf8'), '私人清单')
  })
  const unsafe = path.join(root, 'unsafe.tar.gz')
  await writeTarGz(unsafe, [{ name: '../escape', data: '拒绝逃逸' }])
  check('归档解包拒绝路径逃逸', () => {
    assert.throws(() => extractTarGz(unsafe, path.join(root, 'extract')), /路径不安全/)
    assert.equal(fs.existsSync(path.join(root, 'escape')), false)
  })
  if (process.platform !== 'win32') check('Bash 自举复用本地入口，不执行重复 Git 更新', () => {
    const bootstrapKit = path.join(root, 'bootstrap-kit')
    write(path.join(bootstrapKit, 'install.mjs'), "console.log('isolated-bootstrap:' + process.argv.slice(2).join(','))\n")
    const result = spawnSync('bash', [path.join(kit, 'install.sh'), '--help'], {
      encoding: 'utf8', env: { ...process.env, DSH_KIT_DIR: bootstrapKit, DSH_NODE: process.execPath }
    })
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /isolated-bootstrap:--help/)
    assert.doesNotMatch(fs.readFileSync(path.join(kit, 'install.sh'), 'utf8'), /git -C .* pull/)
  })
  const evidence = operationDir(path.join(kit, 'data/_kit/logs'), 'verify-v1')
  fs.mkdirSync(evidence, { recursive: true })
  json(path.join(evidence, 'summary.json'), { kitVersion: KIT_VERSION, scenarios, scope: 'isolated; no desktop acceptance or real data migration' })
  console.log(`${scenarios} 组 V1 隔离检查通过`)
} finally { fs.rmSync(root, { recursive: true, force: true }) }
