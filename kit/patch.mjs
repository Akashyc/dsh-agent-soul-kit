#!/usr/bin/env node
// 补丁引擎：只管「能不能打」和状态流转，不管「该不该修」。
// 「该不该修」是诊断层的事（症状检查），这里不碰。
//   node kit/patch.mjs list   [--data <补丁库目录>]
//   node kit/patch.mjs plan   [--data <...>] --profile-dir <profile 目录>
//   node kit/patch.mjs apply  [--data <...>] --profile-dir <...> [--yes]
//   node kit/patch.mjs retire --data <...> --id <id> --status <新状态> [--yes]
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { NL, exists, kitRoot, parseArgs, readJson, readText } from '../probe/lib/common.mjs'

const opt = parseArgs(process.argv.slice(2))
const cmd = opt._[0]
const dataDir = opt['--data'] ? path.resolve(opt['--data']) : path.join(kitRoot(), 'data', '_kit', 'patches')
const profileDir = opt['--profile-dir'] ? path.resolve(opt['--profile-dir']) : null
const confirmed = Boolean(opt['--yes'])
const emit = (value) => process.stdout.write(JSON.stringify(value, null, 2) + NL)

/** 能自动进库参与匹配的状态。草稿留在目录里给人看，不参与。 */
const AUTO_STATUS = new Set(['verified', 'applied'])

function sha256(file) {
  try {
    return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  } catch {
    return null
  }
}

function indexPath() {
  return path.join(dataDir, 'index.json')
}

/** 读总表。没有就返回空库——不造一个假的 index。 */
function readIndex() {
  const parsed = readJson(indexPath())
  if (parsed.value === null) return { order: [], error: parsed.error }
  const order = Array.isArray(parsed.value.order) ? parsed.value.order : []
  return { order, error: null }
}

/** 按总表顺序读每个补丁；缺 patch.json 的记为损坏，不跳过。 */
function readPatches() {
  const index = readIndex()
  const patches = []
  for (const id of index.order) {
    const dir = path.join(dataDir, id)
    const parsed = readJson(path.join(dir, 'patch.json'))
    if (parsed.value === null) {
      patches.push({ id, dir, broken: parsed.error })
      continue
    }
    patches.push({ id, dir, ...parsed.value })
  }
  return { order: index.order, patches, indexError: index.error }
}

// ---------- list ----------
if (cmd === 'list') {
  const { order, patches, indexError } = readPatches()
  const rows = patches.map((item) => ({
    id: item.id,
    status: item.broken ? 'broken' : (item.status || null),
    auto: !item.broken && AUTO_STATUS.has(item.status),
    targets: item.broken ? [] : (item.targets || []).map((target) => target.file),
    fingerprint: item.broken ? null : (item.fingerprint || null),
    note: item.broken || null,
  }))
  emit({
    dataDir,
    exists: exists(dataDir),
    order,
    count: rows.length,
    auto: rows.filter((row) => row.auto).length,
    patches: rows,
    indexError,
  })
  process.exit(0)
}

