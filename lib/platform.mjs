// 系统差异集中在这里：找 node、找 DSH 家目录、读系统代理、在 Mac 上帮用户退出 DSH。
// 不写死任何一台电脑的路径：用户目录、Program Files 这类都从环境变量和 os.homedir() 现取。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

export const IS_WIN = process.platform === 'win32'
export const IS_MAC = process.platform === 'darwin'
const exists = (p) => fs.existsSync(p)
const posix = (p) => p.replace(/\\/g, '/')

// ═══ DSH 家目录 ═════════════════════════════════════════════════════════
/** 候选的 DSH 家目录，按优先级：--dsh-home → DSH_HOME → ~/.dsh → Windows 的 %APPDATA%\dsh。 */
export function dshHomeCandidates(explicit) {
  return [
    explicit && path.resolve(explicit),
    process.env.DSH_HOME && path.resolve(process.env.DSH_HOME),
    path.join(os.homedir(), '.dsh'),
    IS_WIN && process.env.APPDATA ? path.join(process.env.APPDATA, 'dsh') : null,
  ].filter(Boolean)
}

// ═══ node 探测 ═════════════════════════════════════════════════════════
// 不假定 node 在哪：DSH NEXT、老版 Desktop、CLI 版、Windows 各有各的位置。
// 优先级：DSH 自带 > 当前进程 > PATH > 常见安装位置。
export const NODE_MIN_MAJOR = 18
const NODE_BIN = IS_WIN ? 'node.exe' : 'node'
const BUNDLED_SKIP = new Set(['node_modules', 'dependencies', 'Frameworks', 'Cache', 'cache', 'GPUCache', 'CachedData'])

export function nodeVersionOf(bin) {
  if (!bin || !exists(bin)) return null
  try {
    const r = spawnSync(bin, ['-v'], { encoding: 'utf8', timeout: 5000, windowsHide: true })
    if (r.error || r.status !== 0 || !r.stdout) return null
    const version = String(r.stdout).trim().replace(/^v/i, '')
    const major = Number(version.split('.')[0])
    if (!Number.isFinite(major) || major <= 0) return null
    return { version, major }
  } catch { return null }
}

// DSH 自带的 node 长这样：
//   macOS    <app>/Contents/Resources/runtime/<arch>/<flavor>/dependencies/node/bin/node
//   Windows  <app>/resources/runtime/<arch>/<flavor>/dependencies/node/bin/node.exe
// 只从 Resources 起摸，深度有限，跳过 Frameworks / node_modules，避免扫整个 app。
function bundledNodeUnder(dir, depth) {
  const d = depth || 0
  if (d > 6) return null
  try { if (!fs.statSync(dir).isDirectory()) return null } catch { return null }
  for (const rel of [['dependencies', 'node', 'bin', NODE_BIN], ['node', 'bin', NODE_BIN], ['bin', NODE_BIN]]) {
    const p = path.join(dir, ...rel)
    if (exists(p)) return p
  }
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return null }
  // DSH 同时带 arm64 和 x64 两份运行时：本机架构的那份排前面（Intel Mac 跑不了 arm64 的，Apple 芯片跑 x64 的要走 Rosetta）
  entries.sort((a, b) => (b.name === process.arch) - (a.name === process.arch))
  for (const e of entries) {
    if (!e.isDirectory()) continue
    if (e.name.startsWith('.') || BUNDLED_SKIP.has(e.name)) continue
    const got = bundledNodeUnder(path.join(dir, e.name), d + 1)
    if (got) return got
  }
  return null
}

// 系统的应用目录（不是哪台电脑的用户路径）：macOS 的 /Applications 和 ~/Applications，Windows 的 Program Files 和 %LOCALAPPDATA%
function appRoots() {
  if (IS_MAC) return ['/Applications', path.join(os.homedir(), 'Applications')]
  if (IS_WIN) return [process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs'), process.env.LOCALAPPDATA, process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean)
  return ['/opt', '/usr/local', '/usr/lib']
}
/** 名字像 DSH 的安装目录（不把整个应用目录翻一遍）。label 是应用名，Mac 上退出 DSH 用它。 */
export function dshAppDirs() {
  const out = []
  for (const r of appRoots()) {
    let names = []
    try { names = fs.readdirSync(r) } catch { continue }
    for (const n of names) {
      if (!/dsh|deepseek/i.test(n) || (IS_MAC && !/\.app$/i.test(n))) continue
      const app = path.join(r, n)
      if (IS_MAC) { const base = path.join(app, 'Contents', 'Resources'); out.push({ dir: exists(base) ? base : app, label: n.replace(/\.app$/i, '') }); continue }
      const sub = IS_WIN ? ['resources', 'Resources', ''].find((s) => exists(path.join(app, s))) : ''
      if (sub !== undefined) out.push({ dir: sub ? path.join(app, sub) : app, label: n })
    }
  }
  return out
}

export function nodesOnPath() {
  const out = []
  for (const d of String(process.env.PATH || '').split(path.delimiter)) {
    if (!d) continue
    const p = path.join(d, NODE_BIN)
    if (exists(p)) out.push(p)
  }
  return out
}

function commonNodePlaces() {
  const h = os.homedir()
  const out = []
  const add = (p) => { if (p && exists(p)) out.push(p) }
  if (IS_WIN) {
    for (const r of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean)) add(path.join(r, 'nodejs', 'node.exe'))
    return out
  }
  // Homebrew（Apple Silicon / Intel）、系统自带、MacPorts
  for (const p of ['/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node', '/opt/local/bin/node']) add(p)
  add(path.join(h, '.volta', 'bin', 'node'))
  // nvm / fnm / asdf：只取版本号最大的三个，不逐个跑
  const scanVersions = (root, tail) => {
    let names = []
    try { names = fs.readdirSync(root) } catch { return }
    const best = names
      .map((n) => ({ n, m: /v?(\d+)\.(\d+)\.(\d+)/.exec(n) }))
      .filter((x) => x.m)
      .map((x) => ({ n: x.n, k: [Number(x.m[1]), Number(x.m[2]), Number(x.m[3])] }))
      .sort((a, b) => b.k[0] - a.k[0] || b.k[1] - a.k[1] || b.k[2] - a.k[2])
      .slice(0, 3)
    for (const x of best) add(path.join(root, x.n, ...tail))
  }
  scanVersions(path.join(h, '.nvm', 'versions', 'node'), ['bin', 'node'])
  scanVersions(path.join(h, '.fnm', 'node-versions'), ['installation', 'bin', 'node'])
  scanVersions(path.join(h, '.local', 'share', 'fnm', 'node-versions'), ['installation', 'bin', 'node'])
  scanVersions(path.join(h, '.asdf', 'installs', 'nodejs'), ['bin', 'node'])
  return out
}

