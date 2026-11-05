import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const opDir = (root, ts, op) => path.join(root, `${ts}-${op}-${crypto.randomBytes(3).toString('hex')}`)

/** 文件在快照里的位置：DSH 家目录下的照相对路径，别处的放 _outside/<原绝对路径>。 */
export function snapPath(dir, dshHome, file) {
  const rel = path.relative(dshHome, file)
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return path.join(dir, rel)
  return path.join(dir, '_outside', path.resolve(file).replace(/^([A-Za-z]):/, '$1').replace(/^[\\/]+/, ''))
}

/** 拷进快照（文件或整个目录）；不存在就跳过。返回快照里的位置。 */
export function snap(dir, dshHome, file) {
  if (!fs.existsSync(file)) return null
  const to = snapPath(dir, dshHome, file)
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.cpSync(file, to, { recursive: true, preserveTimestamps: true, force: true })
  return to
}
