// Preset 层：上游 cyanwell/dsh-agent-soul 已经改成发布砚青四套 preset（presets/preset-yanqing*.yml）。
// 这里跟上游：留一个自用的 PTC·Soul·Flash（从 Flash 源派生），其余四个逐字搬上游的砚青预设。
// install.mjs 和本机重新生成脚本共用这一份，别在别处再写一套。
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ASSETS = path.join(HERE, '..', 'assets')

export const YANQING_IDS = ['yanqing', 'yanqing-cordis', 'yanqing-ptc', 'yanqing-distill']
export const PRESET_IDS = ['ptc-soul-flash', ...YANQING_IDS]
// 早期版本用过的 id
export const OLD_PRESET_IDS = {
  'flash-lean-ptc-v3-soul': 'ptc-soul-flash',
  // 2.10 及以前的四套自建 preset，2.11 起换成上游砚青四套：同模式一一对应
  'ptc-soul': 'yanqing-ptc',
  'standard-soul': 'yanqing',
  'minimal-soul': 'yanqing-distill',
  'cordis-soul': 'yanqing-cordis',
}
// 旧 id 当时在 preset 列表里叫什么（给旧会话留的别名用这个名字，认得出来）
export const OLD_PRESET_LABEL = {
  'flash-lean-ptc-v3-soul': 'Flash 精简·PTC v3 · Soul',
  'ptc-soul': 'PTC · Soul 模式',
  'standard-soul': '标准 · Soul 模式',
  'minimal-soul': '极简 · Soul 模式',
  'cordis-soul': 'Cordis · Soul 模式',
}
export const PRESET_LABEL = {
  'ptc-soul-flash': 'PTC · Soul · Flash 模式',
  yanqing: '砚青',
  'yanqing-cordis': '砚青创造',
  'yanqing-ptc': '砚青 PTC',
  'yanqing-distill': '砚青蒸馏',
}
export const PRESET_INFO = {
  'ptc-soul-flash': '更省 token：精简行事规则，上下文到 25% 就压，只留最近约 2 万 token 原文',
  yanqing: '上游砚青：标准模式的副本，兜底压缩换成带门牌的版本',
  'yanqing-cordis': '上游砚青创造：Cordis 模式的砚青版',
  'yanqing-ptc': '上游砚青 PTC：PTC 模式的砚青版',
  'yanqing-distill': '上游砚青蒸馏：更省 token 的砚青版',
}
// 每个 preset 的来源键：flash 从 Flash 源派生，砚青四套逐字搬上游 presets/
export const PRESET_SOURCE = {
  'ptc-soul-flash': 'flash',
  yanqing: 'preset-yanqing',
  'yanqing-cordis': 'preset-yanqing-cordis',
  'yanqing-ptc': 'preset-yanqing-ptc',
  'yanqing-distill': 'preset-yanqing-distill',
}
const BUILTIN_KEYS = ['ptc', 'standard', 'minimal', 'cordis']
export const SOURCE_DESC = {
  ptc: '官方 PTC', standard: '官方「标准」预设', minimal: '官方「极简」预设',
  cordis: '官方「Cordis」预设', flash: 'Flash 精简·PTC v3',
}
// 砚青四套不再起新名，正文就是上游原文；这里只给 flash 写说明
const DESCRIPTION = {
  'ptc-soul-flash': '与 PTC · Soul 模式一样带门牌压缩和裁剪，区别是更省 token：多一套精简行事规则（控回合数、少空想、批量调用、只读新内容）；上下文用到 25% 就压缩，只留最近约 2 万 token 原文（PTC · Soul 模式到 80% 才压）；不带定时任务工具和每轮的时间提示，子 agent 默认可续接。',
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
// 源预设：官方四个从 app.asar 里读，读不到就用安装包快照；Flash 版本从已装的 dsh-flash-presets 读；
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
  const fp = path.join(nm, 'dsh-flash-presets', 'presets', 'flash-lean-ptc-v3.patch.yml')
  let fpj = null
  try { fpj = JSON.parse(fs.readFileSync(path.join(nm, 'dsh-flash-presets', 'package.json'), 'utf8')) } catch { /* 没装 */ }
  out.flash = isFile(fp)
    ? { text: fs.readFileSync(fp, 'utf8'), from: '已装的 dsh-flash-presets', version: 'dsh-flash-presets ' + (fpj && fpj.version), dsh: null }
    : { text: fs.readFileSync(path.join(ASSETS, 'presets', 'flash-lean-ptc-v3.patch.yml'), 'utf8'), from: '安装包快照 assets/presets/flash-lean-ptc-v3.patch.yml', version: 'dsh-flash-presets 0.2.5（快照）', dsh: null, snapshot: true }
  // 砚青四套：上游 presets/*.yml。缺了就留空，buildPresetBundle 会跳过并提示
  for (const key of YANQING_IDS) {
    const up = upstreamDir && path.join(upstreamDir, 'presets', 'preset-' + key + '.yml')
    const snap = path.join(ASSETS, 'presets', 'preset-' + key + '.yml')
    const f = up && isFile(up) ? up : (isFile(snap) ? snap : null)
    if (!f) { out['preset-' + key] = null; continue }
    const fromUp = f === up
    let ver = fromUp ? '上游' : '安装包快照'
    try {
      const m = readManifest(fromUp ? upstreamDir : path.join(ASSETS, 'presets'))
      const hit = m && m.find((p) => p.configId === key)
      if (hit && hit.lines) ver += ' ' + hit.lines + ' 行'
    } catch { /* 没有清单 */ }
    const raw = fs.readFileSync(f, 'utf8')
    out['preset-' + key] = { text: expandIncludes(raw, fromUp ? path.join(upstreamDir, 'presets') : path.join(ASSETS, 'presets')), from: fromUp ? '上游 presets/preset-' + key + '.yml' : '安装包快照 assets/presets/preset-' + key + '.yml', version: ver, dsh: null }
  }
  return out
}
// 上游用 `# @include $DIR/_shared/compaction.yml` 共享压缩组。展开算法逐行照搬作者 tools/soul-preset.mjs 的 build：
//   跳过共享文件开头连续的 # 说明行；段内部的 # 注释和空行原样保留；非空行按标记行的缩进补回去。
//   作者用这套算法证明「展开后逐字节还原」，soul-version.json 里每套的 SHA256 就是这样算出来的。
//   （2.11–2.15 这里把压缩段里的注释和空行全删了：YAML 等价，但四套的哈希和作者一个都对不上。）
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
// 作者的 soul-version.json：每套砚青 preset 展开后的 SHA256，加一行契约版本 contracts。
// 作者原话：「零件版本怎么变，只要契约版本没变，就不需要迁移器」—— contracts 变了就是要迁移的大更新。
// 上游根目录有就用上游的；离线时用安装包快照 assets/presets/soul-version.json。
export function readSoulVersion(upstreamDir) {
  for (const f of [upstreamDir && path.join(upstreamDir, 'soul-version.json'), path.join(ASSETS, 'presets', 'soul-version.json')]) {
    if (!f || !isFile(f)) continue
    try { return { ...JSON.parse(fs.readFileSync(f, 'utf8')), file: f, snapshot: !upstreamDir || !f.startsWith(upstreamDir) } } catch { /* 坏了就当没有 */ }
  }
  return null
}
/** 按作者 build 的算法展开一套 preset 并算 SHA256（展开后去掉末尾一个换行）。 */
export function presetDigest(presetsDir, blockId) {
  const f = path.join(presetsDir, blockId + '.yml')
  if (!isFile(f)) return null
  const t = expandIncludes(fs.readFileSync(f, 'utf8'), presetsDir).replace(/\n$/, '')
  return crypto.createHash('sha256').update(t).digest('hex')
}
/**
 * 拿作者 soul-version.json 里的哈希核对 presets/ 下的源文件（称呼替换之前的原文）。
 * @returns {{ match: string[], mismatch: {blockId, want, got}[], missing: string[] }}
 */
