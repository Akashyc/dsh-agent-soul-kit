import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileFixes, detectFix, planFile, scanCandidates, referencedPackageName } from '../lib/fixes.mjs'
import { beginFixTransaction } from '../lib/fix-transaction.mjs'
import { planManagedText, changedLines, revertConfigLines, hasMissingApiKey } from '../lib/fix-records.mjs'
import { fixQuotedBooleans } from '../lib/config-sanitize.mjs'

const names = { memory: 'dsh-agent-memory', clock: 'dsh-agent-clock' }
const partNames = { memory: ['dsh-agent-memory'], clock: ['dsh-agent-clock'], echo: ['dsh-yanqing-echo'], 'huanqi-panel': ['dsh-yanqing-huanqi-panel'] }
const fixes = fileFixes({ runtime: null, names, partNames, dshHome: '/fixture' })
const memory = fixes.find((fix) => fix.id === 'memory-home')

test('空白改写不误退役，陌生函数名不能充当正向修复证据', () => {
  assert.equal(detectFix(memory, "const anchorUser = p => join(ENV('DSH_HOME')||HERE,p);"), 'present')
  assert.equal(detectFix(memory, 'const anchorUser = p => anotherAnchor(p);'), 'unknown')
  const clock = fixes.find((fix) => fix.id === 'clock-panel')
  assert.equal(detectFix(clock, 'h("div", { style: fixedPanelStyle }, h(ClockPanel))'), 'unknown')
})

test('作者已修：有旧原文证据才替换 kit 版，手改过的文件不动', () => {
  const old = memory.old
  const applied = planFile({ upstream: old, installed: old, fixes: [memory] }).target
  const upstream = "const anchorUser = p => join(resolveUserHome(), p);"
  const record = { upstream: old, applied }
  const plan = planFile({ upstream, installed: applied, fixes: [memory], record })
  assert.equal(plan.state, 'rewrite')
  assert.equal(plan.rows[0].action, 'revert')
  assert.equal(plan.target, upstream)
  assert.equal(planFile({ upstream, installed: applied + '\n// local', fixes: [memory], record }).state, 'local')
  assert.equal(planFile({ upstream, installed: applied, fixes: [memory] }).state, 'local')
})

test('未知作者改写不撤掉旧 kit 修复，也不覆盖本机文件', () => {
  const applied = planFile({ upstream: memory.old, installed: memory.old, fixes: [memory] }).target
  const plan = planFile({ upstream: 'export const different = 1', installed: applied, fixes: [memory], record: { upstream: memory.old, applied } })
  assert.equal(plan.target, applied)
  assert.equal(plan.rows[0].action, 'manual')
})

test('配置撤回逐字节恢复 CRLF 和空白，其他设置及手改保留', () => {
  const before = "- id: huanqi\r\n  config:\r\n    fullCompactOnBreaker:    'true'\r\n- id: other\r\n  config: false\r\n"
  const after = fixQuotedBooleans(before).text
  const changes = changedLines(before, after)
  assert.equal(revertConfigLines(after, changes).text, before)
  assert.equal(revertConfigLines(after.replace('  config: false', '  config: true'), changes).text, before.replace('  config: false', '  config: true'))
  assert.equal(revertConfigLines(after.replace('fullCompactOnBreaker: true', 'fullCompactOnBreaker: false'), changes).local, true)
})

test('生成物跳过撤回、冻结和本机修改遵循同一保护规则', () => {
  const record = { upstream: 'author', applied: 'kit' }
  assert.equal(planManagedText({ upstream: 'author', target: 'author', installed: 'kit', record }).action, 'revert')
  assert.equal(planManagedText({ upstream: 'new author', target: 'new author', installed: 'kit', record }).target, 'new author')
  assert.equal(planManagedText({ upstream: 'author', target: 'kit', installed: 'custom', record }).action, 'local')
  assert.equal(planManagedText({ upstream: 'author', target: 'kit', installed: 'old', freeze: true }).target, 'old')
})

test('事务回滚覆盖文件、目录、创建和删除；提交后不再回滚', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-transaction-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const file = path.join(root, 'profile.json')
  const pkg = path.join(root, 'old-pkg')
  const added = path.join(root, 'new-pkg')
  fs.mkdirSync(pkg)
  fs.writeFileSync(file, 'original\r\n')
  fs.writeFileSync(path.join(pkg, 'index.js'), 'old')
  const transaction = beginFixTransaction(path.join(root, 'backup'), [file, pkg, added])
  fs.writeFileSync(file, 'changed')
  fs.rmSync(pkg, { recursive: true })
  fs.mkdirSync(added)
  transaction.rollback()
  assert.equal(fs.readFileSync(file, 'utf8'), 'original\r\n')
  assert.equal(fs.readFileSync(path.join(pkg, 'index.js'), 'utf8'), 'old')
  assert.equal(fs.existsSync(added), false)
  const next = beginFixTransaction(path.join(root, 'backup2'), [file])
  fs.writeFileSync(file, 'committed')
  next.commit()
  next.rollback()
  assert.equal(fs.readFileSync(file, 'utf8'), 'committed')
})

test('事务回滚还原符号链接指向的真实包内容', (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fix-symlink-')))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const original = path.join(root, 'store/pkg')
  const link = path.join(root, 'linked-pkg')
  fs.mkdirSync(original, { recursive: true })
  fs.writeFileSync(path.join(original, 'index.js'), 'original')
  fs.symlinkSync(original, link, 'junction')
  const transaction = beginFixTransaction(path.join(root, 'backup'), [link])
  fs.writeFileSync(path.join(link, 'index.js'), 'patched')
  transaction.rollback()
  assert.equal(fs.readFileSync(path.join(link, 'index.js'), 'utf8'), 'original')
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true)
})

test('模型路由相同但会话报 no API key 时仍能识别', () => {
  assert.equal(hasMissingApiKey('compaction failed: no API key configured'), true)
  assert.equal(hasMissingApiKey('compaction succeeded'), false)
})

test('包名以读取到的上游引用为准，不能强制 kit 写死的新名', () => {
  const known = ['dsh-new', 'dsh-old']
  assert.equal(referencedPackageName('compaction', 'dsh-old', ['name: dsh-old'], known), 'dsh-old')
  assert.equal(referencedPackageName('compaction', 'dsh-old', ['name: dsh-new'], known), 'dsh-new')
  assert.equal(referencedPackageName('compaction', 'dsh-old', ['name: dsh-other'], known), null)
})

test('扫描覆盖 macOS 路径、client id、模型路由、缺包和 schema 类型', () => {
  const files = {
    'package.json': JSON.stringify({ name: 'dsh-example' }),
    'client.js': "const id = 'dsh-wrong'; const dir = '/Users/author/data';",
    'index.js': 'const config = { enabled: z.boolean() }',
    'preset.yml': "name: dsh-missing\nconfig:\n  summarizationProvider: deepseek-official\n  enabled: 'true'\n"
  }
  const result = scanCandidates({ dirs: [{ dir: '/fixture', rel: 'plugins/example', files: Object.keys(files) }], read: (file) => files[path.basename(file)] })
  assert.deepEqual(new Set(result.map((item) => item.kind)), new Set(['hardcoded-path', 'client-id', 'model-route', 'preset-package', 'config-type']))
})
