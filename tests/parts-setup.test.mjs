// 零件目录（lib/parts.mjs）和方案问答（lib/setup.mjs）：必装范围、各系统的已知限制、旧回答 / 旧方案的兼容。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MUST_HAVE, PRESET_ONLY, OPTIONAL_PARTS, platformNote, platformText } from '../lib/parts.mjs'
import { normalizeAnswers, loadSetup, questionSheet, askTerminal } from '../lib/setup.mjs'
import { dshHomeCandidates } from '../lib/platform.mjs'

test('必装跟作者的「全局必装」：换气、换气面板、mcp-hub 和 preset 要调用的压缩三件套都不能跳', () => {
  for (const p of ['compaction', 'pruner', 'memory', 'echo', 'huanqi', 'huanqi-panel', 'mcp-hub', 'compact-region']) assert.ok(MUST_HAVE(p), p)
  for (const p of OPTIONAL_PARTS) assert.ok(!MUST_HAVE(p), p)
  // 新旧包名都只进 dependencies、不进 bundles
  for (const n of ['dsh-agent-compaction', 'dsh-yanqing-compaction', 'dsh-agent-compact-region']) assert.ok(PRESET_ONLY.includes(n), n)
})

test('系统限制：model-statusbar 在 Mac 上不可用，yantai 部分可用；Windows 上换气有 #5 的提示', () => {
  assert.equal(platformNote('model-statusbar', 'darwin').level, 'unsupported')
  assert.equal(platformNote('yantai', 'darwin').level, 'partial')
  assert.equal(platformNote('model-statusbar', 'win32'), null)
  assert.equal(platformNote('huanqi', 'win32').level, 'partial')
  assert.equal(platformNote('clock', 'darwin'), null)
  assert.match(platformText('model-statusbar', 'darwin'), /^macOS 不可用：/)
})

test('回答：选了 Mac 上用不了的零件只提醒不拦；旧回答里的换气、mcp-hub 现在必装，滤掉不算错', () => {
  const raw = { name: '测试鲸', user: '我', parts: ['huanqi', 'huanqi-panel', 'mcp-hub', 'clock', 'model-statusbar'], setupName: `kit-test-${process.pid}-${Date.now()}` }
  const mac = normalizeAnswers(raw, { mnemon: false, platform: 'darwin' })
  assert.deepEqual(mac.errors, [])
  assert.deepEqual(mac.setup.parts, ['clock', 'model-statusbar'])
  assert.equal(mac.warnings.length, 1)
  assert.match(mac.warnings[0], /^model-statusbar：macOS 不可用/)
  assert.deepEqual(normalizeAnswers(raw, { mnemon: false, platform: 'win32' }).warnings, [])
})

test('旧方案里 4.0 退役的修复条目（换源、改包名）直接丢掉，不让方案读不出来', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-setup-'))
  try {
    for (const f of ['00-authority.md', 'SELF.src.md.tpl']) fs.writeFileSync(path.join(dir, f), '# x\n')
    fs.writeFileSync(path.join(dir, 'setup.json'), JSON.stringify({
      name: 'x', user: 'y', hardLines: [{ name: 'a', rule: 'b' }], parts: ['clock', 'huanqi'],
      fixSkip: ['name-compaction', 'src-huanqi-organs', 'clock-panel'], files: { authority: '00-authority.md', self: 'SELF.src.md.tpl' },
    }))
    const L = loadSetup(dir)
    assert.deepEqual(L.errors, [])
    assert.deepEqual(L.setup.fixSkip, ['clock-panel'])
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('给 agent 的问题清单带上这台系统的限制，路径不写死', () => {
  const sheet = questionSheet({ kitVersion: 'x', profile: '<DSH 家目录>/profiles/desktop', mnemon: true, platform: 'darwin' })
  const opts = sheet.questions.find((q) => q.id === 'parts').options
  assert.equal(opts.find((o) => o.value === 'model-statusbar').platform.level, 'unsupported')
  assert.ok(!opts.find((o) => o.value === 'clock').platform)
  assert.equal(sheet.detected.platform, 'darwin')
  assert.doesNotMatch(JSON.stringify(sheet), new RegExp(os.homedir().replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')))
})

test('DSH 家目录候选：--dsh-home 最先，其次 DSH_HOME，再是用户目录下的 .dsh', () => {
  const saved = process.env.DSH_HOME
  process.env.DSH_HOME = path.join(os.tmpdir(), 'env-home')
  try {
    const c = dshHomeCandidates(path.join(os.tmpdir(), 'cli-home'))
    assert.deepEqual(c.slice(0, 3), [path.join(os.tmpdir(), 'cli-home'), path.join(os.tmpdir(), 'env-home'), path.join(os.homedir(), '.dsh')])
  } finally {
    if (saved === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = saved
  }
})

test('终端问答一路回车：拿到合法回答；Mac 上提示 model-statusbar 不可用、默认不装', async () => {
  const lines = []
  const log = console.log
  console.log = (...a) => lines.push(a.join(' '))
  const answers = ['测试鲸', '老板']
  let raw
  try { raw = await askTerminal({ question: async () => answers.shift() ?? '' }, { mnemon: false, platform: 'darwin' }) } finally { console.log = log }
  assert.deepEqual(raw.parts, ['clock'])
  assert.ok(lines.some((l) => /! model-statusbar：macOS 不可用/.test(l)))
  assert.ok(lines.some((l) => /必装、不用选：.*huanqi.*mcp-hub/.test(l)))
  const n = normalizeAnswers(raw, { mnemon: false, platform: 'darwin' })
  assert.deepEqual(n.errors, [])
  assert.equal(n.setup.defaultPreset, 'yanqing')
})
