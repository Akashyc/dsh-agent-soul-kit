import fs from 'node:fs'
import path from 'node:path'
import { exists, readText } from '../core/io.mjs'

/**
 * 检测层 · P0 静态检查（docs/架构-检测层.md §4）。只读已装文件与配置。
 *
 * 范围铁律：只看本架构自己的东西——本体、零件（install.parts）、Soul preset 的 skills
 * （install.presetSkills）。DSH 内置插件、别家插件、别的 preset 一概不判。
 *
 * D1.1 平台专属可执行文件 / D1.2 Windows 专属路径 / D2.3 以 cwd 拼路径 / D5.1 悬空 patch 条目 / D5.2 frontmatter 必挂
 */

const CODE_EXT = /\.(js|mjs|cjs)$/
// 开发产物与测试：实测 mcp-hub/_check-client.mjs、clock/verify-browser.mjs、huanqi/test/privacy.spec.mjs
// 都命中 D1 但不是运行期代码；不排除就会把第一版的可信度打光。
const skipDir = (n) => n === 'node_modules' || n === '.git' || n === 'test' || n === '__tests__'
const skipFile = (n) => n.startsWith('_') || /^(verify|test)[-.]/.test(n) || /\.(spec|test)\./.test(n)

const PLATFORM_CALL = /\b(?:exec|execSync|execFile|execFileSync|spawn|spawnSync)\s*\(\s*['"`](powershell\.exe|pwsh|cmd\.exe|schtasks)['"`]/i
const PLATFORM_ARGV = /^['"`](powershell\.exe|pwsh|cmd\.exe|schtasks)['"`],?$/i
const CJK = /[\u4e00-\u9fff]/
// 用 includes 而不是正则：路径里的反斜杠在正则字面量里要四层转义，写错过一次，不再冒险
// \\pipe\\：Windows 命名管道；在 macOS 上会变成 cwd 下一个叫 \\.\pipe\echo-hub 的 socket 文件，客户端换个 cwd 就连不上
const WIN_PATHS = ['python_embeded', 'Scripts\\', 'Scripts/', 'C:\\', 'D:\\', 'E:\\', '\\pipe\\']
const HIT_CAP = 40
// D2.3 只认 cwd 路径被赋值或返回（即真的生效）。DSH 进程的 cwd 是安装目录，不是数据目录。
// 打印 cwd、或作为回落链里的一个候选（D2.4：前面有更可靠的级）都不报
const CWD_PATH = /(?:=|\?\?|\|\||\breturn)\s*(?:path\.)?(?:join|resolve)\(\s*process\.cwd\(\)/

const isComment = (t) => t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')

/** 本架构自己装的东西：本体 + 零件 + preset 包 */
const ownPackages = (context) => new Set([
  'dsh-agent-soul',
  ...(context.install?.parts || []),
])

function* codeFiles(dir, root = dir) {
  let ents
  try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of ents) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (!skipDir(e.name)) yield* codeFiles(full, root)
    } else if (CODE_EXT.test(e.name) && !skipFile(e.name)) {
      yield [full, path.relative(root, full)]
    }
  }
}

function checkPlatform(pkg, dir, rel) {
  const out = []
  for (const [full, inner] of codeFiles(dir)) {
    if (out.length >= HIT_CAP) break
    let text
    try { text = fs.readFileSync(full, 'utf8') } catch { continue }
    const lines = text.split('\n')
    for (let i = 0; i < lines.length && out.length < HIT_CAP; i++) {
      const trimmed = lines[i].trim()
      if (!trimmed || isComment(trimmed)) continue
      // 含中文的多半是界面文案／报错字符串，不是可执行位置
      if (CJK.test(trimmed)) continue
      const argv = PLATFORM_ARGV.exec(trimmed)
      const call = argv || PLATFORM_CALL.exec(trimmed)
      const winPath = call ? null : WIN_PATHS.find((p) => trimmed.includes(p))
      const cwd = !call && !winPath && CWD_PATH.test(trimmed)
      if (!call && !winPath && !cwd) continue
      const snippet = trimmed.slice(0, 120)
      out.push({
        checkId: call ? 'D1.1' : cwd ? 'D2.3' : 'D1.2',
        pkg,
        severity: cwd ? 'degraded' : 'broken',
        file: path.join(rel, inner),
        line: i + 1,
        snippet,
        detail: call
          ? '调用 Windows 专属命令 ' + call[1] + '，当前平台 ' + process.platform + ' 上不可用'
          : cwd ? '以 process.cwd() 拼路径；DSH 进程的 cwd 是安装目录，文件会读写到错的位置'
          : '含 Windows 专属路径写法 ' + winPath + '，当前平台 ' + process.platform + ' 上不成立',
      })
    }
  }
  return out
}

/**
 * D2.1：配置里写死的绝对路径是否还存在。
 * 只看本架构自己的配置（中枢 echo.config.json）；盘符/家目录路径失效时面板会静默空白。
 */
function checkConfigPaths(context) {
  const out = []
  const cfg = path.join(context.home, 'dsh-soul', 'memory', 'hub', 'echo.config.json')
  if (!exists(cfg)) return out
  let doc
  try { doc = JSON.parse(readText(cfg)) } catch { return out }

  const seen = new Set()
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk)
    if (node && typeof node === 'object') return Object.values(node).forEach(walk)
    if (typeof node !== 'string' || !path.isAbsolute(node)) return
    if (seen.has(node)) return
    seen.add(node)
    if (exists(node)) return
    out.push({
      checkId: 'D2.1',
      pkg: 'memory-hub',
      severity: 'broken',
      file: 'dsh-soul/memory/hub/echo.config.json',
      line: 0,
      snippet: node,
      detail: '中枢配置指向的路径不存在（' + node + '），相关面板或检索会静默空白',
    })
  }
  walk(doc)
  return out
}

