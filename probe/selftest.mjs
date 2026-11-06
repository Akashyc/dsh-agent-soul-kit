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
  fs.writeFileSync(path.join(src, 'plugins', 'demo', 'package.json'), JSON.stringify({ name: 'dsh-agent-demo', version: '0.2.0', main: 'index.js' }))
  fs.mkdirSync(path.join(src, 'presets'), { recursive: true })
  fs.writeFileSync(path.join(src, 'presets', 'a.yml'), 'x: 1')
  fs.mkdirSync(path.join(src, 'templates'), { recursive: true })
  fs.writeFileSync(path.join(src, 'templates', 't.md'), 't')
  fs.writeFileSync(path.join(src, 'AGENT-INSTALL.md'), ['# 说明书', '## 一、规矩', '正文', '## 二、验收'].join(NL))
  const up = run('upstream.mjs', ['--source', src])
  assert.equal(up.readable, true)
  assert.equal(up.parts.length, 1)
  assert.equal(up.parts[0].dir, 'demo')
  assert.equal(up.parts[0].name, 'dsh-agent-demo')
  assert.equal(up.parts[0].hasEntry, true)
  assert.deepEqual(up.presets, ['presets/a.yml'])
  assert.deepEqual(up.templates, ['templates/t.md'])
  assert.equal(up.installDocHeadings.length, 3, '章节锚点必须保住顺序与层级')
  assert.ok(up.notes.some((note) => note.includes('install.js')), '缺 install.js 要进 notes')
  assert.ok(up.notes.some((note) => note.includes('package.json')), '缺 package.json 要进 notes')

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
  fs.writeFileSync(path.join(good, 'answers.json'), JSON.stringify({ profile: 'desktop', parts: ['dsh-agent-demo'] }))
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
  console.log('selftest 通过：local 13 / logs 8 / upstream 9 / references 5 / files 11 / diff 8 / applycheck 11 / patch 14 / backup 12 / diagnose 12 / report 8；含缺记录、坏日志行、无来源、无标识、缺一侧、改名、锚点变更十种边界（含坏计划、打不上、路径改写、脱敏）')
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}