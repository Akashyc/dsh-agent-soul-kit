#!/usr/bin/env node
// 只读取证：两版的结构差在哪。不写文件、不下结论。
//   node probe/diff.mjs --a <旧目录> --b <新目录>
// 管「结构」：零件增删改名、manifest 字段变化、安装流程锚点变化。
// 管「内容」的是 files.mjs——两者分开，因为处置方式不同。
import path from 'node:path'
import { emit, exists, parseArgs } from './lib/common.mjs'
import { gitInfo, scanHeadings, scanParts } from './lib/tree.mjs'

const opt = parseArgs(process.argv.slice(2))
const notes = []
const a = opt['--a'] ? path.resolve(opt['--a']) : null
const b = opt['--b'] ? path.resolve(opt['--b']) : null

if (!a || !b) {
  emit({ a, b, readable: false, notes: ['必须同时给 --a 和 --b：结构差要两边才能算'] })
  process.exit(0)
}

const missing = [a, b].filter((dir) => !exists(dir))
if (missing.length) {
  emit({ a, b, readable: false, notes: missing.map((dir) => '目录不存在：' + dir) })
  process.exit(0)
}

const partsA = scanParts(a)
const partsB = scanParts(b)
if (partsA.missing) notes.push('a 侧没有 plugins/ 目录：零件清单不可比')
if (partsB.missing) notes.push('b 侧没有 plugins/ 目录：零件清单不可比')

const byDirA = new Map(partsA.list.map((item) => [item.dir, item]))
const byDirB = new Map(partsB.list.map((item) => [item.dir, item]))

const added = []
const removed = []
const renamed = []
const changed = []

// 先按 dir 配对；dir 变了但 name 没变 —— 那是改名，不是一删一增。
const usedDirs = new Set()
const nameIndexB = new Map()
for (const item of partsB.list) {
  if (item.name && !nameIndexB.has(item.name)) nameIndexB.set(item.name, item)
}

for (const oldItem of partsA.list) {
  const same = byDirB.get(oldItem.dir)
  if (same) {
    usedDirs.add(oldItem.dir)
    const fields = []
    for (const key of ['name', 'version', 'os', 'hasEntry', 'peerDependencies']) {
      const before = oldItem[key]
      const after = same[key]
      if (JSON.stringify(before) !== JSON.stringify(after)) fields.push({ field: key, before, after })
    }
    if (fields.length) changed.push({ dir: oldItem.dir, fields })
    continue
  }
  const moved = oldItem.name ? nameIndexB.get(oldItem.name) : null
  if (moved && !byDirA.has(moved.dir)) {
    usedDirs.add(moved.dir)
    renamed.push({ name: oldItem.name, from: oldItem.dir, to: moved.dir })
    continue
  }
  removed.push({ dir: oldItem.dir, name: oldItem.name, version: oldItem.version })
}

for (const item of partsB.list) {
  if (usedDirs.has(item.dir)) continue
  added.push({ dir: item.dir, name: item.name, version: item.version, os: item.os, hasEntry: item.hasEntry })
}

// 安装流程锚点：标题就是锚点。变了说明作者改了执行契约，安装脚本不能照旧跑。
const headA = scanHeadings(path.join(a, 'AGENT-INSTALL.md'))
const headB = scanHeadings(path.join(b, 'AGENT-INSTALL.md'))
const setHeadA = new Set(headA)
const setHeadB = new Set(headB)
const headings = {
  added: headB.filter((line) => !setHeadA.has(line)),
  removed: headA.filter((line) => !setHeadB.has(line)),
  reordered: [],
}
if (!headA.length && !headB.length) notes.push('两边都没有 AGENT-INSTALL.md：流程锚点无法比较')
else if (!headA.length) notes.push('a 侧没有 AGENT-INSTALL.md')
else if (!headB.length) notes.push('b 侧没有 AGENT-INSTALL.md')
else {
  const keptA = headA.filter((line) => setHeadB.has(line))
  const keptB = headB.filter((line) => setHeadA.has(line))
  for (let i = 0; i < Math.min(keptA.length, keptB.length); i++) {
    if (keptA[i] !== keptB[i]) {
      headings.reordered.push({ before: keptA[i], after: keptB[i] })
      break
    }
  }
}

const gitA = gitInfo(a)
const gitB = gitInfo(b)
if (!gitA.sha && !gitB.sha) notes.push('两边都取不到提交号：能比结构，但不能说这是哪两版')

const structural = added.length + removed.length + renamed.length + changed.length
  + headings.added.length + headings.removed.length + headings.reordered.length

emit({
  a: { path: a, sha: gitA.sha, clean: gitA.clean },
  b: { path: b, sha: gitB.sha, clean: gitB.clean },
  readable: true,
  identical: structural === 0,
  parts: { added, removed, renamed, changed },
  headings,
  notes,
})