// 卸载用的规划函数：纯文本进出、不碰磁盘，install.mjs --uninstall 和 tests/uninstall.test.mjs 共用。
//
// 卸载要收回安装碰过的四类东西：
//   ① profile 配置：package.json（bundles、dependencies、desktopNextDeselectedBundles）、cordis.patch.yml（本架构插件的配置块、默认 preset）；
//   ② 锁文件：pnpm-lock.yaml、node_modules/.pnpm/lock.yaml、node_modules/.modules.yaml、node_modules/.package-map.json
//      —— 不摘干净，下次插件市场装东西时 pnpm 按锁文件去找已经删掉的 file:node_modules/<包>，整个失败；
//   ③ DSH 家目录：mcp-hub 清单里的 echo、hub/ 指针、换气账本、书房和记忆中枢；
//   ④ 旧会话：会话文件第一行的 agentPreset 写的是 Soul preset 的 id，preset 没了会话就打不开。
//      三种处理（用户选）：留空壳 preset（id 不变、换回官方压缩）/ 改写成对应的官方 preset / 不管。

export const OLD_SESSION_MODES = {
  shell: '留空壳 preset：保留 dsh-soul-preset，id 不变，压缩和裁剪换回官方原版，旧会话照常打开',
  rewrite: '改写旧会话：把会话文件开头的 agentPreset 改成对应的官方 preset',
  keep: '不管，只提醒：preset 全删，用 Soul preset 建的旧会话可能打不开（要看时用 --restore 装回来）',
}

// Soul preset → 官方 preset。Flash 版的源（dsh-flash-presets）装着就回到它，没装就回到官方 PTC
const SOUL_TO_OFFICIAL = { 'ptc-soul': 'ptc', 'standard-soul': 'standard', 'minimal-soul': 'minimal', 'cordis-soul': 'cordis' }
const FLASH_IDS = ['ptc-soul-flash', 'flash-lean-ptc-v3-soul']
export const SOUL_PRESET_IDS = [...Object.keys(SOUL_TO_OFFICIAL), ...FLASH_IDS]
export function officialPresetFor(id, { flashInstalled = false } = {}) {
  if (SOUL_TO_OFFICIAL[id]) return SOUL_TO_OFFICIAL[id]
  if (FLASH_IDS.includes(id)) return flashInstalled ? 'flash-lean-ptc-v3' : 'ptc'
  return null
}

const keyName = (k) => String(k).trim().replace(/^'(.*)'$/, '$1').replace(/^"(.*)"$/, '$1')
// 锁文件里的键：包名本身，或者「包名@版本 / 包名@file:…」
const isOurs = (key, names) => { const k = keyName(key); return names.some((n) => k === n || k.startsWith(n + '@')) }

/** package.json：从 bundles、dependencies（含 dev / optional）、desktopNextDeselectedBundles 里去掉这些包。 */
export function planPackageJsonRemoval(text, names) {
  const j = JSON.parse(text)
  const removed = { bundles: [], dependencies: [], deselected: [] }
  const prof = j.dsh && j.dsh.profile
  if (prof && Array.isArray(prof.bundles)) { removed.bundles = prof.bundles.filter((b) => names.includes(b)); prof.bundles = prof.bundles.filter((b) => !names.includes(b)) }
  for (const k of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    if (!j[k]) continue
    for (const n of Object.keys(j[k])) if (names.includes(n)) { delete j[k][n]; removed.dependencies.push(n) }
  }
  if (j.dsh && Array.isArray(j.dsh.desktopNextDeselectedBundles)) {
    removed.deselected = j.dsh.desktopNextDeselectedBundles.filter((b) => names.includes(b))
    j.dsh.desktopNextDeselectedBundles = j.dsh.desktopNextDeselectedBundles.filter((b) => !names.includes(b))
  }
  const outText = JSON.stringify(j, null, 2) + (text.endsWith('\n') ? '\n' : '')
  return { text: outText, removed, changed: outText !== text }
}

/**
 * pnpm 的 YAML 锁文件（lockfileVersion 9）：摘掉这些包的条目，其余逐字不动。
 *   · importers → <路径> → dependencies / devDependencies / optionalDependencies 下的「包名:」整块；
 *   · packages: / snapshots:（以及别的顶层表，比如老版 .modules.yaml 的 hoistedLocations:）下顶格两空格的「包名@…:」整块，连同后面那一行空行。
 * 摘完以后还提到这些包的行（比如别的包依赖它们）列进 leftover，由调用方报出来，不硬删。
 */
