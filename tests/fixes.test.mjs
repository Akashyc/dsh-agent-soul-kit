// 修复清单（lib/fixes.mjs）：每条修复「问题还在不在」的判定、文件级重算（planFile）、迭代归类。
// 素材用安装包快照 assets/parts/（organs 原样）和就地造的小段文本，不碰本机 DSH。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FIXES, FIX_IDS, fixInfo, fileFixes, detectFix, planFile, patchText, detectHuanqiSource, detectName, detectConfigBool, detectSummaryRoute, defaultProvider, inspectUpstream, classifyFix, scanCandidates } from '../lib/fixes.mjs'
import { MAINT_OLD, MAINT_NEW } from '../lib/organ-patches.mjs'

const KIT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PARTS = path.join(KIT, 'assets', 'parts')
const PN = {
  compaction: ['dsh-yanqing-compaction', 'dsh-agent-compaction'], pruner: ['dsh-yanqing-pruner', 'dsh-agent-pruner'], memory: ['dsh-agent-memory'],
  'mnemon-probe': ['dsh-agent-mnemon-probe'], echo: ['dsh-yanqing-echo', 'dsh-agent-echo'], clock: ['dsh-agent-clock'], huanqi: ['dsh-huanqi', 'dsh-agent-huanqi'],
  'huanqi-panel': ['dsh-yanqing-huanqi-panel', 'dsh-agent-huanqi-panel'], 'mcp-hub': ['dsh-mcp-hub'], riji: ['dsh-agent-riji'], yantai: ['dsh-agent-yantai'],
  'compact-region': ['dsh-yanqing-compact-region', 'dsh-agent-compact-region'],
}
const NAMES = Object.fromEntries(Object.entries(PN).map(([p, n]) => [p, n[0]]))
const ALL = fileFixes({ runtime: '/x/.dsh/runtime', names: NAMES, dshHome: '/x/.dsh', partNames: PN })
const byId = (id) => ALL.find((f) => f.id === id)
const read = (f) => { try { return fs.readFileSync(f, 'utf8') } catch { return null } }

test('清单：23 条、id 不重复，文件补丁都登记在清单里，每条都有目标和证据', () => {
  assert.equal(FIXES.length, 23)
  assert.equal(new Set(FIX_IDS).size, FIX_IDS.length)
  for (const f of ALL) assert.equal(fixInfo(f.id)?.phase, 'file', f.id)
  assert.deepEqual(FIXES.filter((f) => f.phase === 'file').map((f) => f.id).sort(), ALL.map((f) => f.id).sort())
  for (const fix of FIXES) {
    assert.ok(fix.target && fix.type && fix.evidence.length && fix.validation.length, fix.id)
  }
})

test('organs 快照上：换气、compact-region 的五条都判定「问题还在」，锚点也对得上', () => {
  const hq = read(path.join(PARTS, 'huanqi', 'lib', 'index.js')), cr = read(path.join(PARTS, 'compact-region', 'index.js'))
  for (const [id, t] of [['huanqi-hub-path', hq], ['huanqi-full-maint', hq], ['huanqi-trigger-idle', hq], ['cr-hub-path', cr], ['cr-input', cr]]) {
    assert.equal(detectFix(byId(id), t), 'present', id)
    assert.ok(t.includes(byId(id).old), id)
  }
})

test('作者用自己的写法修好以后判定「作者已修」，认不出那段代码时判定「判断不了」', () => {
  const hq = read(path.join(PARTS, 'huanqi', 'lib', 'index.js'))
  const own = hq.split("'D:\\\\AI\\\\memory\\\\hub\\\\_plugin-diag.log'").join("join(hub, '_plugin-diag.log')").split("'D:\\\\AI\\\\memory\\\\hub\\\\_huanqi-trigger.json'").join("join(hub, '_huanqi-trigger.json')")
  assert.equal(detectFix(byId('huanqi-hub-path'), own), 'absent')
  assert.equal(detectFix(byId('huanqi-full-maint'), hq.replace(MAINT_OLD, '                await svc.compactNow(manualCtx, ac.signal);')), 'absent')
  const cr = read(path.join(PARTS, 'compact-region', 'index.js'))
  assert.equal(detectFix(byId('cr-input'), cr.replace('        handler,', "        input: { hint: 'a b' },\n        handler,")), 'absent')
  assert.equal(detectFix(byId('memory-home'), "const anchorUser = (p) => (p ? join(home(), p) : '');"), 'absent')
  assert.equal(detectFix(byId('memory-home'), 'export default {}'), 'unknown')
  assert.equal(detectFix(byId('echo-load-name'), '- insert:\n    - id: echo\n      name: dsh-agent-echo\n'), 'present')
  assert.equal(detectFix(byId('echo-load-name'), '- insert:\n    - id: echo\n      name: dsh-yanqing-echo\n'), 'absent')
})

