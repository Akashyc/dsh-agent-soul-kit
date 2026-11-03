// Preset 层：上游 cyanwell/dsh-agent-soul 发布的灵魂五套 preset（presets/preset-soul*.yml；v3.0.0 以前叫砚青四套 preset-yanqing*）。
// 这里跟上游：只提供上游的预设，装法也照作者：写进 profile 的 cordis.patch.yml 顶层一项 `- insert:` 下面
// （作者 tools/soul-preset.mjs build / verify、soul-doctor 认的位置）。4.3 以前装在独立包 dsh-soul-preset 里。
// install.mjs 和本机重新生成脚本共用这一份，别在别处再写一套。
import { RETIRED_PRESETS } from './preset-migration.mjs'
import { FLASH_PRESET_ID, FLASH_LABEL, FLASH_FILE, adaptFlash } from './flash-presets.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ASSETS = path.join(HERE, '..', 'assets')

export const SOUL_IDS = ['soul', 'soul-cordis', 'soul-ptc', 'soul-distill', 'soul-all']
// 灵魂 · PTC Flash（lib/flash-presets.mjs）可以和灵魂五套一起选，默认不选
export const PRESET_IDS = [...SOUL_IDS, FLASH_PRESET_ID]
export const DEFAULT_PRESET_IDS = [...SOUL_IDS]
// 安装包后来才加的 preset：更新时安装记录里没有也补上（kit 版本低于这里写的）
export const ADDED_PRESETS = { 'soul-all': '5.0' }
// 早期版本用过的 id → 现在对应的 id（直接指到现在的，不链式映射）
export const OLD_PRESET_IDS = {
  // 2.10 及以前的四套自建 preset，2.11 起换成上游的四套：同模式一一对应
  'ptc-soul': 'soul-ptc',
  'standard-soul': 'soul',
  'minimal-soul': 'soul-distill',
  'cordis-soul': 'soul-cordis',
  // 2.11 – 4.5 的砚青四套和砚青 PTC Flash：上游 v3.0.0 去个人化改名（只换 id、显示名和 persona）
  yanqing: 'soul',
  'yanqing-cordis': 'soul-cordis',
  'yanqing-ptc': 'soul-ptc',
  'yanqing-distill': 'soul-distill',
  'yanqing-ptc-flash': FLASH_PRESET_ID,
}
// 旧 id 当时在 preset 列表里叫什么（给旧会话留的别名用这个名字，认得出来）
export const OLD_PRESET_LABEL = {
  'ptc-soul': 'PTC · Soul 模式',
  'standard-soul': '标准 · Soul 模式',
  'minimal-soul': '极简 · Soul 模式',
  'cordis-soul': 'Cordis · Soul 模式',
  yanqing: '砚青',
  'yanqing-cordis': '砚青创造',
  'yanqing-ptc': '砚青 PTC',
  'yanqing-distill': '砚青蒸馏',
  'yanqing-ptc-flash': '砚青 PTC Flash',
}
export const PRESET_LABEL = {
  soul: '灵魂',
  'soul-cordis': '灵魂 · 创造',
  'soul-ptc': '灵魂 · PTC',
  'soul-distill': '灵魂 · 预判',
  'soul-all': '灵魂 · 全能',
  [FLASH_PRESET_ID]: FLASH_LABEL,
}
export const PRESET_INFO = {
  soul: '上游灵魂：标准模式的副本，兜底压缩换成带门牌的版本',
  'soul-cordis': '上游灵魂 · 创造：Cordis 模式的灵魂版，带随 preset 走的创造技能（skills/）',
  'soul-ptc': '上游灵魂 · PTC：PTC 模式的灵魂版',
  'soul-distill': '上游灵魂 · 预判：persona 里常驻「先过一遍用户会怎么看」',
  'soul-all': '上游灵魂 · 全能：标准、PTC、创造、预判四合一，不用切换；只取 preset 本身，不带上游文件后面那段作者本机配置',
  [FLASH_PRESET_ID]: '灵魂 · PTC 的 Flash 精简版：照 dsh-flash-presets v3（控轮数、按需折叠，上下文到 25% 就压缩），压缩和裁剪带门牌；每次安装 / 更新时在线取作者最新发布的版本',
}
// 每个 preset 的来源键：灵魂五套逐字搬上游 presets/
export const PRESET_SOURCE = {
  soul: 'preset-soul',
  'soul-cordis': 'preset-soul-cordis',
  'soul-ptc': 'preset-soul-ptc',
  'soul-distill': 'preset-soul-distill',
  'soul-all': 'preset-soul-all',
  [FLASH_PRESET_ID]: 'flash',
}
const BUILTIN_KEYS = ['ptc', 'standard', 'minimal', 'cordis']
export const SOURCE_DESC = {
  ptc: '官方 PTC', standard: '官方「标准」预设', minimal: '官方「极简」预设',
  cordis: '官方「Cordis」预设', flash: 'dsh-flash-presets v3',
}
const posix = (p) => p.split(path.sep).join('/')
const isFile = (p) => { try { return fs.statSync(p).isFile() } catch { return false } }

