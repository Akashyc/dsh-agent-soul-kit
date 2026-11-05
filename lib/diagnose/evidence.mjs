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
export function allFailures(logsDir, home = '') { return scanFailures(logsDir, home).failures }

/** 同时返回实际读取范围，不能将无日志和读过后无匹配都当作正常的零。 */
export function scanFailures(logsDir, home = '') {
  const out = new Map()
  const coverage = { status: 'missing', files: [], unreadable: [], invalidRows: 0, unmatchedRows: 0 }
  if (!fs.existsSync(logsDir)) return { failures: out, coverage }
  let files
  try {
    files = fs.readdirSync(logsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
      .flatMap((entry) => {
        try { return [{ name: entry.name, at: fs.statSync(path.join(logsDir, entry.name)).mtimeMs }] }
        catch (error) { coverage.unreadable.push({ file: entry.name, code: error.code }); return [] }
      })
      .sort((a, b) => b.at - a.at).slice(0, 5)
  } catch (error) {
    coverage.status = 'unreadable'
    coverage.unreadable.push({ file: path.basename(logsDir), code: error.code })
    return { failures: out, coverage }
  }
  for (const file of files) {
    let text
    try { text = readText(path.join(logsDir, file.name)) }
    catch (error) { coverage.unreadable.push({ file: file.name, code: error.code }); continue }
    const range = { name: file.name, rows: 0, from: null, to: null }
    coverage.files.push(range)
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      let row
      try { row = JSON.parse(line) } catch { coverage.invalidRows++; continue }
      if (!row || typeof row !== 'object' || Array.isArray(row)) { coverage.invalidRows++; continue }
      range.rows++
      if (toDate(row.time)) {
        if (!range.from || row.time < range.from) range.from = row.time
        if (!range.to || row.time > range.to) range.to = row.time
      }
      if (!String(row.message || '').includes('failed to import')) continue
      const match = String(row.message).match(/^([\w@/.-]+) \(([\w@/.-]+)\): failed to import: ([\s\S]*)$/)
      if (!match) { coverage.unmatchedRows++; continue }
      const hit = { file: file.name, time: row.time, runId: row.runId || '', detail: match[3], pkg: match[2] }
      const list = out.get(match[2]) || []
      list.push(hit)
      out.set(match[2], list)
    }
  }
  coverage.status = !coverage.files.some((file) => file.rows)
    ? (coverage.unreadable.length || coverage.invalidRows ? 'unreadable' : 'empty')
    : (coverage.unreadable.length || coverage.invalidRows || coverage.unmatchedRows ? 'partial' : 'ready')
  const failures = new Map()
  for (const [pkg, rows] of out) {
    const groups = new Map()
    for (const row of rows) { const group = groups.get(row.detail) || []; group.push(row); groups.set(row.detail, group) }
    failures.set(pkg, [...groups.values()].map((group) => summarize(pkg, group.sort((a, b) => String(a.time).localeCompare(String(b.time))), home)))
  }
  return { failures, coverage }
}

/** 一条证据：报的时刻（按启动分组）、几次启动、什么错、缺哪个文件（在不在）。 */
function summarize(pkg, rows, home) {
  const last = rows[rows.length - 1]
  const boots = new Map()
  for (const row of rows) {
    const d = toDate(row.time)
    if (!d || !row.runId) continue
    const key = row.runId
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