// 一条造出来的修复：问题 = 文本里有 BAD；kit 把 BAD 换成 GOOD
const FAKE = { id: 'fake', old: 'BAD', new: 'GOOD // kit', any: /GOOD(?: \/\/ kit)?|OLDKIT/, problem: 'BAD', fixed: /value = FIXED/, scope: /value =/ }
const UP = 'const value = BAD\n'

test('planFile：打上、保持、换写法、本机改过、判断不了', () => {
  let r = planFile({ upstream: UP, installed: UP, fixes: [FAKE] })
  assert.equal(r.state, 'rewrite'); assert.equal(r.target, 'const value = GOOD // kit\n'); assert.equal(r.rows[0].action, 'apply'); assert.equal(r.rows[0].status, 'kit')
  r = planFile({ upstream: UP, installed: 'const value = GOOD // kit\n', fixes: [FAKE] })
  assert.equal(r.state, 'same'); assert.equal(r.rows[0].action, 'keep')
  r = planFile({ upstream: UP, installed: 'const value = OLDKIT\n', fixes: [FAKE] })
  assert.equal(r.state, 'rewrite'); assert.equal(r.rows[0].action, 'refresh')
  r = planFile({ upstream: UP, installed: 'const value = BAD\n// 手改\n', fixes: [FAKE] })
  assert.equal(r.state, 'local'); assert.equal(r.rows[0].action, 'local')
  r = planFile({ upstream: 'something else\n', installed: 'something else\n', fixes: [FAKE] })
  assert.equal(r.rows[0].status, 'manual'); assert.equal(r.state, 'same')
  r = planFile({ upstream: UP, installed: null, fixes: [FAKE] })
  assert.equal(r.state, 'missing'); assert.equal(r.rows[0].action, 'apply')
})

test('planFile：作者已修就不打；跳过的撤掉换回作者原文；--fix-only 没选的保持现状', () => {
  let r = planFile({ upstream: 'const value = FIXED\n', installed: 'const value = FIXED\n', fixes: [FAKE] })
  assert.equal(r.rows[0].status, 'author'); assert.equal(r.rows[0].action, 'keep'); assert.equal(r.state, 'same')
  r = planFile({ upstream: UP, installed: 'const value = GOOD // kit\n', fixes: [FAKE], skip: ['fake'] })
  assert.equal(r.rows[0].status, 'skipped'); assert.equal(r.rows[0].action, 'revert'); assert.equal(r.target, UP)
  r = planFile({ upstream: UP, installed: UP, fixes: [FAKE], freeze: ['fake'] })
  assert.equal(r.rows[0].status, 'frozen'); assert.equal(r.state, 'same')
  r = planFile({ upstream: UP, installed: 'const value = GOOD // kit\n', fixes: [FAKE], freeze: ['fake'] })
  assert.equal(r.state, 'same')
})

test('planFile 用真条目：作者原文 → 打上全部；打完再算一遍是「保持」', () => {
  const hq = read(path.join(PARTS, 'huanqi', 'lib', 'index.js'))
  const fx = ALL.filter((f) => f.pkg === 'dsh-huanqi')
  const a = planFile({ upstream: hq, installed: hq, fixes: fx })
  assert.deepEqual(a.rows.map((r) => r.action), ['apply', 'apply', 'apply'])
  const b = planFile({ upstream: hq, installed: a.target, fixes: fx })
  assert.equal(b.state, 'same'); assert.deepEqual(b.rows.map((r) => r.action), ['keep', 'keep', 'keep'])
  assert.equal(patchText('aXa', { new: 'Y', all: true }, 'X'), 'aYa')
})

test('16 条文件修复逐条可还原到原始字节，未选中的旧写法不被刷新', () => {
  for (const fix of ALL) {
    const upstream = fix.old
    const applied = planFile({ upstream, installed: upstream, fixes: [fix] })
    assert.equal(applied.rows[0].status, 'kit', fix.id)
    const reverted = planFile({ upstream, installed: applied.target, fixes: [fix], skip: [fix.id] })
    assert.equal(reverted.target, upstream, fix.id)
    assert.equal(reverted.state, 'rewrite', fix.id)
  }
  const frozen = planFile({ upstream: UP, installed: 'const value = OLDKIT\n', fixes: [FAKE], freeze: ['fake'] })
  assert.equal(frozen.target, 'const value = OLDKIT\n')
  assert.equal(frozen.state, 'same')
})

