// 称呼替换：上游代码里写着作者本人的称呼，装到别人机器上应该换成这台的用户称呼。
// 例：换气熔断时注入给 agent 的指令是「落完就停，告诉爀曦『需要手动压缩』」；回声分类认「爀曦说 / 爀曦问」。
// 做法：在上游源码的临时副本上替换，install.mjs 后面的比对、安装、中枢同步都用替换后的那份，
// 所以替换不会被当成「上游改动」，也不会被下一次更新冲掉。只换 kit 认得的上游作者称呼，别的字符串一律不碰。
import fs from 'node:fs'
import path from 'node:path'

// kit 认得的上游作者称呼（cyanwell/dsh-agent-soul）
export const AUTHOR_NAMES = ['爀曦']
// 只在这些文本文件里换；二进制、视频一律不碰
const TEXT_RE = /\.(?:m?js|cjs|ts|md|json|ya?ml|txt)$/i
// 换进去的称呼会落在 JS 字符串、模板字符串和注释里：引号、反引号、反斜杠、$、换行都可能把代码弄坏
const SAFE_TO = /^[^'"`\\$\x00-\x1f\x7f]{1,24}$/

/**
 * 读命令行或配置里的称呼替换。
 * @param value 对象 { 爀曦: 'Boss' }、字符串 '爀曦=Boss'（多条用逗号）或 'none'
 * @returns { map, errors }；map 是空对象表示不替换
 */
export function parseNameMap(value) {
  if (value === undefined || value === null || value === '' || value === 'none') return { map: {}, errors: [] }
  let map = {}
  const errors = []
  if (typeof value === 'string') {
    for (const part of value.split(/[,，]/).map((x) => x.trim()).filter(Boolean)) {
      const i = part.indexOf('=')
      if (i <= 0) { errors.push(`称呼替换要写成「上游称呼=你的称呼」，例如 ${AUTHOR_NAMES[0]}=Boss（现在是「${part}」）`); continue }
      map[part.slice(0, i).trim()] = part.slice(i + 1).trim()
    }
  } else if (typeof value === 'object' && !Array.isArray(value)) map = { ...value }
  else errors.push('称呼替换要是 { "上游称呼": "你的称呼" } 这样的对象')
  return { map, errors: [...errors, ...validateNameMap(map)] }
}

/**
 * 校验：只许换 kit 认得的上游作者称呼，换进去的称呼不能带会弄坏代码的字符。
 * @param map 上游称呼 → 本机称呼
 * @returns 错误列表
 */
export function validateNameMap(map) {
  const errors = []
  for (const [from, to] of Object.entries(map || {})) {
    if (!AUTHOR_NAMES.includes(from)) errors.push(`称呼替换只认上游作者的称呼（${AUTHOR_NAMES.join('、')}），不认「${from}」`)
    if (typeof to !== 'string' || !to.trim()) { errors.push(`「${from}」要换成什么没写`); continue }
    if (to !== to.trim() || !SAFE_TO.test(to)) errors.push(`「${to}」不能换进代码：不能有引号、反引号、反斜杠、$、换行，前后不能有空格，最长 24 个字`)
    if (AUTHOR_NAMES.some((n) => to.includes(n))) errors.push(`「${to}」里又含上游作者的称呼，换了等于没换`)
  }
  return errors
}

export const hasNames = (map) => Boolean(map && Object.keys(map).length)
export const nameMapLabel = (map) => Object.entries(map || {}).map(([a, b]) => `「${a}」→「${b}」`).join('、')
export const sameNameMap = (a, b) => JSON.stringify(Object.entries(a || {}).sort()) === JSON.stringify(Object.entries(b || {}).sort())

/**
 * 在一段文本里做称呼替换。
 * @param text 原文
 * @param map 上游称呼 → 本机称呼
 * @returns 替换后的文本
 */
export function applyNameMap(text, map) {
  let t = text
  for (const [from, to] of Object.entries(map || {})) t = t.split(from).join(to)
  return t
}

/**
 * 把上游源码复制一份，在文本文件里做称呼替换；原目录（可能是用户给的 --source）不动。
 * @param srcDir 上游源码目录
 * @param outDir 新目录（不存在）
 * @param map 上游称呼 → 本机称呼
 * @param skip 跳过的相对路径规则（.git、node_modules、视频等），和安装器的文件枚举一致
 * @returns 换过的文件（相对路径，/ 分隔）
 */
export function renameTree(srcDir, outDir, map, skip) {
  const changed = []
  fs.cpSync(srcDir, outDir, {
    recursive: true, verbatimSymlinks: true,
    filter: (file) => { const rel = path.relative(srcDir, file).split(path.sep).join('/'); return !rel || !skip || !skip.test(rel) },
  })
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(outDir, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) { walk(r); continue }
      if (!e.isFile() || !TEXT_RE.test(e.name)) continue
      const file = path.join(outDir, ...r.split('/'))
      const text = fs.readFileSync(file, 'utf8')
      const next = applyNameMap(text, map)
      if (next !== text) { fs.writeFileSync(file, next, 'utf8'); changed.push(r) }
    }
  }
  walk('')
  return changed.sort()
}

/**
 * 认出「本机代码手工改过称呼、但安装记录里没写」的情况，好提醒用户加 --rename，而不是默默冲掉。
 * @param pairs [{ local, raw }]：本机的文本和对应的上游原文
 * @param candidates 可能换成的称呼（安装记录 / 方案里的用户称呼）
 * @returns { from, to, count }；认不出返回 null
 */
export function guessNameMap(pairs, candidates) {
  let best = null
  for (const from of AUTHOR_NAMES) {
    for (const to of candidates.filter((c) => typeof c === 'string' && c && validateNameMap({ [from]: c }).length === 0)) {
      const count = pairs.filter((p) => typeof p.raw === 'string' && p.raw.includes(from) && p.local === p.raw.split(from).join(to)).length
      if (count && (!best || count > best.count)) best = { from, to, count }
    }
  }
  return best
}
