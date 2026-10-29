import fs from 'node:fs'
import path from 'node:path'

/**
 * 在首个写入前保存目标；失败时恢复文件、目录和原先不存在的路径。
 * @param directory 持久备份目录，不能放在待恢复目标内
 * @param targets 本次可能修改的绝对路径
 * @returns rollback / commit；备份保留供人工核查
 */
export function beginFixTransaction(directory, targets) {
  const resolved = targets.flatMap((target) => {
    const absolute = path.resolve(target)
    return fs.existsSync(absolute) ? [absolute, fs.realpathSync(absolute)] : [absolute]
  })
  const roots = [...new Set(resolved)]
    .filter((target, _, all) => !all.some((parent) => parent !== target && target.startsWith(parent + path.sep)))
  if (roots.some((target) => path.resolve(directory).startsWith(target + path.sep))) {
    throw new Error('修复备份目录不能位于待恢复目标内')
  }
  fs.mkdirSync(directory, { recursive: true })
  const entries = roots.map((target, index) => {
    const backup = path.join(directory, String(index))
    const exists = fs.existsSync(target) || Boolean(fs.lstatSync(target, { throwIfNoEntry: false }))
    if (exists) fs.cpSync(target, backup, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true })
    return { target, backup, exists }
  })
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(entries, null, 2))
  let active = true
  return {
    commit() {
      active = false
    },
    rollback() {
      if (!active) return
      const errors = []
      for (const entry of [...entries].reverse()) {
        try {
          fs.rmSync(entry.target, { recursive: true, force: true })
          if (entry.exists) {
            fs.mkdirSync(path.dirname(entry.target), { recursive: true })
            fs.cpSync(entry.backup, entry.target, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true })
          }
        } catch (error) {
          errors.push(`${entry.target}: ${error.message}`)
        }
      }
      if (errors.length) throw new Error(`自动回滚未完成，备份 ${directory}：${errors.join('；')}`)
      active = false
    }
  }
}