export function removeLockEntries(text, names) {
  const nl = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  const out = [], removed = []
  let section = null, depBlock = false
  const indent = (l) => l.match(/^ */)[0].length
  // 键可以带引号；不带引号的键里也可能有冒号（dsh-x@file:node_modules/dsh-x:），以「冒号 + 空白或行尾」收尾
  const KEY = /^( *)('(?:[^']|'')*'|"[^"]*"|[^\s'"#].*?):(?:\s|$)/
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const top = l.match(/^([A-Za-z][\w-]*):/)
    if (top) { section = top[1]; depBlock = false; out.push(l); continue }
    const m = l.match(KEY)
    if (section === 'importers' && m) {
      const ind = m[1].length
      if (ind <= 4) depBlock = ind === 4 && /^(dependencies|devDependencies|optionalDependencies)$/.test(keyName(m[2]))
      else if (ind === 6 && depBlock && isOurs(m[2], names)) {
        removed.push(`importers: ${keyName(m[2])}`)
        while (i + 1 < lines.length && lines[i + 1].trim() && indent(lines[i + 1]) > 6) i++
        continue
      }
    }
    if (section && section !== 'importers' && m && m[1].length === 2 && isOurs(m[2], names)) {
      removed.push(`${section}: ${keyName(m[2])}`)
      while (i + 1 < lines.length && lines[i + 1].trim() && indent(lines[i + 1]) > 2) i++
      if (i + 1 < lines.length && !lines[i + 1].trim() && i + 2 < lines.length) i++ // 条目之间的空行一起拿掉
      continue
    }
    out.push(l)
  }
  const t = out.join(nl)
  const re = new RegExp(`(^|[\\s'"/])(${names.map(reEsc).join('|')})(@|:|$|['"\\s/])`)
  const leftover = t.split(/\r?\n/).filter((l) => re.test(l))
  return { text: t, removed, leftover, changed: t !== text }
}

/** node_modules/.modules.yaml（pnpm 写成 JSON）：各个表里以这些包为键的条目、skipped 里的这些包，去掉。 */
export function removeModulesEntries(text, names) {
  let j
  try { j = JSON.parse(text) } catch { return removeLockEntries(text, names) } // 老版 pnpm 写的是 YAML，按锁文件的办法摘
  const removed = []
  for (const [k, v] of Object.entries(j)) {
    if (Array.isArray(v)) { const keep = v.filter((x) => !(typeof x === 'string' && isOurs(x, names))); if (keep.length !== v.length) { removed.push(...v.filter((x) => !keep.includes(x)).map((x) => `${k}: ${x}`)); j[k] = keep } }
    else if (v && typeof v === 'object') for (const kk of Object.keys(v)) if (isOurs(kk, names)) { delete v[kk]; removed.push(`${k}: ${kk}`) }
  }
  const t = JSON.stringify(j, null, 2) + (text.endsWith('\n') ? '\n' : '')
  return { text: t, removed, leftover: [], changed: removed.length > 0 }
}

/** node_modules/.package-map.json：packages 里这些包自己的条目、别人（主要是 "."）对它们的依赖，去掉。 */
export function removePackageMapEntries(text, names) {
  const j = JSON.parse(text)
  const removed = []
  const pk = j && j.packages && typeof j.packages === 'object' ? j.packages : {}
  for (const n of Object.keys(pk)) if (names.includes(n)) { delete pk[n]; removed.push(`packages: ${n}`) }
  for (const [k, v] of Object.entries(pk)) if (v && v.dependencies) for (const d of Object.keys(v.dependencies)) if (names.includes(d)) { delete v.dependencies[d]; removed.push(`${k} → ${d}`) }
  const compact = !/\n\s/.test(text.trim())
  const t = (compact ? JSON.stringify(j) : JSON.stringify(j, null, 2)) + (text.endsWith('\n') ? '\n' : '')
  return { text: t, removed, leftover: [], changed: removed.length > 0 }
}

