#!/usr/bin/env node
// 只读取证：装之前先看这台机器的前置。
//   node probe/prereqs.mjs --source <作者仓库> [--dsh-home <目录>] [--profile desktop]
//
// 回答四个问题：
//   1. 宿主在不在（home / profile / patch 文件 / dsh CLI）；
//   2. 零件的 dependencies（运行时，装进 profile 的那些）齐不齐；
//   3. **上游文档里点名的外部插件**（例如 mnemon-probe 要靠 dsh-mnemon、heartbeat 配套 lead-waker）
//      —— 这类不在 plugins/ 里，只能按文档声明去查，缺了插件会「装上但不工作」；
//   4. 这台机器上**已经装了哪些非本架构的插件** —— 包括同名但来源不同的（那类会在安装时被覆盖）。
//
// 不查宿主包里有什么：@deepseek-ai/* 在 asar 里，普通 fs 读不到，查了也只能写「未判定」。
// 那是宿主自己的事（上游 doctor 的 L1/official 也明说「不算失败」）。

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { emit, exists, listDir, parseArgs, readJson, resolveHome } from './lib/common.mjs'
import { scanParts } from './lib/tree.mjs'
import { scanModules } from './lib/modules.mjs'

const opt = parseArgs(process.argv.slice(2))
const source = opt['--source'] ? path.resolve(opt['--source']) : null
const home = resolveHome(opt)
const profile = opt['--profile'] || 'desktop'
const profileDir = path.join(home, 'profiles', profile)

const notes = []
if (!source) {
  emit({ readable: false, notes: ['没有给 --source：不知道要装什么，前置无从判断'] })
  process.exit(0)
}

const parts = scanParts(source)
if (parts.missing) {
  emit({ readable: false, notes: ['上游没有 plugins/ 目录：零件清单不可知'] })
  process.exit(0)
}

const cli = spawnSync('dsh', ['--version'], { encoding: 'utf8', timeout: 8000 })
const hostOk = {
  dshHome: exists(home),
  profileDir: exists(profileDir),
  patchFile: exists(path.join(profileDir, 'cordis.patch.yml')),
  cli: cli.error ? null : cli.status === 0 ? String(cli.stdout || '').trim() || 'ok' : null,
}

const profileModules = scanModules(path.join(profileDir, 'node_modules'))
if (profileModules === null) notes.push('profile 的 node_modules 读不到：已装插件与前置都未判定')

const findIn = (pkg) => {
  const local = (profileModules || []).filter((m) => m.name === pkg)
  if (local.length) return { at: 'profile', dirs: local.map((m) => m.dir), version: local[0].version }
  return null
}

// runtime：零件 package.json 里声明的 dependencies（要真装进 profile 的那些）
const runtime = new Map()
for (const part of parts.list) {
  const manifest = readJson(path.join(source, 'plugins', part.dir, 'package.json'))
  const deps = (manifest.value && manifest.value.dependencies) || {}
  for (const [pkg, range] of Object.entries(deps)) {
    if (!runtime.has(pkg)) runtime.set(pkg, { pkg, ranges: new Set(), neededBy: [] })
    runtime.get(pkg).ranges.add(String(range))
    runtime.get(pkg).neededBy.push(part.dir)
  }
}

const selfProvided = new Set(['dsh-agent-soul'])
const runtimeReport = [...runtime.values()].map((item) => {
  if (selfProvided.has(item.pkg)) {
    return { pkg: item.pkg, range: [...item.ranges].join(' , '), neededBy: item.neededBy, foundAt: 'kit', dirs: [], status: 'self' }
  }
  const hit = findIn(item.pkg)
  return { pkg: item.pkg, range: [...item.ranges].join(' , '), neededBy: item.neededBy, foundAt: hit ? hit.at : null, dirs: hit ? hit.dirs : [], status: hit ? 'ok' : 'missing' }
})

// 已装插件：分「本架构的」与「非本架构的」
const partNames = new Set(parts.list.map((p) => p.name).filter(Boolean))
const partDirs = new Set(parts.list.map((p) => p.dir))
const installed = profileModules || []
const external = installed.filter((m) => !partNames.has(m.name))
const alreadySoul = installed.filter((m) => partNames.has(m.name))

// 同名多目录 = 迟早抢同一个插件 id
const byName = new Map()
for (const m of installed) {
  if (!byName.has(m.name)) byName.set(m.name, [])
  byName.get(m.name).push(m.dir)
}
const shadow = [...byName.entries()].filter(([, dirs]) => dirs.length > 1).map(([name, dirs]) => ({ name, dirs }))
if (shadow.length) notes.push('同一个包名出现在多个目录：' + shadow.map((s) => s.name + '(' + s.dirs.join('|') + ')').join('、'))

// 与本架构零件同名的已装包：安装时会覆盖，必须先说
const willOverwrite = alreadySoul.map((m) => ({ dir: m.dir, name: m.name, version: m.version }))
if (willOverwrite.length) notes.push('这些目录与本架构零件同名，安装会覆盖：' + willOverwrite.map((x) => x.dir).join(', '))

// ── 文档里声明的前置 ────────────────────────────────────────────────
// 只认「上游自己写下来的」：清单.md 与各插件 README 里出现的包名、服务名、环境变量。
// 不从 kit 维护一张表 —— 上游加一个前置，这里自动多一条。
const DOC_FILES = [path.join(source, 'plugins', '清单.md')].concat(
  parts.list.map((part) => path.join(source, 'plugins', part.dir, 'README.md')).filter((file) => exists(file)),
)

