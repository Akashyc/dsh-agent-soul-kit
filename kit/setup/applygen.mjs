// 生成这份安装的 apply.mjs 与 meta.json。
//
// 它消费 answers 里那四个「有值没用」的字段：cliTools / register / skills / writeConfig。
// 产出的计划必须能过 probe/lib/plan.mjs —— 生成和校验分开，谁也不替谁兜底。
//
//   node kit/setup/applygen.mjs --answers <answers.json> --instance <目录> --source <上游> [--dry]
//
// 生成的是**本机资产**：脚本里嵌着这台机器的路径，不进版本库，也不套模板。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { kitRoot, parseArgs, readJson } from '../../probe/lib/common.mjs'
import { validateAnswers } from '../../probe/lib/answers.mjs'
import { kitFingerprint } from '../../probe/lib/kitfp.mjs'
import { fingerprint } from './replay.mjs'
import { validatePlan } from '../../probe/lib/plan.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const NL = String.fromCharCode(10)
const at = (p) => String(p).replace(/\\/g, '/')

/** 上游 plugins/tools 下有哪些 CLI 脚本目录（数据驱动，不写死 ledger/gateway/self）。 */
function scanTools(source) {
  const dir = path.join(source, 'plugins', 'tools')
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
  } catch { return [] }
}

/** 上游 presets/skills 下有哪些技能目录。 */
function scanSkills(source) {
  const dir = path.join(source, 'presets', 'skills')
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
  } catch { return [] }
}

/**
 * 答案 + 上游 + 本机 → 计划（契约版本 1）。
 * @param ctx source / dshHome / profile / instance / stamp / prereqs（可选）
 */