/**
 * profile 的 cordis.patch.yml：去掉 ids 里这些插件的配置块（顶格「- id: X」到下一个顶格行，单行写法也认），
 * 旧版安装包写在根层的 compaction-basic / tool-result-pruner 禁用也去掉；默认 preset 是 Soul preset 的，换回官方的。
 * 其余行逐字不动。
 */
export function planCordisRemoval(text, { ids, flashInstalled = false, keepDefault = [] }) {
  const nl = text.includes('\r\n') ? '\r\n' : '\n'
  const lines = text.split(/\r?\n/)
  const out = [], removed = []
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const m = l.match(/^- (?:\{\s*)?id: ['"]?([^'",}\s]+)['"]?/)
    const legacy = m && ['compaction-basic', 'tool-result-pruner'].includes(m[1]) && (/disabled: true/.test(l) || /^ {2}disabled: true\s*$/.test(lines[i + 1] || ''))
    if (m && (ids.includes(m[1]) || legacy)) {
      removed.push(m[1])
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) i++
      // 去掉块以后别留下两行连着的空行
      while (i + 1 < lines.length && !lines[i + 1].trim() && (!out.length || !out[out.length - 1].trim())) i++
      continue
    }
    out.push(l)
  }
  let y = out.join(nl)
  let defaultFrom = null, defaultTo = null
  const reg = y.match(/^- id: ['"]?agent-preset-registry['"]?\r?\n(?: {2}.*(?:\r?\n|$))*/m)
  if (reg) {
    const sm = reg[0].match(/^( {4}selectedDefault: )['"]?([\w-]+)['"]?[ \t]*$/m)
    if (sm && SOUL_PRESET_IDS.includes(sm[2]) && !keepDefault.includes(sm[2])) {
      defaultFrom = sm[2]; defaultTo = officialPresetFor(sm[2], { flashInstalled })
      y = y.replace(reg[0], reg[0].replace(/^( {4}selectedDefault: ).*$/m, `$1${defaultTo}`))
    }
  }
  return { text: y, removed, defaultFrom, defaultTo, changed: y !== text }
}

/** mcp-hub 清单：去掉指向记忆中枢 echo-mcp.mjs 的那台 echo，别的服务器原样留着。 */
export function planServersRemoval(doc) {
  const arr = Array.isArray(doc) ? doc : (doc && Array.isArray(doc.servers) ? doc.servers : [])
  const isEcho = (x) => x && x.serverName === 'echo' && [].concat(x.args || []).some((a) => /echo-mcp\.mjs$/.test(String(a)))
  const removed = arr.filter(isEcho)
  const others = arr.filter((x) => !isEcho(x))
  const next = Array.isArray(doc) ? others : { ...doc, servers: others }
  return { doc: next, removed: removed.length, others: others.map((x) => (x && x.serverName) || '（没名字）') }
}

/** 会话文件（解压后的文本）：第一行是会话头，agentPreset 在 map 里就换掉。只动这一个值，其余逐字不动。 */
export function rewriteSessionHeader(text, map) {
  const i = text.indexOf('\n')
  const head = i < 0 ? text : text.slice(0, i)
  let j
  try { j = JSON.parse(head) } catch { return null }
  if (!j || j.type !== 'session' || typeof j.agentPreset !== 'string' || !map[j.agentPreset]) return null
  const re = new RegExp(`("agentPreset"\\s*:\\s*)"${reEsc(j.agentPreset)}"`)
  if (!re.test(head)) return null
  const nh = head.replace(re, `$1${JSON.stringify(map[j.agentPreset])}`)
  return { text: nh + (i < 0 ? '' : text.slice(i)), from: j.agentPreset, to: map[j.agentPreset] }
}
export function sessionPreset(text) {
  const i = text.indexOf('\n')
  try { const j = JSON.parse(i < 0 ? text : text.slice(0, i)); return j && j.type === 'session' ? (j.agentPreset || null) : null } catch { return null }
}

/** macOS 心跳的 plist 是不是本架构的：标签对得上，或者调的是书房 / 中枢里的心跳脚本。 */
export function isSoulHeartbeatPlist(text, { label = 'com.dsh-soul.heartbeat', soulRoot = '' } = {}) {
  const t = String(text || '')
  if (t.includes(`<string>${label}</string>`)) return true
  const root = String(soulRoot || '').replace(/\\/g, '/')
  return Boolean(root) && t.includes(root) && /heartbeat\.(mjs|sh)/.test(t)
}

function reEsc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }