import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { exists, listDir, readJson, readText } from './common.mjs'

/** 遍历时要跳过的目录：都不是作者发布的零件。 */
export const SKIP_DIR = new Set(['.git', 'node_modules', 'data', 'logs', 'backups', '.DS_Store'])

/** 递归列出相对路径（正斜杠）。目录不存在返回空数组，不抛。 */
export function walkRel(dir, skip) {
  const out = []
  const skipped = skip || SKIP_DIR
  const step = (current, prefix) => {
    const entries = listDir(current)
    if (!entries) return
    for (const entry of entries) {
      if (skipped.has(entry.name)) continue
      const rel = prefix ? prefix + '/' + entry.name : entry.name
      if (entry.isDirectory()) step(path.join(current, entry.name), rel)
      else out.push(rel)
    }
  }
  step(dir, '')
  return out
}

/**
 * 扫 plugins/ 下的零件清单。只读 manifest 里写着的字段，缺了就是 null。
 * 返回 { list, missing }：missing 表示没有 plugins/ 目录，不能用空数组冒充「零个零件」。
 */
export function scanParts(dir) {
  const entries = listDir(path.join(dir, 'plugins'))
  if (!entries) return { list: [], missing: true }
  const list = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const manifest = path.join(dir, 'plugins', entry.name, 'package.json')
    if (!exists(manifest)) continue
    const parsed = readJson(manifest)
    const pkg = parsed.value || {}
    list.push({
      dir: entry.name,
      name: typeof pkg.name === 'string' ? pkg.name : null,
      version: typeof pkg.version === 'string' ? pkg.version : null,
      os: pkg.os || null,
      hasEntry: Boolean(pkg.main || pkg.exports),
      peerDependencies: pkg.peerDependencies || null,
    })
  }
  return { list: list.sort((a, b) => a.dir.localeCompare(b.dir)), missing: false }
}

/** 取文档里的标题行（# 开头），按出现顺序。没有文件返回空数组。 */
export function scanHeadings(file) {
  if (!exists(file)) return []
  return readText(file)
    .split(String.fromCharCode(10))
    .filter((line) => line.startsWith('#'))
    .map((line) => line.trim())
}

/** 取提交号与工作区是否干净；取不到就返回 null，不编造。 */
export function gitInfo(dir) {
  const sha = spawnSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
  const status = spawnSync('git', ['-C', dir, 'status', '--porcelain'], { encoding: 'utf8' })
  return {
    sha: sha.status === 0 ? sha.stdout.trim() : null,
    clean: status.status === 0 ? status.stdout.trim() === '' : null,
  }
}


export default { SKIP_DIR, walkRel, scanParts, scanHeadings, gitInfo }