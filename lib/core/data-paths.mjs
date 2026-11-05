import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

export function validateProfile(profile) {
  if (!/^[\p{L}\p{N}_-][\p{L}\p{N}_. -]*$/u.test(profile) || /[. ]$/.test(profile) || profile === '_kit') {
    throw new Error('profile 必须是单个有效目录名，不能使用保留名 _kit')
  }
}

/** 归档目录不接受符号链接，避免将私有数据写到 kit 外。 */
export function assertDataPath(kit, target) {
  const base = path.resolve(kit, 'data')
  const rel = path.relative(base, path.resolve(target))
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) throw new Error('归档路径超出 kit/data')
  let current = base
  for (const part of ['', ...rel.split(path.sep).filter(Boolean)]) {
    if (part) current = path.join(current, part)
    if (fs.existsSync(current) || isLink(current)) {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error('归档路径不接受符号链接：' + current)
    }
  }
  return path.resolve(target)
}

function isLink(file) { try { return fs.lstatSync(file).isSymbolicLink() } catch (error) { if (error.code === 'ENOENT') return false; throw error } }

export function dataPaths(kit, home, profile = 'desktop') {
  validateProfile(profile)
  const absolute = path.resolve(home)
  let ancestor = absolute
  const suffix = []
  while (!fs.existsSync(ancestor)) { suffix.unshift(path.basename(ancestor)); ancestor = path.dirname(ancestor) }
  const normalized = path.join(fs.realpathSync(ancestor), ...suffix)
  const id = crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 8)
  const instance = `${os.hostname().replace(/[^\w.-]/g, '_')}-${id}`
  const root = assertDataPath(kit, path.join(kit, 'data', profile, instance))
  return Object.fromEntries([
    ['root', root], ['home', normalized], ['profile', profile], ['instance', instance],
    ...['logs', 'backups', 'archives', 'setups', 'reports', 'fix'].map((name) => [name, assertDataPath(kit, path.join(root, name))]),
    ['issues', assertDataPath(kit, path.join(root, 'fix', 'issues.json'))],
  ])
}

export function operationDir(parent, operation) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return path.join(parent, `${stamp}-${operation}-${crypto.randomBytes(3).toString('hex')}`)
}

export function saveContext(kit, data) {
  const file = assertDataPath(kit, path.join(data.root, 'context.json'))
  const value = { format: 1, profile: data.profile, instance: data.instance, dshHome: data.home }
  if (fs.existsSync(file)) {
    const old = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (old.profile !== value.profile || old.dshHome !== value.dshHome) throw new Error('归档上下文归属冲突')
  }
  fs.mkdirSync(data.root, { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
}
