// 从上游文档里读出「必装 / 层 / 说明 / preset 元数据」。
// 只做文本扫描，不解析 YAML —— 上游 patch 里有 !!js，普通解析器会炸。
// 解析不出来就返回 null / 空，并说明原因：宁可「未判定」，不许拿常量顶替。

import fs from 'node:fs'
import path from 'node:path'
import { exists, readText } from './common.mjs'

const NL = String.fromCharCode(10)

/** 表格行拆 cells；非表格行返回 null。 */
function cells(line) {
  const t = line.trim()
  if (!t.startsWith('|')) return null
  return t.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
}

const ticks = (text) => [...String(text).matchAll(/`([^`]+)`/g)].map((m) => m[1].trim()).filter(Boolean)

/**
 * README「全局必装」表。
 * 返回 { found, rows, reason }；rows 里每条给 n / title / refs / parts / scripts / why。
 * parts 只认能对上 plugins/<目录> 的引用 —— 对不上的进 scripts，绝不丢。
 */
export function scanMustInstall(readmePath, parts) {
  if (!exists(readmePath)) return { found: false, rows: [], reason: '没有 README.md' }
  const lines = readText(readmePath).split(NL)
  const start = lines.findIndex((l) => /^##\s*全局必装/.test(l.trim()))
  if (start < 0) return { found: false, rows: [], reason: 'README 里没有「全局必装」一节' }

  const byDir = new Map((parts || []).map((p) => [p.dir, p]))
  const byName = new Map((parts || []).filter((p) => p.name).map((p) => [p.name, p]))
  const rows = []
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]
    if (/^##\s/.test(line.trim())) break
    const c = cells(line)
    if (!c || c.length < 4) continue
    if (!/^\d+$/.test(c[0])) continue
    const refs = ticks(c[2])
    const hitParts = []
    const scripts = []
    for (const ref of refs) {
      const dir = ref.startsWith('plugins/') ? ref.slice('plugins/'.length) : ref
      if (byDir.has(dir)) hitParts.push(dir)
      else if (byName.has(ref)) hitParts.push(byName.get(ref).dir)
      else scripts.push(ref)
    }
    rows.push({ n: Number(c[0]), title: c[1].replace(/\*\*/g, ''), refs, parts: [...new Set(hitParts)], scripts, why: c[3] })
  }
  if (rows.length === 0) return { found: false, rows: [], reason: '「全局必装」节里没有编号表格行' }
  return { found: true, rows, reason: null }
}

/**
 * plugins/清单.md：零件表（7 列，第 6 列是 ✓/○）+ 顶部层总表。
 * 返回 { notes: { 名字: {...} }, layers: [{ id, name, parts }], found }
 */
export function scanCatalog(mdPath) {
  if (!exists(mdPath)) return { found: false, notes: {}, layers: [], reason: '没有 plugins/清单.md' }
  const lines = readText(mdPath).split(NL)
  const notes = {}
  const layers = []

  for (const line of lines) {
    const c = cells(line)
    if (!c || c.length < 3) continue

    // 层总表：| Ⅰ ECHO | 空间：… | `compaction` · `pruner` · …
    const lv = c[0].replace(/\*/g, '').match(/^([ⅠⅡⅢⅣⅤⅥ])\s*(.*)$/)
    if (lv && ticks(c[2]).length) {
      layers.push({ id: lv[1], name: lv[2].trim(), manages: c[1].trim(), parts: ticks(c[2]) })
      continue
    }
    // 零件表：| `memory` | 管什么 | 缺了会怎样 | 判据 | 验它活了 | ✓ | 前置 |
    // 有些行是加粗的（**`heartbeat`**），先去掉星号再认
    if (!c[0].replace(/\*/g, '').trim().startsWith('`') || c.length < 7) continue
    const key = ticks(c[0])[0]
    if (!key) continue
    const mark = c[5].replace(/\*/g, '').trim()
    if (!['✓', '○', ''].includes(mark)) continue
    notes[key] = { what: c[1], without: c[2], check: c[3], verify: c[4], required: mark === '✓' ? true : mark === '○' ? false : null, prereq: c[6] || null }
  }

  const found = Object.keys(notes).length > 0
  return { found, notes, layers, reason: found ? null : '清单.md 里没认出零件表' }
}

/** preset-*.yml 的显示名与说明：扫 \`- id:\` 与 config 下的 id/name/description。 */
export function scanPresets(dir) {
  if (!exists(dir)) return { found: false, list: [], reason: '没有 presets/ 目录' }
  const list = []
  for (const file of fs.readdirSync(dir).sort()) {
    if (!/^preset-.*\.yml$/.test(file)) continue
    const text = readText(path.join(dir, file))
    const blockId = (text.match(/^-\s*id:\s*(\S+)/m) || [])[1] || file.replace(/\.yml$/, '')
    const lines = text.split(NL)
    let cfgIndent = -1
    let id = null
    let name = null
    let description = null
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      const cfg = l.match(/^(\s*)config:\s*$/)
      if (cfg && cfgIndent < 0) { cfgIndent = cfg[1].length; continue }
      if (cfgIndent < 0) continue
      const indent = l.match(/^(\s*)/)[1].length
      if (l.trim() && indent <= cfgIndent) break
      if (!id) { const m = l.match(/^\s*id:\s*(\S+)\s*$/); if (m) { id = m[1]; continue } }
      if (!name) { const m = l.match(/^\s*name:\s*(.+?)\s*$/); if (m) { name = m[1].replace(/^['"]|['"]$/g, ''); continue } }
      const d = l.match(/^\s*description:\s*(.*)$/)
      if (d && description === null) {
        const head = d[1].trim()
        if (head.startsWith('>') || head.startsWith('|')) {
          const pad = l.match(/^(\s*)/)[1].length
          const buf = []
          for (let j = i + 1; j < lines.length; j++) {
            const nl2 = lines[j]
            const ind = nl2.match(/^(\s*)/)[1].length
            if (nl2.trim() && ind <= pad) break
            buf.push(nl2.trim())
          }
          description = buf.join(' ').replace(/\s+/g, ' ').trim()
        } else {
          description = head.replace(/^['"]|['"]$/g, '')
        }
      }
    }
    list.push({ block: blockId, file, id: id || blockId.replace(/^preset-/, ''), name: name || id || blockId, description: description || null })
  }
  return { found: list.length > 0, list, reason: list.length ? null : 'presets/ 下没有 preset-*.yml' }
}

export default { scanMustInstall, scanCatalog, scanPresets }
