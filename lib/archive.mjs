// 自动快照（5.4）：安装、更新、修复、恢复、卸载动手前的原样，统一放在 kit 的 archives/ 下，不再散落在 DSH 家目录里。
// 和 backups/ 分开：backups/ 是用户主动 --backup 打的迁移包（能带去别的电脑），archives/ 只给本机回滚用。
//   archives/<主机名>-<家目录指纹>/<时间>-<操作>-<随机码>/  一次操作一个文件夹，DSH 家目录下的文件按相对路径摆放
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

/** 这套 DSH 的快照根目录：一个 kit 管几套 DSH（或几台电脑共用一个 kit 文件夹）时互不混。 */
export function archiveRoot(kit, dshHome) {
  const id = crypto.createHash('sha1').update(path.resolve(dshHome)).digest('hex').slice(0, 8)
  return path.join(kit, 'archives', `${os.hostname().replace(/[^\w.-]/g, '_')}-${id}`)
}

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

/** 搬过去：同一个盘直接改名，跨盘拷完再删。 */
export function moveInto(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  try { fs.renameSync(from, to) } catch (e) {
    if (e.code !== 'EXDEV') throw e
    fs.cpSync(from, to, { recursive: true, preserveTimestamps: true })
    fs.rmSync(from, { recursive: true, force: true })
  }
}

// 5.3 及以前留在原地的备份：配置文件旁的 .bak-<时间>-pre-…、dsh-soul/_backup/ 里的各批、node_modules 里的 <包>.bak-…
const BAK_FILE = /\.bak-\d{8}-\d{6}-pre-[\w-]+$/
/**
 * 找 kit 以前留在 DSH 家目录里的备份；别人的文件不认。
 * @param dirs 放配置文件的目录（profile、mcp-hub、记忆中枢）；backupDir：dsh-soul/_backup；nm、pkgs：node_modules 和 kit 管的包名
 */
export function legacyBackups({ dirs, backupDir, nm, pkgs }) {
  const ls = (d) => { try { return fs.readdirSync(d) } catch { return [] } }
  return [
    ...dirs.flatMap((d) => ls(d).filter((f) => BAK_FILE.test(f)).map((f) => path.join(d, f))),
    ...ls(backupDir).map((f) => path.join(backupDir, f)),
    ...ls(nm).filter((d) => pkgs.some((n) => d.startsWith(n + '.bak-'))).map((d) => path.join(nm, d)),
  ]
}