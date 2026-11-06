#!/usr/bin/env node
// 只读取证：两棵树逐文件比哈希。不写任何文件，不执行任何东西。
//   node probe/files.mjs --a <目录> --b <目录> [--snippet <行数>] [--max <文件数>]
// a 通常是被比对的基线（上游某一版），b 是现状（本机已装的那份）。
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { NL, emit, exists, parseArgs, readText } from './lib/common.mjs'
import { walkRel } from './lib/tree.mjs'

const opt = parseArgs(process.argv.slice(2))
const notes = []
const a = opt['--a'] ? path.resolve(opt['--a']) : null
const b = opt['--b'] ? path.resolve(opt['--b']) : null
const snippetLines = opt['--snippet'] ? Number(opt['--snippet']) : 0
const maxFiles = opt['--max'] ? Number(opt['--max']) : 200

/** 文件内容哈希。读不动返回 null——不拿空串的哈希冒充空文件。 */
function hashOf(file) {
  try {
    return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  } catch {
    return null
  }
}

function sizeOf(file) {
  try {
    return fs.statSync(file).size
  } catch {
    return null
  }
}

if (!a || !b) {
  emit({ a, b, readable: false, notes: ['必须同时给 --a 和 --b：单边无法比较，也不该用空结果冒充「没有差异」'] })
  process.exit(0)
}
if (!exists(a) || !exists(b)) {
  const missing = []
  if (!exists(a)) missing.push(a)
  if (!exists(b)) missing.push(b)
  emit({ a, b, readable: false, notes: missing.map((dir) => '目录不存在：' + dir) })
  process.exit(0)
}

const listA = walkRel(a)
const listB = walkRel(b)
const setA = new Set(listA)
const setB = new Set(listB)
const all = Array.from(new Set(listA.concat(listB))).sort()

const summary = { same: 0, changed: 0, onlyA: 0, onlyB: 0, unreadable: 0 }
const changed = []

for (const rel of all) {
  if (!setB.has(rel)) {
    summary.onlyA++
    changed.push({ path: rel, state: 'onlyA' })
    continue
  }
  if (!setA.has(rel)) {
    summary.onlyB++
    changed.push({ path: rel, state: 'onlyB' })
    continue
  }
  const fileA = path.join(a, rel)
  const fileB = path.join(b, rel)
  const shaA = hashOf(fileA)
  const shaB = hashOf(fileB)
  if (!shaA || !shaB) {
    summary.unreadable++
    changed.push({ path: rel, state: 'unreadable', shaA, shaB })
    continue
  }
  if (shaA === shaB) {
    summary.same++
    continue
  }
  summary.changed++
  const entry = {
    path: rel,
    state: 'changed',
    shaA,
    shaB,
    sizeA: sizeOf(fileA),
    sizeB: sizeOf(fileB),
  }
  if (snippetLines > 0) entry.snippet = snippet(fileB, snippetLines)
  changed.push(entry)
}

/** 取头几行原文：给诊断层定位用，这里不带行号——行号是诊断层的事。 */
function snippet(file, count) {
  try {
    return readText(file).split(NL).slice(0, count)
  } catch {
    return []
  }
}

const truncated = changed.length > maxFiles
if (truncated) notes.push('差异文件超过上限 ' + maxFiles + ' 条，已截断：这段比较不完整')

emit({
  a,
  b,
  readable: true,
  summary,
  changed: changed.slice(0, maxFiles),
  truncated,
  notes,
})