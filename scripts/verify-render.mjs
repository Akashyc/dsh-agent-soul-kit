import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { renderText } from '../lib/diagnose/text.mjs'

// 假家目录：一个干净的零件，没有平台调用、没有悬空 patch、没有坏的 skill
const root = mkdtempSync(path.join(tmpdir(), 'render-'))
const home = path.join(root, '.dsh')
const prof = path.join(home, 'profiles', 'desktop')
const put = (rel, text) => {
  const full = path.join(prof, rel)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, text, 'utf8')
}
put('node_modules/pkgs-ok/index.js', 'export const ok = 1\n')
put('node_modules/pkgs-ok/package.json', '{"name":"pkgs-ok"}')
mkdirSync(path.join(home, 'logs'), { recursive: true })

const base = {
  home, profile: 'desktop', logs: path.join(home, 'logs'),
  install: { parts: ['pkgs-ok'], presetSkills: {}, upstream: { sha: 'a'.repeat(40) } },
}

// ① 零发现：只出概览，不出现任何一段（这是 AGENT-DIAGNOSE 的空段消失约定）
const quiet = renderText({ context: base, author: { sha: 'a'.repeat(40), dir: null }, issues: { issues: {} } })
assert.ok(quiet.startsWith('**概览**'), '必须仍以概览开头')
assert.ok(!quiet.includes('### 一、'), '零发现时不该有段落，实际：' + quiet.slice(0, 200))
assert.ok(quiet.includes('新发现'), '概览里要保留新发现计数')

// ② 有静态发现：进「新发现」一段，且不新增别的章节
put('node_modules/pkgs-bad/index.js', 'const x = execFileSync("powershell.exe", [])\n')
put('node_modules/pkgs-bad/package.json', '{"name":"pkgs-bad"}')
const ctx2 = { ...base, install: { ...base.install, parts: ['pkgs-ok', 'pkgs-bad'] } }
const loud = renderText({ context: ctx2, author: { sha: 'a'.repeat(40), dir: null }, issues: { issues: {} } })
assert.ok(loud.includes('### 一、新发现'), '静态发现应进新发现段')
assert.ok(loud.includes('D1.1'), '要写出 checkId')
assert.ok(!/### 二、/.test(loud), '只有一段时不该有第二段')
const headings = loud.match(/^### .+$/gm) || []
assert.equal(headings.length, 1, '章节数应为 1，实际：' + JSON.stringify(headings))

// ③ 清单里已有同包条目时，静态发现让位，不重复报
const issues = { issues: { 'some-id': { id: 'some-id', pkg: 'pkgs-bad', title: '已知问题', file: 'x.js' } } }
const dedup = renderText({ context: ctx2, author: { sha: 'a'.repeat(40), dir: null }, issues })
assert.ok(!dedup.includes('静态检查 D1.1'), '同包已有条目时不该重复报静态发现')
// 该条目自己会进「待核对」，所以恰好 1 条；静态那 1 条被压掉，不能变成 2 条
assert.ok(dedup.includes('### 一、新发现（1）'), '应只留清单条目自己那 1 条，实际标题：' + (dedup.match(/^### .+$/m) || ['无'])[0])

// ④ 不在本轮报告里的旧条目（open 但没有日志证据）不能压掉同包的静态发现
const stale = { issues: { old: { id: 'old', pkg: 'pkgs-bad', title: '旧问题', file: 'profiles/desktop/node_modules/pkgs-bad/index.js', problem: 'powershell.exe' } } }
const kept = renderText({ context: ctx2, author: { sha: 'a'.repeat(40), dir: null }, issues: stale })
assert.ok(kept.includes('静态检查 D1.1'), '旧条目不该压掉静态发现，实际：' + kept.slice(0, 300))

rmSync(root, { recursive: true, force: true })
console.log('verify-render: 通过（零发现 / 有发现 / 去重 / 旧条目不压 四种形态）')
