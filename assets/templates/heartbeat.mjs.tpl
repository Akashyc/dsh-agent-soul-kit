#!/usr/bin/env node
// {{NAME}} · 心跳（自律神经）—— 由 install.mjs 生成，放在书房 60-工具/ 下
// 每天定时跑一次：重建索引 → 装配 SELF.md → 体检。
// 日志写进 <hub>/heartbeat/<日期>.log，体检里「心跳」一项看的就是这个目录里最新文件的时间。
// 只重建衍生品，不碰账本、书房文档和 SELF.src.md。
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const HUB = {{HUB_JSON}}
const LOGDIR = path.join(HUB, 'heartbeat')
fs.mkdirSync(LOGDIR, { recursive: true })

const now = new Date()
const p2 = (n) => String(n).padStart(2, '0')
const day = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`
const stamp = `${day} ${p2(now.getHours())}:${p2(now.getMinutes())}:${p2(now.getSeconds())}`
const LOG = path.join(LOGDIR, `${day}.log`)

// 先落一行再干活：体检会看这个目录里最新文件的时间，日志必须在体检开始前就存在
const append = (lines) => fs.appendFileSync(LOG, lines.join('\n') + '\n', 'utf8')
append([`===== 心跳 ${stamp} =====`, `node: ${process.execPath}`])
const steps = [
  ['memindex build', 'memindex.mjs', ['build']],
  ['self.mjs', 'self.mjs', []],
  ['echo-doctor', 'echo-doctor.mjs', []],
]
for (const [label, script, args] of steps) {
  const r = spawnSync(process.execPath, [path.join(HUB, script), ...args], {
    cwd: HUB,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
    timeout: 600000,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  })
  const out = [`--- ${label}`]
  if (r.stdout) out.push(String(r.stdout).trimEnd())
  if (r.stderr) out.push(String(r.stderr).trimEnd())
  if (r.error) out.push(`启动失败：${r.error.message}`)
  out.push(`退出码 ${r.status}`)
  append(out)
}
append([''])

// 只留最近 30 天的日志
const cutoff = Date.now() - 30 * 86400000
for (const name of fs.readdirSync(LOGDIR)) {
  if (!name.endsWith('.log')) continue
  const f = path.join(LOGDIR, name)
  try { if (fs.statSync(f).mtimeMs < cutoff) fs.unlinkSync(f) } catch { /* 删不掉就留着 */ }
}