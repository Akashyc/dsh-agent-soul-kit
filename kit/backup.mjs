#!/usr/bin/env node
// 备份与还原。默认只清点，打包要 --yes。
//   node kit/backup.mjs plan    --dsh-home <目录> [--profile <名>]
//   node kit/backup.mjs pack    --dsh-home <...> --out <文件.tgz> [--yes]
//   node kit/backup.mjs verify  --from <文件.tgz>
//   node kit/backup.mjs restore --from <文件.tgz> --to <新 DSH 目录> [--yes]
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { NL, emit, exists, listDir, parseArgs, readJson, readText } from '../probe/lib/common.mjs'
import { walkRel } from '../probe/lib/tree.mjs'

const opt = parseArgs(process.argv.slice(2))
const cmd = opt._[0]
const confirmed = Boolean(opt['--yes'])
const dshHome = opt['--dsh-home'] ? path.resolve(opt['--dsh-home']) : path.resolve(os.homedir(), '.dsh')
const profile = opt['--profile'] || 'desktop'
const outFile = opt['--out'] ? path.resolve(opt['--out']) : null
const fromFile = opt['--from'] ? path.resolve(opt['--from']) : null
const toDir = opt['--to'] ? path.resolve(opt['--to']) : null

/** 备份清单：只带重装不出来的东西。判据是「丢了要重新做决定」，不是「文件存在」。 */
function inventory() {
  const profDir = 'profiles/' + profile
  return [
    { path: 'dsh-soul', why: '灵魂数据：记忆、书房、账本。重装不会重建它' },
    { path: profDir + '/cordis.patch.yml', why: '装配清单，重装会被覆盖成作者默认' },
    { path: profDir + '/package.json', why: 'bundles 与依赖声明' },
    { path: profDir + '/skills', why: 'preset 自带的技能目录' },
    { path: 'data/' + profile, why: 'answers / meta / apply / report：你的选择与执行记录' },
  ]
}

/** 明确不进包的东西，每条都要能说出为什么。 */
const EXCLUDED = [
  { path: 'data/_kit/patches', why: '补丁的 diff 上下文在新机器上大概率对不上，带了是废的；还原后重新诊断更可信' },
  { path: 'profiles/' + '*/node_modules', why: '安装结果，重装能得到，且体积最大' },
  { path: 'logs', why: '运行期日志，属于当时的机器，换机器即失效' },
]

function dirStats(rel, base) {
  const full = path.join(base, rel)
  if (!exists(full)) return { rel, exists: false, files: 0, bytes: 0 }
  const stat = fs.statSync(full)
  if (!stat.isDirectory()) return { rel, exists: true, files: 1, bytes: stat.size }
  const files = walkRel(full)
  let bytes = 0
  for (const file of files) {
    try { bytes += fs.statSync(path.join(full, file)).size } catch { /* 读不到就不算，不猜 */ }
  }
  return { rel, exists: true, files: files.length, bytes }
}

if (!cmd) {
  emit({ readable: false, commands: ['plan', 'pack', 'verify', 'restore'], notes: ['没给子命令'] })
  process.exit(0)
}