test('装前、配置、preset 的判定', () => {
  assert.equal(detectHuanqiSource('no', "commands.execute(agent, '/compact-region 1 2')"), 'present')
  assert.equal(detectHuanqiSource("x('/compact-region')", 'whatever'), 'absent')
  assert.equal(detectHuanqiSource('no', 'no'), 'unknown')
  assert.equal(detectName('dsh-agent-compaction', 'dsh-yanqing-compaction'), 'present')
  assert.equal(detectName('dsh-yanqing-compaction', 'dsh-yanqing-compaction'), 'absent')
  assert.equal(detectConfigBool("- id: huanqi\n  config:\n    fullCompactOnBreaker: 'true'\n"), 'present')
  assert.equal(detectConfigBool('- id: huanqi\n  config:\n    fullCompactOnBreaker: true\n'), 'absent')
  assert.equal(detectSummaryRoute(['        summarizationProvider: deepseek-official\n']), 'present')
  assert.equal(detectSummaryRoute(['        thresholdRatio: 0.88\n']), 'absent')
  assert.equal(defaultProvider('- id: agent-default-model\n  name: x\n  config:\n    provider: deepseek-account\n    model: deepseek-flash\n'), 'deepseek-account')
  assert.equal(defaultProvider('- id: other\n'), null)
})

test('迭代归类：仍需修 / 作者这次修好 / 原文对不上 / 不再适用；快照上全是「仍需修」', () => {
  assert.equal(classifyFix({ detect: 'present' }, { detect: 'present', anchor: true }), 'still-needed')
  assert.equal(classifyFix({ detect: 'present' }, { detect: 'absent' }), 'author-fixed')
  assert.equal(classifyFix({ detect: 'absent' }, { detect: 'absent' }), 'already-fixed')
  assert.equal(classifyFix({ detect: 'present' }, { detect: 'present', anchor: false }), 'anchor-broken')
  assert.equal(classifyFix({ detect: 'present' }, { detect: 'unknown' }), 'anchor-broken')
  assert.equal(classifyFix({ detect: 'present' }, { detect: 'missing' }), 'not-applicable')
  // 主仓的换气不调 /compact-region → 换气按 organs 判定
  const main = fs.mkdtempSync(path.join(os.tmpdir(), 'soul-kit-main-'))
  fs.mkdirSync(path.join(main, 'plugins', 'huanqi', 'lib'), { recursive: true })
  fs.writeFileSync(path.join(main, 'plugins', 'huanqi', 'lib', 'index.js'), 'export function apply() {}\n')
  fs.writeFileSync(path.join(main, 'plugins', 'huanqi', 'package.json'), JSON.stringify({ name: 'dsh-huanqi' }))
  fs.mkdirSync(path.join(main, 'presets'))
  fs.writeFileSync(path.join(main, 'presets', 'preset-yanqing.yml'), 'name: dsh-yanqing-compact-region\n')
  const ins = inspectUpstream({ main, organs: PARTS, partNames: PN, read })
  assert.equal(ins['src-huanqi-organs'].detect, 'present')
  for (const id of ['huanqi-hub-path', 'huanqi-full-maint', 'huanqi-trigger-idle', 'cr-hub-path', 'cr-input', 'name-compact-region', 'name-huanqi']) assert.equal(ins[id].detect, 'present', id)
  assert.equal(ins['memory-home'].detect, 'missing')
  fs.rmSync(main, { recursive: true, force: true })
})

test('疑似新问题：写死 Windows 路径、加载名 ≠ 包名；注释里的和清单已管的文件不报', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'soul-kit-cand-'))
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'dsh-x' }))
  fs.writeFileSync(path.join(dir, 'a.js'), "// 'D:\\\\in\\\\comment'\nconst P = 'D:\\\\AI\\\\x'\n")
  fs.writeFileSync(path.join(dir, 'b.js'), "const P = 'C:/covered'\n")
  fs.writeFileSync(path.join(dir, 'cordis.patch.yml'), '- insert:\n    - id: x\n      name: dsh-old-x\n')
  const out = scanCandidates({ dirs: [{ dir, rel: 'plugins/x', files: ['a.js', 'b.js', 'cordis.patch.yml'] }], read, covered: new Set(['plugins/x/b.js']) })
  assert.deepEqual(out.map((c) => [c.kind, c.file]), [['hardcoded-path', 'plugins/x/a.js'], ['load-name', 'plugins/x/cordis.patch.yml']])
  assert.match(out[0].message, /第 2 行/)
  fs.rmSync(dir, { recursive: true, force: true })
})
