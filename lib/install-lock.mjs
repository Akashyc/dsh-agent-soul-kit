import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

/**
 * 对整个 DSH 家目录加写锁，覆盖不同 profile 共享的中枢；异常退出遗留锁须人工核对。
 * @param home 已存在的 DSH 家目录
 * @returns 只释放本次持有锁的函数
 */
export function acquireInstallLock(home) {
  const file = path.join(fs.realpathSync(home), '.dsh-soul-write.lock')
  const token = randomUUID()
  let descriptor

  try {
    descriptor = fs.openSync(file, 'wx', 0o600)
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(`另一项 kit/fix 操作持有写锁：${file}；若进程已异常退出，请核对后手动处理遗留锁`)
    }
    throw error
  }

  try {
    fs.writeFileSync(descriptor, JSON.stringify({ token, pid: process.pid, at: new Date().toISOString() }))
  } catch (error) {
    fs.closeSync(descriptor)
    fs.unlinkSync(file)
    throw error
  }
  fs.closeSync(descriptor)

  return () => {
    if (!fs.existsSync(file)) return
    const current = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (current.token !== token) throw new Error('写锁归属已变化，未删除他人的锁')
    fs.unlinkSync(file)
  }
}