export function buildPlan(answers, upstream, ctx) {
  const errors = []
  const source = ctx.source
  const profile = answers.profile || ctx.profile
  const profileDir = path.join(ctx.dshHome, 'profiles', profile)
  const instance = ctx.instance
  const backupDir = path.join(instance, 'backups', ctx.stamp)
  const byDir = new Map((upstream.parts || []).map((p) => [p.dir, p]))

  const steps = []
  const risks = []

  // 1) 零件：装 / 拒
  for (const dir of answers.parts.install) {
    const part = byDir.get(dir)
    if (!part || !part.name) { errors.push('上游没有零件 ' + dir + '（答案过期了？）'); continue }
    steps.push({ kind: 'copy', from: 'plugins/' + dir, to: 'node_modules/' + part.name })
  }
  for (const dir of answers.parts.declined) {
    steps.push({ kind: 'skip', what: dir, why: '用户拒装（进 declined，下次更新不自动装回来）' })
  }

  // 2) 运行时依赖：只有真缺才装；没跑过 prereqs 就说清，不假装齐
  const runtime = ctx.prereqs ? (ctx.prereqs.runtime || []).filter((item) => item.status === 'missing') : null
  if (runtime === null) {
    steps.push({ kind: 'skip', what: '运行时依赖', why: '没跑 probe/prereqs.mjs：依赖齐不齐未判定，不拿「大概齐了」当结论' })
  } else {
    for (const item of runtime) {
      steps.push({ kind: 'install', pkg: item.pkg, from: String(upstream.sha || '').slice(0, 7) })
    }
  }

  // 3) CLI 工具：用户给了落点就装，没给就记跳过
  //   ★ '~' 必须展开：默认建议值是 '~/.dsh/dsh-soul/tools'，不展开会被当成 profile 相对路径，
  //     于是文件落到 profiles/desktop/~/... 下面 —— 装完脚本却「找不到」。
  const tools = scanTools(source)
  const cliRoot = answers.cliTools ? String(answers.cliTools).replace(/^~(?=\/|$)/, os.homedir()) : ''
  if (cliRoot && !path.isAbsolute(cliRoot)) errors.push('answers.cliTools 必须是绝对路径（或 ~ 开头）：' + answers.cliTools)
  if (cliRoot && path.isAbsolute(cliRoot)) {
    for (const name of tools) {
      steps.push({ kind: 'copy', from: 'plugins/tools/' + name, to: at(path.join(cliRoot, name)) })
    }
  } else if (tools.length) {
    steps.push({ kind: 'skip', what: 'plugins/tools/' + tools.join(','), why: 'answers.cliTools 为空：CLI 脚本没有落点，不猜路径' })
  }

  // 4) preset 技能
  const skills = scanSkills(source)
  if (answers.skills && skills.length) {
    for (const name of skills) steps.push({ kind: 'copy', from: 'presets/skills/' + name, to: at(path.join(profileDir, 'skills', name)) })
  } else if (skills.length) {
    steps.push({ kind: 'skip', what: 'presets/skills', why: 'answers.skills 为 false：不装 preset 自带技能' })
  }

  // 5) 写配置：两处，写前必备份
  if (answers.register) {
    steps.push({
      kind: 'write-config',
      file: at(path.join(profileDir, 'package.json')),
      backup: at(path.join(backupDir, 'package.json')),
      change: 'dsh.profile.bundles 追加 ' + bundlePkgs(answers, source).length + ' 个包名；desktopNextDeselectedBundles 去掉同名条目',
    })
  } else {
    steps.push({ kind: 'skip', what: 'dsh.profile.bundles', why: '用户选择不写 bundles：文件在、宿主不加载' })
  }

  const patchFile = path.join(profileDir, 'cordis.patch.yml')
  if (!answers.writeConfig) {
    steps.push({ kind: 'skip', what: 'cordis.patch.yml', why: 'answers.writeConfig 为 false' })
  } else if (!fs.existsSync(patchFile)) {
    errors.push('profile 没有 cordis.patch.yml：先启动一次 DSH 让它生成（作者 §0）')
  } else {
    // soul-preset build 要有锚点才能插入：profile 里一个 preset 块都没有时它会直接退出。
    // 这一步在计划阶段就说清，不留到执行时炸。
    const raw = fs.readFileSync(patchFile, 'utf8')
    const anchors = (raw.match(/^- id: preset-/gm) || []).length
    if (anchors === 0) {
      steps.push({ kind: 'skip', what: 'cordis.patch.yml', why: 'profile 里没有 preset 锚点：soul-preset build 无处插入，需要先手工搭一个 preset 骨架（作者 §4）' })
      risks.push('没有 preset 锚点：cordis.patch.yml 这次不会写入，picker 里不会出现任何模式')
    } else {
      steps.push({
        kind: 'write-config',
        file: at(patchFile),
        backup: at(path.join(backupDir, 'cordis.patch.yml')),
        change: '插入 ' + (answers.presets || []).length + ' 个 preset 块' + (answers.defaultPreset ? '；agent-preset-registry 的 selectedDefault/default 设为 ' + answers.defaultPreset : ''),
      })
    }
  }

  // 6) 风险：从上游事实里取，不写通用套话
  const noBundle = answers.parts.install.filter((dir) => {
    const part = byDir.get(dir)
    if (!part) return false
    const manifest = readJson(path.join(source, 'plugins', dir, 'package.json'))
    return !(manifest.value && manifest.value.dsh && manifest.value.dsh.bundle)
  })
  if (noBundle.length) risks.push('这些零件没有 dsh.bundle，复制了也不进装配清单：' + noBundle.join(', '))
  if ((answers.presets || []).length === 0) risks.push('一个 preset 都没选：picker 里不会出现任何模式')
  if (ctx.prereqs && (ctx.prereqs.declaredNeeds || []).length) risks.push('上游文档里还有 ' + ctx.prereqs.declaredNeeds.length + ' 条服务/账号类前置，装完要人工确认')
  if (!ctx.prereqs) risks.push('没跑前置排查：依赖与服务类前置均未判定')
  risks.push('写 cordis.patch.yml 后必须复核 bundles 条数（sanitizeProfile 会重置）')

  return {
    plan: {
      version: 1,
      action: ctx.action || 'install',
      steps,
      risks,
      rollback: at(backupDir),
      needsRestart: true,
    },
    errors,
  }
}

