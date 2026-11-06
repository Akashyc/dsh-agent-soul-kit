import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { scanStatic } from '../lib/diagnose/scan.mjs'

const root = mkdtempSync(path.join(tmpdir(), 'scan-'))
const prof = path.join(root, '.dsh', 'profiles', 'desktop')
const put = (rel, text) => {
  const full = path.join(prof, rel)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, text, 'utf8')
}

// D1.1 注释里的不算，真调用算
put('node_modules/pkgs-bad/index.js', [
  '// 注释里的 powershell.exe 不该被抓',
  'const x = execFileSync("powershell.exe", ["-NoProfile"])',
].join('\n'))
put('node_modules/pkgs-bad/package.json', '{"name":"pkgs-bad"}')

// D1.2 单反斜杠 Windows 路径
put('node_modules/pkgs-win/run.js', [
  'const py = join(dir, "python_embeded", "python.exe")',
  'const venv = join(dir, ".venv", "Scripts\\python.exe")',
].join('\n'))
put('node_modules/pkgs-win/package.json', '{"name":"pkgs-win"}')

put('node_modules/pkgs-good/index.js', 'export const ok = 1\n')
// 本体只扫 kit/：命名管道算 D1.2；plugins/ 是零件副本、test-* 是测试，都不扫
put('node_modules/dsh-agent-soul/kit/echo/svc.mjs', 'const PIPE = process.env.ECHO_PIPE || "\\\\\\\\.\\\\pipe\\\\echo-hub"\n')
put('node_modules/dsh-agent-soul/kit/echo/test-self-check.mjs', 'const p = "C:\\\\x"\n')
put('node_modules/dsh-agent-soul/plugins/x/index.js', 'execFileSync("powershell.exe")\n')
// D2.3：拿 cwd 拼路径算，打印 cwd 和注释不算
put('node_modules/pkgs-cwd/index.js', [
  'const f = path.join(process.cwd(), "state.json")',
  'log("cwd=" + process.cwd())',
  '// 原来是 join(process.cwd(), "diary")',
  'const cands = [env ? join(env, "a.json") : null,',
  '  path.join(process.cwd(), "a.json"),',
  ']',
].join('\n'))
put('node_modules/pkgs-cwd/package.json', '{"name":"pkgs-cwd"}')
put('node_modules/pkgs-good/package.json', '{"name":"pkgs-good"}')

// 噪声：测试目录 / 下划线脚本 / verify-*
put('node_modules/pkgs-good/test/a.spec.mjs', 'execFileSync("powershell.exe")\n')
put('node_modules/pkgs-good/_check.mjs', 'execFileSync("powershell.exe")\n')
put('node_modules/pkgs-good/verify-x.mjs', 'execFileSync("powershell.exe")\n')

// D5.1：只有我们自己的包才算；DSH 内置 id、别家插件都不许报
put('cordis.patch.yml', [
  '- insert:',
  '    - id: pkgs-good',            // 我们自己的，装了 → 不报
  '    - id: pkgs-absent',         // 我们自己的，没装 → 报
  '    - id: compaction',           // DSH 内置 → 不归我们管
  '    - id: nekowhale-stickers',   // 别家插件 → 不归我们管
].join('\n'))
put('desktop-next.cordis.patch.json', JSON.stringify([{ id: 'agents-anywhere-bridge-next', config: {} }]))

// D5.2：只查 presetSkills 里列的
put('skills/creation/SKILL.md', ['---', 'name: creation', 'description: 造东西 Triggers: 做个插件', '---'].join('\n'))
put('skills/ours-ok/SKILL.md', ['---', 'name: ours-ok', 'description: "含 Triggers: 但加了引号"', '---'].join('\n'))
put('skills/other/SKILL.md', ['---', 'name: other', 'description: 别家 Triggers: 不归我们', '---'].join('\n'))

// D5.6：相对导入指向不存在的文件。缺的那个照抄今天真机的形态
put('node_modules/pkgs-broken-import/index.js', [
  "import { a } from './missing.mjs'",
  "import { b } from './present.mjs'",
].join('\n'))
put('node_modules/pkgs-broken-import/present.mjs', 'export const b = 1\n')
put('node_modules/pkgs-broken-import/package.json', '{"name":"pkgs-broken-import"}')
// D2.1：中枢配置里只有不存在的那条绝对路径该报
const hubCfg = path.join(root, '.dsh', 'dsh-soul', 'memory', 'hub', 'echo.config.json')
mkdirSync(path.dirname(hubCfg), { recursive: true })
writeFileSync(hubCfg, JSON.stringify({ gone: path.join(root, 'missing-dir'), here: root, rel: 'not/abs' }), 'utf8')
// D4.1：只认栈在包内的错误；报文提到包名不算
const logsDir = path.join(root, '.dsh', 'logs')
mkdirSync(logsDir, { recursive: true })
writeFileSync(path.join(logsDir, 'x.jsonl'), [
  JSON.stringify({ level: 'error', message: '', error: { message: 'boom', stack: 'at x (node_modules/pkgs-bad/index.js:1:1)' }, fields: { tool: 'some_tool' } }),
  JSON.stringify({ level: 'error', message: 'cannot write ".../dsh-agent-soul-kit/docs/a.md"', error: { message: 'nope', stack: 'at y (/tmp/nothing.js:1:1)' }, fields: { tool: 'write' } }),
  JSON.stringify({ level: 'warn', message: 'warn only', error: { message: 'w', stack: 'node_modules/pkgs-good/i.js' } }),
].join('\n'), 'utf8')