const ownNames = new Set(parts.list.flatMap((part) => [part.dir, part.name].filter(Boolean)))
ownNames.add('dsh-agent-soul') // 本仓自己的包名，不是前置
const required = new Map()
const avoid = new Map()
const needs = []
const envVars = new Map()

const isTableHeader = (line) => /^\s*\|/.test(line) && /(零件|层|路径|字段|列|---)/.test(line) && !/dsh-/.test(line)
const AVOID = /(别和|不要和|不能和|前身|已弃用|弃用|同时装两套|会重复)/

for (const file of DOC_FILES) {
  const rel = path.relative(source, file).replace(/\\/g, '/')
  const lines = String(fs.readFileSync(file, 'utf8')).split(String.fromCharCode(10))
  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed || isTableHeader(line)) return
    const at = rel + ':' + (index + 1)
    const tokens = (line.match(/(?:@[\w.-]+\/)?dsh-[\w-]+/g) || []).filter((t) => !ownNames.has(t))
    const isAvoid = AVOID.test(line)
    const isRequire = /(先装|必须先|前置|需要|依赖|配套|要装|还要)/.test(line)

    if (tokens.length && (isAvoid || isRequire)) {
      const bucket = isAvoid ? avoid : required
      for (const token of tokens) {
        if (!bucket.has(token)) bucket.set(token, [])
        bucket.get(token).push(at)
      }
    }

    // 服务 / 账号类：说了「需要」，且点名了具体的外部服务 —— 只能原样交给人。
    // 不点名的一律不取（「需要把偏离拉回来」这种话不是前置）。
    const SERVICE = /(账号|服务|网关|客户端|Web GUI|浏览器|语音|模型服务|ComfyUI|SnowLuma|OneBot|NapCat|LLOneBot|Lagrange|edge-tts|密钥|token|二维码)/i
    const NEGATIVE = /(不需要|无需|不用|不必)/
    if (!tokens.length && isRequire && SERVICE.test(line) && !NEGATIVE.test(line) && !trimmed.startsWith('>') && trimmed.length > 10 && trimmed.length < 200) {
      needs.push({ file: rel, line: index + 1, text: trimmed })
    }

    // 环境变量：只认明确在讲环境变量的行（或 VAR=值 的写法），否则 README、JSON 这些词全会被抓进来
    if (/(环境变量|环境变量名|设为|export\s+[A-Z_]|[A-Z_]{4,}\s*=\s*[^\s])/.test(line)) {
      for (const token of line.match(/\b[A-Z][A-Z0-9_]{3,}\b/g) || []) {
        if (/^(README|JSON|YAML|HTTP|EULA|PATH|USER|POST|DELETE|PATCH|VALUE|FAILED|DISPLAY|VITAL|MEMORY|PASSWORD|SECRET|TOKEN|LOCALAPPDATA|USERPROFILE|PYTHONIOENCODING|CHROME_PATH)$/.test(token)) continue
        if (!envVars.has(token)) envVars.set(token, [])
        envVars.get(token).push(at)
      }
    }
  })
}

// @deepseek-ai/* 是宿主自己的包（在 asar 里），这里不查也不报 —— 查了只会得到假结论。
const isHostPackage = (pkg) => pkg.startsWith('@deepseek-ai/')
for (const token of [...required.keys(), ...avoid.keys()]) {
  if (!isHostPackage(token)) continue
  required.delete(token)
  avoid.delete(token)
}

const describe = (map, kind) => [...map.entries()].map(([pkg, where]) => {
  const hit = findIn(pkg)
  return {
    pkg,
    kind,
    mentionedIn: where.slice(0, 4),
    foundAt: hit ? hit.at : null,
    version: hit ? hit.version : null,
    status: hit ? 'ok' : 'missing',
  }
})

const docPackages = describe(required, 'required').concat(describe(avoid, 'avoid'))
const missingDoc = docPackages.filter((p) => p.kind === 'required' && p.status === 'missing')
if (missingDoc.length) notes.push('上游文档点名要装、但本机没有：' + missingDoc.map((p) => p.pkg).join(', ') + '（缺了会「装上但不工作」）')
if (avoid.size) notes.push('上游文档点名「别一起装」的：' + [...avoid.keys()].join(', '))
if (needs.length) notes.push('文档里写了 ' + needs.length + ' 条服务/账号类前置，查不到，只能人工确认（见 declaredNeeds）')

const missingRuntime = runtimeReport.filter((p) => p.status === 'missing')
if (missingRuntime.length) notes.push('缺运行时依赖（要装进 profile）：' + missingRuntime.map((p) => p.pkg).join(', '))

emit({
  readable: true,
  dshHome: home,
  profile,
  platform: process.platform,
  host: hostOk,
  runtime: runtimeReport,
  docPackages,
  declaredNeeds: needs.slice(0, 40),
  envVars: [...envVars.entries()].map(([name, where]) => ({ name, mentionedIn: where.slice(0, 3) })),
  installedCount: installed.length,
  external,
  willOverwrite,
  shadow,
  installState: exists(path.join(home, 'dsh-soul', '.install-state.json')),
  notes,
})
