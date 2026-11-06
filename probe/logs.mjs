#!/usr/bin/env node
// 只读取证：运行期出过什么错。不写任何文件。
//   node probe/logs.mjs [--dsh-home <目录>] [--logs <日志目录>]
import fs from 'node:fs'
import path from 'node:path'
import { BS, NL, emit, exists, listDir, parseArgs, readText, resolveHome } from './lib/common.mjs'

const MAX_FILES = 5
const MAX_ENTRIES = 200

const opt = parseArgs(process.argv.slice(2))
const home = resolveHome(opt)
const dir = path.resolve(opt['--logs'] || path.join(home, 'logs'))
// --only 只收这些包（逗号分隔）。不传 = 全收，范围判断留给调用方，probe 不替它决定。
const only = new Set(String(opt['--only'] || '').split(',').map((x) => x.trim()).filter(Boolean))

/** 从调用栈里取「最内层的 node_modules 包名」；取不到返回 null，不猜。 */
function pkgFromStack(stack) {
  if (!stack) return null
  const normalized = String(stack).split(BS).join('/')
  const chunks = normalized.split('/node_modules/')
  for (let i = chunks.length - 1; i > 0; i--) {
    const segments = chunks[i].split('/')
    const head = segments[0]
    if (!head || head.startsWith('.')) continue // .pnpm / .bin 这类中转目录跳过
    if (head.startsWith('@') && segments[1]) return head + '/' + segments[1]
    return head
  }
  return null
}

function pickFiles() {
  const entries = listDir(dir)
  if (!entries) return { readable: false, files: [] }
  const files = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
    const full = path.join(dir, entry.name)
    let at = 0
    try {
      at = fs.statSync(full).mtimeMs
    } catch {
      // 时间读不到就不参与排序
    }
    files.push({ name: entry.name, full, at })
  }
  files.sort((a, b) => b.at - a.at)
  return { readable: true, files: files.slice(0, MAX_FILES) }
}

const picked = pickFiles()
const entries = []
let unclaimed = 0
let foreign = 0
let filesRead = 0

for (const file of picked.files) {
  let text
  try {
    text = readText(file.full)
  } catch {
    continue
  }
  filesRead++
  for (const line of text.split(NL)) {
    if (!line.trim()) continue
    let row
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    if (!row || row.level !== 'error') continue
    const stack = row.error && typeof row.error === 'object' ? String(row.error.stack || '') : ''
    const pkg = pkgFromStack(stack)
    if (!pkg) unclaimed++
    if (only.size && !only.has(pkg)) {
      foreign++
      continue
    }
    if (entries.length >= MAX_ENTRIES) continue
    entries.push({
      pkg,
      file: file.name,
      at: row.time || row.timestamp || null,
      level: 'error',
      message: String(row.message || (row.error && row.error.message) || '').slice(0, 400),
      tool: row.fields && typeof row.fields === 'object' ? String(row.fields.tool || '') || null : null,
      stackInPackage: Boolean(pkg),
    })
  }
}

emit({
  dir,
  readable: picked.readable,
  filesAvailable: picked.files.length,
  filesRead,
  entriesTotal: entries.length,
  truncated: entries.length >= MAX_ENTRIES,
  only: [...only],
  unclaimed,
  foreign,
  entries,
})