/** 只有带 dsh.bundle 的包才进 bundles —— 没有那一段的，写了也不生效（compact-region 就是这种）。 */
export function bundlePkgs(answers, source) {
  const out = []
  for (const dir of answers.parts.install) {
    const manifest = readJson(path.join(source, 'plugins', dir, 'package.json'))
    const pkg = manifest.value || {}
    if (pkg.name && pkg.dsh && pkg.dsh.bundle) out.push(pkg.name)
  }
  return out
}

/** 四项指纹。kit 那一项是内容指纹，不是版本号。 */
export function buildMeta(answers, upstream, local, ctx) {
  return {
    upstream: { sha: upstream.sha, short: String(upstream.sha || '').slice(0, 7), parts: (upstream.parts || []).length, fileCount: upstream.fileCount || null, syncedAt: ctx.syncedAt || null },
    local: { dshHome: ctx.dshHome, profile: answers.profile, platform: local.platform, arch: local.arch, node: local.nodeVersion, packageManager: local.packageManager, installedPartsBefore: (local.installedPackages || []).length },
    kit: { version: ctx.kitVersion, fingerprint: kitFingerprint(kitRoot()).fingerprint },
    answers: { file: 'answers.json', sha256: fingerprint(answers) },
  }
}

/** 生成的 apply.mjs：计划内嵌，默认只打印；--execute 才动。 */
export function renderScript(plan, ctx) {
  const L = []
  const push = (line) => L.push(line)
  push('#!/usr/bin/env node')
  push('// 本机安装脚本 —— 由 kit/setup/applygen.mjs 生成，不套模板。')
  push('//   node apply.mjs             只打印计划，一个字节都不动')
  push('//   node apply.mjs --execute   真跑（写前备份，失败即停）')
  push("import fs from 'node:fs'")
  push("import path from 'node:path'")
  push("import { spawnSync } from 'node:child_process'")
  push('')
  push('const PLAN = ' + JSON.stringify(plan, null, 2))
  push('const CTX = ' + JSON.stringify({
    source: at(ctx.source),
    dshHome: at(ctx.dshHome),
    profileDir: at(ctx.profileDir),
    profile: ctx.profile,
    packageManager: ctx.packageManager || 'pnpm',
    bundlePkgs: ctx.bundlePkgs || [],
    presetBuild: at(path.join(ctx.source, 'tools', 'soul-preset.mjs')),
  }, null, 2))
  push('const EXECUTE = process.argv.includes(String.fromCharCode(45, 45) + "execute")')
  push('const NL = String.fromCharCode(10)')
  push('')
  push('if (!EXECUTE) { process.stdout.write(JSON.stringify(PLAN, null, 2) + NL); process.exit(0) }')
  push('')
  push('const backupDir = PLAN.rollback')
  push('fs.mkdirSync(backupDir, { recursive: true })')
  push('const done = []')
  push('const replaced = []')
  push('')
  push('function backupFile(file) {')
  push('  if (!fs.existsSync(file)) return null')
  push('  const rel = path.relative(CTX.profileDir, file)')
  push('  const to = path.join(backupDir, rel)')
  push('  fs.mkdirSync(path.dirname(to), { recursive: true })')
  push('  fs.copyFileSync(file, to)')
  push('  return to')
  push('}')
  push('')
  push('function copyDir(from, to) {')
  push('  if (fs.existsSync(to)) {')
  push('    const old = path.join(backupDir, "replaced", String(replaced.length + 1) + "-" + path.basename(to))')
  push('    fs.mkdirSync(path.dirname(old), { recursive: true })')
  push('    fs.renameSync(to, old)')
  push('    replaced.push({ from: to, backup: old })')
  push('  }')
  push('  fs.mkdirSync(path.dirname(to), { recursive: true })')
  push('  fs.cpSync(from, to, { recursive: true })')
  push('}')
  push('')
  push('function editBundles(file) {')
  push("  const doc = JSON.parse(fs.readFileSync(file, 'utf8'))")
  push('  doc.dsh = doc.dsh || {}')
  push('  doc.dsh.profile = doc.dsh.profile || {}')
  push('  const before = Array.isArray(doc.dsh.profile.bundles) ? doc.dsh.profile.bundles.slice() : []')
  push('  const added = []')
  push('  for (const pkg of CTX.bundlePkgs) if (!before.includes(pkg)) { before.push(pkg); added.push(pkg) }')
  push('  doc.dsh.profile.bundles = before')
  push('  if (Array.isArray(doc.dsh.desktopNextDeselectedBundles)) {')
  push('    const set = new Set(CTX.bundlePkgs)')
  push('    doc.dsh.desktopNextDeselectedBundles = doc.dsh.desktopNextDeselectedBundles.filter((n) => !set.has(n))')
  push('  }')
  push("  fs.writeFileSync(file, JSON.stringify(doc, null, 2) + NL, 'utf8')")
  push("  const after = JSON.parse(fs.readFileSync(file, 'utf8')).dsh.profile.bundles")
  push("  if (after.length !== before.length) throw new Error('bundles 条数对不上：' + before.length + ' != ' + after.length)")
  push('  return { added: added.length, after: after.length }')
  push('}')
  push('')
  push('function runPresetBuild() {')
  push("  const args = [CTX.presetBuild, 'build', '--profile', CTX.profile, '--from', path.join(CTX.source, 'presets'), '--write']")
  push('  const r = spawnSync(process.execPath, args, { encoding: "utf8", env: { ...process.env, DSH_HOME: CTX.dshHome } })')
  push("  if (r.status !== 0) throw new Error('soul-preset build 失败：' + ((r.stderr || r.stdout || '').trim().split(NL).slice(-2).join(' / ')))")
  push('  return (r.stdout || "").trim().split(NL).slice(-4)')
  push('}')
  push('')
  push('for (const step of PLAN.steps) {')
  push("  if (step.kind === 'copy') {")
  push('    const from = path.join(CTX.source, step.from)')
  push("    const to = step.to.startsWith('/') ? step.to : path.join(CTX.profileDir, step.to)")
  push("    if (!fs.existsSync(from)) throw new Error('上游不存在：' + step.from)")
  push('    copyDir(from, to)')
  push("    done.push('copy ' + step.from + ' -> ' + to)")
  push("  } else if (step.kind === 'install') {")
  push("    const pm = CTX.packageManager === 'pnpm' ? 'pnpm' : 'npm'")
  push("    const r = spawnSync(pm, ['add', step.pkg], { cwd: CTX.profileDir, encoding: 'utf8' })")
  push("    if (r.status !== 0) throw new Error(pm + ' add ' + step.pkg + ' 失败：' + (r.stderr || '').trim().split(NL).slice(-2).join(' / '))")
  push("    done.push('install ' + step.pkg)")
  push("  } else if (step.kind === 'write-config') {")
  push('    backupFile(step.file)')
  push("    if (path.basename(step.file) === 'package.json') {")
  push("      done.push('write-config package.json ' + JSON.stringify(editBundles(step.file)))")
  push("    } else if (path.basename(step.file) === 'cordis.patch.yml') {")
  push("      done.push('write-config cordis.patch.yml ' + JSON.stringify(runPresetBuild()))")
  push('    } else {')
  push("      throw new Error('不认识的配置文件：' + step.file + '（契约只有这两种，多出来的要停下来改契约）')")
  push('    }')
  push("  } else if (step.kind === 'skip') {")
  push("    done.push('skip ' + step.what)")
  push('  }')
  push('}')
  push('')
  push("fs.writeFileSync(path.join(backupDir, 'MANIFEST.json'), JSON.stringify({ generatedBy: 'kit/setup/applygen.mjs', executedAt: new Date().toISOString(), steps: PLAN.steps, replaced }, null, 2) + NL)")
  push('process.stdout.write(JSON.stringify({ executed: true, steps: done, backupDir, needsRestart: true }, null, 2) + NL)')
  return L.join(NL) + NL
}