export function checkPresetDigests(presetsDir, soulVersion) {
  const r = { match: [], mismatch: [], missing: [] }
  for (const p of (soulVersion && soulVersion.presets) || []) {
    const got = presetDigest(presetsDir, p.blockId)
    if (!got) r.missing.push(p.blockId)
    else if (got === p.sha256) r.match.push(p.blockId)
    else r.mismatch.push({ blockId: p.blockId, want: p.sha256, got })
  }
  return r
}
function readManifest(dir) {
  if (!dir) return null
  for (const f of [path.join(dir, 'presets', '_manifest.json'), path.join(dir, 'presets', 'upstream-manifest.json'), path.join(dir, '_manifest.json'), path.join(dir, 'upstream-manifest.json')]) {
    try { return JSON.parse(fs.readFileSync(f, 'utf8')).presets } catch { /* 下一个 */ }
  }
  return null
}
// 砚青：逐字搬。上游文件从 '    - id: preset-yanqing' 起（没有 - insert:），补一行头
export function verbatim(srcText, { key }) {
  const t = String(srcText).replace(/\r\n/g, '\n').replace(/\s+$/, '')
  if (!/^ {4}- id: preset-[\w-]+$/m.test(t)) throw new Error('砚青源 preset ' + key + ' 结构变了：第一行不是「    - id: preset-…」')
  return t + '\n'
}
// 从源 preset 派生：只换 id / 名字 / 说明，和压缩、裁剪两个零件的 name，其余逐字保留
export function derive(srcText, { id, label, description }) {
  const lines = srcText.replace(/\r\n/g, '\n').split('\n')
  const start = lines.findIndex((l) => /^- insert:\s*$/.test(l))
  if (start < 0) throw new Error('源文件里找不到 - insert:')
  let body = lines.slice(start + 1).join('\n').replace(/\s+$/, '') + '\n'
  const group = (re) => new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
  const once = (re, fn, what) => {
    const m = body.match(group(re))
    if (!m || m.length !== 1) throw new Error(what + '：应匹配 1 处，实际 ' + (m ? m.length : 0) + ' 处')
    body = body.replace(re, fn)
  }
  // 源 preset 没有这个零件时跳过（极简预设就没有工具结果裁剪）
  const maybe = (re, fn, what) => {
    const m = body.match(group(re))
    if (!m) return false
    if (m.length !== 1) throw new Error(what + '：应匹配 1 处，实际 ' + m.length + ' 处')
    body = body.replace(re, fn); return true
  }
  once(/^(    - id: )(preset-[\w-]+)$/m, (_, a) => a + 'preset-' + id, '声明行 id')
  once(/^(        id: )([\w-]+)$/m, (_, a) => a + id, 'preset id')
  const head = () => body.split('        plugins:')[0]
  if (/^        name: .*$/m.test(head())) once(/^(        name: ).*$/m, (_, a) => a + JSON.stringify(label), 'preset 名称')
  else body = body.replace(/^(        id: [\w-]+)$/m, '$1\n        name: ' + JSON.stringify(label))
  if (/^        description: .*$/m.test(head())) once(/^(        description: ).*$/m, (_, a) => a + JSON.stringify(description), 'preset 说明')
  else body = body.replace(/^(        name: .*)$/m, '$1\n        description: ' + JSON.stringify(description))
  // 名字以上游为准：压缩 / 裁剪 / 范围压缩三件套统一成 dsh-yanqing-*
  maybe(/name: '@deepseek-ai\/dsh-compaction-basic'/, () => "name: 'dsh-yanqing-compaction'", '压缩零件')
  maybe(/name: '@deepseek-ai\/dsh-compaction-tool-result-pruner'/, () => "name: 'dsh-yanqing-pruner'", '裁剪零件')
  maybe(/name: '@deepseek-ai\/dsh-command-compact-region'/, () => "name: 'dsh-yanqing-compact-region'", '范围压缩零件')
  return body
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
export function buildPresetBundle(src, ids = PRESET_IDS, { pkgName = 'dsh-soul-preset', aliases = {} } = {}) {
  const made = {}, missing = []
  for (const id of PRESET_IDS) {
    if (!ids.includes(id)) continue
    const s = src[PRESET_SOURCE[id]]
    if (!s || !s.text) { missing.push(id); continue }
    made[id] = id === 'ptc-soul-flash'
      ? derive(s.text, { id, label: PRESET_LABEL[id], description: DESCRIPTION[id] })
      : verbatim(s.text, { key: PRESET_SOURCE[id] })
  }
  const block = (t, id) => { const m = t.match(new RegExp('- id: ' + id + '\\n[\\s\\S]*?(?=\\n\\s*- id: |$)')); return m ? m[0] : '' }
  const notes = []
  for (const id of PRESET_IDS) if (made[id] && /# @include \$DIR\//.test(made[id])) notes.push(PRESET_LABEL[id] + ' 的压缩组没展开（缺 presets/_shared/），装上去会没有压缩机制')
  if (missing.length) notes.push('上游这次没给的 preset：' + missing.join('、') + '（跳过，不影响其它 preset）')
  if (made['ptc-soul-flash'] && (!/thresholdRatio: 0\.25/.test(made['ptc-soul-flash']) || !/retainTokens: 20000/.test(made['ptc-soul-flash']))) notes.push('Flash 源的压缩参数变了，「25% 就压缩、只留约 2 万 token」可能不准')
  if (made['ptc-soul-flash'] && (/- id: time-context\b/.test(made['ptc-soul-flash']) || /- id: tool-schedule\b/.test(made['ptc-soul-flash']))) notes.push('Flash 源现在带了时间提示或定时任务工具，简介里「不带」那句可能不准')
  const srcLine = ids.filter((id) => made[id]).map((id) => PRESET_LABEL[id] + ' ← ' + (PRESET_SOURCE[id] in SOURCE_DESC ? SOURCE_DESC[PRESET_SOURCE[id]] : '上游 presets/' + PRESET_SOURCE[id] + '.yml') + '，' + src[PRESET_SOURCE[id]].version).join('；')
  const aliasList = Object.entries(aliases).filter(([o, n]) => made[n] && !PRESET_IDS.includes(o))
  const aliasText = aliasList.map(([o, n]) => aliasBlock(made[n], o, n)).join('')
  const yml = [
    '# ' + pkgName + '：由 dsh-agent-soul 安装包的 install.mjs 生成，不要手改。',
    '# PTC · Soul · Flash 从 Flash 源派生，只换压缩 / 裁剪两个零件的 name 为 dsh-yanqing-*；',
    '# 砚青四套逐字搬上游 presets/，只加这一行注释头。',
    ...(aliasList.length ? ['# 旧会话用的别名（内容和对应的新 preset 一样，只换 id 和名字）：' + aliasList.map(([o, n]) => o + ' → ' + n).join('、')] : []),
    '# 源：' + srcLine,
    '- insert:',
  ].join('\n') + '\n' + (PRESET_IDS.filter((id) => made[id]).map((id) => made[id]).join('') + aliasText).replace(/\n$/, '')
  const pkg = JSON.stringify({
    name: pkgName, version: '0.2.0', private: true, type: 'module',
    description: 'PTC·Soul·Flash + 上游砚青四套 preset；压缩三件套统一为 dsh-yanqing-*',
    files: ['README.md', 'cordis.patch.yml', 'package.json'],
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, null, 2)
  const list = ids.filter((id) => made[id]).map((id) => '「' + PRESET_LABEL[id] + '」')
  const readme = [
    '# ' + pkgName,
    '',
    '给 DSH 的 preset 列表加：' + list.join('、') + '。',
    '',
    '- PTC · Soul · Flash：从 Flash 精简·PTC v3 派生，只把压缩 / 裁剪换成带门牌的 dsh-yanqing-compaction / dsh-yanqing-pruner；',
    '- 砚青、砚青创造、砚青 PTC、砚青蒸馏：逐字搬上游 presets/，压缩三件套是 dsh-yanqing-compaction / compact-region / pruner。',
    '',
    'id 是 ' + PRESET_IDS.filter((id) => made[id]).join('、') + '。' + (aliasList.length ? '另有给旧会话留的别名 ' + aliasList.map(([o, n]) => o + '（同 ' + n + '）').join('、') + '：以前用这些 id 建的会话还能打开，新会话别选它们。' : ''),
    '',
    '## 维护',
    '',
    '- cordis.patch.yml 由 install.mjs 生成，不要手改；上游更新后跑 install.mjs --update 重新生成。',
    '- 砚青四套跟着上游走：上游改了 presets/，这里下次安装/更新就跟着变。要改砚青的措辞，去上游仓库改，不要改这里。',
    '- 依赖 profile 里已装好 dsh-yanqing-compaction、dsh-yanqing-pruner、dsh-yanqing-compact-region（只需在 dependencies 里，不必在 bundles 里）。',
  ].join('\n')
  return { files: { 'package.json': pkg, 'cordis.patch.yml': yml, 'README.md': readme }, notes, made, aliases: Object.fromEntries(aliasList) }
}

// ── 卸载时留下的「空壳」：只给 flash 做，砚青四套直接删（它们本来就依赖上游的包）────────────
export const SHELL_MARK = 'dsh-agent-soul:shell'
const SHELL_DESC = 'dsh-agent-soul 已卸载。留着这个 preset 只是为了让以前用它建的会话还能打开；压缩和裁剪已经换回官方原版，和对应的官方 preset 一样。新会话请用官方 preset。'
export function buildShellBundle(installedYml, { pkgName = 'dsh-soul-preset' } = {}) {
  let body = String(installedYml || '').replace(/\r\n/g, '\n')
  const start = body.indexOf('- insert:')
  if (start < 0) throw new Error('已装的 Soul preset 里找不到 - insert:')
  body = body.slice(start)
  // 只留 flash：砚青块整块去掉（它们依赖上游的 dsh-yanqing-* 包，卸载后留着只会让会话起不来）
  body = body.split(/\n(?=    - id: preset-)/).filter((b) => !/^ {8}id: (yanqing|yanqing-)/m.test(b)).join('\n')
  body = body.replace(/name: 'dsh-yanqing-compaction'/g, "name: '@deepseek-ai/dsh-compaction-basic'")
             .replace(/name: 'dsh-yanqing-pruner'/g, "name: '@deepseek-ai/dsh-compaction-tool-result-pruner'")
  // 范围压缩是 Kit 自己带进来的，空壳里没有官方对应件，整条去掉
  body = body.replace(/^ *- id: command-compact-region\n *name: '[^']*'\n/gm, '')
  const ids = [...body.matchAll(/^ {8}id: ([\w-]+)$/gm)].map((m) => m[1])
  if (!ids.length) throw new Error('已装的 Soul preset 里一个 preset id 都没认出来')
  body = body.replace(/^( {8}name: )"(.*)"$/gm, (_, a, n) => a + JSON.stringify(n.replace(/（已卸载）$/, '') + '（已卸载）'))
             .replace(/^( {8}description: )[^\n]*(?:\n {10,}[^\n]*)*/gm, (_, a) => a + JSON.stringify(SHELL_DESC)) // 上游砚青的说明是跨行的引号串，续行一起换掉
  if (/name: ['"](dsh-agent-|dsh-yanqing-|dsh-huanqi|dsh-mcp-hub|dsh-soul-preset)/.test(body)) throw new Error('换回官方零件以后还引用着本架构的包，不能当空壳用')
  const yml = [
    '# ' + pkgName + '（空壳，' + SHELL_MARK + '）：dsh-agent-soul 已卸载，这里只留 PTC·Soul·Flash 的 id，让以前用它建的会话还能打开。',
    '# 压缩和裁剪已经换回官方原版（@deepseek-ai/dsh-compaction-basic、@deepseek-ai/dsh-compaction-tool-result-pruner），不依赖本架构的任何包。',
    '# 砚青四套依赖上游的 dsh-yanqing-* 包，卸载时一并删掉；装回来：node install.mjs --restore <备份包>。',
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
    'dsh-agent-soul 已经卸载。以前用 PTC·Soul·Flash 建的会话，开头记着 preset 的 id（' + ids.join('、') + '），preset 没了这些会话就打不开，所以留下这个空壳：',
    '',
    '- id 和以前一样，名字后面标了「（已卸载）」；',
    '- 兜底压缩和工具结果裁剪换回官方原版，和对应的官方 preset 一样，不带门牌；',
    '- 不依赖 dsh-agent-soul 的任何包。砚青四套依赖上游的 dsh-yanqing-* 包，卸载时已删除。',
    '',
    '新会话请选官方 preset。想装回来：node install.mjs --restore <备份包>。',
  ].join('\n')
  return { files: { 'package.json': pkg, 'cordis.patch.yml': yml, 'README.md': readme }, ids }
}