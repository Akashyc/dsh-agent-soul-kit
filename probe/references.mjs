#!/usr/bin/env node
// 只读取证：某个标识出现在哪几处。改名时照这张图改，不靠人凭记忆列清单。
//   node probe/references.mjs --name <标识>[,<标识>] [--source <作者仓库>] [--home <DSH 家目录>] [--profile desktop]
import fs from 'node:fs'
import path from 'node:path'
import { NL, emit, exists, listDir, parseArgs, readText, resolveHome } from './lib/common.mjs'

const MAX_FILE_BYTES = 1024 * 1024
const MAX_HITS = 200
const EXTS = ['.js', '.mjs', '.cjs', '.json', '.yml', '.yaml', '.md', '.txt']
const SKIP_DIRS = new Set(['.git', 'node_modules', 'data', 'logs', 'backups', '.DS_Store'])

const opt = parseArgs(process.argv.slice(2))
const names = String(opt['--name'] || '').split(',').map((x) => x.trim()).filter(Boolean)
const home = resolveHome(opt)
const profile = opt['--profile'] || 'desktop'
const source = opt['--source'] ? path.resolve(opt['--source']) : null
const localRoot = path.join(home, 'profiles', profile)

if (!names.length) {
  emit({ names: {}, notes: ['没有给 --name：要查什么标识必须由调用方说明'] })
  process.exit(0)
}

function collect(dir, prefix, out) {
  const entries = listDir(dir)
  if (!entries) return
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue
    const rel = prefix ? prefix + '/' + entry.name : entry.name
    if (entry.isDirectory()) {
      collect(path.join(dir, entry.name), rel, out)
      continue
    }
    const ext = path.extname(entry.name).toLowerCase()
    if (!EXTS.includes(ext)) continue
    try {
      if (fs.statSync(path.join(dir, entry.name)).size > MAX_FILE_BYTES) continue
    } catch {
      continue
    }
    out.push({ full: path.join(dir, entry.name), rel })
  }
}

/** 扫描一棵树，返回每个标识的命中位置。 */
function scan(root) {
  const hits = {}
  for (const name of names) hits[name] = []
  if (!root || !exists(root)) return hits
  const files = []
  collect(root, '', files)
  for (const file of files) {
    let text
    try {
      text = readText(file.full)
    } catch {
      continue
    }
    if (!names.some((name) => text.includes(name))) continue
    const lines = text.split(NL)
    for (let i = 0; i < lines.length; i++) {
      for (const name of names) {
        if (lines[i].includes(name) && hits[name].length < MAX_HITS) {
          hits[name].push({ file: file.rel, line: i + 1, text: lines[i].trim().slice(0, 160) })
        }
      }
    }
  }
  return hits
}

const upstream = scan(source)
const local = scan(localRoot)
const result = {}
for (const name of names) result[name] = { upstream: upstream[name], local: local[name] }

emit({
  names: result,
  roots: { upstream: source, local: localRoot },
  notes: [
    '本机的 node_modules 不在扫描范围内：要改的是已有引用，不是包内自带的同名代码',
    source ? null : '没有给 --source：只看本机一侧',
  ].filter(Boolean),
})