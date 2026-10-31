// 修复清单（lib/fixes.mjs）：每条修复「问题还在不在」的判定、文件级重算（planFile）、迭代归类。
// 素材是就地造的小段文本（照上游 4606555 里换气、compact-region 的原样写法），不碰本机 DSH。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { FIXES, FIX_IDS, fixInfo, fileFixes, detectFix, planFile, patchText, detectConfigBool, detectSummaryRoute, defaultProvider, inspectUpstream, classifyFix, scanCandidates } from '../lib/fixes.mjs'
import { MAINT_OLD, IDLE_OLD, INPUT_OLD } from '../lib/huanqi-patches.mjs'
import { PART_NAMES as PN } from '../lib/parts.mjs'

// 换气 lib/index.js 里和修复清单有关的几段（上游写法）：写死作者电脑的记忆中枢、套两层 runMaintenance、测试触发口
const HQ = [
  "        const TRIGGER = 'D:\\\\AI\\\\memory\\\\hub\\\\_huanqi-trigger.json';",
  "                appendFileSync('D:\\\\AI\\\\memory\\\\hub\\\\_plugin-diag.log', line);",
  MAINT_OLD,
  IDLE_OLD,
].join('\n') + '\n'
// 作者 10-31 的测试触发口：明确不等 idle
const HQ_1031 = HQ.replace(IDLE_OLD, IDLE_OLD.split('\n').slice(0, 2).join('\n') + '\n                        /* ★★★ 2026-10-31（砚青·修正）：**这里绝对不能等 idle。** */\n                        const outcome = await compactOnce(target, m, targetSid);')
// compact-region 10-31：日志改走 DSH_PLUGIN_DIAG / 临时目录，只在注释里提到旧路径；命令还没声明 input
const CR_CMD = "      commands.register({\n        name: 'compact-region',\n" + INPUT_OLD + '\n'
const CR_1031 = "//   原来写死 `D:\\AI\\memory\\hub\\_plugin-diag.log` —— 那是本机路径\nconst LOG = process.env.DSH_PLUGIN_DIAG || join(tmpdir(), '_dsh-plugin-diag.log')\n" + CR_CMD
const CR_OLD = "const LOG = 'D:\\\\AI\\\\memory\\\\hub\\\\_plugin-diag.log'\n" + CR_CMD
const NAMES = Object.fromEntries(Object.entries(PN).map(([p, n]) => [p, n[0]]))
const ALL = fileFixes({ runtime: '/x/.dsh/runtime', names: NAMES, dshHome: '/x/.dsh', partNames: PN })
const byId = (id) => ALL.find((f) => f.id === id)
const read = (f) => { try { return fs.readFileSync(f, 'utf8') } catch { return null } }

test('清单：20 条、id 不重复，文件补丁都登记在清单里，每条都有目标和证据', () => {
  assert.equal(FIXES.length, 20)
  assert.equal(new Set(FIX_IDS).size, FIX_IDS.length)
  for (const f of ALL) assert.equal(fixInfo(f.id)?.phase, 'file', f.id)
  assert.deepEqual(FIXES.filter((f) => f.phase === 'file').map((f) => f.id).sort(), ALL.map((f) => f.id).sort())
  for (const fix of FIXES) {
    assert.ok(fix.target && fix.type && fix.evidence.length && fix.validation.length, fix.id)
  }
})

test('换气、compact-region：旧写法判定「问题还在」；作者 10-31 改过的两条判定「作者已修」，注释里的旧路径不算', () => {
  for (const [id, t] of [['huanqi-hub-path', HQ], ['huanqi-full-maint', HQ], ['huanqi-trigger-idle', HQ], ['cr-hub-path', CR_OLD], ['cr-input', CR_OLD]]) {
    assert.equal(detectFix(byId(id), t), 'present', id)
    assert.ok(t.includes(byId(id).old), id)
  }
  assert.equal(detectFix(byId('huanqi-trigger-idle'), HQ_1031), 'absent')
  assert.equal(detectFix(byId('huanqi-hub-path'), HQ_1031), 'present')
  assert.equal(detectFix(byId('cr-hub-path'), CR_1031), 'absent')
  assert.equal(detectFix(byId('cr-input'), CR_1031), 'present')
})

