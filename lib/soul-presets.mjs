// Preset 层：上游 cyanwell/dsh-agent-soul 已经改成发布砚青四套 preset（presets/preset-yanqing*.yml）。
// 这里跟上游：只提供上游砚青四套预设。
// install.mjs 和本机重新生成脚本共用这一份，别在别处再写一套。
import { RETIRED_PRESETS } from './preset-migration.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ASSETS = path.join(HERE, '..', 'assets')

export const YANQING_IDS = ['yanqing', 'yanqing-cordis', 'yanqing-ptc', 'yanqing-distill']
export const PRESET_IDS = [...YANQING_IDS]
// 早期版本用过的 id
export const OLD_PRESET_IDS = {
  // 2.10 及以前的四套自建 preset，2.11 起换成上游砚青四套：同模式一一对应
  'ptc-soul': 'yanqing-ptc',
  'standard-soul': 'yanqing',
  'minimal-soul': 'yanqing-distill',
  'cordis-soul': 'yanqing-cordis',
}
// 旧 id 当时在 preset 列表里叫什么（给旧会话留的别名用这个名字，认得出来）
export const OLD_PRESET_LABEL = {
  'ptc-soul': 'PTC · Soul 模式',
  'standard-soul': '标准 · Soul 模式',
  'minimal-soul': '极简 · Soul 模式',
  'cordis-soul': 'Cordis · Soul 模式',
}
export const PRESET_LABEL = {
  yanqing: '砚青',
  'yanqing-cordis': '砚青创造',
  'yanqing-ptc': '砚青 PTC',
  'yanqing-distill': '砚青蒸馏',
}
export const PRESET_INFO = {
  yanqing: '上游砚青：标准模式的副本，兜底压缩换成带门牌的版本',
  'yanqing-cordis': '上游砚青创造：Cordis 模式的砚青版',
  'yanqing-ptc': '上游砚青 PTC：PTC 模式的砚青版',
  'yanqing-distill': '上游砚青蒸馏：更省 token 的砚青版',
}
// 每个 preset 的来源键：砚青四套逐字搬上游 presets/
export const PRESET_SOURCE = {
  yanqing: 'preset-yanqing',
  'yanqing-cordis': 'preset-yanqing-cordis',
  'yanqing-ptc': 'preset-yanqing-ptc',
  'yanqing-distill': 'preset-yanqing-distill',
}
const BUILTIN_KEYS = ['ptc', 'standard', 'minimal', 'cordis']
export const SOURCE_DESC = {
  ptc: '官方 PTC', standard: '官方「标准」预设', minimal: '官方「极简」预设',
  cordis: '官方「Cordis」预设',
}
export const YANQING_DESC = {
  yanqing: '上游砚青预设，逐字搬过来（只换注释头）。',
  'yanqing-cordis': '上游砚青创造预设，逐字搬过来（只换注释头）。',
  'yanqing-ptc': '上游砚青 PTC 预设，逐字搬过来（只换注释头）。',
  'yanqing-distill': '上游砚青蒸馏预设，逐字搬过来（只换注释头）。',
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
// 砚青四套从这次下载的上游源码 presets/ 里读（upstreamDir 是上游解包目录）
export function presetSources(nm, { appAsar, upstreamDir } = {}) {
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
  // 砚青四套：上游 presets/*.yml。缺了就留空，buildPresetBundle 会跳过并提示
  for (const key of YANQING_IDS) {
    const up = upstreamDir && path.join(upstreamDir, 'presets', 'preset-' + key + '.yml')
    const snap = path.join(ASSETS, 'presets', 'preset-' + key + '.yml')
    const f = up && isFile(up) ? up : (isFile(snap) ? snap : null)
    if (!f) { out['preset-' + key] = null; continue }
    const fromUp = f === up
    const ver = fromUp ? '上游' : '安装包快照'
    const raw = fs.readFileSync(f, 'utf8')
    out['preset-' + key] = { text: expandIncludes(raw, fromUp ? path.join(upstreamDir, 'presets') : path.join(ASSETS, 'presets')), from: fromUp ? '上游 presets/preset-' + key + '.yml' : '安装包快照 assets/presets/preset-' + key + '.yml', version: ver, dsh: null }
  }
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
// 砚青：逐字搬。上游文件从 '    - id: preset-yanqing' 起（没有 - insert:），补一行头
export function verbatim(srcText, { key }) {
  const t = String(srcText).replace(/\r\n/g, '\n').replace(/\s+$/, '')
  if (!/^ {4}- id: preset-[\w-]+$/m.test(t)) throw new Error('砚青源 preset ' + key + ' 结构变了：第一行不是「    - id: preset-…」')
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
// 压缩摘要走哪个模型。作者砚青四套在压缩组里写死了
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
export function buildPresetBundle(src, ids = PRESET_IDS, { pkgName = 'dsh-soul-preset', aliases = {}, summary = 'author' } = {}) {
  if (!SUMMARY_MODES[summary]) throw new Error('不认识的压缩摘要模式：' + summary)
  const made = {}, missing = []
  for (const id of PRESET_IDS) {
    if (!ids.includes(id)) continue
    const s = src[PRESET_SOURCE[id]]
    if (!s || !s.text) { missing.push(id); continue }
    made[id] = verbatim(s.text, { key: PRESET_SOURCE[id] })
  }
  if (summary === 'session') for (const id of Object.keys(made)) made[id] = stripSummaryRoute(made[id])
  const notes = []
  for (const id of PRESET_IDS) if (made[id] && /# @include \$DIR\//.test(made[id])) notes.push(PRESET_LABEL[id] + ' 的压缩组没展开（缺 presets/_shared/），装上去会没有压缩机制')
  if (missing.length) notes.push('上游这次没给的 preset：' + missing.join('、') + '（跳过，不影响其它 preset）')
  const srcLine = ids.filter((id) => made[id]).map((id) => PRESET_LABEL[id] + ' ← ' + (PRESET_SOURCE[id] in SOURCE_DESC ? SOURCE_DESC[PRESET_SOURCE[id]] : '上游 presets/' + PRESET_SOURCE[id] + '.yml') + '，' + src[PRESET_SOURCE[id]].version).join('；')
  const aliasList = Object.entries(aliases).filter(([o, n]) => made[n] && !PRESET_IDS.includes(o) && !RETIRED_PRESETS[o])
  const aliasText = aliasList.map(([o, n]) => aliasBlock(made[n], o, n)).join('')
  const yml = [
    '# ' + pkgName + '：由 dsh-agent-soul 安装包的 install.mjs 生成，不要手改。',
    '# 砚青四套逐字搬上游 presets/，只加这一行注释头。',
    ...(summary === 'session' ? ['# 压缩摘要跟会话模型走：去掉了压缩组里的 summarizationProvider / summarizationModel（作者写死 deepseek-official，要 API key）。'] : []),
    ...(aliasList.length ? ['# 旧会话用的别名（内容和对应的新 preset 一样，只换 id 和名字）：' + aliasList.map(([o, n]) => o + ' → ' + n).join('、')] : []),
    '# 源：' + srcLine,
    '- insert:',
  ].join('\n') + '\n' + (PRESET_IDS.filter((id) => made[id]).map((id) => made[id]).join('') + aliasText).replace(/\n$/, '')
  const pkg = JSON.stringify({
    name: pkgName, version: '0.2.0', private: true, type: 'module',
    description: '上游砚青四套 preset；压缩三件套统一为 dsh-yanqing-*',
    files: ['README.md', 'cordis.patch.yml', 'package.json'],
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, null, 2)
  const list = ids.filter((id) => made[id]).map((id) => '「' + PRESET_LABEL[id] + '」')
  const readme = [
    '# ' + pkgName,
    '',
    '给 DSH 的 preset 列表加：' + list.join('、') + '。',
    '',
    '- 砚青、砚青创造、砚青 PTC、砚青蒸馏：逐字搬上游 presets/，压缩三件套是 dsh-yanqing-compaction / compact-region / pruner。',
    '- 压缩摘要：' + SUMMARY_MODES[summary] + '。',
    '',
    'id 是 ' + PRESET_IDS.filter((id) => made[id]).join('、') + '。' + (aliasList.length ? '另有给旧会话留的别名 ' + aliasList.map(([o, n]) => o + '（同 ' + n + '）').join('、') + '：以前用这些 id 建的会话还能打开，新会话别选它们。' : ''),
    '',
    '## 维护',
    '',
    '- cordis.patch.yml 由 install.mjs 生成，不要手改；上游更新后跑 install.mjs --update 重新生成。',
    '- 砚青四套跟着上游走：上游改了 presets/，这里下次安装/更新就跟着变。要改砚青的措辞，去上游仓库改，不要改这里。',
    '- 依赖 profile 里已装好 dsh-yanqing-compaction、dsh-yanqing-pruner、dsh-yanqing-compact-region（只需在 dependencies 里，不必在 bundles 里）。',
  ].join('\n')
  return { files: { 'package.json': pkg, 'cordis.patch.yml': yml, 'README.md': readme }, notes, made, aliases: Object.fromEntries(aliasList), summary }
}

// ── 卸载时保留旧会话入口，替换为官方零件；已退役的 preset 不再生成 ──
export const SHELL_MARK = 'dsh-agent-soul:shell'
const SHELL_DESC = 'dsh-agent-soul 已卸载。留着这个 preset 只是为了让以前用它建的会话还能打开；压缩和裁剪已经换回官方原版，和对应的官方 preset 一样。新会话请用官方 preset。'
export function buildShellBundle(installedYml, { pkgName = 'dsh-soul-preset' } = {}) {
  let body = String(installedYml || '').replace(/\r\n/g, '\n')
  const start = body.indexOf('- insert:')
  if (start < 0) throw new Error('已装的 Soul preset 里找不到 - insert:')
  body = body.slice(start)
  // 退役 preset 的会话由卸载流程改回官方 PTC，不留同名空壳。
  body = body.split(/\n(?=    - id: preset-)/).filter((b) => !RETIRED_PRESETS[b.match(/^ {8}id: ([\w-]+)$/m)?.[1]]).join('\n')
  // 新旧两种包名都认：4.0 起是 dsh-agent-*，2.11–3.0 装的是 dsh-yanqing-*
  body = body.replace(/name: '(?:dsh-agent|dsh-yanqing)-compaction'/g, "name: '@deepseek-ai/dsh-compaction-basic'")
             .replace(/name: '(?:dsh-agent|dsh-yanqing)-pruner'/g, "name: '@deepseek-ai/dsh-compaction-tool-result-pruner'")
  // 范围压缩是 Kit 自己带进来的，空壳里没有官方对应件，整条去掉
  body = body.replace(/^ *- id: command-compact-region\n *name: '[^']*'\n/gm, '')
  const ids = [...body.matchAll(/^ {8}id: ([\w-]+)$/gm)].map((m) => m[1])
  if (!ids.length) throw new Error('已装的 Soul preset 里一个 preset id 都没认出来')
  body = body.replace(/^( {8}name: )(.+)$/gm, (_, a, n) => a + JSON.stringify(n.replace(/^['"]|['"]$/g, '').replace(/（已卸载）$/, '') + '（已卸载）'))
             .replace(/^( {8}description: )[^\n]*(?:\n {10,}[^\n]*)*/gm, (_, a) => a + JSON.stringify(SHELL_DESC)) // 上游砚青的说明是跨行的引号串，续行一起换掉
  if (/name: ['"](dsh-agent-|dsh-yanqing-|dsh-huanqi|dsh-mcp-hub|dsh-soul-preset)/.test(body)) throw new Error('换回官方零件以后还引用着本架构的包，不能当空壳用')
  const yml = [
    '# ' + pkgName + '（空壳，' + SHELL_MARK + '）：dsh-agent-soul 已卸载，这里保留砚青 preset 的 id，让以前用它建的会话还能打开。',
    '# 压缩和裁剪已经换回官方原版（@deepseek-ai/dsh-compaction-basic、@deepseek-ai/dsh-compaction-tool-result-pruner），不依赖本架构的任何包。',
    '# 空壳不依赖本架构的任何包；装回来：node install.mjs --restore <备份包>。',
  ].join('\n') + '\n' + body.replace(/\s+$/, '')
  const pkg = JSON.stringify({
    name: pkgName, version: '0.0.0-shell', private: true, type: 'module',
    description: 'dsh-agent-soul 已卸载后留下的空壳 preset：id 不变，压缩和裁剪是官方原版，只为旧会话还能打开',
    dshSoulShell: true,
    files: ['README.md', 'cordis.patch.yml', 'package.json'],
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, null, 2)
  const readme = [
    '# ' + pkgName + '（空壳）',
    '',
    'dsh-agent-soul 已经卸载。以前用砚青 preset 建的会话，开头记着 preset 的 id（' + ids.join('、') + '），preset 没了这些会话就打不开，所以留下这个空壳：',
    '',
    '- id 和以前一样，名字后面标了「（已卸载）」；',
    '- 兜底压缩和工具结果裁剪换回官方原版，和对应的官方 preset 一样，不带门牌；',
    '- 不依赖 dsh-agent-soul 的任何包。砚青 preset 已改用官方零件。',
    '',
    '新会话请选官方 preset。想装回来：node install.mjs --restore <备份包>。',
  ].join('\n')
  return { files: { 'package.json': pkg, 'cordis.patch.yml': yml, 'README.md': readme }, ids }
}