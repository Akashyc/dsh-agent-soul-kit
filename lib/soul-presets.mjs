// Soul preset：从 DSH 自带的官方 preset 派生一份，只换 id、名字、说明，以及压缩 / 裁剪两个零件的实现。
// install.mjs 和本机重新生成脚本共用这一份，别在别处再写一套。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ASSETS = path.join(HERE, '..', 'assets')

export const PRESET_IDS = ['ptc-soul', 'ptc-soul-flash', 'standard-soul', 'minimal-soul', 'cordis-soul']
// 早期版本用过的 id
export const OLD_PRESET_IDS = { 'flash-lean-ptc-v3-soul': 'ptc-soul-flash' }
export const PRESET_LABEL = {
  'ptc-soul': 'PTC · Soul 模式',
  'ptc-soul-flash': 'PTC · Soul · Flash 模式',
  'standard-soul': '标准 · Soul 模式',
  'minimal-soul': '极简 · Soul 模式',
  'cordis-soul': 'Cordis · Soul 模式',
}
export const PRESET_INFO = {
  'ptc-soul': '官方 PTC + 带门牌的压缩和裁剪，上下文到 80% 才压',
  'ptc-soul-flash': '更省 token：精简行事规则，上下文到 25% 就压，只留最近约 2 万 token 原文',
  'standard-soul': '官方「标准」预设 + 带门牌的压缩和裁剪，其余一字不改',
  'minimal-soul': '官方「极简」预设 + 带门牌的压缩；原预设没有工具结果裁剪',
  'cordis-soul': '官方「Cordis」预设 + 带门牌的压缩和裁剪，其余一字不改',
}
// 每个 Soul preset 用哪个源预设
export const PRESET_SOURCE = {
  'ptc-soul': 'ptc', 'ptc-soul-flash': 'flash',
  'standard-soul': 'standard', 'minimal-soul': 'minimal', 'cordis-soul': 'cordis',
}
const BUILTIN_KEYS = ['ptc', 'standard', 'minimal', 'cordis']
export const SOURCE_DESC = {
  ptc: '官方 PTC', standard: '官方「标准」预设', minimal: '官方「极简」预设',
  cordis: '官方「Cordis」预设', flash: 'Flash 精简·PTC v3',
}
const DESCRIPTION = {
  'ptc-soul': '官方 PTC 预设，只把兜底压缩和工具结果裁剪换成 dsh-agent-soul 的版本（摘要和被裁内容带可回取原文的门牌），其余与官方 PTC 完全一致。',
  'ptc-soul-flash': '与 PTC · Soul 模式一样带门牌压缩和裁剪，区别是更省 token：多一套精简行事规则（控回合数、少空想、批量调用、只读新内容）；上下文用到 25% 就压缩，只留最近约 2 万 token 原文（PTC · Soul 模式到 80% 才压）；不带定时任务工具和每轮的时间提示，子 agent 默认可续接。',
  'standard-soul': '官方「标准」预设，只把兜底压缩和工具结果裁剪换成 dsh-agent-soul 的版本（摘要和被裁内容带可回取原文的门牌），其余与官方完全一致。',
  'minimal-soul': '官方「极简」预设，只把兜底压缩换成 dsh-agent-soul 的版本（摘要带可回取原文的门牌）；这个预设本来就没有工具结果裁剪，其余与官方完全一致。',
  'cordis-soul': '官方「Cordis」预设，只把兜底压缩和工具结果裁剪换成 dsh-agent-soul 的版本（摘要和被裁内容带可回取原文的门牌），其余与官方完全一致。',
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
// 源预设：官方四个从 app.asar 里读，读不到就用安装包快照；Flash 版本从已装的 dsh-flash-presets 读
export function presetSources(nm, { appAsar } = {}) {
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
  return out
}
// 从源 preset 派生 Soul 版：只换 id / 名字 / 说明，和压缩、裁剪两个零件的 name，其余逐字保留
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
  maybe(/name: '@deepseek-ai\/dsh-compaction-basic'/, () => "name: 'dsh-agent-compaction'", '压缩零件')
  maybe(/name: '@deepseek-ai\/dsh-compaction-tool-result-pruner'/, () => "name: 'dsh-agent-pruner'", '裁剪零件')
  return body
}
export function buildPresetBundle(src, ids = PRESET_IDS, { pkgName = 'dsh-soul-preset' } = {}) {
  const made = {}
  for (const id of PRESET_IDS) if (ids.includes(id)) made[id] = derive(src[PRESET_SOURCE[id]].text, { id, label: PRESET_LABEL[id], description: DESCRIPTION[id] })
  const block = (t, id) => { const m = t.match(new RegExp('- id: ' + id + '\\n[\\s\\S]*?(?=\\n\\s*- id: |$)')); return m ? m[0] : '' }
  // 简介里写的差异按当前源核过；源变了就提醒
  const notes = []
  if (made['ptc-soul'] && /thresholdRatio/.test(block(made['ptc-soul'], 'compaction-basic'))) notes.push('官方 PTC 现在自带压缩阈值，「PTC · Soul 模式到 80% 才压」可能不准')
  if (made['ptc-soul-flash'] && (!/thresholdRatio: 0\.25/.test(made['ptc-soul-flash']) || !/retainTokens: 20000/.test(made['ptc-soul-flash']))) notes.push('Flash 源的压缩参数变了，「25% 就压缩、只留约 2 万 token」可能不准')
  if (made['ptc-soul-flash'] && (/- id: time-context\b/.test(made['ptc-soul-flash']) || /- id: tool-schedule\b/.test(made['ptc-soul-flash']))) notes.push('Flash 源现在带了时间提示或定时任务工具，简介里「不带」那句可能不准')
  if (made['minimal-soul'] && /dsh-agent-pruner/.test(made['minimal-soul'])) notes.push('极简源现在带了工具结果裁剪，简介里「本来就没有」那句可能不准')
  const srcLine = ids.filter((id) => made[id]).map((id) => PRESET_LABEL[id] + ' ← ' + SOURCE_DESC[PRESET_SOURCE[id]] + '，' + src[PRESET_SOURCE[id]].version).join('；')
  const yml = [
    '# ' + pkgName + '：从现成 preset 派生的 Soul 版，由 dsh-agent-soul 安装包的 install.mjs 生成，不要手改。',
    '# 与源 preset 的差别只有压缩和裁剪两个零件的实现：compaction-basic → dsh-agent-compaction，',
    '# tool-result-pruner → dsh-agent-pruner（源 preset 没有裁剪件的就不换）。',
    '# 源：' + srcLine,
    '- insert:',
  ].join('\n') + '\n' + PRESET_IDS.filter((id) => made[id]).map((id) => made[id]).join('').replace(/\n$/, '')
  const pkg = JSON.stringify({
    name: pkgName, version: '0.1.0', private: true, type: 'module',
    description: '从现成 preset 派生的 Soul 版：只把兜底压缩和工具结果裁剪换成 dsh-agent-compaction / dsh-agent-pruner，其余与源 preset 一致',
    files: ['README.md', 'cordis.patch.yml', 'package.json'],
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, null, 2)
  const list = ids.filter((id) => made[id]).map((id) => '「' + PRESET_LABEL[id] + '」（源：' + SOURCE_DESC[PRESET_SOURCE[id]] + '）')
  const readme = [
    '# ' + pkgName,
    '',
    '给 DSH 的 preset 列表加 Soul 版：' + list.join('、') + '。每个 Soul 版从源 preset 逐字派生，只改压缩 / 裁剪两个零件的实现：',
    '',
    '- compaction-basic 的实现换成 dsh-agent-compaction（兜底压缩的摘要第一块带门牌 log:<会话>#seq=<n>）',
    '- tool-result-pruner 的实现换成 dsh-agent-pruner（被裁掉的工具输出标出原文所在的 seq）；源 preset 没有裁剪件的（极简）就不换',
    '',
    'id 是 ' + PRESET_IDS.filter((id) => made[id]).join('、') + '，isolate、压缩阈值、行事规则等参数全部照抄源 preset。',
    '',
    '## 为什么要单独做 preset',
    '',
    'DSH NEXT 里每个 preset 自带一个隔离的 compaction 组，会话用的是 preset 里那份压缩，不是 profile 根层那份。',
    '所以「把 dsh-agent-compaction 排到 bundles 最前 + 根层禁用 compaction-basic」只改了根层，会话里跑的仍是内置压缩；',
    'preset 嵌在 declaration 的 config 里，profile 的 cordis.patch.yml 也没法按 id 改到它。只能派生一个新 preset。',
    'dsh-agent-compaction / dsh-agent-pruner 因此只在 dependencies 里、不在 bundles 里，插件市场会把它们显示成「已停用」，这是正常的，不要打开也不要卸载。',
    '',
    '## 维护',
    '',
    '- cordis.patch.yml 由安装包的 install.mjs 从源 preset 生成，不要手改；DSH 或源 preset 更新后跑 install.mjs --update 重新生成。',
    '- 源：官方 PTC / 标准 / 极简 / Cordis 来自 DSH 自带的 dsh-web-app/presets/*.patch.yml（在 app.asar 里），读不到就用安装包 assets/presets/ 里的快照；Flash 精简·PTC v3 来自已装的 dsh-flash-presets，没装就用安装包里的快照。',
    '- 依赖 profile 里已装好 dsh-agent-compaction、dsh-agent-pruner（只需在 dependencies 里，不必在 bundles 里）。',
  ].join('\n')
  return { files: { 'package.json': pkg, 'cordis.patch.yml': yml, 'README.md': readme }, notes }
}