const install = {
  parts: ['pkgs-bad', 'pkgs-win', 'pkgs-good', 'pkgs-absent', 'pkgs-broken-import', 'pkgs-cwd', 'pkgs-gone'],
  presetIds: ['soul', 'soul-ptc'],
  presetSkills: { 'creation/SKILL.md': 'h1', 'ours-ok/SKILL.md': 'h2' },
}
const { findings, coverage } = scanStatic({ home: path.join(root, '.dsh'), profile: 'desktop', install, logs: logsDir })
const of = (id) => findings.filter((f) => f.checkId === id)
const has = (id, pkg) => of(id).some((f) => f.pkg === pkg)

assert.equal(of('D1.1').length, 1, 'D1.1 应只命中真调用')
assert.equal(of('D1.1')[0].line, 2, 'D1.1 应命中第 2 行')
assert.equal(of('D1.2').filter((f) => f.pkg === 'pkgs-win').length, 2, 'D1.2 应命中 pkgs-win 2 行')
assert.ok(!findings.some((f) => /test\/a\.spec|_check|verify-/.test(f.file)), '降噪失效')
assert.ok(!findings.some((f) => f.pkg === 'pkgs-good'), '干净的包不该被报')

// 范围：只有我们自己的缺失包报，内置和别家一个都不许出现
assert.deepEqual(of('D5.1').map((f) => f.pkg), ['pkgs-absent'], 'D5.1 只该报我们自己的缺失包，实际 ' + JSON.stringify(of('D5.1').map((f) => f.pkg)))

// 范围：presetSkills 里的 creation 报，ours-ok 加了引号不报，other 不在清单里不报
assert.deepEqual(of('D5.2').map((f) => f.pkg), ['preset-skills/creation'], 'D5.2 只该报我们 preset 的 skills，实际 ' + JSON.stringify(of('D5.2').map((f) => f.pkg)))

assert.equal(of('D4.1').length, 1, 'D4.1 只该报栈在包内的那 1 条，实际：' + JSON.stringify(of('D4.1').map((f) => f.pkg)))
assert.equal(of('D4.1')[0].pkg, 'pkgs-bad')
assert.equal(coverage.logs, true)
assert.equal(of('D5.6').length, 1, 'D5.6 只该报缺失的那个导入，实际：' + JSON.stringify(of('D5.6').map((f) => f.snippet)))
assert.equal(of('D5.6')[0].pkg, 'pkgs-broken-import')
assert.ok(of('D5.6')[0].snippet.includes('missing.mjs'))
assert.deepEqual(of('D2.1').map((f) => f.snippet), [path.join(root, 'missing-dir')], 'D2.1 只该报不存在的绝对路径')
assert.deepEqual(of('D2.3').map((f) => f.pkg + ':' + f.line), ['pkgs-cwd:1'], 'D2.3 只该报拿 cwd 拼路径那行，实际 ' + JSON.stringify(of('D2.3').map((f) => f.snippet)))
assert.equal(of('D2.3')[0].severity, 'degraded')
assert.deepEqual(of('D7.1').map((f) => f.pkg), ['pkgs-gone'], 'D7.1 只报未被 D5.1 报过的缺失零件，实际 ' + JSON.stringify(of('D7.1').map((f) => f.pkg)))
assert.deepEqual(findings.filter((f) => f.pkg === 'dsh-agent-soul').map((f) => f.checkId + ' ' + path.basename(f.file)), ['D1.2 svc.mjs'], '本体只该报 kit/ 里的命名管道')
assert.equal(coverage.packages, 5)
assert.equal(coverage.skills, 2)

const empty = scanStatic({ home: path.join(root, 'nope'), profile: 'desktop', install: { parts: [] } })
assert.equal(empty.findings.length, 0)

rmSync(root, { recursive: true, force: true })
console.log('verify-scan: 通过 · ' + findings.length + ' 条 · ' + coverage.packages + ' 零件 · ' + coverage.skills + ' skills')
