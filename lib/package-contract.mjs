// 上游包「发布清单」自洽检查：install.mjs 拷包前、kit 迭代报告里共用这一份。
// 上游 2026-10-28 的更新记录总结过同一类坑（装机不报错、症状出现在别处）：
//   ① files 漏列入口 import 到的目录 → kit 和 pnpm 都按 files 拷包，装完文件就不存在，零件加载失败；
//   ② 源码 import 了 @deepseek-ai/*，peerDependencies 却没声明 → 宿主可能不加载这个零件，也没有崩溃日志。
// ① 是确定的坏包，② 是否被宿主拦截取决于 DSH 版本（上游 2026-10-28 才给 compaction 补上），所以只提醒。
// ④ 相对导入跳出了包目录（上游 0221d89 的换气、心跳从仓库根的 lib/paths.mjs 导入）→ 装进 node_modules 后那个文件不存在，零件一加载就失败。
// ③ DSH 启动时会加载的文件（入口和它们静态导入的）有语法错误 → 一个面板加载失败，整个窗口就起不来
//    （2026-11-01 上游 echo 的 client.js 多留了 12 行，DSH 卡在恢复模式）。用 node --check 只解析、不执行。
// 不执行上游代码；不解析注释里的写法，只认行首的 import / export … from。
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const JS = /\.(?:m?js|cjs)$/
// 静态导入：import x from '…'、import { a } from '…'、export * from '…'（允许跨行，遇到分号或引号就停）
const STATIC = /^[ \t]*(?:import|export)\b[^;'"`]*?\bfrom\s*(['"])([^'"\n]+)\1/gm
// 只为副作用的导入：import '…'
const BARE = /^[ \t]*import\s*(['"])([^'"\n]+)\1/gm
// 动态导入：import('…')，只用于 peerDependencies 提醒，不用于判定坏包（可能在 try 里当可选依赖）
const DYNAMIC = /\bimport\(\s*(['"])([^'"\n]+)\1\s*\)/g
const HOST_SCOPE = '@deepseek-ai/'

const specs = (text, re) => [...text.matchAll(re)].map((m) => m[2])
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))

/**
 * 从 package.json 找出宿主会加载的入口：exports 里的 JS 路径（不含通配）和 main；都没写时退回 index.js。
 * @param pj 已解析的 package.json
 * @param dir 包目录，用来判断默认入口是否存在
 * @returns 相对包根的入口文件（/ 分隔）
 */
export function entryFiles(pj, dir) {
  const out = new Set()
  const add = (value) => {
    if (typeof value !== 'string' || value.includes('*')) return
    const rel = path.posix.normalize(value.replace(/^\.\//, ''))
    if (JS.test(rel) && !rel.startsWith('../')) out.add(rel)
  }
  const walk = (value) => {
    if (typeof value === 'string') add(value)
    else if (value && typeof value === 'object') for (const item of Object.values(value)) walk(item)
  }
  walk(pj.exports)
  add(pj.main)
  if (!out.size && fs.existsSync(path.join(dir, 'index.js'))) out.add('index.js')
  return [...out].sort()
}

/**
 * 把相对导入解析成包内文件：先找发布清单里的，找不到再看源码目录里有没有（区分「漏列」和「根本没有」）。
 * @param from 发起导入的文件（相对包根）
 * @param spec 导入写法，以 . 开头
 * @param shipped 发布清单集合
 * @param dir 包目录
 * @returns { file, shipped, inSource }；指向包外时返回 null
 */
function resolveRelative(from, spec, shipped, dir) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec.split(/[?#]/)[0]))
  if (base.startsWith('../') || base === '..') return null
  const candidates = [base, `${base}.js`, `${base}.mjs`, `${base}.cjs`, `${base}/index.js`]
  const hit = candidates.find((file) => shipped.has(file))
  if (hit) return { file: hit, shipped: true, inSource: true }
  const local = candidates.find((file) => fs.existsSync(path.join(dir, ...file.split('/'))) && fs.statSync(path.join(dir, ...file.split('/'))).isFile())
  return { file: local || base, shipped: false, inSource: Boolean(local) }
}

/**
 * 检查一个上游包：沿入口的静态相对导入走一遍，导到的文件必须都在发布清单里；
 * 走到的文件里用到的 @deepseek-ai/* 必须在 peerDependencies（或 dependencies）里声明。
 * @param dir 上游包目录（含 package.json）
 * @param packed 按 files 规则算出的发布文件（相对路径，/ 分隔），由 install.mjs 的 packFiles 提供
 * @returns 问题列表：kind 为 unshipped（源码有但 files 漏列）、missing（源码里也没有）、outside（导入了包外的文件）、peer（宿主包没声明）、syntax（解析不了）
 */
export function inspectPackage(dir, packed) {
  const pj = readJson(path.join(dir, 'package.json'))
  const shipped = new Set(packed)
  const declared = new Set([...Object.keys(pj.peerDependencies || {}), ...Object.keys(pj.dependencies || {})])
  const issues = []
  const seen = new Set()
  const queue = []
  for (const entry of entryFiles(pj, dir)) {
    if (shipped.has(entry)) queue.push(entry)
    else {
      const exists = fs.existsSync(path.join(dir, ...entry.split('/')))
      issues.push({ kind: exists ? 'unshipped' : 'missing', file: 'package.json', spec: entry, target: entry })
      if (exists) queue.push(entry)
    }
  }
  const peers = new Map()
  // 漏列的第二类：不是 import，而是按路径拼出来再跑/读的包内脚本。
  // heartbeat 的 index.js 用 join(AI_ROOT, 'dsh-tools', 'dsh-yanqing-heartbeat') 拼出目录，
  // 再跑 heartbeat.mjs —— 静态 import 走不到，于是三个作者文件漏列了也没人报
  // （2026-11-04：照清单装完，面板一加载就 ERR_MODULE_NOT_FOUND）。
  // 只认「裸文件名 + js 扩展名」，且必须真的躺在包里；hub 的 memindex.mjs 之类不会误报。
  const flagged = new Set()
  while (queue.length) {
    const file = queue.shift()
    if (seen.has(file)) continue
    seen.add(file)
    if (!JS.test(file)) continue
    const abs = path.join(dir, ...file.split('/'))
    const check = spawnSync(process.execPath, ['--check', abs], { encoding: 'utf8', windowsHide: true })
    if (check.status !== 0) {
      const err = String(check.stderr || '')
      const at = err.match(/:(\d+)\r?\n/), why = err.match(/^\w*Error: .*$/m)
      issues.push({ kind: 'syntax', file, spec: `${at ? `第 ${at[1]} 行 ` : ''}${why ? why[0] : '解析失败'}`, target: file })
      continue
    }
    const text = fs.readFileSync(abs, 'utf8')
    // ponytail: 单行 join/resolve 字面脚本名；复杂动态路径仍需人工审查。
    for (const [, , name] of text.matchAll(/^(?![ \t]*\/\/).*?\b(?:join|resolve)\([^\n;]*?(['"])([\w.-]+\.(?:m?js|cjs))\1/gm)) {
      if (flagged.has(name)) continue
      if (!fs.existsSync(path.join(dir, name))) continue // 不是包内的文件（hub 里的那些）
      if (shipped.has(name)) continue // 清单里有，正常
      flagged.add(name)
      issues.push({ kind: 'unshipped', file, spec: name, target: name })
      queue.push(name) // 顺着它再走一遍 import，把它的配套文件也带出来
    }
    for (const spec of [...specs(text, STATIC), ...specs(text, BARE)]) {
      if (!spec.startsWith('.')) continue
      const hit = resolveRelative(file, spec, shipped, dir)
      if (!hit) { issues.push({ kind: 'outside', file, spec, target: spec }); continue }
      if (hit.shipped) queue.push(hit.file)
      else {
        if (!issues.some((i) => i.kind === 'unshipped' && i.target === hit.file)) issues.push({ kind: hit.inSource ? 'unshipped' : 'missing', file, spec, target: hit.file })
        if (hit.inSource) queue.push(hit.file)
      }
    }
    for (const spec of [...specs(text, STATIC), ...specs(text, BARE), ...specs(text, DYNAMIC)]) {
      if (!spec.startsWith(HOST_SCOPE)) continue
      const name = spec.split('/').slice(0, 2).join('/')
      if (!declared.has(name) && !peers.has(name)) peers.set(name, file)
    }
  }
  for (const [name, file] of peers) issues.push({ kind: 'peer', file, spec: name, target: name })
  return issues
}

/**
 * 把问题说成一句人话，安装器和迭代报告共用。
 * @param label 包的显示名
 * @param issue inspectPackage 返回的一项
 * @returns 中文说明
 */
export function describeIssue(label, issue) {
  if (issue.kind === 'syntax') return `${label}：${issue.file} 有语法错误（${issue.spec}），DSH 一加载它就失败（面板文件坏了整个窗口都起不来）`
  if (issue.kind === 'outside') return `${label}：${issue.file} 导入了包外的 ${issue.spec}，装进 node_modules 后这个文件不存在，零件一加载就失败`
  if (issue.kind === 'peer') return `${label}：${issue.file} 用到 ${issue.spec}，但 peerDependencies 没声明（DSH 可能不加载这个零件，也不报错）`
  const where = issue.file === 'package.json' ? `入口 ${issue.target}` : `${issue.file} 导入的 ${issue.spec}`
  return issue.kind === 'unshipped'
    ? `${label}：${where} 不在 package.json 的 files 里，按发布清单装上后这个文件不存在`
    : `${label}：${where} 在源码里找不到`
}
