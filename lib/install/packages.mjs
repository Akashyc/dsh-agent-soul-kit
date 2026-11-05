import { exists, readJson } from '../core/io.mjs'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
const sha1 = (value) => crypto.createHash('sha1').update(value).digest('hex')
const SKIP_RE = /(^|\/)(\.DS_Store|\.git|node_modules)(\/|$)|\.(mp4|mov|webm)$/i

export function walk(root, rel = '', acc = []) {
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name
    if (SKIP_RE.test(r)) continue
    if (e.isDirectory()) walk(root, r, acc)
    else if (e.isFile()) acc.push(r)
  }
  return acc
}
export function packFiles(dir) {
  const all = walk(dir)
  const pj = readJson(path.join(dir, 'package.json'))
  if (pj?.name !== 'dsh-agent-soul') return all.sort()
  if (!pj || !Array.isArray(pj.files) || !pj.files.length) return all.sort()
  const rules = pj.files.map((f) => String(f).replace(/^\.\//, '').replace(/\/+$/, ''))
  const globs = rules.filter((f) => f.includes('*')).map((g) => new RegExp('^' + g.split('**').map((s) => s.split('*').map((t) => t.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*') + '(/.*)?$'))
  const plain = rules.filter((f) => !f.includes('*'))
  return all.filter((f) => /^package\.json$|^(readme|license|licence)(\.[^/]*)?$/i.test(f) || plain.some((p) => f === p || f.startsWith(p + '/')) || globs.some((g) => g.test(f))).sort()
}
export function hashFiles(root, files) { const m = new Map(); for (const f of files) m.set(f, sha1(fs.readFileSync(path.join(root, f)))); return m }
export function hashDir(root, ignore = []) { return exists(root) ? hashFiles(root, walk(root).filter((f) => !ignore.includes(f))) : new Map() }
// 比对范围必须与安装时相同，零件不能再按 npm 的 files 缩减。
export function hashInstalled(root, ignore = []) { return exists(root) ? hashFiles(root, packFiles(root).filter((f) => !ignore.includes(f))) : new Map() }
export function diffMaps(oldM, newM) {
  const added = [], removed = [], changed = []
  for (const [f, h] of newM) { if (!oldM.has(f)) added.push(f); else if (oldM.get(f) !== h) changed.push(f) }
  for (const f of oldM.keys()) if (!newM.has(f)) removed.push(f)
  return { added, removed, changed, same: !added.length && !removed.length && !changed.length }
}
// 按桌面端安装范围暂存、核对后再换上，失败不留半截。
export function packHashes(src) { return hashFiles(src, packFiles(src)) }
// 零件整目录复制，不修改作者 package.json 的 files。
export function deployPackage(src, dst, label, keep = [], { dry, stamp, info, ok }) {
  const files = packFiles(src)
  if (dry) { info(`[干跑] 将安装 ${label}（${files.length} 个文件）→ ${dst}`); return }
  const stage = dst + `.stage-${stamp}`
  fs.rmSync(stage, { recursive: true, force: true })
  for (const f of files) { const t = path.join(stage, ...f.split('/')); fs.mkdirSync(path.dirname(t), { recursive: true }); fs.copyFileSync(path.join(src, ...f.split('/')), t) }
  const want = packHashes(src, null), got = hashDir(stage)
  if (!diffMaps(want, got).same) { fs.rmSync(stage, { recursive: true, force: true }); throw new Error(`${label} 拷贝不完整`) }
  if (exists(dst)) {
    for (const k of keep) { const from = path.join(dst, k); if (exists(from)) { fs.mkdirSync(path.dirname(path.join(stage, k)), { recursive: true }); fs.copyFileSync(from, path.join(stage, k)) } }
    fs.rmSync(dst, { recursive: true, force: true })
  }
  fs.renameSync(stage, dst)
  ok(`${label}：已安装（${files.length} 个文件）`)
}
