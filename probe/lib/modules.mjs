// 扫一个 node_modules：目录 → { dir, name, version }。
// scoped 包在 @scope/<name> 下 —— 只认顶层目录会把它们全漏掉（曾经漏过 @deepseek-ai/schemastery）。
import path from 'node:path'
import { exists, listDir, readJson } from './common.mjs'

export function scanModules(dir) {
  const entries = listDir(dir)
  if (!entries) return null
  const out = []
  const take = (rel, manifestPath, fallback) => {
    if (!exists(manifestPath)) return
    const pkg = readJson(manifestPath).value || {}
    out.push({ dir: rel, name: typeof pkg.name === 'string' ? pkg.name : fallback, version: pkg.version || null })
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    if (entry.name.startsWith('@')) {
      for (const sub of listDir(path.join(dir, entry.name)) || []) {
        if (!sub.isDirectory() || sub.name.startsWith('.')) continue
        const rel = entry.name + '/' + sub.name
        take(rel, path.join(dir, entry.name, sub.name, 'package.json'), rel)
      }
      continue
    }
    take(entry.name, path.join(dir, entry.name, 'package.json'), entry.name)
  }
  return out
}

export default { scanModules }