/** 找一个够版本的 node。dshOnly=true：只找 DSH 自带的（写配置时用它，不碰用户的 PATH）。 */
export function detectNode(o = {}) {
  const tried = []
  const seen = new Set()
  let hit = null
  const consider = (bin, from) => {
    if (!bin || hit) return
    let key
    try { key = fs.realpathSync(bin) } catch { key = path.resolve(bin) }
    if (seen.has(key)) return
    seen.add(key)
    const v = nodeVersionOf(bin)
    const okVer = Boolean(v && v.major >= NODE_MIN_MAJOR)
    tried.push({ bin: posix(bin), from, version: v ? v.version : null, ok: okVer })
    if (okVer) hit = { bin, from, version: v.version, major: v.major }
  }
  if (process.env.DSH_NODE) consider(process.env.DSH_NODE, 'DSH_NODE')
  for (const d of dshAppDirs()) consider(bundledNodeUnder(d.dir, 0), `DSH 自带（${d.label}）`)
  if (!o.dshOnly) {
    consider(process.execPath, '当前进程')
    for (const p of nodesOnPath()) consider(p, 'PATH')
    for (const p of commonNodePlaces()) consider(p, '常见安装位置')
  }
  return hit ? { ...hit, tried } : null
}

// ═══ 代理 ═══════════════════════════════════════════════════════════════
/** 下载用的代理：--proxy → 环境变量 → 系统代理（macOS 读 scutil，Windows 读 IE 设置）。 */
export function resolveProxy(opt) {
  if (opt) return opt === 'none' ? null : opt
  for (const k of ['HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy', 'HTTP_PROXY', 'http_proxy']) if (process.env[k]) return process.env[k]
  try {
    if (IS_MAC) {
      const s = String(spawnSync('scutil', ['--proxy'], { encoding: 'utf8' }).stdout || '')
      const g = (k) => { const m = s.match(new RegExp(`\\b${k}\\s*:\\s*(\\S+)`)); return m ? m[1] : null }
      if (g('HTTPSEnable') === '1' && g('HTTPSProxy')) return `http://${g('HTTPSProxy')}:${g('HTTPSPort') || 443}`
      if (g('HTTPEnable') === '1' && g('HTTPProxy')) return `http://${g('HTTPProxy')}:${g('HTTPPort') || 80}`
      if (g('SOCKSEnable') === '1' && g('SOCKSProxy')) return `socks5h://${g('SOCKSProxy')}:${g('SOCKSPort') || 1080}`
    } else if (IS_WIN) {
      const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
      const q = (v) => String(spawnSync('reg', ['query', key, '/v', v], { encoding: 'utf8', windowsHide: true }).stdout || '')
      if (/ProxyEnable\s+REG_DWORD\s+0x1/i.test(q('ProxyEnable'))) {
        const m = q('ProxyServer').match(/ProxyServer\s+REG_SZ\s+(\S+)/i)
        if (m) { const v = m[1]; const https = v.match(/https=([^;]+)/i); const any = v.includes('=') ? (https || v.match(/http=([^;]+)/i)) : null; return 'http://' + (any ? any[1] : v) }
      }
    }
  } catch { /* 读不到系统代理就直连 */ }
  return null
}

// ═══ 退出 DSH（只在 Mac 上代劳）══════════════════════════════════════════
// 真跑必须先完全退出 DSH（profile 只在启动时读一次，开着时改 node_modules 和配置不安全）。
// Mac 上能用 AppleScript 让它正常退出（和 Cmd+Q 一样）；Windows 没有等价的温和做法，只提示用户自己退（托盘图标也要退）。
/** 让 DSH 正常退出，等 isRunning() 变成 false（或进程没了）；最多等 timeoutMs。返回 true 表示确认退出了。 */
export function quitDshMac(isRunning, timeoutMs = 30000) {
  const apps = IS_MAC ? [...new Set(dshAppDirs().map((d) => d.label))] : []
  if (!apps.length) return false
  // DSH 退出时不一定来得及把 active-run.json 标成 ended，所以进程都没了也算退出
  const gone = () => isRunning() === false || apps.every((a) => spawnSync('pgrep', ['-x', a]).status === 1)
  for (const a of apps) spawnSync('osascript', ['-e', `tell application ${JSON.stringify(a)} to quit`], { encoding: 'utf8', timeout: 15000 })
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    if (gone()) return true
    spawnSync('sleep', ['1'])
  }
  return gone()
}