// ── CLI ───────────────────────────────────────────────────────────────
//   node kit/setup/applygen.mjs --answers <answers.json> --instance <目录> --source <上游> [--dry]
// 默认就写盘（生成 apply.mjs 与 meta.json）；加 --dry 只看计划。
// 写之前先过两道闸：answers 形状、计划契约。任何一道红就停。

function runProbe(script, args) {
  const r = spawnSync(process.execPath, [path.join(kitRoot(), script), ...args], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(script + ' 失败：' + (r.stderr || r.stdout || '').trim().split(NL).slice(-2).join(' / '))
  return JSON.parse(r.stdout)
}

function main() {
  const opt = parseArgs(process.argv.slice(2))
  const answersFile = opt['--answers'] ? path.resolve(opt['--answers']) : null
  const instance = opt['--instance'] ? path.resolve(opt['--instance']) : null
  const source = opt['--source'] ? path.resolve(opt['--source']) : null
  const dry = Boolean(opt['--dry'])
  const fail = (msg, extra) => { console.error(JSON.stringify({ ok: false, error: msg, ...(extra || {}) }, null, 2)); process.exit(2) }
  if (!answersFile || !fs.existsSync(answersFile)) fail('要用 --answers <answers.json>')
  if (!instance) fail('要用 --instance <data/<profile>/<instance>>')
  if (!source || !fs.existsSync(source)) fail('要用 --source 指向作者仓库副本')

  const answers = readJson(answersFile).value
  if (!answers) fail('answers.json 读不出来')
  const shape = validateAnswers(answers)
  if (!shape.ok) fail('answers 形状不对，先修问卷', { failures: shape.failures })

  const upstream = runProbe('probe/upstream.mjs', ['--source', source])
  const dshHome = opt['--dsh-home'] ? path.resolve(opt['--dsh-home']) : path.join(os.homedir(), '.dsh')
  const local = runProbe('probe/local.mjs', ['--dsh-home', dshHome, '--profile', answers.profile])
  const prereqs = opt['--prereqs'] ? readJson(path.resolve(opt['--prereqs'])).value : null

  const stamp = opt['--stamp'] || new Date().toISOString().slice(0, 10)
  const ctx = {
    source, instance, stamp, prereqs,
    dshHome,
    profile: answers.profile,
    profileDir: path.join(dshHome, 'profiles', answers.profile),
    packageManager: local.packageManager,
    bundlePkgs: bundlePkgs(answers, source),
    kitVersion: readJson(path.join(kitRoot(), 'package.json')).value.version,
  }

  const built = buildPlan(answers, upstream, ctx)
  if (built.errors.length) fail('计划生成不了：答案与上游对不上', { errors: built.errors })
  const check = validatePlan(built.plan)
  if (!check.ok) fail('计划不合契约，不许执行', { failures: check.failures })

  const script = renderScript(built.plan, ctx)
  const meta = buildMeta(answers, upstream, local, ctx)
  const out = {
    ok: true,
    dry,
    instance,
    steps: built.plan.steps.length,
    kinds: built.plan.steps.reduce((acc, s) => { acc[s.kind] = (acc[s.kind] || 0) + 1; return acc }, {}),
    risks: built.plan.risks.length,
    rollback: built.plan.rollback,
    notes: check.notes,
  }

  if (!dry) {
    fs.mkdirSync(instance, { recursive: true })
    fs.writeFileSync(path.join(instance, 'apply.mjs'), script, 'utf8')
    fs.writeFileSync(path.join(instance, 'meta.json'), JSON.stringify(meta, null, 2) + NL, 'utf8')
    out.written = ['apply.mjs', 'meta.json']
  } else {
    out.plan = built.plan
  }
  process.stdout.write(JSON.stringify(out, null, 2) + NL)
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (invokedDirectly) {
  try { main() } catch (error) { console.error('✗ ' + (error && error.message ? error.message : error)); process.exit(2) }
}

export default { buildPlan, buildMeta, renderScript, bundlePkgs }
