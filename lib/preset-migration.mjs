import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { rewriteSessionHeader } from './uninstall.mjs'

// 仅用于识别旧安装；这些 id 不再注册为 preset 或兼容别名。
export const RETIRED_PRESETS = {
  'ptc-soul-flash': 'yanqing-ptc',
  'flash-lean-ptc-v3-soul': 'yanqing-ptc',
}

/** 只替换退役 preset 的默认入口，保留其他配置原文。 */
export function migratePresetDefault(text) {
  return text.replace(/^(\s*selectedDefault:\s*)(['"]?)([\w-]+)\2([ \t]*(?:#.*)?)$/gm,
    (line, prefix, quote, id, suffix) => RETIRED_PRESETS[id] ? prefix + quote + RETIRED_PRESETS[id] + quote + suffix : line)
}

/** 拆出完整的 preset 块，避免误删插件内部的同名字段。 */
export function presetBlocks(text) {
  return [...String(text).matchAll(/^ {4}- id: preset-([\w-]+)\r?\n[\s\S]*?(?=^ {4}- id: preset-|$(?![\s\S]))/gm)]
    .map((match) => ({ id: match[1], text: match[0] }))
}

/** 移除退役块、补齐迁移目标；已存在的其他 preset 正文逐字保留。 */
export function migratePresetBundle(installed, target, known = []) {
  const oldBlocks = presetBlocks(installed)
  if (!oldBlocks.some((block) => RETIRED_PRESETS[block.id]) && !/^#.*PTC.*Flash/m.test(installed)) return null
  const kept = oldBlocks.filter((block) => !RETIRED_PRESETS[block.id])
  const current = new Map(kept.map((block) => [block.id, block.text]))
  const wanted = presetBlocks(target)
  const managed = [target, ...known.filter(Boolean)].flatMap(presetBlocks)
  const blocks = wanted.map((block) => {
    const existing = current.get(block.id)
    const recognized = managed.some((item) => item.id === block.id && item.text.trimEnd() === existing?.trimEnd())
    return !existing || recognized ? block.text : existing
  })
  for (const block of kept) if (!wanted.some((item) => item.id === block.id)) blocks.push(block.text)
  const header = target.slice(0, target.indexOf('    - id: preset-'))
  return header + blocks.map((block) => block.replace(/\s+$/, '')).join('\n')
}

/** 预检会话迁移；恢复时本机同路径文件优先，不修改备份原件。 */
export function planPresetSessions(directory, restoreDirectory = null) {
  const plans = []
  const seen = new Set()
  const walk = (source, relative = '') => {
    const dir = path.join(source, relative)
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = path.join(relative, entry.name)
      if (entry.isDirectory()) {
        walk(source, rel)
        continue
      }
      if (!/^session\.v\d+\.jsonl(?:\.zstd)?$/.test(entry.name) || seen.has(rel)) continue
      seen.add(rel)
      const file = path.join(source, rel)
      try {
        if (!entry.isFile()) throw new Error('会话必须是普通文件')
        const compressed = file.endsWith('.zstd')
        const bytes = fs.readFileSync(file)
        const decoded = compressed ? zlib.zstdDecompressSync(bytes) : bytes
        const text = decoded.toString('utf8')
        if (!Buffer.from(text).equals(decoded)) throw new Error('会话不是有效 UTF-8，不能保证正文原字节不变')
        const header = JSON.parse(text.split('\n', 1)[0])
        if (!header || header.type !== 'session') throw new Error('无法识别会话头')
        const rewrite = rewriteSessionHeader(text, RETIRED_PRESETS)
        if (!rewrite) continue
        const output = compressed ? zlib.zstdCompressSync(Buffer.from(rewrite.text)) : Buffer.from(rewrite.text)
        plans.push({ file: path.join(directory, rel), before: bytes, after: output, stat: fs.statSync(file) })
      } catch (error) {
        throw new Error(`会话迁移预检失败：${file}（${error.message}）。请使用支持 zstd 的 Node 或修复该文件后重试；尚未删除旧 preset。`)
      }
    }
  }
  walk(directory)
  if (restoreDirectory) walk(restoreDirectory)
  return plans
}

/** 在事务保护下写回会话，核对原文和回读结果，保留时间与权限。 */
export function applyPresetSessions(plans) {
  for (const plan of plans) {
    if (!fs.readFileSync(plan.file).equals(plan.before)) throw new Error('会话在预检后发生变化：' + plan.file)
    fs.writeFileSync(plan.file, plan.after)
    if (!fs.readFileSync(plan.file).equals(plan.after)) throw new Error('会话迁移回读失败：' + plan.file)
    fs.chmodSync(plan.file, plan.stat.mode)
    fs.utimesSync(plan.file, plan.stat.atime, plan.stat.mtime)
  }
}