export function openAppAsar(file) {
  const fd = fs.openSync(file, 'r')
  const b8 = Buffer.alloc(8); fs.readSync(fd, b8, 0, 8, 0)
  const headerSize = b8.readUInt32LE(4)
  const hb = Buffer.alloc(headerSize); fs.readSync(fd, hb, 0, headerSize, 8)
  const header = JSON.parse(hb.subarray(8, 8 + hb.readUInt32LE(4)).toString('utf8'))
  const base = 8 + headerSize
  const node = (p) => { let n = header; for (const seg of p.split('/')) { if (!n.files || !n.files[seg]) return null; n = n.files[seg] } return n }
  return {
    file,
    read(p) {
      const n = node(p); if (!n || n.files) return null
      if (n.unpacked) { try { return fs.readFileSync(path.join(file + '.unpacked', ...p.split('/'))) } catch { return null } }
      const b = Buffer.alloc(n.size); fs.readSync(fd, b, 0, n.size, base + Number(n.offset)); return b
    },
    close() { fs.closeSync(fd) },
  }
}
export function findAppAsar(override) {
  const c = []
  if (override) c.push(path.resolve(override))
  let d = path.dirname(process.execPath)
  for (let i = 0; i < 10; i++) { c.push(path.join(d, 'app.asar'), path.join(d, 'resources', 'app.asar'), path.join(d, 'Resources', 'app.asar')); const up = path.dirname(d); if (up === d) break; d = up }
  if (process.platform === 'darwin') for (const r of ['/Applications', path.join(process.env.HOME || '', 'Applications')]) for (const n of ['DSH NEXT.app', 'DeepSeek Harness.app']) c.push(path.join(r, n, 'Contents', 'Resources', 'app.asar'))
  if (process.platform === 'win32') for (const r of [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs'), process.env.ProgramFiles].filter(Boolean)) {
    try { for (const e of fs.readdirSync(r)) c.push(path.join(r, e, 'resources', 'app.asar')) } catch { /* 没有这个目录 */ }
  }
  for (const f of c) {
    try {
      if (!isFile(f)) continue
      const a = openAppAsar(f)
      const ptc = a.read('node_modules/@deepseek-ai/dsh-web-app/presets/ptc.patch.yml')
      if (!ptc) { a.close(); continue }
      const web = JSON.parse(String(a.read('node_modules/@deepseek-ai/dsh-web-app/package.json') || '{}'))
      const app = JSON.parse(String(a.read('package.json') || '{}'))
      return { ...a, webApp: web.version || null, app: app.version || null }
    } catch { /* 下一个 */ }
  }
  return null
}
// 源预设：官方四个从 app.asar 里读，读不到就用安装包快照；
// 灵魂五套从这次下载的上游源码 presets/ 里读（upstreamDir 是上游解包目录），上游没有（v3.0.0 以前的版本）就用安装包快照
// flash：灵魂 · PTC Flash 的源（install.mjs 取到的 dsh-flash-presets 目录和版本），没选它就不给
export function presetSources(nm, { appAsar, upstreamDir, flash = null } = {}) {
  const arg = appAsar !== undefined ? appAsar : (() => { const i = process.argv.indexOf('--app-asar'); return i >= 0 ? process.argv[i + 1] : null })()
  const a = findAppAsar(arg)
  const out = {}
  for (const k of BUILTIN_KEYS) {
    const t = a && a.read('node_modules/@deepseek-ai/dsh-web-app/presets/' + k + '.patch.yml')
    out[k] = t
      ? { text: t.toString('utf8'), from: 'DSH 自带（' + posix(a.file) + '）', version: 'DSH ' + (a.app || '?') + ' · dsh-web-app ' + (a.webApp || '?'), dsh: { app: a.app, webApp: a.webApp } }
      : { text: fs.readFileSync(path.join(ASSETS, 'presets', k + '.patch.yml'), 'utf8'), from: '安装包快照 assets/presets/' + k + '.patch.yml', version: 'DSH 2.0.19-next · dsh-web-app 0.2.1-rc.2（快照）', dsh: null, snapshot: true }
  }
  if (a) a.close()
  // 灵魂五套：上游 presets/*.yml。缺了就留空，buildPresetBundle 会跳过并提示
  for (const key of SOUL_IDS) {
    const up = upstreamDir && path.join(upstreamDir, 'presets', 'preset-' + key + '.yml')
    const snap = path.join(ASSETS, 'presets', 'preset-' + key + '.yml')
    const f = up && isFile(up) ? up : (isFile(snap) ? snap : null)
    if (!f) { out['preset-' + key] = null; continue }
    const fromUp = f === up
    const ver = fromUp ? '上游' : '安装包快照'
    const raw = fs.readFileSync(f, 'utf8')
    out['preset-' + key] = { text: expandIncludes(raw, fromUp ? path.join(upstreamDir, 'presets') : path.join(ASSETS, 'presets')), from: fromUp ? '上游 presets/preset-' + key + '.yml' : '安装包快照 assets/presets/preset-' + key + '.yml', version: ver, dsh: null }
  }
  if (flash) out.flash = { text: fs.readFileSync(path.join(flash.dir, ...FLASH_FILE.split('/')), 'utf8'), from: flash.from, version: flash.version, dsh: null }
  return out
}
// 上游用 `# @include $DIR/_shared/compaction.yml` 共享压缩组。展开算法逐行照搬作者 tools/soul-preset.mjs 的 build：
//   跳过共享文件开头连续的 # 说明行；段内部的 # 注释和空行原样保留；非空行按标记行的缩进补回去。
//   作者用这套算法证明「展开后逐字节还原」（作者 10-31 删掉了记哈希的 soul-version.json，算法照旧）。
// 找不到被引用的文件就原样留着那一行，buildPresetBundle 会提示。
export function expandIncludes(text, dir) {
  const src = String(text).replace(/\r\n/g, '\n')
  if (!dir) return src
  const out = []
  for (const line of src.split('\n')) {
    const m = line.match(/^(\s*)#\s*@include\s+(\S+?\.yml)/)
    const f = m && path.join(dir, m[2].replace(/^\$DIR\//, ''))
    if (!m || !isFile(f)) { out.push(line); continue }
    const inc = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')
    let i0 = 0
    while (i0 < inc.length && /^\s*#/.test(inc[i0])) i0++
    for (const l of inc.slice(i0)) out.push(l === '' ? '' : m[1] + l)
  }
  return out.join('\n')
}
// 灵魂五套：逐字搬。上游文件从 '    - id: preset-soul…' 起（没有 - insert:）。
// 只取这一块：顶格的第一行（不缩进的 `- id:` 或注释）起就不是 preset 了——上游 preset-soul-all.yml 后面跟着作者整份 profile 的导出
// （模型列表、第三方插件、局域网绑定、mnemon / 换气配置），照搬会盖掉用户自己的配置
export function verbatim(srcText, { key }) {
  const lines = String(srcText).replace(/\r\n/g, '\n').split('\n')
  const end = lines.findIndex((l, i) => i > 0 && /^\S/.test(l))
  const t = (end < 0 ? lines : lines.slice(0, end)).join('\n').replace(/\s+$/, '')
  if (!/^ {4}- id: preset-[\w-]+$/m.test(t)) throw new Error('上游 preset ' + key + ' 结构变了：第一行不是「    - id: preset-…」')
  return t + '\n'
}
/**
 * 给旧会话留的别名：会话开头记着建会话时的 preset id，id 没了会话就打不开。
 * 别名的内容和它对应的新 preset 逐字相同，只换声明行 id、preset id 和显示名。
 * @param block 新 preset 的整块文本（从「    - id: preset-…」起）
 * @param oldId 旧 id
 * @param newId 对应的新 id
 * @returns 别名块
 */
export function aliasBlock(block, oldId, newId) {
  let b = block
  const once = (re, to, what) => { if ((b.match(new RegExp(re.source, 'gm')) || []).length < 1) throw new Error('给旧会话做别名失败：' + newId + ' 里找不到' + what); b = b.replace(re, to) }
  once(/^ {4}- id: preset-[\w-]+$/m, '    - id: preset-' + oldId, '声明行')
  once(/^ {8}id: [\w-]+$/m, '        id: ' + oldId, ' preset id')
  const label = JSON.stringify((OLD_PRESET_LABEL[oldId] || oldId) + '（旧会话用，同「' + (PRESET_LABEL[newId] || newId) + '」）')
  const head = b.split('        plugins:')[0]
  if (/^ {8}name: .*$/m.test(head)) b = b.replace(/^( {8}name: ).*$/m, (_, a) => a + label)
  else b = b.replace(/^( {8}id: [\w-]+)$/m, '$1\n        name: ' + label)
  return b
}
// 压缩摘要走哪个模型。作者的灵魂五套在压缩组里写死了
//   summarizationProvider: deepseek-official / summarizationModel: deepseek-flash
// 那是走 API key 的路由。账号登录（deepseek-account）的机器没有 DEEPSEEK_API_KEY，压缩一调摘要就报
// 「llm-deepseek: no API key for provider route "deepseek-official"」：手动 /compact、88% 的自动压缩全都压不成，
// 长会话会一路涨到上下文顶上（Boss 本机 2026-10-29 会话日志里连续 6 次）。
//   session：去掉这两行，和官方预设一样跟会话模型走（默认）
//   author： 照作者原样写死
export const SUMMARY_MODES = { session: '跟会话模型走（去掉作者写死的 summarizationProvider / summarizationModel）', author: '照作者原样：deepseek-official / deepseek-flash（要在 DSH 模型页填 DeepSeek API key）' }
export function stripSummaryRoute(text) {
  const t = String(text).replace(/^[ \t]*summarization(?:Provider|Model):[^\n]*\n/gm, '')
  // 去掉之后某个 config: 底下空了，YAML 会变成 null：这种情况不该出现，出现了就别装
  const lines = t.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)config:\s*$/)
    if (!m) continue
    const next = lines.slice(i + 1).find((l) => l.trim() && !/^\s*#/.test(l))
    if (!next || next.match(/^\s*/)[0].length <= m[1].length) throw new Error('去掉摘要模型那两行后，有个 config: 底下空了（第 ' + (i + 1) + ' 行）')
  }
  return t
}
// profile cordis.patch.yml 里 Soul preset 那一节：顶层「- insert:」到下一个顶层行，里面有 4 格缩进的 preset 块才算。
// 作者的 build 在 profile 里一个 preset 都没有时会插到文件最顶上、还不带「- insert:」，所以第一次由这里写。
// 返回 { start, end, text }（行号区间、去掉尾部空行的原文），没有就 null
export function findPresetSection(cfg) {
  const lines = String(cfg || '').replace(/\r\n/g, '\n').split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (!/^- insert:\s*$/.test(lines[i])) continue
    let end = i + 1
    while (end < lines.length && !/^\S/.test(lines[end])) end++
    while (end > i + 1 && !lines[end - 1].trim()) end--
    const body = lines.slice(i, end)
    if (body.some((l) => /^ {4}- id: preset-[\w-]+\s*$/.test(l))) return { start: i, end, text: body.join('\n') }
  }
  return null
}
/** 换掉（或在末尾加上）profile 里 Soul preset 那一节；section 为空就整节去掉。 */
export function setPresetSection(cfg, section) {
  const lines = String(cfg || '').replace(/\r\n/g, '\n').split('\n')
  const found = findPresetSection(lines.join('\n'))
  const add = section ? section.replace(/\n+$/, '').split('\n') : []
  if (found) {
    lines.splice(found.start, found.end - found.start, ...add)
    // 整节去掉时别留下两行连着的空行
    if (!add.length && found.start < lines.length && !lines[found.start].trim() && (found.start === 0 || !lines[found.start - 1].trim())) lines.splice(found.start, 1)
  } else if (add.length) {
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
    lines.push(...add)
  }
  const t = lines.join('\n').replace(/\n+$/, '')
  return t ? t + '\n' : ''
}
/** 4.3 以前独立包 dsh-soul-preset 的 cordis.patch.yml（带注释头）→ 只留「- insert:」那一节，好和 profile 里的比。 */
export function presetSectionOf(text) {
  const t = String(text || '').replace(/\r\n/g, '\n')
  const i = t.search(/^- insert:/m)
  return i < 0 ? '' : t.slice(i).replace(/\s+$/, '')
}
// 生成要写进 profile 的那一节（text）；made 是每个 preset 的块，notes 是要提醒的
export function buildPresetBundle(src, ids = PRESET_IDS, { aliases = {}, summary = 'author' } = {}) {
  if (!SUMMARY_MODES[summary]) throw new Error('不认识的压缩摘要模式：' + summary)
  const made = {}, missing = []
  for (const id of PRESET_IDS) {
    if (!ids.includes(id)) continue
    const s = src[PRESET_SOURCE[id]]
    if (!s || !s.text) { missing.push(id); continue }
    made[id] = id === FLASH_PRESET_ID ? adaptFlash(s.text) : verbatim(s.text, { key: PRESET_SOURCE[id] })
  }
  if (summary === 'session') for (const id of Object.keys(made)) made[id] = stripSummaryRoute(made[id])
  const notes = []
  for (const id of PRESET_IDS) if (made[id] && /# @include \$DIR\//.test(made[id])) notes.push(PRESET_LABEL[id] + ' 的压缩组没展开（缺 presets/_shared/），装上去会没有压缩机制')
  if (missing.length) notes.push('上游这次没给的 preset：' + missing.join('、') + '（跳过，不影响其它 preset）')
  const srcLine = ids.filter((id) => made[id]).map((id) => PRESET_LABEL[id] + ' ← ' + (PRESET_SOURCE[id] in SOURCE_DESC ? SOURCE_DESC[PRESET_SOURCE[id]] : '上游 presets/' + PRESET_SOURCE[id] + '.yml') + '，' + src[PRESET_SOURCE[id]].version).join('；')
  const aliasList = Object.entries(aliases).filter(([o, n]) => made[n] && !PRESET_IDS.includes(o) && !RETIRED_PRESETS[o])
  const aliasText = aliasList.map(([o, n]) => aliasBlock(made[n], o, n)).join('')
  // srcLine 只给安装输出用：profile 里这一节不带注释，好和修复记录逐字比对
  const text = '- insert:\n' + (PRESET_IDS.filter((id) => made[id]).map((id) => made[id]).join('') + aliasText).replace(/\n$/, '')
  return { text, srcLine, notes, made, aliases: Object.fromEntries(aliasList), summary }
}

// ── 卸载时保留旧会话入口，替换为官方零件；已退役的 preset 不再生成 ──
export const SHELL_DESC = 'dsh-agent-soul 已卸载。留着这个 preset 只是为了让以前用它建的会话还能打开；压缩和裁剪已经换回官方原版，和对应的官方 preset 一样。新会话请用官方 preset。'
/** profile 里那一节是不是上次卸载留下的空壳。 */
export const isShellSection = (text) => String(text || '').includes(JSON.stringify(SHELL_DESC))
/**
 * 卸载时留的空壳：Soul preset 的 id 不变、名字标「（已卸载）」，压缩和裁剪换回官方零件，写回 profile 的同一节。
 * @param section 已装的那一节（profile 里的，或 4.3 以前独立包里的「- insert:」那一节）
 * @returns { text, ids }
 */
export function buildShellBundle(section) {
  let body = presetSectionOf(section)
  if (!body) throw new Error('已装的 Soul preset 里找不到 - insert:')
  // 退役 preset 的会话由卸载流程改回官方 PTC，不留同名空壳。
  body = body.split(/\n(?=    - id: preset-)/).filter((b) => !RETIRED_PRESETS[b.match(/^ {8}id: ([\w-]+)$/m)?.[1]]).join('\n')
  // 新旧两种包名都认：4.0 – 4.5 装的是 dsh-agent-*，2.11 – 3.0 和 5.0 起是 dsh-yanqing-*
  body = body.replace(/name: '(?:dsh-agent|dsh-yanqing)-compaction'/g, "name: '@deepseek-ai/dsh-compaction-basic'")
             .replace(/name: '(?:dsh-agent|dsh-yanqing)-pruner'/g, "name: '@deepseek-ai/dsh-compaction-tool-result-pruner'")
  // 范围压缩是 Kit 自己带进来的，空壳里没有官方对应件，整条去掉
  body = body.replace(/^ *- id: command-compact-region\n *name: '[^']*'\n/gm, '')
  const ids = [...body.matchAll(/^ {8}id: ([\w-]+)$/gm)].map((m) => m[1])
  if (!ids.length) throw new Error('已装的 Soul preset 里一个 preset id 都没认出来')
  body = body.replace(/^( {8}name: )(.+)$/gm, (_, a, n) => a + JSON.stringify(n.replace(/^['"]|['"]$/g, '').replace(/（已卸载）$/, '') + '（已卸载）'))
             .replace(/^( {8}description: )[^\n]*(?:\n {10,}[^\n]*)*/gm, (_, a) => a + JSON.stringify(SHELL_DESC)) // 上游 preset 的说明是跨行的字符串，续行一起换掉
  if (/name: ['"](dsh-agent-|dsh-yanqing-|dsh-huanqi|dsh-mcp-hub|dsh-soul-preset)/.test(body)) throw new Error('换回官方零件以后还引用着本架构的包，不能当空壳用')
  return { text: body.replace(/\s+$/, ''), ids }
}
