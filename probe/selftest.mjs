#!/usr/bin/env node
// 自检：在临时目录里造一个假 DSH 家目录，跑两个 probe，断言输出。
// 不碰真实安装；跑完删掉临时目录。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { NL } from './lib/common.mjs'
import { validateAnswers } from './lib/answers.mjs'
import { validatePlan } from './lib/plan.mjs'
import { chunk, questionPopups } from '../kit/setup/popups.mjs'
import * as scaffold from '../kit/setup/scaffold.mjs'
import * as replay from '../kit/setup/replay.mjs'
import { composeAnswers } from '../kit/setup/compose.mjs'
import { buildPlan, bundlePkgs, renderScript } from '../kit/setup/applygen.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-probe-'))
const home = path.join(tmp, '.dsh')
const profileDir = path.join(home, 'profiles', 'desktop')
const put = (rel, text) => {
  const full = path.join(home, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, text, 'utf8')
}

function runRaw(scriptPath, args) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8' })
  assert.equal(result.status, 0, path.basename(scriptPath) + ' 退出码非 0：' + result.stderr)
  return JSON.parse(result.stdout)
}

function run(script, args) {
  return runRaw(path.join(here, script), args)
}

try {
  put('profiles/desktop/node_modules/dsh-agent-pkg-a/package.json', JSON.stringify({ name: 'dsh-agent-pkg-a' }))
  put('profiles/desktop/node_modules/.bin/ignored', '')
  put('profiles/desktop/cordis.patch.yml', 'x: 1' + NL)
  put('profiles/desktop/skills/creation/SKILL.md', '---' + NL + 'name: creation' + NL + '---' + NL)
  put('dsh-soul/.install-state.json', JSON.stringify({ upstream: { sha: 'a'.repeat(40) }, parts: ['dsh-agent-pkg-a'], declined: [] }))
  put('logs/2026-11-06.jsonl', [
    JSON.stringify({ level: 'error', time: '2026-11-06T14:00:00+08:00', message: 'boom',
      error: { stack: 'Error: boom' + NL + '    at f (/x/node_modules/dsh-agent-pkg-a/index.js:1:1)' } }),
    JSON.stringify({ level: 'error', message: 'unowned', error: { stack: 'Error: unowned' + NL + '    at g (/x/app/main.js:2:2)' } }),
    JSON.stringify({ level: 'info', message: 'noise' }),
    'not json at all',
  ].join(NL))

  // 1. local：认出零件、patch、skills、安装记录、日志摘要
  const local = run('local.mjs', ['--dsh-home', home])
  assert.equal(local.profile, 'desktop')
  assert.equal(local.installState.exists, true)
  assert.equal(local.installState.parts.length, 1)
  assert.deepEqual(local.installedPackages.map((p) => p.dir), ['dsh-agent-pkg-a'])
  assert.equal(local.installedPackages[0].name, 'dsh-agent-pkg-a')
  assert.deepEqual(local.patchFiles, ['cordis.patch.yml'])
  assert.deepEqual(local.presetSkills, ['creation/SKILL.md'])
  assert.equal(local.logs.readable, true)
  assert.equal(local.logs.files, 1)
  assert.equal(local.soulData.exists, true)
  assert.equal(local.notes.length, 0)

  // 2. local：没有安装记录时必须出声，不能静默返回空
  const bare = run('local.mjs', ['--dsh-home', path.join(tmp, 'nowhere')])
  assert.equal(bare.installState.exists, false)
  assert.ok(bare.notes.some((note) => note.includes('没有安装记录')), '缺安装记录必须写进 notes')

  // 3. logs：只收 error、认清包、认不出的计入 unclaimed、坏行不炸
  const logs = run('logs.mjs', ['--dsh-home', home])
  assert.equal(logs.filesRead, 1)
  assert.equal(logs.entriesTotal, 2)
  assert.equal(logs.unclaimed, 1)
  const owned = logs.entries.find((entry) => entry.pkg === 'dsh-agent-pkg-a')
  assert.ok(owned, '栈在包内的错误必须认到包名')
  assert.equal(owned.stackInPackage, true)
  assert.equal(owned.message, 'boom')
  assert.ok(logs.entries.some((entry) => entry.pkg === null), '认不出的错误保留，包名为 null')

  // 5. upstream：认出零件、presets、templates、章节锚点
  const src = path.join(tmp, 'author')
  fs.mkdirSync(path.join(src, 'plugins', 'demo'), { recursive: true })
  fs.writeFileSync(path.join(src, 'plugins', 'demo', 'package.json'), JSON.stringify({
    name: 'dsh-agent-demo', version: '0.2.0', main: 'index.js',
    peerDependencies: { '@scope/host': '*' },
    dependencies: { '@scope/dep': '^1.0.0' },
  }))
  fs.mkdirSync(path.join(src, 'presets'), { recursive: true })
  fs.writeFileSync(path.join(src, 'presets', 'a.yml'), 'x: 1')
  fs.mkdirSync(path.join(src, 'templates'), { recursive: true })
  fs.writeFileSync(path.join(src, 'templates', 't.md'), 't')
  fs.writeFileSync(path.join(src, 'AGENT-INSTALL.md'), ['# 说明书', '## 一、规矩', '正文', '## 二、验收'].join(NL))
  fs.writeFileSync(path.join(src, 'README.md'), ['# demo', '', '## 全局必装', '', '| # | 声明 | 范围 | 为什么 |', '|---|---|---|---|',
    '| 1 | **压缩机制必装** | `demo` | 没有压缩就没有长时间工作 |', '| 2 | **账本必须实装** | `plugins/tools/ledger` | 双写者不倒 |', ''].join(NL))
  fs.writeFileSync(path.join(src, 'plugins', '清单.md'), ['# 清单', '', '| 层 | 一句话 | 零件 |', '|---|---|---|', '| Ⅰ ECHO | 空间：丢了还找不找得回来 | `demo` |', '',
    '| 零件 | 管什么 | 缺了会怎样 | 判据 | 验它活了 | 必选? | 前置 |', '|---|---|---|---|---|---|---|',
    '| `demo` | 演示零件 | 缺了就看不到演示 | 有没有跑起来 | 跑一次看面板 | ✓ | 无 |', ''].join(NL))
  fs.writeFileSync(path.join(src, 'presets', 'preset-demo.yml'), ['- id: preset-demo', "  name: '@deepseek-ai/dsh-agent-preset'", '  config:',
    '    id: demo', '    name: 演示档', '    description: >-', '      一行说明', '      第二行', '    plugins: []', ''].join(NL))
  const up = run('upstream.mjs', ['--source', src])
  assert.equal(up.readable, true)
  assert.equal(up.parts.length, 1)
  assert.equal(up.parts[0].dir, 'demo')
  assert.equal(up.parts[0].name, 'dsh-agent-demo')
  assert.equal(up.parts[0].hasEntry, true)
  assert.equal(up.presets.length, 2, 'presets/ 下两个 yml 都要扫到')
  assert.ok(up.presets.includes('presets/a.yml') && up.presets.includes('presets/preset-demo.yml'))
  assert.deepEqual(up.templates, ['templates/t.md'])
  assert.equal(up.installDocHeadings.length, 3, '章节锚点必须保住顺序与层级')
  assert.ok(up.notes.some((note) => note.includes('install.js')), '缺 install.js 要进 notes')
  assert.ok(up.notes.some((note) => note.includes('package.json')), '缺 package.json 要进 notes')

  // 5b. 必装集合 / 层 / 说明必须从上游文档读出来，不许靠 kit 常量
  assert.equal(up.mustInstall.found, true, '「全局必装」表要能读出来')
  assert.equal(up.mustInstall.rows.length, 2)
  assert.deepEqual(up.mustInstall.rows[0].parts, ['demo'], '反引号里的零件名要能对到 plugins/<目录>')
  assert.deepEqual(up.mustInstall.rows[1].scripts, ['plugins/tools/ledger'], '对不上零件的引用要进 scripts，不许丢')
  assert.equal(up.parts[0].mustInstall, true, '零件要带上「必装」标记')
  assert.equal(up.parts[0].required, true, '清单表里的 ✓ 要读成层内必选')
  assert.ok(String(up.parts[0].layer).startsWith('Ⅰ'), '层号与层名要拆开')
  assert.equal(up.parts[0].what, '演示零件')
  assert.equal(up.presetMeta[0].name, '演示档', 'preset 显示名要从 yml 里扫出来')
  assert.ok(up.presetMeta[0].description.includes('一行说明'), '> 折叠的多行说明要拼起来')

  // 5c. 弹窗形状：多选均衡分片、单选不硬切、标题不超 12 字
  const chunks = chunk(Array.from({ length: 21 }, (_, i) => i))
  assert.equal(chunks.length, 6, '21 个选项应分 6 片')
  assert.ok(chunks.every((c) => c.length <= 4 && c.length >= 2), '每片 2–4 个，不许出现只剩 1 个的片')
  const many = questionPopups([{ id: 'parts', group: 'G', type: 'multi', header: '装哪些零件这些', ask: '装哪些？',
    options: Array.from({ length: 9 }, (_, i) => ({ label: 'p' + i, value: 'p' + i, description: 'x' })) }])
  assert.equal(many[0].questions.length, 3, '9 个选项 → 3 道题')
  assert.ok(many[0].questions.every((q) => q.options.length <= 4 && q.header.length <= 12), '多选每道 ≤4 个选项、标题 ≤12 字')
  const choice = questionPopups([{ id: 'defaultPreset', group: 'G', type: 'choice', header: '默认 preset', ask: '哪个？',
    options: Array.from({ length: 5 }, (_, i) => ({ label: 's' + i, value: 's' + i, description: '' })) }])
  assert.equal(choice[0].questions[0].options.length, 5, '默认 preset 五个必须全列出来，不能只给前三个')

  // 5d. prereqs：宿主在不在、运行时依赖齐不齐、已装了什么非本架构的插件
  // 宿主自己的 @deepseek-ai/* 不查（在 asar 里），所以这里没有 peer 一说。
  put('profiles/desktop/node_modules/@scope/dep/package.json', JSON.stringify({ name: '@scope/dep', version: '1.2.3' }))

  const pre1 = run('prereqs.mjs', ['--source', src, '--dsh-home', home])
  assert.equal(pre1.readable, true)
  const dep = pre1.runtime.find((p) => p.pkg === '@scope/dep')
  assert.equal(dep.status, 'ok', '★ scoped 包在 @scope/<name> 下，跳过 "@" 开头的目录会把它判成缺')
  assert.equal(dep.foundAt, 'profile')
  assert.equal('peers' in pre1, false, 'peer 依赖不再查：宿主包在 asar 里，查了只会是假结论')
  assert.equal('hostsGiven' in pre1, false, '不再有 --host 这条路')
  assert.ok(pre1.external.some((e) => e.dir === 'dsh-agent-pkg-a'), '本架构之外的已装插件要单独列出来')
  assert.equal(pre1.willOverwrite.length, 0, '没有同名零件时不许乱报覆盖')
  assert.equal(pre1.host.profileDir, true)

  // 5e. prereqs：前置按上游自己声明的查（文档点名的外部插件 + 服务类），kit 不另列一张表
  const docSrc = path.join(tmp, 'author-docs')
  fs.mkdirSync(path.join(docSrc, 'plugins', 'demo2'), { recursive: true })
  fs.writeFileSync(path.join(docSrc, 'plugins', 'demo2', 'package.json'), JSON.stringify({ name: 'dsh-agent-doc', version: '0.1.0', main: 'index.js' }))
  fs.writeFileSync(path.join(docSrc, 'plugins', 'demo2', 'README.md'), [
    '# demo2', '',
    '先装 `dsh-mnemon`，否则探针拿不到热记忆。',
    '需要：一个 QQ 网关，和浏览器。',
    '不需要浏览器也能跑单测。',
    '',
  ].join(NL))
  fs.writeFileSync(path.join(docSrc, 'plugins', '清单.md'), ['# 清单', '', '别和 `dsh-loop-guard` 一起装。', ''].join(NL))

  const pre3 = run('prereqs.mjs', ['--source', docSrc, '--dsh-home', home])
  const mnemon = pre3.docPackages.find((p) => p.pkg === 'dsh-mnemon')
  assert.ok(mnemon, '文档里点名的 dsh-mnemon 必须被认出来')
  assert.equal(mnemon.kind, 'required')
  assert.equal(mnemon.status, 'missing', 'profile 里没有就是 missing')
  const avoidItem = pre3.docPackages.find((p) => p.pkg === 'dsh-loop-guard')
  assert.ok(avoidItem && avoidItem.kind === 'avoid', '「别和 X 一起装」要归到 avoid，不能算成 required')
  assert.ok(pre3.declaredNeeds.some((n) => n.text.includes('QQ 网关')), '服务类前置要原样收下')
  assert.equal(pre3.declaredNeeds.some((n) => n.text.includes('不需要浏览器')), false, '带「不需要」的行不许收')
  assert.ok(pre3.notes.some((n) => n.includes('dsh-mnemon')), '缺前置要在 notes 里点名')

  // 6. upstream：没有 --source 时必须说不可知，不能返回空结构冒充查过了
  const noSrc = run('upstream.mjs', [])
  assert.equal(noSrc.readable, false)
  assert.ok(noSrc.notes.length > 0)

  // 7. references：同一标识上游与本机各自定位到行
  fs.writeFileSync(path.join(src, 'plugins', 'demo', 'cordis.patch.yml'), '- id: dsh-agent-demo' + NL)
  put('profiles/desktop/package.json', JSON.stringify({ dependencies: { 'dsh-agent-demo': 'file:x' } }, null, 2))
  const refs = run('references.mjs', ['--name', 'dsh-agent-demo', '--source', src, '--dsh-home', home])
  const upHits = refs.names['dsh-agent-demo'].upstream
  const localHits = refs.names['dsh-agent-demo'].local
  assert.equal(upHits.length, 2, '上游应有 package.json 与 patch 两处命中')
  assert.ok(upHits.every((hit) => hit.line > 0))
  assert.equal(localHits.length, 1)
  assert.ok(localHits[0].file.endsWith('package.json'))

  // 8. references：不给 --name 就不猜要查什么
  const noName = run('references.mjs', [])
  assert.deepEqual(noName.names, {})
  // 4. logs：日志目录不存在 → readable false，不假装读过
  const none = run('logs.mjs', ['--dsh-home', path.join(tmp, 'nowhere')])
  assert.equal(none.readable, false)
  assert.equal(none.filesRead, 0)


  // 9. files：四种状态齐全——同、异、只在左、只在右
  const dA = path.join(tmp, 'diffA')
  const dB = path.join(tmp, 'diffB')
  const mk = (root, rel, text) => {
    const full = path.join(root, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, text, 'utf8')
  }
  const manifest = (name, version) => JSON.stringify({ name, version, main: 'index.js' })

  mk(dA, 'plugins/demo/package.json', manifest('dsh-agent-demo', '0.2.0'))
  mk(dA, 'plugins/demo/index.js', 'one' + NL + 'two')
  mk(dA, 'plugins/old/package.json', manifest('dsh-agent-old', '0.1.0'))
  mk(dA, 'plugins/gone/package.json', manifest('dsh-agent-gone', '0.5.0'))
  mk(dA, 'docs/same.md', 'identical' + NL)
  mk(dA, 'AGENT-INSTALL.md', ['# 说明书', '## 一、规矩', '## 二、验收'].join(NL))

  mk(dB, 'plugins/demo/package.json', manifest('dsh-agent-demo', '0.3.0'))
  mk(dB, 'plugins/demo/index.js', 'one' + NL + 'changed')
  mk(dB, 'plugins/old-renamed/package.json', manifest('dsh-agent-old', '0.1.0'))
  mk(dB, 'plugins/fresh/package.json', manifest('dsh-agent-fresh', '1.0.0'))
  mk(dB, 'docs/same.md', 'identical' + NL)
  mk(dB, 'AGENT-INSTALL.md', ['# 说明书', '## 一、规矩', '## 三、新验收'].join(NL))

  const cmp = run('files.mjs', ['--a', dA, '--b', dB, '--snippet', '2'])
  assert.equal(cmp.readable, true)
  assert.equal(cmp.summary.same, 1, '内容相同要算 same，不能混进差异')
  // 文件级看不出「改名」：旧的 old/ 与新的 old-renamed/ 各算一边。改名是 diff.mjs 的事，
  // 两个脚本分开正是为了这个——一个说「哪几个文件不同」，一个说「这是改名不是增删」。
  assert.equal(cmp.summary.onlyA, 2, '只在左边的是删除，不是改动')
  assert.equal(cmp.summary.onlyB, 2, '只在右边的是新增')
  const sameEntry = cmp.changed.find((item) => item.path === 'docs/same.md')
  assert.equal(sameEntry, undefined, '相同文件不该出现在差异列表里')
  const changedEntry = cmp.changed.find((item) => item.path === 'plugins/demo/index.js')
  assert.equal(changedEntry.state, 'changed')
  assert.notEqual(changedEntry.shaA, changedEntry.shaB, '两边哈希必须不同才是真改了')
  assert.equal(changedEntry.snippet.length, 2, '--snippet 要给够行数')
  assert.ok(changedEntry.snippet.includes('changed'), '片段必须是现状原文')

  // 10. files：缺一边就说不可比，不拿空结果冒充「没差异」
  const partial = run('files.mjs', ['--a', dA])
  assert.equal(partial.readable, false)
  assert.ok(partial.notes.length > 0)

  // 11. diff：增、删、改名、版本变化、锚点变化各归各位
  const d = run('diff.mjs', ['--a', dA, '--b', dB])
  assert.equal(d.readable, true)
  assert.equal(d.identical, false)
  assert.deepEqual(d.parts.added.map((item) => item.dir), ['fresh'])
  assert.deepEqual(d.parts.removed.map((item) => item.dir), ['gone'])
  assert.equal(d.parts.renamed.length, 1)
  assert.equal(d.parts.renamed[0].from, 'old')
  assert.equal(d.parts.renamed[0].to, 'old-renamed')
  assert.equal(d.parts.added.length + d.parts.removed.length, 2, '改名不能同时算成增和删')
  const versionChange = d.parts.changed.find((item) => item.dir === 'demo')
  assert.ok(versionChange, '版本变了必须报')
  assert.ok(versionChange.fields.some((item) => item.field === 'version' && item.after === '0.3.0'))
  assert.ok(d.headings.added.includes('## 三、新验收'))
  assert.ok(d.headings.removed.includes('## 二、验收'))

  // 12. diff：同一棵树比自己必须报「无结构差」，不能因为算法漏项假装有变化
  const self = run('diff.mjs', ['--a', dA, '--b', dA])
  assert.equal(self.identical, true)
  assert.equal(self.parts.changed.length, 0)

  // 13. diff：缺一边就说不可比
  const noB = run('diff.mjs', ['--a', dA])
  assert.equal(noB.readable, false)

  // 14. applycheck：合格的 apply 目录——静态检查过、计划合法
  const good = path.join(tmp, 'apply-good')
  fs.mkdirSync(good, { recursive: true })
  fs.writeFileSync(path.join(good, 'answers.json'), JSON.stringify({
    version: 2,
    profile: 'desktop',
    paths: { soul: '/tmp/soul', memory: '/tmp/mem' },
    setup: { name: 'demo', user: 'boss', userNote: '', purpose: '', hardLines: [{ name: '凭据', rule: '不读' }], customHardLines: [], persona: '', multiSession: true, windowSize: null, hasIndex: false, setupName: 'demo' },
    parts: { install: ['demo'], declined: [] },
    presets: ['preset-demo'],
    defaultPreset: 'preset-demo',
    register: true,
    skills: true,
    writeConfig: true,
    asked: [{ id: 'parts', question: '装哪些零件', options: ['A', 'B'], recommended: 'A', answer: ['demo'], source: 'user' }],
  }))
  fs.writeFileSync(path.join(good, 'meta.json'), JSON.stringify({ upstream: 'a', local: 'b', kit: '1.0.0', answers: 'c' }))
  fs.writeFileSync(path.join(good, 'apply.mjs'), [
    'const plan = {',
    '  version: 1,',
    '  action: \'install\',',
    '  steps: [',
    '    { kind: \'copy\', from: \'plugins/demo\', to: \'node_modules/dsh-agent-demo\' },',
    '    { kind: \'write-config\', file: \'cordis.patch.yml\', backup: \'backups/cordis.patch.yml\' }',
    '  ],',
    '  risks: [],',
    '  rollback: \'backups\',',
    '  needsRestart: true',
    '}',
    'process.stdout.write(JSON.stringify(plan))',
  ].join(String.fromCharCode(10)))

  const goodCheck = run('applycheck.mjs', ['--dir', good, '--run'])
  assert.equal(goodCheck.ok, true, '合格的 apply 必须判 ok')
  assert.equal(goodCheck.executed, true)
  assert.equal(goodCheck.plan.ok, true)
  assert.ok(goodCheck.plan.notes.some((note) => note.includes('重启')), '需要重启要提醒，不能默认静默')
  assert.ok(goodCheck.checks.every((item) => item.ok))

  // 15. applycheck：坏计划——写配置没备份、跳过没原因、没回滚点、重启字段不是布尔
  const bad = path.join(tmp, 'apply-bad')
  fs.mkdirSync(bad, { recursive: true })
  fs.writeFileSync(path.join(bad, 'answers.json'), '{}')
  fs.writeFileSync(path.join(bad, 'apply.mjs'), [
    'const plan = {',
    '  version: 1,',
    '  action: \'install\',',
    '  steps: [',
    '    { kind: \'write-config\', file: \'cordis.patch.yml\' },',
    '    { kind: \'skip\', what: \'dsh-agent-demo\' }',
    '  ],',
    '  risks: [],',
    '  rollback: \'\',',
    '  needsRestart: \'yes\'',
    '}',
    'process.stdout.write(JSON.stringify(plan))',
  ].join(String.fromCharCode(10)))

  const badCheck = run('applycheck.mjs', ['--dir', bad, '--run'])
  assert.equal(badCheck.ok, false)
  const codes = badCheck.plan.failures.map((item) => item.code)
  assert.ok(codes.includes('meta/exists') === false, 'meta 缺失是静态检查的事，不该混进计划校验')
  assert.ok(codes.includes('step/backup'), '写配置必须有备份')
  assert.ok(codes.includes('step/why'), '跳过必须写原因')
  assert.ok(codes.includes('plan/rollback'), '没有回滚点不许开始')
  assert.ok(codes.includes('plan/needsRestart'), '重启字段必须是布尔')
  assert.ok(badCheck.checks.some((item) => item.name === 'meta/exists' && !item.ok), '缺 meta.json 要报出来')

  // 16. applycheck：不传 --run 就绝不执行——默认姿势是只看不跑
  const staticOnly = run('applycheck.mjs', ['--dir', good])
  assert.equal(staticOnly.executed, false)
  assert.equal(staticOnly.plan, null)
  assert.ok(staticOnly.notes.some((note) => note.includes('--run')), '要说清为什么没执行')

  // 16b. answers 形状：必填项齐、asked 说清谁定的，才叫「选项定下来了」
  // 只查「文件在不在」等于让人在执行时刻补决定——那正是 playbook §二 要防的。
  const goodShape = goodCheck.checks.find((item) => item.name === 'answers/shape')
  assert.ok(goodShape, 'applycheck 必须检查 answers 的形状')
  assert.equal(goodShape.ok, true, '必填项齐、asked 有 source 的 answers 必须判过')

  const shapeBad = path.join(tmp, 'apply-shape-bad')
  fs.mkdirSync(shapeBad, { recursive: true })
  // 缺 version / presets / register / skills / writeConfig；source 是猜的；parts 还是旧形状
  fs.writeFileSync(path.join(shapeBad, 'answers.json'), JSON.stringify({
    profile: 'desktop',
    parts: ['dsh-agent-demo'],
    asked: [{ id: 'parts', answer: ['dsh-agent-demo'], source: 'guess' }],
  }))
  const shapeOut = run('applycheck.mjs', ['--dir', shapeBad])
  const shapeCheck = shapeOut.checks.find((item) => item.name === 'answers/shape')
  assert.equal(shapeCheck.ok, false, '半个形状不许判过')
  for (const code of ['answers/version', 'answers/presets', 'answers/register', 'answers/parts']) {
    assert.ok(shapeCheck.detail.includes(code), '要报到具体字段：' + code)
  }
  assert.ok(shapeCheck.detail.includes('answers/asked/source'), '猜出来的来源必须报，不能当成用户定的')
  assert.equal(shapeOut.ok, false, '静态检查有红就不许判 ok')

  // 16c. defaultPreset 不在 presets 里 = picker 里不会出现，必须拦
  const dpDir = path.join(tmp, 'apply-default-preset')
  fs.mkdirSync(dpDir, { recursive: true })
  fs.writeFileSync(path.join(dpDir, 'answers.json'), JSON.stringify({
    version: 2,
    profile: 'desktop',
    paths: { soul: '/tmp/soul', memory: '/tmp/mem' },
    setup: { name: 'demo', user: 'boss', userNote: '', purpose: '', hardLines: [{ name: '凭据', rule: '不读' }], customHardLines: [], persona: '', multiSession: true, windowSize: null, hasIndex: false, setupName: 'demo' },
    parts: { install: ['demo'], declined: [] },
    presets: ['preset-a'],
    defaultPreset: 'preset-b',
    register: true, skills: true, writeConfig: true,
    asked: [{ id: 'parts', answer: ['demo'], source: 'user' }],
  }))
  const dpOut = run('applycheck.mjs', ['--dir', dpDir])
  const dpCheck = dpOut.checks.find((item) => item.name === 'answers/shape')
  assert.equal(dpCheck.ok, false, '默认 preset 越界必须判红')
  assert.ok(dpCheck.detail.includes('answers/defaultPreset'), '要指名 defaultPreset，不能只说「形状不对」')

  // 16d. scaffold：kit 不渲染 soul 文件，只把答案接给上游三个工具
  const initA = scaffold.toInitAnswers({
    name: '小鲸', user: '老板', purpose: '写代码',
    hardLines: [{ name: '凭据', rule: 'x' }, '交易'],
    customHardLines: [{ name: '删除', rule: 'y' }],
    multiSession: true, hasIndex: false, windowSize: 1000000,
  }, '/dsh/dsh-soul/soul')
  assert.equal(initA.hardLines, '凭据,交易,删除', '内置与自定硬线要合成一行短名，去重')
  assert.equal(initA.multiSession, 'y')
  assert.equal(initA.hasIndex, 'n')
  assert.equal(initA.authorityDir, 'soul', '目录名跟着书房根走，换路径不用改上游')
  assert.deepEqual(scaffold.initArgs('/up', '/a.json', '/dsh/dsh-soul/soul').slice(-2), ['--out', '/dsh/dsh-soul'], 'init 写到书房根的父目录')
  const scArgs = scaffold.scaffoldArgs('/up', false, '/soul', '/mem')
  assert.deepEqual(scArgs.slice(-4), ['--soul', '/soul', '--memory', '/mem'], '两个根走命令行参数，优先于配置文件')
  assert.equal(scArgs.includes('--apply'), false, '缺省只干跑')
  assert.equal(initA.windowSize, '1000000')
  assert.equal(initA.note, '写代码', '用途要交给 init 写进权威源册开头')
  assert.equal(scaffold.toInitAnswers({ name: 'a', user: 'b' }).hardLines, '', '没选硬线就给空串，不编默认')

  assert.equal(scaffold.personaFile({ name: 'a', persona: '   ' }, '/x'), null, '人设为空时不许建空文件')
  const pf = scaffold.personaFile({ name: '小鲸', persona: '话短、爱吐槽' }, '/x')
  assert.ok(pf.file.endsWith('65-声音/小鲸-声音.md'), '人设落在书房 65-声音/')
  assert.ok(pf.content.includes('话短、爱吐槽'))

  const soulDir = path.join(tmp, 'soul-check')
  const memDir = path.join(tmp, 'mem-check')
  fs.mkdirSync(soulDir, { recursive: true })
  fs.mkdirSync(memDir, { recursive: true })
  fs.writeFileSync(path.join(soulDir, '03-self.md'), '名字：<...>' + NL + '用户：<...>' + NL + '尾巴：<...>')
  const insp = scaffold.inspect(soulDir, memDir)
  assert.equal(insp.placeholders, 3, '还剩多少 <...> 必须数出来')
  assert.equal(insp.selfAssembled, false, 'SELF.md 没装配就要说没装配，不许当完成')
  assert.equal(scaffold.inspect(path.join(tmp, 'nope'), memDir).exists, false)
  fs.mkdirSync(path.join(memDir, 'hub'), { recursive: true })
  fs.writeFileSync(path.join(memDir, 'hub', 'SELF.md'), '装配好的那一页')
  assert.equal(scaffold.inspect(soulDir, memDir).selfAssembled, true, 'SELF.md 在 hub 下才算装配了')

  const mem = scaffold.memoryConfig('/mem')
  assert.equal(mem.selfPath, '/mem/hub/SELF.md', 'selfPath 要指到 hub 下：scaffold 把 SELF 写在那里，指错就是「装了但注入空」')
  assert.equal(mem.statePath, '/mem/hub/state.json')
  assert.deepEqual(scaffold.installKitArgs('/up', '/mem').slice(-2), ['--hub', '/mem/hub'], '第一步先把 hub 建出来')
  assert.equal(scaffold.selfCheckEnv('/mem').SELF_FILE, '/mem/hub/SELF.md')


  // 16e. 答案保存与重放：指纹稳定、只问变化、已答不重问
  const fpA = replay.fingerprint({ b: 1, a: [1, 2] })
  const fpB = replay.fingerprint({ a: [1, 2], b: 1 })
  assert.equal(fpA, fpB, '键序不同但内容相同，必须同一个指纹')
  assert.notEqual(fpA, replay.fingerprint({ a: [2, 1], b: 1 }), '数组顺序变了就是不同答案')

  const savePath = path.join(tmp, 'answers-out', 'answers.json')
  const baseAnswers = {
    version: 2, profile: 'desktop',
    paths: { soul: '/s', memory: '/m' },
    setup: { name: 'a', user: 'b', hardLines: [{ name: '凭据', rule: 'x' }], multiSession: true, windowSize: 1000, hasIndex: false, persona: '', setupName: 'a', userNote: '', purpose: '', customHardLines: [] },
    parts: { install: ['demo'], declined: [] },
    presets: ['preset-demo'], defaultPreset: 'preset-demo',
    register: true, skills: true, writeConfig: true,
    asked: [{ id: 'name', answer: ['a'], source: 'user' }],
  }
  const saved1 = replay.saveAnswers(savePath, baseAnswers, null)
  const saved2 = replay.saveAnswers(savePath, { ...baseAnswers, asked: [{ id: 'parts', answer: ['demo'], source: 'user' }] }, baseAnswers)
  assert.equal(saved2.merged.asked.length, 2, 'asked 要合并：旧题保留、新题追加')
  assert.equal(saved1.sha, replay.saveAnswers(savePath, baseAnswers, null).sha, '同一份答案两次保存，指纹一致')
  assert.equal(replay.loadAnswers(path.join(tmp, 'nope.json')).value, null, '读不出来要返回 null，不许当空答案')

  const upFixture = {
    parts: [
      { dir: 'demo', mustInstall: true, required: true },
      { dir: 'fresh', mustInstall: false, required: false },
    ],
    mustInstall: { found: true, rows: [] },
    presetMeta: [{ block: 'preset-demo', name: '演示' }, { block: 'preset-new', name: '新的' }],
  }
  const d1 = replay.diffAnswers(baseAnswers, upFixture)
  assert.deepEqual(d1.newParts, ['fresh'], '上游新增的零件要列出来')
  assert.deepEqual(d1.goneParts, [], '没有删件就别乱报')
  assert.ok(d1.questions.includes('parts'), '有新零件就要问零件那一组')
  assert.deepEqual(d1.presetAdded, ['preset-new'], '新 preset 要列出来')
  assert.deepEqual(d1.presetRemoved, [], '上次选的 preset 还在，不许报删')

  const sameUpstream = {
    parts: [{ dir: 'demo', mustInstall: true }],
    mustInstall: { found: true, rows: [] },
    presetMeta: [{ block: 'preset-demo', name: '演示' }],
  }
  const d2 = replay.diffAnswers(baseAnswers, sameUpstream)
  assert.deepEqual(d2.questions, [], '上游没变就一道题都不重问')
  assert.equal(d2.ok, true)

  const gone = replay.diffAnswers(baseAnswers, { parts: [], mustInstall: { found: true, rows: [] }, presetMeta: [] })
  assert.deepEqual(gone.goneParts, ['demo'], '上游删掉的零件要报出来，但不当成新题')

  const brokenDefault = replay.diffAnswers(baseAnswers, {
    parts: [{ dir: 'demo' }], mustInstall: { found: true, rows: [] },
    presetMeta: [{ block: 'preset-other', name: '别的' }],
  })
  assert.equal(brokenDefault.defaultBroken, true, '默认 preset 没了必须重选')
  assert.ok(brokenDefault.questions.includes('defaultPreset'))

  const noPrev = replay.diffAnswers(null, upFixture)
  assert.deepEqual(noPrev.questions, ['all'], '没有上次答案就整份重问')

  const v1 = replay.diffAnswers({ version: 1, parts: { install: ['dsh-agent-echo'], declined: [] }, presets: [] }, upFixture)
  assert.deepEqual(v1.questions, ['all'], 'v1 答案用包名，不能拿去跟目录名比')
  assert.deepEqual(v1.goneParts, [], '版本不同不许报「上游删了 20 个零件」')

  const picked = replay.pickQuestions([{ id: 'parts', group: '零件' }, { id: 'name', group: '身份' }], ['零件'])
  assert.deepEqual(picked.map((q) => q.id), ['parts'], '按组名也能选出题')
  assert.equal(replay.pickQuestions([{ id: 'a' }], []).length, 0, '没有要问的就不返回题')

  const merged = replay.mergeAnswers(baseAnswers, { setup: { name: '改名' }, paths: { soul: '/s2' } })
  assert.equal(merged.setup.name, '改名')
  assert.equal(merged.setup.user, 'b', '没改的字段要留住')
  assert.equal(merged.paths.memory, '/m', 'paths 也要深合并')
  assert.deepEqual(merged.parts, baseAnswers.parts, '没问到的部分原样保留')

  // 16e2. 组装器：题干 id → 答案形状，映射只许有一处
  const flat = {
    name: '小鲸', user: '老板', userNote: '', purpose: '写代码',
    hardLines: ['凭据', '隐私'], customHardLines: '[{"name":"删除","rule":"不删文件"}]',
    persona: '话短', multiSession: true, windowSize: '1000000', hasIndex: false,
    presets: ['preset-a', 'preset-b'], defaultPreset: 'preset-b', parts: ['clock', 'echo'],
    register: true, cliTools: '~/.dsh/dsh-soul/tools', soulPath: '/s', memoryPath: '/m', setupName: '小鲸',
  }
  const c1 = composeAnswers(flat, { profile: 'desktop', mustInstall: ['echo', 'compaction'], declined: ['splash'], skills: true, writeConfig: true })
  assert.deepEqual(c1.errors, [], '完整答案不该报错')
  assert.equal(c1.answers.version, 2)
  assert.deepEqual(c1.answers.paths, { soul: '/s', memory: '/m' }, 'soulPath → paths.soul，映射只在这里')
  assert.deepEqual(c1.answers.parts.install.sort(), ['clock', 'compaction', 'echo'], '必装自动进 install 且去重')
  assert.deepEqual(c1.answers.parts.declined, ['splash'])
  assert.equal(c1.answers.setup.windowSize, 1000000, '数字就从字符串转成数字')
  assert.equal(c1.answers.setup.setupName, '小鲸')
  assert.equal(c1.answers.setup.hardLines.length, 3, '两条内置 + 一条自定')
  assert.ok(c1.answers.setup.hardLines.every((l) => !l.rule.includes('{{USER}}')), '{{USER}} 必须全部换掉，不留占位符')
  assert.ok(c1.answers.setup.hardLines[1].rule.includes('老板'), '称呼要真的替换进规则原文')
  assert.equal(c1.answers.defaultPreset, 'preset-b')

  const c2 = composeAnswers({ ...flat, windowSize: '不是数', hardLines: ['不存在的硬线'], defaultPreset: 'preset-z', soulPath: '' }, { profile: 'desktop' })
  assert.ok(c2.errors.some((e) => e.startsWith('windowSize')), '给了非数字要报，不静默变 null')
  assert.ok(c2.errors.some((e) => e.includes('不存在的硬线')), '硬线名字对不上要报')
  assert.ok(c2.errors.some((e) => e.startsWith('defaultPreset')), '默认 preset 越界要报')
  assert.ok(c2.errors.some((e) => e.startsWith('soulPath')), '书房根空着要报')

  const c3 = composeAnswers({ ...flat, customHardLines: '[坏 JSON' }, { profile: 'desktop', mustInstall: [] })
  assert.ok(c3.errors.some((e) => e.startsWith('customHardLines')), '自定硬线不是 JSON 要报，不许吞')

  // 16e3. 文档里的 answers 示例必须能过校验器 —— 抄示例抄出错，是最贵的一种文档漂移
  const docPath = path.join(here, '..', 'docs', '架构-交互与建议值.md')
  if (fs.existsSync(docPath)) {
    const block = fs.readFileSync(docPath, 'utf8').match(/```json\n(\{[\s\S]*?)\n```/)
    assert.ok(block, '文档里要有 answers 的 json 示例')
    const sample = JSON.parse(block[1])
    const sampleCheck = validateAnswers(sample)
    assert.deepEqual(sampleCheck.failures, [], '文档示例必须过 answers/shape 校验：' + JSON.stringify(sampleCheck.failures))
  }

  // 16f. kit 指纹：判「代码变过没有」靠内容，不靠版本号
  const kitInfo = runRaw(path.join(here, 'kit.mjs'), [])
  const pkgVersion = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8')).version
  assert.equal(kitInfo.version, pkgVersion, 'kit.mjs 报的版本必须就是 package.json 里那个，不许另算')
  assert.equal(kitInfo.fingerprint.length, 32, '指纹 32 位')
  assert.equal(runRaw(path.join(here, 'kit.mjs'), []).fingerprint, kitInfo.fingerprint, '同一份代码两次同指纹')
  assert.ok(kitInfo.fileCount > 10, '要把 kit/ 与 probe/ 的源码都算进去')
  assert.ok(kitInfo.note.includes('不回答「发版没有」'), '要说清指纹管什么、不管什么')

  // 16g. applygen：计划要合契约、bundle 只收有 dsh.bundle 的、渲染出的脚本能 dry
  const genSrc = path.join(tmp, 'author-gen')
  fs.mkdirSync(path.join(genSrc, 'plugins', 'plain'), { recursive: true })
  fs.mkdirSync(path.join(genSrc, 'plugins', 'bundled'), { recursive: true })
  fs.mkdirSync(path.join(genSrc, 'plugins', 'tools', 'demo-tool'), { recursive: true })
  fs.writeFileSync(path.join(genSrc, 'plugins', 'plain', 'package.json'), JSON.stringify({ name: 'dsh-plain', version: '1.0.0' }))
  fs.writeFileSync(path.join(genSrc, 'plugins', 'bundled', 'package.json'), JSON.stringify({ name: 'dsh-bundled', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  fs.writeFileSync(path.join(genSrc, 'plugins', 'tools', 'demo-tool', 'index.mjs'), '// tool')

  const genHome = path.join(tmp, 'gen-home')
  const genProfile = path.join(genHome, 'profiles', 'desktop')
  fs.mkdirSync(genProfile, { recursive: true })
  fs.writeFileSync(path.join(genProfile, 'package.json'), JSON.stringify({ name: 'dsh-profile-desktop', dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] }, desktopNextDeselectedBundles: ['dsh-bundled'] } }))
  fs.writeFileSync(path.join(genProfile, 'cordis.patch.yml'), ['- id: preset-standard', "  name: '@deepseek-ai/dsh-agent-preset'", '  config:', '    id: standard', ''].join(NL))

  const genAnswers = {
    version: 2, profile: 'desktop', paths: { soul: '/s', memory: '/m' },
    setup: { name: 'a', user: 'b', hardLines: [{ name: '凭据', rule: 'x' }], customHardLines: [], persona: '', multiSession: true, windowSize: null, hasIndex: false, setupName: 'a' },
    parts: { install: ['plain', 'bundled'], declined: ['splash'] },
    presets: ['preset-standard'], defaultPreset: 'preset-standard',
    register: true, skills: true, writeConfig: true, cliTools: '/tools',
    asked: [{ id: 'parts', answer: ['plain'], source: 'user' }],
  }
  assert.deepEqual(bundlePkgs({ parts: { install: ['plain', 'bundled'] } }, genSrc), ['dsh-bundled'], '没有 dsh.bundle 的包不许进 bundles')

  const genCtx = { source: genSrc, instance: path.join(tmp, 'gen-inst'), stamp: '2026-11-06', prereqs: null, dshHome: genHome, profile: 'desktop', profileDir: genProfile, packageManager: 'pnpm', kitVersion: '1.0.0' }
  const built = buildPlan(genAnswers, { parts: [{ dir: 'plain', name: 'dsh-plain' }, { dir: 'bundled', name: 'dsh-bundled' }], sha: 'a'.repeat(40) }, genCtx)
  assert.deepEqual(built.errors, [], '正常答案不该生成不了计划')
  assert.equal(validatePlan(built.plan).ok, true, '生成的计划必须合契约')
  const kinds = built.plan.steps.map((s) => s.kind)
  assert.ok(kinds.includes('copy') && kinds.includes('skip') && kinds.includes('write-config'))
  const copies = built.plan.steps.filter((s) => s.kind === 'copy').map((s) => s.to)
  assert.ok(copies.includes('node_modules/dsh-plain'), '零件要拷到 node_modules/<包名>')
  assert.ok(copies.some((p) => p.includes('demo-tool')), 'CLI 工具要按 answers.cliTools 落盘')
  const tilde = buildPlan({ ...genAnswers, cliTools: '~/tools' }, { parts: [{ dir: 'plain', name: 'dsh-plain' }], sha: 'a'.repeat(40) }, genCtx)
  const tildeCopy = tilde.plan.steps.find((s) => s.kind === 'copy' && s.from.includes('demo-tool'))
  assert.ok(tildeCopy && path.isAbsolute(tildeCopy.to), '★ ~ 必须展开成绝对路径，否则会落到 profile 里的 ~ 目录')
  assert.ok(!tildeCopy.to.includes('~'), '生成的路径里不许留 ~')
  const relative = buildPlan({ ...genAnswers, cliTools: 'tools' }, { parts: [{ dir: 'plain', name: 'dsh-plain' }], sha: 'a'.repeat(40) }, genCtx)
  assert.ok(relative.errors.some((e) => e.includes('cliTools')), '相对路径要报错，不许猜')
  const wc = built.plan.steps.filter((s) => s.kind === 'write-config')
  assert.equal(wc.length, 2, 'package.json 与 cordis.patch.yml 各一处')
  assert.ok(wc.every((s) => s.backup), '写配置必须带备份路径')
  assert.ok(built.plan.steps.some((s) => s.kind === 'skip' && s.what === 'splash'), '拒装的零件要留 skip 与原因')

  // 没有 preset 锚点：不许假装能写，要 skip + 风险
  fs.writeFileSync(path.join(genProfile, 'cordis.patch.yml'), ['- id: something-else', ''].join(NL))
  const noAnchor = buildPlan(genAnswers, { parts: [{ dir: 'plain', name: 'dsh-plain' }], sha: 'a'.repeat(40) }, genCtx)
  assert.ok(noAnchor.plan.steps.some((s) => s.kind === 'skip' && s.what === 'cordis.patch.yml'), '没有锚点就不能写 patch')
  assert.ok(noAnchor.plan.risks.some((r) => r.includes('没有 preset 锚点')), '要在风险里说清后果')

  // 渲染出的脚本：语法过、dry 出的计划与生成时一致
  const scriptPath = path.join(tmp, 'gen-inst', 'apply.mjs')
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true })
  fs.writeFileSync(scriptPath, renderScript(built.plan, { ...genCtx, bundlePkgs: ['dsh-bundled'] }))
  const syntax = spawnSync(process.execPath, ['--check', scriptPath], { encoding: 'utf8' })
  assert.equal(syntax.status, 0, '渲染出的 apply.mjs 必须语法合法：' + syntax.stderr)
  const dryRun = runRaw(scriptPath, [])
  assert.deepEqual(dryRun.steps.map((s) => s.kind), built.plan.steps.map((s) => s.kind), 'dry 出来的计划必须与原计划一致')
  assert.equal(dryRun.needsRestart, true)

  // 17. patch：四种状态各归各位——可打、不参与、哈希对不上、targets 空
  const patchLib = path.join(tmp, 'patches')
  const prof = path.join(tmp, 'profile')
  const targetRel = 'node_modules/dsh-agent-demo/index.js'
  const targetAbs = path.join(prof, targetRel)
  fs.mkdirSync(path.dirname(targetAbs), { recursive: true })
  const original = ['const a = 1', "const root = 'WINPATH'", 'const z = 3'].join(NL)
  fs.writeFileSync(targetAbs, original + NL)
  const baseSha = createHash('sha256').update(fs.readFileSync(targetAbs)).digest('hex')

  const putJson = (rel, value) => {
    const full = path.join(patchLib, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, JSON.stringify(value, null, 2))
  }
  const diff = [
    '--- a/' + targetRel,
    '+++ b/' + targetRel,
    '@@ -1,3 +1,3 @@',
    ' const a = 1',
    "-const root = 'WINPATH'",
    "+const root = 'MACPATH'",
    ' const z = 3',
  ].join(NL) + NL

  putJson('index.json', { order: ['p-ok', 'p-draft', 'p-stale', 'p-empty'] })
  putJson('p-ok/patch.json', { status: 'verified', targets: [{ file: targetRel, baseSha256: baseSha }] })
  fs.writeFileSync(path.join(patchLib, 'p-ok', 'fix.patch'), diff)
  putJson('p-draft/patch.json', { status: 'draft', targets: [{ file: targetRel, baseSha256: baseSha }] })
  putJson('p-stale/patch.json', { status: 'verified', targets: [{ file: targetRel, baseSha256: 'deadbeef' }] })
  fs.writeFileSync(path.join(patchLib, 'p-stale', 'fix.patch'), diff)
  putJson('p-empty/patch.json', { status: 'verified', targets: [] })

  const patchScript = path.join(here, '..', 'kit', 'patch.mjs')
  const listed = runRaw(patchScript, ['list', '--data', patchLib])
  assert.equal(listed.count, 4)
  assert.equal(listed.auto, 3, '只有 verified/applied 进自动匹配，draft 不算')

  const planOut = runRaw(patchScript, ['plan', '--data', patchLib, '--profile-dir', prof])
  assert.equal(planOut.counts.apply, 1, '哈希对上、diff 能过的才可打')
  assert.equal(planOut.counts.skip, 1, 'draft 不参与')
  assert.equal(planOut.counts.stale, 1, '基线哈希不对必须报 stale，不许静默')
  assert.equal(planOut.counts.blocked, 1, 'targets 空必须报 blocked')
  const staleStep = planOut.steps.find((step) => step.id === 'p-stale')
  assert.equal(staleStep.action, 'stale')
  assert.equal(staleStep.expected, 'deadbeef')
  assert.equal(staleStep.actual, baseSha, '要报出实际哈希，人才知道差在哪')

  // 18. patch：没有 --yes 就一个字节都不动
  const dryApply = runRaw(patchScript, ['apply', '--data', patchLib, '--profile-dir', prof])
  assert.deepEqual(dryApply.applied, [])
  assert.equal(fs.readFileSync(targetAbs, 'utf8'), original + NL, '没确认前不许改文件')

  // 19. patch：确认后真打，内容确实变了
  const realApply = runRaw(patchScript, ['apply', '--data', patchLib, '--profile-dir', prof, '--yes'])
  assert.equal(realApply.applied.length, 1)
  assert.equal(realApply.applied[0].ok, true)
  const afterText = fs.readFileSync(targetAbs, 'utf8')
  assert.ok(afterText.includes('MACPATH'), '文件必须真的被改了')
  assert.ok(!afterText.includes('WINPATH'))

  // 20. patch：retire 也要确认，且改的是状态不是别的
  const dryRetire = runRaw(patchScript, ['retire', '--data', patchLib, '--id', 'p-ok', '--status', 'retired'])
  assert.equal(dryRetire.dry, true)
  assert.equal(JSON.parse(fs.readFileSync(path.join(patchLib, 'p-ok', 'patch.json'), 'utf8')).status, 'verified', '没确认前不许改状态')
  const realRetire = runRaw(patchScript, ['retire', '--data', patchLib, '--id', 'p-ok', '--status', 'retired', '--yes'])
  assert.equal(realRetire.ok, true)
  assert.equal(realRetire.before, 'verified')
  assert.equal(JSON.parse(fs.readFileSync(path.join(patchLib, 'p-ok', 'patch.json'), 'utf8')).status, 'retired')

  // 21. backup：清点只带重装不出来的东西，不存在的项要报出来
  const srcHome = path.join(tmp, 'home-a')
  const putHome = (rel, text) => {
    const full = path.join(srcHome, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, text)
  }
  putHome('dsh-soul/memory/hub/ledger.jsonl', '{"a":1}' + NL)
  putHome('dsh-soul/SELF.md', '# 我' + NL)
  putHome('profiles/desktop/cordis.patch.yml', '- id: demo' + NL + '  root: ' + srcHome + '/dsh-soul' + NL)
  putHome('profiles/desktop/package.json', JSON.stringify({ name: 'profile-desktop' }))
  putHome('data/desktop/answers.json', JSON.stringify({ profile: 'desktop' }))
  fs.mkdirSync(path.join(srcHome, 'profiles/desktop/node_modules/dsh-agent-demo'), { recursive: true })
  fs.writeFileSync(path.join(srcHome, 'profiles/desktop/node_modules/dsh-agent-demo/index.js'), 'x')

  const backupScript = path.join(here, '..', 'kit', 'backup.mjs')
  const counted = runRaw(backupScript, ['plan', '--dsh-home', srcHome])
  const countedPaths = counted.include.map((item) => item.path)
  assert.ok(countedPaths.includes('dsh-soul'), '灵魂数据是备份的第一理由')
  assert.ok(countedPaths.includes('data/desktop'))
  assert.equal(countedPaths.includes('profiles/desktop/node_modules'), false, 'node_modules 不进包')
  assert.ok(counted.total.files >= 4)
  assert.ok(counted.exclude.some((item) => item.path.includes('patches')), '补丁库要写在排除清单里并说明原因')

  // 22. backup：没有 --yes 不打包
  const tgz = path.join(tmp, 'backup.tgz')
  const dryPack = runRaw(backupScript, ['pack', '--dsh-home', srcHome, '--out', tgz])
  assert.equal(dryPack.ok, false)
  assert.equal(existsSync(tgz), false, '没确认前不许生成文件')

  // 23. backup：确认后打包，包里有 manifest，verify 能认出它
  const realPack = runRaw(backupScript, ['pack', '--dsh-home', srcHome, '--out', tgz, '--yes'])
  assert.equal(realPack.ok, true)
  assert.ok(realPack.bytes > 0)
  const checked = runRaw(backupScript, ['verify', '--from', tgz])
  assert.equal(checked.hasManifest, true)
  assert.ok(checked.files > 3)
  assert.equal(checked.notes.length, 0)

  // 24. backup：还原到新目录要改写旧路径，且不带 manifest
  const dstHome = path.join(tmp, 'home-b')
  const dryRestore = runRaw(backupScript, ['restore', '--from', tgz, '--to', dstHome])
  assert.equal(dryRestore.ok, false)
  assert.equal(existsSync(dstHome), false, '没确认前目标目录都不该出现')

  const realRestore = runRaw(backupScript, ['restore', '--from', tgz, '--to', dstHome, '--yes'])
  assert.equal(realRestore.ok, true)
  assert.equal(realRestore.oldHomeUsed, srcHome)
  assert.ok(realRestore.rewrites.length >= 1, '配置里有旧路径就必须改写')
  const restoredConf = fs.readFileSync(path.join(dstHome, 'profiles/desktop/cordis.patch.yml'), 'utf8')
  assert.ok(restoredConf.includes(dstHome), '还原后路径要指向新机器')
  assert.ok(!restoredConf.includes(srcHome), '旧机器路径不许留在配置里')
  assert.ok(existsSync(path.join(dstHome, 'dsh-soul/SELF.md')), '灵魂数据要还原')
  assert.equal(existsSync(path.join(dstHome, '.manifest.json')), false, 'manifest 是元数据，不落到目标目录')

  // 25. diagnose：三段式、空段消失、序号按实际段落连续编号
  const run1 = path.join(tmp, 'run-1')
  const putRun = (dir, name, value) => {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2))
  }
  putRun(run1, 'upstream.json', { repo: 'demo', sha: '0123456789abcdef', parts: [{ dir: 'a' }] })
  putRun(run1, 'local.json', { dshHome: srcHome, profile: 'desktop', platform: 'darwin', arch: 'arm64', nodeVersion: '22', installedPackages: [{ dir: 'x', name: 'x' }] })
  putRun(run1, 'logs.json', { readable: true, filesRead: 2, entries: [
    { pkg: 'dsh-agent-demo', file: 'a.jsonl', at: '2026-11-06T10:00:00+08:00', message: 'Cannot find module' },
    { pkg: null, file: 'a.jsonl', at: '2026-11-06T10:01:00+08:00', message: 'unowned boom' },
  ] })
  putRun(run1, 'patch-plan.json', { steps: [{ id: 'p1', action: 'stale', reason: '哈希对不上' }] })

  const diagScript = path.join(here, '..', 'kit', 'diagnose.mjs')
  const diag = runRaw(diagScript, ['--run', run1])
  assert.equal(diag.readable, true)
  assert.equal(diag.counts.happening, 1, '认领到包的错误进「正在发生」')
  assert.ok(diag.counts.discovered >= 2, '未认领错误 + stale 补丁都算新发现')
  assert.ok(diag.markdown.includes('一、正在发生'))
  assert.ok(diag.markdown.includes('二、新发现'), '没有「作者已修」段时，新发现要接成二，不能留空号')
  assert.equal(diag.markdown.includes('三、新发现'), false)
  assert.ok(!diag.markdown.includes('一切正常'))
  assert.ok(diag.markdown.includes('0123456'), '概览要带上游提交前 7 位')

  // 26. diagnose：只有一段时它就是一，不是三
  const run2 = path.join(tmp, 'run-2')
  putRun(run2, 'upstream.json', { sha: 'abcdef1234567' })
  putRun(run2, 'local.json', { dshHome: srcHome, installedPackages: [] })
  putRun(run2, 'logs.json', { readable: true, filesRead: 1, entries: [] })
  putRun(run2, 'patch-plan.json', { steps: [{ id: 'p1', action: 'stale', reason: '哈希对不上' }] })
  const diag2 = runRaw(diagScript, ['--run', run2])
  assert.ok(diag2.markdown.includes('一、新发现'))
  assert.equal(diag2.markdown.includes('三、'), false)

  // 27. diagnose：日志不可读时必须是「未判定」，不能拿 0 冒充没检查
  const run3 = path.join(tmp, 'run-3')
  putRun(run3, 'local.json', { dshHome: srcHome, installedPackages: [] })
  putRun(run3, 'logs.json', { readable: false, filesRead: 0, entries: [] })
  const diag3 = runRaw(diagScript, ['--run', run3])
  assert.equal(diag3.verdict, 'undetermined')
  assert.ok(diag3.markdown.includes('未判定'))
  assert.ok(!diag3.markdown.includes('一切正常'))
  assert.ok(!diag3.markdown.includes('没有问题'))

  // 28. report：脱敏、指纹、定位不到就不导出
  const reportScript = path.join(here, '..', 'kit', 'report.mjs')
  const snippet = 'const root = ' + JSON.stringify(srcHome + '/x')
  putRun(run1, 'entries.json', [
    { id: 'e1', group: 'crash', title: '启动即崩', position: 'plugins/demo/index.js:12', snippet, reason: '读 ' + srcHome + '/nope 失败', symptom: '插件不加载' },
    { id: 'e2', group: 'path', title: '没有位置的条目' },
  ])
  const rendered = runRaw(reportScript, ['--run', run1])
  assert.equal(rendered.ok, true)
  assert.equal(rendered.counts.accepted, 1)
  assert.equal(rendered.counts.dropped, 1, '没有上游位置的不许进导出物')
  assert.ok(!rendered.markdown.includes(srcHome), '本机家目录必须被脱掉')
  assert.ok(rendered.markdown.includes('<DSH_HOME>'))
  assert.ok(!rendered.markdown.includes('/Users/'), '用户目录也要脱')
  assert.ok(/指纹：[0-9a-f]{8}/.test(rendered.markdown), '每条都要有 8 位指纹')

  // 29. report：指纹只随内容变，不随时间变
  const fp1 = rendered.markdown.match(/指纹：([0-9a-f]{8})/)[1]
  const rendered2 = runRaw(reportScript, ['--run', run1])
  const fp2 = rendered2.markdown.match(/指纹：([0-9a-f]{8})/)[1]
  assert.equal(fp1, fp2, '同样的片段必须给同样的指纹')

  // 30. report：落盘只在指定 --out 时发生
  const reportOut = path.join(tmp, 'reports', 'list.md')
  const saved = runRaw(reportScript, ['--run', run1, '--out', reportOut])
  assert.equal(saved.written, true)
  assert.ok(existsSync(reportOut))
  assert.ok(!fs.readFileSync(reportOut, 'utf8').includes(srcHome))

  // 31. sync-upstream：不是 git 仓库就跳过，不覆盖不删
  const syncScript = path.join(here, '..', 'kit', 'sync-upstream.mjs')
  const notRepo = path.join(tmp, 'not-a-repo')
  fs.mkdirSync(notRepo, { recursive: true })
  fs.writeFileSync(path.join(notRepo, 'keep.txt'), 'do not delete')
  const skipped = runRaw(syncScript, ['--dir', notRepo])
  assert.equal(skipped.ok, false)
  assert.equal(skipped.action, 'skip')
  assert.ok(existsSync(path.join(notRepo, 'keep.txt')), '不是仓库的目录绝不能被清掉')

  // 32. sync-upstream：本地有改动就停，不 stash 不 reset
  const dirtyRepo = path.join(tmp, 'dirty-repo')
  fs.mkdirSync(dirtyRepo, { recursive: true })
  spawnSync('git', ['init', '-q'], { cwd: dirtyRepo })
  fs.writeFileSync(path.join(dirtyRepo, 'a.txt'), 'base')
  spawnSync('git', ['add', '-A'], { cwd: dirtyRepo })
  spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], { cwd: dirtyRepo })
  fs.writeFileSync(path.join(dirtyRepo, 'a.txt'), 'changed by hand')
  const blockedSync = runRaw(syncScript, ['--dir', dirtyRepo])
  assert.equal(blockedSync.ok, false)
  assert.equal(blockedSync.action, 'blocked')
  assert.equal(fs.readFileSync(path.join(dirtyRepo, 'a.txt'), 'utf8'), 'changed by hand', '本地改动必须原样保留')
  console.log('selftest 通过：local 13 / logs 8 / upstream 9 + 文档解析 10 / 弹窗形状 5 / 上游工具接线 14 / 答案重放 16 / 组装 16 / 文档示例 3 / kit 指纹 5 / 前置 12 / 生成器 18 / references 5 / files 11 / diff 8 / applycheck 11 + answers 形状 9 / patch 14 / backup 12 / diagnose 12 / report 8 / sync-upstream 6；含缺记录、坏日志行、无来源、无标识、缺一侧、改名、锚点变更十一种边界（含坏计划、打不上、路径改写、脱敏、脏上游）')
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}