// ---------- plan / apply 共用：算每一步该干什么 ----------
function buildPlan() {
  const { patches } = readPatches()
  const steps = []
  // 串行：上一个补丁打完后的哈希，是下一个补丁的合法基线。
  const running = new Map()

  for (const item of patches) {
    const base = { id: item.id }
    if (item.broken) {
      steps.push({ ...base, action: 'blocked', reason: 'patch.json 读不出来：' + item.broken })
      continue
    }
    if (!AUTO_STATUS.has(item.status)) {
      steps.push({ ...base, action: 'skip', reason: '状态是 ' + (item.status || '未标') + '，不参与自动应用' })
      continue
    }
    const targets = Array.isArray(item.targets) ? item.targets : []
    if (targets.length === 0) {
      steps.push({ ...base, action: 'blocked', reason: 'targets 是空的：不知道要打在哪' })
      continue
    }

    let blocked = null
    for (const target of targets) {
      const file = path.join(profileDir, target.file)
      if (!exists(file)) {
        blocked = { action: 'blocked', reason: '目标文件不存在：' + target.file }
        break
      }
      const current = sha256(file)
      const expected = target.baseSha256
      const afterLast = running.get(target.file)
      if (current !== expected && current !== afterLast) {
        blocked = {
          action: 'stale',
          reason: target.file + ' 的哈希既不是基线也不是上一个补丁的结果：diff 打不上',
          file: target.file,
          expected,
          actual: current,
        }
        break
      }
      target._current = current
    }
    if (blocked) {
      steps.push({ ...base, ...blocked })
      continue
    }

    const patchFile = path.join(dataDir, item.id, 'fix.patch')
    if (!exists(patchFile)) {
      steps.push({ ...base, action: 'blocked', reason: '没有 fix.patch' })
      continue
    }
    const check = spawnSync('git', ['apply', '--check', patchFile], { cwd: profileDir, encoding: 'utf8' })
    if (check.status !== 0) {
      steps.push({
        ...base,
        action: 'stale',
        reason: 'git apply --check 不通过：' + (check.stderr || '').trim().split(NL).slice(0, 2).join(' / '),
        patchFile,
      })
      continue
    }

    steps.push({ ...base, action: 'apply', patchFile, targets: targets.map((t) => t.file) })
  }

  return steps
}

if (cmd === 'plan' || cmd === 'apply') {
  if (!profileDir) {
    emit({ readable: false, notes: ['必须给 --profile-dir：不知道要打到哪份安装上'] })
    process.exit(0)
  }
  if (!exists(profileDir)) {
    emit({ readable: false, notes: ['profile 目录不存在：' + profileDir] })
    process.exit(0)
  }
  const steps = buildPlan()
  const counts = { apply: 0, skip: 0, stale: 0, blocked: 0 }
  for (const step of steps) counts[step.action]++

  if (cmd === 'plan') {
    emit({ dataDir, profileDir, steps, counts, notes: ['这是计划，没有改动任何文件'] })
    process.exit(0)
  }

  if (!confirmed) {
    emit({
      dataDir,
      profileDir,
      steps,
      counts,
      applied: [],
      notes: ['没有 --yes：计划给你看了，一个文件都没动'],
    })
    process.exit(0)
  }

  // 真打：按计划顺序，遇到 stale/blocked 就停——不跳过继续。
  const applied = []
  for (const step of steps) {
    if (step.action !== 'apply') continue
    const result = spawnSync('git', ['apply', step.patchFile], { cwd: profileDir, encoding: 'utf8' })
    if (result.status !== 0) {
      applied.push({ id: step.id, ok: false, reason: (result.stderr || '').trim().split(NL).slice(0, 2).join(' / ') })
      break
    }
    applied.push({ id: step.id, ok: true })
  }
  emit({ dataDir, profileDir, steps, counts, applied, notes: applied.some((item) => !item.ok) ? ['中途失败，已停：后面的步骤没有执行'] : [] })
  process.exit(0)
}

// ---------- retire：改状态 ----------
if (cmd === 'retire') {
  const id = opt['--id']
  const status = opt['--status']
  if (!id || !status) {
    emit({ ok: false, notes: ['要给 --id 和 --status'] })
    process.exit(0)
  }
  const file = path.join(dataDir, id, 'patch.json')
  const parsed = readJson(file)
  if (parsed.value === null) {
    emit({ ok: false, notes: ['读不到 patch.json：' + id + ' — ' + parsed.error] })
    process.exit(0)
  }
  const before = parsed.value.status || null
  if (!confirmed) {
    emit({ ok: false, dry: true, id, before, after: status, notes: ['没有 --yes：状态没改'] })
    process.exit(0)
  }
  parsed.value.status = status
  parsed.value.statusChangedAt = new Date().toISOString()
  fs.writeFileSync(file, JSON.stringify(parsed.value, null, 2) + NL)
  emit({ ok: true, id, before, after: status })
  process.exit(0)
}

emit({
  readable: false,
  commands: ['list', 'plan', 'apply', 'retire'],
  notes: [cmd ? '不认识的子命令：' + cmd : '没给子命令'],
})