/**
 * D5.6：包内相对导入指向的文件不存在。
 * 今天的真机就是这种形态：index.js 里 import './env-config.mjs'，但该文件没被装进来，
 * 启动时 ERR_MODULE_NOT_FOUND，整个零件加载失败——而静态看包目录是"存在"的。
 */
const REL_IMPORT = /(?:from\s*|import\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g

function checkRelativeImports(pkg, dir, rel) {
  const out = []
  for (const [full, inner] of codeFiles(dir)) {
    if (out.length >= HIT_CAP) break
    let text
    try { text = fs.readFileSync(full, 'utf8') } catch { continue }
    const lines = text.split('\n')
    for (let i = 0; i < lines.length && out.length < HIT_CAP; i++) {
      const trimmed = lines[i].trim()
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) continue
      REL_IMPORT.lastIndex = 0
      let m
      while ((m = REL_IMPORT.exec(lines[i])) && out.length < HIT_CAP) {
        const spec = m[1]
        const base = path.resolve(path.dirname(full), spec)
        const candidates = [base, base + '.js', base + '.mjs', base + '.cjs', path.join(base, 'index.js'), path.join(base, 'index.mjs')]
        if (candidates.some((c) => exists(c))) continue
        out.push({
          checkId: 'D5.6',
          pkg,
          severity: 'block',
          file: path.join(rel, inner),
          line: i + 1,
          snippet: trimmed.slice(0, 120),
          detail: '相对导入 ' + spec + ' 指向的文件不存在，加载时会 ERR_MODULE_NOT_FOUND',
        })
      }
    }
  }
  return out
}