test('作者用自己的写法修好以后判定「作者已修」，认不出那段代码时判定「判断不了」', () => {
  const own = HQ.split("'D:\\\\AI\\\\memory\\\\hub\\\\_plugin-diag.log'").join("join(hub, '_plugin-diag.log')").split("'D:\\\\AI\\\\memory\\\\hub\\\\_huanqi-trigger.json'").join("join(hub, '_huanqi-trigger.json')")
  assert.equal(detectFix(byId('huanqi-hub-path'), own), 'absent')
  assert.equal(detectFix(byId('huanqi-full-maint'), HQ.replace(MAINT_OLD, '                await svc.compactNow(manualCtx, ac.signal);')), 'absent')
  assert.equal(detectFix(byId('cr-input'), CR_OLD.replace('        handler,', "        input: { hint: 'a b' },\n        handler,")), 'absent')
  assert.equal(detectFix(byId('memory-home'), "const anchorUser = (p) => (p ? join(home(), p) : '');"), 'absent')
  assert.equal(detectFix(byId('memory-home'), 'export default {}'), 'unknown')
  assert.equal(detectFix(byId('clock-panel'), '".dsh-agent-clock-panel{position:fixed;z-index:2147482000;"'), 'absent')
  // 4.0：包名回到 dsh-agent-echo，上游 cordis.patch.yml 还在用旧名 dsh-yanqing-echo 加载
  assert.equal(detectFix(byId('echo-load-name'), '- insert:\n    - id: echo\n      name: dsh-yanqing-echo\n'), 'present')
  assert.equal(detectFix(byId('echo-load-name'), '- insert:\n    - id: echo\n      name: dsh-agent-echo\n'), 'absent')
  // echo 面板的失败诊断（上游 10-30 新加）也写死了作者电脑的记忆中枢
  assert.equal(detectFix(byId('echo-hub-path'), "          fs.appendFileSync('D:\\\\AI\\\\memory\\\\hub\\\\_plugin-diag.log',"), 'present')
  // echo 面板找 node：只认 Windows 布局时问题在，作者加了 macOS 布局就算修好
  const node = `function resolveNode() {\n  const guesses = [\n${byId('echo-node-darwin').old}\n}`
  assert.equal(detectFix(byId('echo-node-darwin'), node), 'present')
  assert.equal(detectFix(byId('echo-node-darwin'), node.replace("'bin', 'node.exe'),\n  ]", "'bin', 'node.exe'),\n    path.join(root, '..', 'Resources', 'x'),\n  ]")), 'absent')
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
  const fx = ALL.filter((f) => f.pkg === 'dsh-huanqi')
  const a = planFile({ upstream: HQ, installed: HQ, fixes: fx })
  assert.deepEqual(a.rows.map((r) => r.action), ['apply', 'apply', 'apply'])
  const b = planFile({ upstream: HQ, installed: a.target, fixes: fx })
  assert.equal(b.state, 'same'); assert.deepEqual(b.rows.map((r) => r.action), ['keep', 'keep', 'keep'])
  assert.equal(patchText('aXa', { new: 'Y', all: true }, 'X'), 'aYa')
})

test('18 条文件修复逐条可还原到原始字节，未选中的旧写法不被刷新', () => {
  assert.equal(ALL.length, 18)
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

test('配置、preset 的判定', () => {
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
  // 4.0：只看主仓 plugins/（换气、compact-region 都在主仓）
  const main = fs.mkdtempSync(path.join(os.tmpdir(), 'soul-kit-main-'))
  fs.mkdirSync(path.join(main, 'plugins', 'huanqi', 'lib'), { recursive: true })
  fs.mkdirSync(path.join(main, 'plugins', 'compact-region'), { recursive: true })
  fs.writeFileSync(path.join(main, 'plugins', 'huanqi', 'lib', 'index.js'), HQ_1031)
  fs.writeFileSync(path.join(main, 'plugins', 'compact-region', 'index.js'), CR_1031)
  const ins = inspectUpstream({ main, partNames: PN, read })
  for (const id of ['huanqi-hub-path', 'huanqi-full-maint', 'cr-input']) assert.equal(ins[id].detect, 'present', id)
  for (const id of ['huanqi-trigger-idle', 'cr-hub-path']) assert.equal(ins[id].detect, 'absent', id)
  assert.equal(ins['memory-home'].detect, 'missing')
  assert.ok(!('src-huanqi-organs' in ins))
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
