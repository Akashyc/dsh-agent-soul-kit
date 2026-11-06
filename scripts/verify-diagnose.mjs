import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { renderText } from '../lib/diagnose/text.mjs'
import { scanFailures } from '../lib/diagnose/evidence.mjs'
import { judge } from '../lib/diagnose/detect.mjs'
import { putIssue, loadIssues, saveIssues, refreshCleanup } from '../lib/diagnose/issues.mjs'
import { renderProblems, snippetOf } from '../lib/diagnose/report.mjs'
import { dataPaths } from '../lib/core/data-paths.mjs'
import { KIT_VERSION } from '../lib/core/version.mjs'

const kit = fileURLToPath(new URL('../', import.meta.url))
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-diagnose-'))
const context = { profile: 'desktop', home: path.join(root, 'home'), logs: path.join(root, 'logs') }
const author = { sha: 'a'.repeat(40), dir: path.join(root, 'source') }
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text) }
const json = (file, value) => write(file, JSON.stringify(value))
const entry = {
  id: 'load', title: '入口加载失败', pkg: 'load', sig: 'missing', file: 'plugins/load.js',
  upstreamFile: 'plugins/load.js', problem: 'BROKEN', solution: '// 本机修\nFIXED',
  authorFixed: 'AUTHOR_FIXED', impact: '入口不可用', hint: '修正导入', verify: ['重启后使用入口'],
}
const evidence = (pkg) => ({ pkg, file: 'one.jsonl', at: '2026-11-05 08:00:00', boots: 1, message: 'ERR_MODULE_NOT_FOUND', detail: 'missing' })
const ready = { status: 'ready', files: [{ name: 'one.jsonl', rows: 1 }], unreadable: [], invalidRows: 0, unmatchedRows: 0 }
const header = (live = 0, retired = 0, fresh = 0) => `**概览**：\`aaaaaaa\` · kit ${KIT_VERSION} · 要修 ${live} · 待退役 ${retired} · 新发现 ${fresh} · 范围：已读取 1 份 JSONL 日志（只看插件加载失败）；零件 0 个、preset skills 0 个做检测层检查（D1.1/D1.2/D2.1/D4.1/D5.1/D5.2/D5.6）`
const render = (entries = [], failures = new Map(), coverage = ready) => renderText({ context, author, issues: { issues: Object.fromEntries(entries.map((e) => [e.id, e])) }, scan: { failures, coverage } })
const checks = []
function check(label, fn) { fn(); checks.push(label); console.log('✓ ' + label) }
try {
  write(path.join(context.home, entry.file), 'BROKEN')
  write(path.join(author.dir, entry.upstreamFile), 'BROKEN')
  const retired = { ...entry, id: 'retired', pkg: 'retired', file: 'plugins/retired.js', upstreamFile: 'plugins/retired.js', cleanup: 'done' }
  write(path.join(context.home, retired.file), entry.solution)
  write(path.join(author.dir, retired.upstreamFile), 'AUTHOR_FIXED')
  check('全零只输出一行概览，不带外层代码块或空章节', () => {
    assert.equal(render(), header())
    assert.doesNotMatch(render(), /```|^## /m)
  })
  check('三段全部七种非空组合按顺序输出，省略空段并连续编号', () => {
    for (let mask = 1; mask < 8; mask++) {
      const entries = [], failures = new Map(), names = []
      if (mask & 1) { entries.push(entry); failures.set('load', [evidence('load')]); names.push('正在发生（1）') }
      if (mask & 2) { entries.push(retired); names.push('作者已修 → 改用作者的（1）') }
      if (mask & 4) { failures.set('fresh', [evidence('fresh')]); names.push('新发现（1）') }
      const output = render(entries, failures)
      assert.equal(output.split('\n')[0], header(mask & 1 ? 1 : 0, mask & 2 ? 1 : 0, mask & 4 ? 1 : 0))
      assert.deepEqual([...output.matchAll(/^### ([一二三])、(.+)$/gm)].map((m) => m[1] + '、' + m[2]), names.map((name, i) => ['一', '二', '三'][i] + '、' + name))
    }
  })
  check('已知问题完整格式固定，简要改法与核实不漏传', () => {
    assert.equal(render([entry], new Map([['load', [evidence('load')]]])), header(1) + '\n\n### 一、正在发生（1）\n\n**`load`** — 入口加载失败\n- 证据：`one.jsonl`，2026-11-05 08:00:00 报 `ERR_MODULE_NOT_FOUND`\n- 不修：入口不可用\n- 改法：修正导入\n- 核实：重启后使用入口')
  })
  check('同一问题多种报错不重复计数，新错误有明确影响与待核对修法', () => {
    assert.match(render([entry], new Map([['load', [evidence('load'), { ...evidence('load'), detail: 'missing-two' }]]])), /要修 1/)
    const output = render([], new Map([['fresh', [evidence('fresh')]]]))
    for (const label of ['- 证据：', '- 不修：', '- 改法：', '- 核实：']) assert.ok(output.includes(label))
  })
  check('已有 unknown/local-changed 条目不得被三零概览隐藏', () => {
    write(path.join(context.home, entry.file), 'REWRITTEN')
    assert.match(render([entry]), /### 一、新发现（1）[\s\S]*待核对：unknown/)
    assert.match(render([{ ...entry, scope: 'REWRITTEN' }]), /待核对：local-changed/)
    assert.match(render([entry]), /没有匹配的加载失败记录/)
    write(path.join(context.home, entry.file), 'BROKEN')
  })
  check('无目录、空目录、不可读路径、损坏和不识别记录均不冒充正常空结果', () => {
    assert.equal(scanFailures(context.logs).coverage.status, 'missing')
    assert.match(renderText({ context, author, issues: { issues: {} } }), /要修 未判定.*新发现 未判定.*无可读日志/)
    fs.mkdirSync(context.logs)
    assert.equal(scanFailures(context.logs).coverage.status, 'empty')
    write(path.join(root, 'not-dir'), 'x')
    assert.equal(scanFailures(path.join(root, 'not-dir')).coverage.status, 'unreadable')
    write(path.join(context.logs, 'one.jsonl'), JSON.stringify({ time: '2026-11-05T00:00:00Z', message: 'ok' }) + '\ninvalid\n' + JSON.stringify({ message: 'other format failed to import' }))
    const scan = scanFailures(context.logs)
    assert.equal(scan.coverage.status, 'partial')
    assert.equal(scan.coverage.invalidRows, 1)
    assert.equal(scan.coverage.unmatchedRows, 1)
    assert.match(render([], scan.failures, scan.coverage), /结果不完整/)
    fs.rmSync(context.logs, { recursive: true })
  })
  check('真实日志范围按最近五份读取，无 runId 不捏造启动次数', () => {
    for (let i = 0; i < 6; i++) {
      const file = path.join(context.logs, i + '.jsonl')
      write(file, JSON.stringify({ time: `2026-11-05T00:00:0${i}Z`, message: 'loader (load): failed to import: missing' }))
      fs.utimesSync(file, 1000 + i, 1000 + i)
    }
    const scan = scanFailures(context.logs)
    assert.equal(scan.coverage.files.length, 5)
    assert.equal(scan.coverage.files.some((file) => file.name === '0.jsonl'), false)
    assert.equal(scan.failures.get('load')[0].boots, 0)
    assert.equal(scan.failures.get('load')[0].count, 5)
  })
  check('JSON 正则和 flags 在判定与作者报告中一致，scope 不冒充问题证据', () => {
    const regexEntry = { ...entry, problem: '/broken/i', scope: '/broken/i', cite: '/broken/i', hint: '调整导入', why: '已确认的原因' }
    assert.equal(judge(regexEntry, context, author).state, 'open')
    assert.equal(snippetOf(regexEntry, author.dir, entry.upstreamFile).line, 1)
    assert.equal(snippetOf({ ...regexEntry, problem: 'NOT_PRESENT' }, author.dir, entry.upstreamFile), null)
    assert.equal(snippetOf({ ...regexEntry, problem: '/[/', scope: '/broken/i' }, author.dir, entry.upstreamFile), null)
    const store = { issues: {} }; putIssue(store, 'load', regexEntry, 'now')
    for (const field of ['cite', 'hint', 'why', 'upstreamFile']) assert.equal(store.issues.load[field], regexEntry[field])
    const report = renderProblems({ items: [{ ...regexEntry, entry: regexEntry, state: 'open' }], author, home: context.home, at: 'now', install: { upstream: { version: 'WRONG_OLD_VERSION' } } })
    assert.match(report.markdown, /调整导入/)
    assert.match(report.markdown, /已确认的原因/)
    assert.doesNotMatch(report.markdown, /本机修|FIXED|WRONG_OLD_VERSION/)
    assert.equal(renderProblems({ items: [{ ...regexEntry, entry: regexEntry, state: 'patched' }], author, at: 'now', home: context.home }).issues.length, 0)
  })
  check('已退役旧补丁重装后重新进入待清理状态', () => {
    const store = { issues: { retired: { ...retired, state: 'retired' } } }
    refreshCleanup(store, () => false); assert.equal(store.issues.retired.cleanup, 'done')
    refreshCleanup(store, () => true); assert.equal(store.issues.retired.cleanup, 'pending')
    refreshCleanup(store, () => false); assert.equal(store.issues.retired.cleanup, 'done')
    write(path.join(context.home, retired.file), 'BROKEN')
    assert.match(render([retired]), /本机仍有旧问题，需按作者更新/)
    write(path.join(context.home, retired.file), entry.solution)
  })
  check('格式模板只在 Agent 手册，README 只给入口', () => {
    const manual = fs.readFileSync(path.join(kit, 'AGENT-DIAGNOSE.md'), 'utf8')
    const readme = fs.readFileSync(path.join(kit, 'README.md'), 'utf8')
    for (const label of ['**概览**', '### 一、正在发生', '### 二、作者已修', '### 三、新发现', '空段整段消失', '连续编号', '不额外展开']) assert.ok(manual.includes(label), label)
    assert.doesNotMatch(readme, /\*\*概览\*\*|### [一二三]、(?:正在发生|作者已修|新发现)/)
    assert.match(readme, /请读 AGENT-DIAGNOSE\.md/)
  })
  check('CLI 导出全链路、默认只读、明确写入及参数错误无额外资料写入', () => {
    json(path.join(context.home, 'profiles/desktop/package.json'), { name: 'test-profile' })
    json(path.join(context.home, 'profiles/desktop/node_modules/dsh-agent-soul/package.json'), { name: 'dsh-agent-soul' })
    json(path.join(context.home, 'dsh-soul/.install-state.json'), { profile: 'desktop', kitVersion: '6.2', upstream: { repo: 'cyanwell/dsh-agent-soul', sha: author.sha } })
    for (const args of [['init', '-b', 'main'], ['add', '-A'], ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture']]) assert.equal(spawnSync('git', ['-C', author.dir, ...args], { encoding: 'utf8' }).status, 0)
    const data = dataPaths(kit, context.home, 'desktop')
    const cli = (args = [], code = 0) => {
      const result = spawnSync(process.execPath, [path.join(kit, 'soul-fix.mjs'), '--dsh-home', context.home, '--source', author.dir, '--logs', context.logs, ...args], { encoding: 'utf8' })
      assert.equal(result.status, code, result.stderr)
      return result
    }
    cli(['--ref', 'main'], 1); assert.equal(fs.existsSync(data.root), false)
    cli(['--update'], 1); assert.equal(fs.existsSync(data.root), false)
    cli(['--show', '--write'], 1); assert.equal(fs.existsSync(data.root), false)
    cli(); assert.equal(fs.existsSync(data.root), false)
    cli(['--add', 'load=' + JSON.stringify({ ...entry, problem: '/broken/i', hint: '仅给方向', why: '导入错误', cite: '/broken/i' })])
    const before = fs.readFileSync(data.issues, 'utf8')
    const output = cli().stdout
    assert.equal(fs.readFileSync(data.issues, 'utf8'), before)
    assert.match(output, /### 一、正在发生/)
    const target = path.join(root, 'report.md')
    cli(['--report', target])
    assert.match(fs.readFileSync(target, 'utf8'), /仅给方向/)
    assert.doesNotMatch(fs.readFileSync(target, 'utf8'), /本机修|FIXED/)
    cli(['--write'])
    assert.equal(loadIssues(data.issues).kit, KIT_VERSION)
    assert.equal(loadIssues(data.issues).issues.load.state, 'open')
    assert.equal(spawnSync('git', ['-C', author.dir, 'status', '--porcelain'], { encoding: 'utf8' }).stdout.trim(), '')
    fs.rmSync(data.root, { recursive: true })
  })
  console.log(`${checks.length} 组诊断格式与合并回归通过`)
} finally {
  // 只清理本次隔离目标，不接触真实 profile。
  const data = dataPaths(kit, context.home, 'desktop')
  fs.rmSync(data.root, { recursive: true, force: true })
  fs.rmSync(root, { recursive: true, force: true })
}
