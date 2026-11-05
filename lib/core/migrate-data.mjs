import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { dataPaths, assertDataPath, saveContext } from './data-paths.mjs'

function digest(file) {
  const hash = crypto.createHash('sha256')
  function visit(current, relative = '') {
    const stat = fs.lstatSync(current)
    if (stat.isSymbolicLink()) throw new Error('迁移不接受符号链接：' + current)
    hash.update(relative + (stat.isDirectory() ? '/directory' : '/file'))
    if (stat.isDirectory()) for (const name of fs.readdirSync(current).sort()) visit(path.join(current, name), relative + '/' + name)
    else if (stat.isFile()) hash.update(fs.readFileSync(current))
    else throw new Error('迁移仅支持普通文件与目录')
  }
  visit(file)
  return hash.digest('hex')
}

/** 默认只清点；无法证明归属的历史数据留在原位。 */
export function migrationPlan(kit, home, profile, assignments = []) {
  const data = dataPaths(kit, home, profile)
  const moves = [], unresolved = []
  const add = (from, to, reason) => {
    if (!fs.existsSync(from)) return
    const boundary = from.startsWith(path.resolve(kit) + path.sep) ? path.resolve(kit) : data.home
    for (let cursor = from; cursor.startsWith(boundary + path.sep); cursor = path.dirname(cursor)) {
      if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('迁移来源不接受符号链接：' + cursor)
    }
    moves.push({ from, to: assertDataPath(kit, to), digest: digest(from), reason, conflict: fs.existsSync(to) })
  }
  add(path.join(data.home, 'dsh-soul/fix', profile, 'issues.json'), data.issues, 'DSH 家目录与 profile 明确匹配')
  for (const category of ['logs', 'backups', 'archives', 'setups']) {
    const directory = path.join(kit, category)
    if (!fs.existsSync(directory)) continue
    for (const name of fs.readdirSync(directory)) {
      const from = path.join(directory, name)
      const tracked = spawnSync('git', ['--no-optional-locks', '-C', kit, 'ls-files', '--', path.relative(kit, from)], { encoding: 'utf8', timeout: 10000 })
      if (tracked.error) throw tracked.error
      if (tracked.status === 0 && tracked.stdout.trim()) {
        unresolved.push({ from, reason: '已被 Git 跟踪，保留公开文件，不作为本机数据迁移' })
        continue
      }
      // 公开方案不能因名字匹配而被当作本机产物迁走。
      if (!assignments.includes(from)) { unresolved.push({ from, reason: '归属未确认或可能是公开示例；保留原位，需要显式 --assign' }); continue }
      add(from, path.join(data[category], name), '使用者显式指定归属')
    }
  }
  for (const assignment of assignments) {
    if (!moves.some((move) => move.from === assignment)) throw new Error('--assign 只能指定 kit 旧 logs/backups/archives/setups 下存在的直接子项')
  }
  return { format: 1, kind: 'kit-data-migration', kit: path.resolve(kit), home: data.home, profile, instance: data.instance, moves, unresolved }
}

/** 按审阅后的精确计划移动，逐项落账；中断后可用同一计划继续。 */
export function applyMigration(plan) {
  const current = migrationPlan(plan.kit, plan.home, plan.profile,
    plan.moves.filter((move) => !move.reason.startsWith('DSH')).map((move) => move.from).filter((file) => fs.existsSync(file)))
  const data = dataPaths(plan.kit, plan.home, plan.profile)
  const journal = path.join(data.root, 'migration.json')
  if (plan.format !== 1 || plan.kind !== 'kit-data-migration' || plan.instance !== data.instance) throw new Error('迁移计划身份无效')
  let completed = []
  let pending = null
  if (fs.existsSync(journal)) {
    const previous = JSON.parse(fs.readFileSync(journal, 'utf8'))
    completed = previous.completed || []
    pending = previous.pending || null
  }
  for (const move of plan.moves) {
    assertDataPath(plan.kit, move.to)
    if (pending?.from === move.from && pending.to === move.to && pending.digest === move.digest && !fs.existsSync(move.from) && fs.existsSync(move.to) && digest(move.to) === move.digest) {
      completed.push(pending)
      pending = null
    }
    const done = completed.find((row) => row.from === move.from && row.to === move.to && row.digest === move.digest)
    if (done) {
      if (fs.existsSync(move.from) || !fs.existsSync(move.to) || digest(move.to) !== move.digest) throw new Error('已迁移内容发生变化，停止：' + move.to)
      continue
    }
    const approved = current.moves.find((row) => row.from === move.from && row.to === move.to && row.digest === move.digest)
    if (!approved || fs.existsSync(move.to)) throw new Error('迁移来源变化或目标冲突：' + move.from)
  }
  if (pending && !plan.moves.some((move) => move.from === pending.from && move.to === pending.to && move.digest === pending.digest)) throw new Error('存在另一份未完成迁移，先使用原计划恢复')
  saveContext(plan.kit, data)
  const record = () => {
    const stage = journal + '.' + crypto.randomBytes(6).toString('hex') + '.tmp'
    fs.writeFileSync(stage, JSON.stringify({ format: 1, completed, pending }, null, 2) + '\n')
    fs.renameSync(stage, journal)
  }
  record()
  for (const move of plan.moves) {
    if (completed.some((row) => row.from === move.from && row.to === move.to && row.digest === move.digest)) continue
    pending = { from: move.from, to: move.to, digest: move.digest }
    record()
    fs.mkdirSync(path.dirname(move.to), { recursive: true })
    try { fs.renameSync(move.from, move.to) } catch (error) {
      if (error.code !== 'EXDEV') throw error
      // 跨卷先复制到临时项，完整校验后才替换目标并移除来源。
      const stage = move.to + '.migration-' + crypto.randomBytes(3).toString('hex')
      fs.cpSync(move.from, stage, { recursive: true, errorOnExist: true, force: false })
      if (digest(stage) !== move.digest) throw new Error('迁移校验失败，原数据保留：' + move.from)
      fs.renameSync(stage, move.to)
      fs.rmSync(move.from, { recursive: true })
    }
    completed.push({ from: move.from, to: move.to, digest: move.digest })
    pending = null
    record()
  }
  return { journal, completed, unresolved: plan.unresolved }
}