/** D5.1：只查「我们自己的包」在 patch 里被引用却没有装 */
function checkPatch(context, own) {
  const dir = path.join(context.home, 'profiles', context.profile)
  const nm = path.join(dir, 'node_modules')
  const out = []
  const seen = new Set()
  const record = (name, file, line, raw) => {
    if (!own.has(name) || seen.has(name)) return
    seen.add(name)
    if (exists(path.join(nm, ...name.split('/'), 'package.json'))) return
    out.push({
      checkId: 'D5.1',
      pkg: name,
      severity: 'broken',
      file,
      line,
      snippet: raw.slice(0, 120),
      detail: 'patch 要加载本架构的 ' + name + '，但 node_modules 里没有这个包',
    })
  }
  let files = []
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.cordis.patch.json') || f === 'cordis.patch.yml') } catch { return out }
  for (const f of files) {
    let text
    try { text = readText(path.join(dir, f)) } catch { continue }
    const rel = path.join('profiles', context.profile, f)
    if (f.endsWith('.json')) {
      let doc
      try { doc = JSON.parse(text) } catch { continue }
      const visit = (node) => {
        if (Array.isArray(node)) return node.forEach(visit)
        if (!node || typeof node !== 'object') return
        for (const key of ['id', 'name']) {
          if (typeof node[key] === 'string') record(node[key], rel, 0, node[key])
        }
        Object.values(node).forEach(visit)
      }
      visit(doc)
    } else {
      const lines = text.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const m = /^\s*-?\s*(?:id|name):\s*([^\s#,\]]+)/.exec(lines[i])
        if (m) record(m[1].replace(/^['"]|['"]$/g, ''), rel, i + 1, lines[i].trim())
      }
    }
  }
  return out
}

/** D5.2：只查本 preset 自己的 skills（install.presetSkills）。别的 preset 的 skills 不归我们管 */
function checkSkills(context) {
  const owned = Object.keys(context.install?.presetSkills || {})
  if (!owned.length) return []
  const dir = path.join(context.home, 'profiles', context.profile, 'skills')
  const out = []
  for (const rel of owned) {
    const full = path.join(dir, ...rel.split('/'))
    if (!exists(full)) continue
    let text
    try { text = readText(full) } catch { continue }
    if (!text.startsWith('---')) continue
    const end = text.indexOf('\n---', 3)
    if (end < 0) continue
    const head = text.slice(3, end).split('\n')
    for (let i = 0; i < head.length; i++) {
      const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(head[i])
      if (!m) continue
      const value = m[2].trim()
      // 加了引号/块标量/集合的不会挂；未加引号且值里含 ": " 才会被当成嵌套映射
      if (!value || /^["'|>\[{]/.test(value) || !value.includes(': ')) continue
      out.push({
        checkId: 'D5.2',
        pkg: 'preset-skills/' + rel.split('/')[0],
        severity: 'broken',
        file: path.join('profiles', context.profile, 'skills', ...rel.split('/')),
        line: i + 2,
        snippet: head[i].trim().slice(0, 120),
        detail: 'frontmatter 的 ' + m[1] + ' 是未加引号的标量且值里含 ": "，YAML 会当成嵌套映射，整份解析失败，skill 不会加载',
      })
    }
  }
  return out
}

/**
 * D4.1：日志里 level=error 的行，按 tools/source + 报文归类。
 * 只留提到「本架构某个包」的错误行——别的插件和 DSH 本体的错误不归 kit 管。
 * 正文可能在 message，也可能在 error.message；只看前者会漏掉全部工具执行失败。
 */
function checkLogErrors(context, own) {
  const dir = context.logs
  const out = []
  if (!dir || !exists(dir)) return out
  let files = []
  try {
    files = fs.readdirSync(dir)
      .filter((name) => name.endsWith('.jsonl'))
      .map((name) => ({ name, at: fs.statSync(path.join(dir, name)).mtimeMs }))
      .sort((a, b) => b.at - a.at).slice(0, 5)
  } catch { return out }

  const groups = new Map()
  for (const file of files) {
    let text
    try { text = readText(path.join(dir, file.name)) } catch { continue }
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      let row
      try { row = JSON.parse(line) } catch { continue }
      if (!row || row.level !== 'error') continue
      const message = String(row.message || '')
      const errorText = row.error && typeof row.error === 'object'
        ? String(row.error.message || '') + ' ' + String(row.error.name || '')
        : ''
      const stack = row.error && typeof row.error === 'object' ? String(row.error.stack || '') : ''
      // 只认「栈在包内」，不认「报文提到包名」：路径里带 dsh-agent-soul-kit 的写入失败不是零件故障
      const hitPkg = [...own].find((name) => stack.includes('node_modules/' + name + '/') || stack.includes('node_modules\\' + name + '\\'))
      if (!hitPkg) continue
      const tool = row.fields && typeof row.fields === 'object' ? String(row.fields.tool || '') : ''
      const source = String(row.source || row.event || '')
      const key = hitPkg + '\u0000' + (tool || source)
      const cur = groups.get(key) || { pkg: hitPkg, tool, source, count: 0, files: new Set(), sample: '' }
      cur.count++
      cur.files.add(file.name)
      if (!cur.sample) cur.sample = (message || errorText).replace(/\s+/g, ' ').trim().slice(0, 160)
      groups.set(key, cur)
    }
  }

  for (const g of groups.values()) {
    out.push({
      checkId: 'D4.1',
      pkg: g.pkg,
      severity: 'degraded',
      file: [...g.files].join('、'),
      line: 0,
      snippet: g.sample,
      detail: '日志里 ' + g.count + ' 条 level=error' + (g.tool ? '（工具 ' + g.tool + '）' : g.source ? '（' + g.source + '）' : '') + '，提到本架构的 ' + g.pkg,
    })
  }
  return out
}

/** @returns {{findings: object[], coverage: {packages: number, skills: number, platform: string}}} */
export function scanStatic(context) {
  const nm = path.join(context.home, 'profiles', context.profile, 'node_modules')
  const parts = (context.install?.parts || []).filter((p) => exists(path.join(nm, p)))
  const own = ownPackages(context)
  const findings = []
  for (const pkg of parts) {
    const relDir = path.join('profiles', context.profile, 'node_modules', pkg)
    findings.push(...checkPlatform(pkg, path.join(nm, pkg), relDir))
    findings.push(...checkRelativeImports(pkg, path.join(nm, pkg), relDir))
  }
  // 本体只扫 kit/：它会被铺进中枢、真的运行；plugins/ 是零件副本（上面已扫），tools/ 是开发用命令行
  const soulKit = path.join(nm, 'dsh-agent-soul', 'kit')
  if (exists(soulKit)) findings.push(...checkPlatform('dsh-agent-soul', soulKit, path.join('profiles', context.profile, 'node_modules', 'dsh-agent-soul', 'kit')))
  findings.push(...checkPatch(context, own), ...checkSkills(context), ...checkLogErrors(context, own), ...checkConfigPaths(context))
  // D7.1：安装记录里有、node_modules 里没有的零件。上面按存在过滤了，不补这条它会从范围里静默消失；D5.1 已报的不重复
  for (const pkg of context.install?.parts || []) {
    if (parts.includes(pkg) || findings.some((f) => f.checkId === 'D5.1' && f.pkg === pkg)) continue
    findings.push({ checkId: 'D7.1', pkg, severity: 'broken', file: path.join('profiles', context.profile, 'node_modules'), line: 0, snippet: pkg, detail: '安装记录列了零件 ' + pkg + '，但 node_modules 里没有，这个零件不会加载' })
  }
  const rank = { block: 0, broken: 1, degraded: 2, hygiene: 3 }
  findings.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9) || a.pkg.localeCompare(b.pkg))
  return {
    findings,
    coverage: {
      packages: parts.length,
      skills: Object.keys(context.install?.presetSkills || {}).length,
      logs: Boolean(context.logs && exists(context.logs)),
      platform: process.platform,
    },
  }
}