// ---------- plan / pack ----------
if (cmd === 'plan' || cmd === 'pack') {
  if (!exists(dshHome)) {
    emit({ readable: false, notes: ['DSH 目录不存在：' + dshHome] })
    process.exit(0)
  }
  const wanted = inventory().map((item) => ({ ...item, ...dirStats(item.path, dshHome) }))
  const present = wanted.filter((item) => item.exists)
  const missing = wanted.filter((item) => !item.exists)
  const warnings = []
  if (!present.some((item) => item.path === 'dsh-soul')) warnings.push('没有 dsh-soul：这份备份不含灵魂数据')
  if (missing.length) warnings.push(missing.length + ' 项在源机器上就不存在：' + missing.map((item) => item.path).join(', '))
  const total = { files: present.reduce((sum, item) => sum + item.files, 0), bytes: present.reduce((sum, item) => sum + item.bytes, 0) }

  const report = {
    dshHome,
    profile,
    include: present.map((item) => ({ path: item.path, files: item.files, bytes: item.bytes, why: item.why })),
    missing: missing.map((item) => item.path),
    exclude: EXCLUDED,
    total,
    warnings,
  }

  if (cmd === 'plan') {
    emit({ ...report, notes: ['这是清点，没有打包'] })
    process.exit(0)
  }

  if (!outFile) {
    emit({ ...report, ok: false, notes: ['要给 --out：不说存哪就不打'] })
    process.exit(0)
  }
  if (!confirmed) {
    emit({ ...report, ok: false, out: outFile, notes: ['没有 --yes：清单给你看了，一个文件都没复制'] })
    process.exit(0)
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  const manifest = {
    kind: 'dsh-agent-soul-kit/backup',
    version: 1,
    at: new Date().toISOString(),
    sourceHome: dshHome,
    profile,
    entries: present.map((item) => ({ path: item.path, files: item.files })),
    excluded: EXCLUDED.map((item) => item.path),
  }
  // manifest 单独放在临时目录，再用第二个 -C 拼进包里：不能写进用户的 dshHome。
  const manifestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-manifest-'))
  fs.writeFileSync(path.join(manifestDir, '.manifest.json'), JSON.stringify(manifest, null, 2) + NL)

  const entries = present.map((item) => item.path)
  const tar = spawnSync('tar', ['-czf', outFile, '-C', dshHome, ...entries, '-C', manifestDir, '.manifest.json'], { encoding: 'utf8' })
  fs.rmSync(manifestDir, { recursive: true, force: true })
  if (tar.status !== 0) {
    emit({ ...report, ok: false, notes: ['tar 失败：' + (tar.stderr || '').trim()] })
    process.exit(0)
  }
  emit({ ...report, ok: true, out: outFile, bytes: fs.statSync(outFile).size, notes: [] })
  process.exit(0)
}

// ---------- verify ----------
if (cmd === 'verify') {
  if (!fromFile || !exists(fromFile)) {
    emit({ readable: false, notes: ['要给 --from，且包必须存在'] })
    process.exit(0)
  }
  const list = spawnSync('tar', ['-tzf', fromFile], { encoding: 'utf8' })
  if (list.status !== 0) {
    emit({ readable: false, notes: ['包读不出来：' + (list.stderr || '').trim()] })
    process.exit(0)
  }
  const files = list.stdout.split(NL).filter(Boolean)
  const hasManifest = files.includes('.manifest.json')
  emit({
    package: fromFile,
    readable: true,
    files: files.length,
    hasManifest,
    sample: files.slice(0, 10),
    notes: hasManifest ? [] : ['包里没有 .manifest.json：不知道它是从哪台机器、哪个 profile 打的'],
  })
  process.exit(0)
}

// ---------- restore ----------
if (cmd === 'restore') {
  if (!fromFile || !exists(fromFile)) {
    emit({ readable: false, notes: ['要给 --from，且包必须存在'] })
    process.exit(0)
  }
  if (!toDir) {
    emit({ readable: false, notes: ['要给 --to：还原到哪必须说清'] })
    process.exit(0)
  }
  const staging = path.join(os.tmpdir(), 'kit-restore-' + Date.now())
  fs.mkdirSync(staging, { recursive: true })
  const untar = spawnSync('tar', ['-xzf', fromFile, '-C', staging], { encoding: 'utf8' })
  if (untar.status !== 0) {
    emit({ readable: false, notes: ['解包失败：' + (untar.stderr || '').trim()] })
    process.exit(0)
  }
  const manifestPath = path.join(staging, '.manifest.json')
  const manifest = readJson(manifestPath).value
  const oldHome = manifest && manifest.sourceHome ? manifest.sourceHome : null

  // 路径改写：只改已知的文本配置，不碰二进制。
  const REWRITE_EXT = new Set(['.yml', '.yaml', '.json', '.md', '.mjs', '.js', '.txt'])
  const rewrites = []
  let skippedRewrite = 0
  if (oldHome && oldHome !== toDir) {
    for (const rel of walkRel(staging)) {
      if (!REWRITE_EXT.has(path.extname(rel))) { skippedRewrite++; continue }
      const file = path.join(staging, rel)
      const before = readText(file)
      if (!before.includes(oldHome)) continue
      const after = before.split(oldHome).join(toDir)
      fs.writeFileSync(file, after)
      rewrites.push({ file: rel, count: before.split(oldHome).length - 1 })
    }
  }

  const counts = { copy: 0, overwrite: 0, skip: 0 }
  const actions = []
  for (const rel of walkRel(staging)) {
    if (rel === '.manifest.json') continue
    const dest = path.join(toDir, rel)
    if (exists(dest)) {
      counts.overwrite++
      actions.push({ path: rel, action: 'overwrite' })
    } else {
      counts.copy++
      actions.push({ path: rel, action: 'copy' })
    }
  }

  if (!confirmed) {
    fs.rmSync(staging, { recursive: true, force: true })
    emit({
      package: fromFile,
      to: toDir,
      oldHomeUsed: oldHome,
      counts,
      rewrites,
      actions: actions.slice(0, 20),
      ok: false,
      notes: ['没有 --yes：包已解开检查过，目标目录一个字节都没动'],
    })
    process.exit(0)
  }

  // manifest 只是元数据，不还原到用户目录里。
  fs.rmSync(manifestPath, { force: true })
  fs.mkdirSync(toDir, { recursive: true })
  fs.cpSync(staging, toDir, { recursive: true, force: true })
  fs.rmSync(staging, { recursive: true, force: true })
  emit({ package: fromFile, to: toDir, oldHomeUsed: oldHome, counts, rewrites, ok: true, notes: oldHome ? [] : ['包里没有源路径记录：路径改写没发生，配置文件里可能还写着旧机器的路径'] })
  process.exit(0)
}

emit({ readable: false, commands: ['plan', 'pack', 'verify', 'restore'], notes: ['不认识的子命令：' + cmd] })