// kit 自身的内容指纹。版本号是发布动作，不能拿来判断「代码变过没有」。
// 只算 kit/ 与 probe/ 下的源码，按路径排序后逐个哈希 —— 同一份代码永远同一个值。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const INCLUDE = ['kit', 'probe']
const SKIP_DIR = new Set(['node_modules', '.git', 'data', 'upstream', 'backups', 'logs'])

function walk(dir, prefix, out) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (SKIP_DIR.has(entry.name)) continue
    const rel = prefix ? prefix + '/' + entry.name : entry.name
    if (entry.isDirectory()) { walk(path.join(dir, entry.name), rel, out); continue }
    if (!/\.(mjs|js|json)$/.test(entry.name)) continue
    if (entry.name === 'selftest.mjs') continue
    out.push(rel)
  }
}

/** @returns { fingerprint, fileCount, files } */
export function kitFingerprint(root) {
  const files = []
  for (const dir of INCLUDE) walk(path.join(root, dir), dir, files)
  files.sort()
  const hashes = files.map((rel) => rel + ':' + crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex').slice(0, 16))
  return {
    fingerprint: crypto.createHash('sha256').update(hashes.join(String.fromCharCode(10))).digest('hex').slice(0, 32),
    fileCount: files.length,
    files: hashes,
  }
}

export default { kitFingerprint }
