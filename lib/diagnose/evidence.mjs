import fs from 'node:fs'
import path from 'node:path'
import { readText } from '../core/io.mjs'

const toDate = (iso) => {
  const d = new Date(String(iso || ''))
  return Number.isNaN(d.getTime()) ? null : d
}
const stamp = (d) => d.toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-')
const clock = (d) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')

/**
 * 扫 DSH 日志，按插件包名归并加载失败。
 * 只读日志，不改任何东西。时间在日志里是 UTC，统一换成本机时区。
 * @param logsDir <DSH 家目录>/logs
 * @param home DSH 家目录：证据里的路径按它缩写（/profiles/desktop/lib/paths.mjs），不带出本机绝对路径
 * @returns Map<包名, 证据>
 */
export function allFailures(logsDir, home = '') {
  const out = new Map()
  if (!fs.existsSync(logsDir)) return out
  const files = fs.readdirSync(logsDir)
    .filter((name) => name.endsWith('.jsonl'))
    .map((name) => ({ name, at: fs.statSync(path.join(logsDir, name)).mtimeMs }))
    .sort((a, b) => b.at - a.at)
    .slice(0, 5)
  for (const file of files) {
    const text = readText(path.join(logsDir, file.name))
    for (const line of text.split('\n')) {
      if (!line.includes('failed to import')) continue
      let row
      try { row = JSON.parse(line) } catch { continue }
      const m = String(row.message || '').match(/^([\w@/.-]+) \(([\w@/.-]+)\): failed to import: ([\s\S]*)$/)
      if (!m) continue
      const hit = { file: file.name, time: row.time, runId: row.runId || '', detail: m[3] }
      const list = out.get(m[2]) || []
      list.push({ ...hit, pkg: m[2] })
      out.set(m[2], list)
    }
  }
  const result = new Map()
  for (const [pkg, rows] of out) {
    const groups = new Map()
    for (const row of rows) { const group = groups.get(row.detail) || []; group.push(row); groups.set(row.detail, group) }
    const evidence = [...groups.values()].map((group) => summarize(pkg, group.sort((a, b) => String(a.time).localeCompare(String(b.time))), home))
    result.set(pkg, evidence)
  }
  return result
}

/** 一条证据：报的时刻（按启动分组）、几次启动、什么错、缺哪个文件（在不在）。 */
function summarize(pkg, rows, home) {
  const last = rows[rows.length - 1]
  const boots = new Map()
  for (const row of rows) {
    const d = toDate(row.time)
    if (!d) continue
    const key = row.runId || String(row.time)
    if (!boots.has(key)) boots.set(key, { at: d, clocks: [] })
    const hit = boots.get(key)
    const c = clock(d)
    if (!hit.clocks.includes(c)) hit.clocks.push(c)
  }
  const bootsList = [...boots.values()]
  const times = bootsList.map((boot) => boot.clocks[0])
  const at = toDate(last.time)
  const message = last.detail.replace(/^Error \[[^\]]+\]: /, '').replace(/^Error: /, '')
  const errCode = (last.detail.match(/^Error \[([A-Z_]+)\]/) || [])[1]
  const errName = last.detail.match(/^([A-Za-z]+Error): (.*)$/)
  const code = errCode || (errName ? errName[1] + ': ' + errName[2].split('\n')[0].slice(0, 40) : 'failed to import')
  const asked = message.match(/Cannot find (?:module|package) '([^']+)'/)
  let missing = null
  if (asked) {
    const abs = asked[1]
    missing = {
      path: home && abs.startsWith(home) ? abs.slice(home.length) || '/' : abs,
      note: fs.existsSync(abs) ? null : fs.existsSync(path.dirname(abs)) ? '该文件不存在' : '该目录不存在',
    }
  }
  return {
    pkg,
    file: last.file,
    at: at ? stamp(at) : String(last.time || '').replace('T', ' ').slice(0, 16),
    times,
    boots: boots.size,
    count: rows.length,
    message: code,
    detail: last.detail,
    missing,
  }
}