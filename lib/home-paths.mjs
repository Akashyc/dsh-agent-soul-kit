// 路径自动定位：插件和配置里不写死某台电脑的绝对路径，运行时自己找 DSH 家目录。
//
// 背景（2026-10-27）：
//   安装时把 /Users/yu/.dsh/…、C:/Users/Akady/.dsh/… 这样的绝对路径写进 cordis.patch.yml 和插件代码，
//   装的那一刻是对的，但它是一份快照：profile 从别的电脑带过来、换了用户名、DSH 家目录挪了位置，
//   路径就静默失效；而补丁只认「本机改」标记、不看路径值，重跑安装也纠正不了。
//   直接写相对路径也不行：插件按 DSH_HOME 环境变量定位相对路径，DSH 桌面版不传这个变量，
//   没有它时 memory 插件会退回自己的目录。
//
// 做法：插件里注入一段运行时代码，按这个顺序找 DSH 家目录：
//   ① DSH_HOME 环境变量（设了就用）；
//   ② 插件自己所在的位置：<家目录>/profiles/<profile>/node_modules/<包>/…，Mac、Windows 都适用；
//   ③ 用户主目录下的 .dsh。
//   配置和补丁里只写相对家目录的部分（dsh-soul/memory/hub/SELF.md），哪台电脑都是同一份。
//
// 这个文件同时被 install.mjs（patchList / planCordis）和 tests/home-paths.test.mjs 使用，
// 注入插件的代码就是 locateDshHome 本身的源码，测试测的和装进去的是同一份。

export const AUTO_HOME_TAG = 'soul-kit:auto-home v1'

// ★ 这个函数会被原样拼进插件代码：只能用语句末尾带分号的写法、不能有 // 注释、不能引用外部变量
export function locateDshHome(moduleUrl, env) {
  env = env || {};
  const clean = (s) => String(s || '').trim().replace(/\\/g, '/').replace(/\/+$/, '');
  const fromEnv = clean(env.DSH_HOME);
  if (fromEnv) return fromEnv;
  let p = '';
  try { p = decodeURIComponent(new URL(String(moduleUrl)).pathname).replace(/^\/([A-Za-z]:)/, '$1'); } catch (e) { p = ''; }
  const m = p.match(/^(.*)\/profiles\/[^/]+\/node_modules\//);
  if (m && m[1]) return m[1];
  const home = clean(env.HOME || env.USERPROFILE);
  return (home || '.') + '/.dsh';
}

/** 插件里求 DSH 家目录的表达式（ESM 插件，用 import.meta.url）。结果用正斜杠，Windows 上 node 也认。 */
export function autoHomeExpr() {
  const src = locateDshHome.toString().replace(/\s*\n\s*/g, ' ')
  return `/* ${AUTO_HOME_TAG} */(${src})(import.meta.url, process.env)`
}

const norm = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').replace(/\/\.\//g, '/')

/** abs 在 home 下面时返回相对部分（正斜杠，不带开头的 /）；相等返回 ''；不在下面返回 null。Windows 盘符不分大小写。 */
export function homeRel(abs, home) {
  const a = norm(abs), h = norm(home)
  if (!a || !h) return null
  const ci = /^[A-Za-z]:\//.test(h) || /^[A-Za-z]:\//.test(a)
  const A = ci ? a.toLowerCase() : a, H = ci ? h.toLowerCase() : h
  if (A === H) return ''
  if (!A.startsWith(H + '/')) return null
  return a.slice(h.length + 1)
}

/** 插件里「DSH 家目录 + 相对部分」的表达式；rel 为空就是家目录本身。 */
export function homePathExpr(rel) {
  return rel ? `(${autoHomeExpr()} + ${JSON.stringify('/' + rel)})` : `(${autoHomeExpr()})`
}

// ── dsh-agent-memory：相对路径一律相对 DSH 家目录 ─────────────────────────
// 上游：相对 selfPath 锚 DSH_HOME，没有就退回插件目录；相对 statePath 锚插件目录。
// 本机改：两个都锚到自动找到的家目录；只有没配置时的默认 state.json 仍放插件目录（上游原样）。
export const MEMORY_OLD = [
  "const anchorUser = (p) => (p ? (isAbs(p) ? p : join(ENV('DSH_HOME') || HERE, p)) : '');",
  "const anchorHere = (p) => (p ? (isAbs(p) ? p : join(HERE, p)) : '');",
].join('\n')
export function memoryNew() {
  return [
    `const DSH_HOME_AUTO = ${autoHomeExpr()}; // 本机改：DSH 不传 DSH_HOME 时，从插件自己所在的位置推出 DSH 家目录`,
    "const anchorUser = (p) => (p ? (isAbs(p) ? p : join(DSH_HOME_AUTO, p)) : ''); // 本机改：相对路径一律相对 DSH 家目录",
    "const anchorHere = (p) => (p ? (isAbs(p) ? p : (p === 'state.json' ? join(HERE, p) : join(DSH_HOME_AUTO, p))) : ''); // 本机改：配置里写的相对 statePath 也相对 DSH 家目录",
  ].join('\n')
}
export const MEMORY_ANY = /const DSH_HOME_AUTO = [^\n]*soul-kit:auto-home[^\n]*\nconst anchorUser = [^\n]*\nconst anchorHere = [^\n]*/
// 上下文水位的兜底读法也要家目录（上游只认 DSH_HOME 环境变量）
export const MEMORY_PRESSURE_OLD = "        const home = ENV('DSH_HOME');"
export function memoryPressureNew() {
  return `        const home = ENV('DSH_HOME') || ${autoHomeExpr()}; // 本机改：没有 DSH_HOME 也能找到投影缓存`
}
export const MEMORY_PRESSURE_ANY = /^ {8}const home = ENV\('DSH_HOME'\) \|\| [^\n]*本机改[^\n]*/m

/** memory 配置里的两条路径：记忆中枢在 DSH 家目录下面就写相对路径（换电脑不用改），否则写绝对路径。 */
export function memoryConfigPaths(hub, dshHome, relativeOk) {
  const rel = relativeOk ? homeRel(hub, dshHome) : null
  if (rel) return { selfPath: `${rel}/SELF.md`, statePath: `${rel}/state.json`, relative: true }
  const h = norm(hub)
  return { selfPath: `${h}/SELF.md`, statePath: `${h}/state.json`, relative: false }
}

/** 把配置里的一条路径按插件的规则落到磁盘上的位置（相对路径相对 DSH 家目录），用来核对配置对不对。 */
export function resolveConfigPath(value, dshHome) {
  const v = norm(String(value || '').trim().replace(/^['"]|['"]$/g, ''))
  if (!v) return ''
  if (/^\//.test(v) || /^[A-Za-z]:\//.test(v)) return v
  return norm(dshHome) + '/' + v.replace(/^\.\//, '')
}
export function samePath(a, b) {
  const x = norm(a), y = norm(b)
  return /^[A-Za-z]:\//.test(x) || /^[A-Za-z]:\//.test(y) ? x.toLowerCase() === y.toLowerCase() : x === y
}

/**
 * profile 的 cordis.patch.yml 里 dsh-agent-memory 那一节：没有就写；有就核对 selfPath / statePath / maxBytes。
 *   · 指向这台电脑的记忆中枢、写法也对 → 不动；
 *   · 指向同一个位置但写的是绝对路径、而这次能用相对写法 → 换成相对写法（换电脑不用改）；
 *   · 指向一个这台电脑上不存在的位置（别的电脑带过来的、旧用户名、家目录挪过）→ 改成这台电脑的；
 *   · 指向这台电脑上另一个确实存在的文件 → 当作有意的自定义，不动，只提醒。
 * maxBytes 没写就补 12288；写了别的值不动，只提醒。纯文本进出，exists 由调用方给（测试里可以造）。
 */
export function planMemoryConfig(text, { hub, dshHome, relative, exists = () => false }) {
  let y = String(text || '').replace(/\r\n/g, '\n')
  const notes = [], warns = []
  const mp = memoryConfigPaths(hub, dshHome, relative)
  const tail = mp.relative ? '（相对 DSH 家目录，换电脑不用改）' : ''
  const lines = y.split('\n')
  const start = lines.findIndex((l) => /^- (?:\{\s*)?id: ['"]?dsh-agent-memory['"]?(?:\s*$|\s*,)/.test(l))
  if (start < 0) {
    if (y.length && !y.endsWith('\n')) y += '\n'
    y += ['- id: dsh-agent-memory', '  name: dsh-agent-memory', '  config:', `    selfPath: '${mp.selfPath}'`, `    statePath: '${mp.statePath}'`, '    maxBytes: 12288'].join('\n') + '\n'
    notes.push(`写入 dsh-agent-memory：selfPath ${mp.selfPath}、statePath ${mp.statePath}${tail}、maxBytes: 12288`)
    return { text: y, notes, warns, paths: mp }
  }
  if (/^- \{/.test(lines[start])) {
    warns.push(`cordis.patch.yml 里 dsh-agent-memory 是单行写法，认不出来，没动；请核对 selfPath 指向 ${mp.selfPath}、statePath 指向 ${mp.statePath}、maxBytes 是 12288`)
    return { text: y, notes, warns, paths: mp }
  }
  let end = start + 1
  while (end < lines.length && !/^(-|\S)/.test(lines[end])) end++
  const blk = lines.slice(start, end)
  const fixes = []
  const cfgAt = () => blk.findIndex((l) => /^ {2}config:\s*$/.test(l))
  const setKey = (k, v) => {
    const i = blk.findIndex((l) => new RegExp(`^ {4}${k}:`).test(l))
    if (i >= 0) { blk[i] = `    ${k}: ${v}`; return }
    let c = cfgAt()
    if (c < 0) {
      // 没有 config: 就接在这一节最后一行有内容的后面补上
      let last = blk.length - 1
      while (last > 0 && !blk[last].trim()) last--
      blk.splice(last + 1, 0, '  config:')
      c = last + 1
    }
    blk.splice(c + 1, 0, `    ${k}: ${v}`)
  }
  for (const [k, want] of [['selfPath', mp.selfPath], ['statePath', mp.statePath]]) {
    const line = blk.find((l) => new RegExp(`^ {4}${k}:`).test(l))
    const cur = line ? line.replace(new RegExp(`^ {4}${k}:`), '').trim().replace(/^['"]|['"]$/g, '') : ''
    if (cur === want) continue
    const curAt = cur ? resolveConfigPath(cur, dshHome) : ''
    const isRel = cur && !/^\//.test(cur.replace(/\\/g, '/')) && !/^[A-Za-z]:[\\/]/.test(cur)
    const same = cur && samePath(curAt, resolveConfigPath(want, dshHome)) && (!isRel || relative)
    if (same && !mp.relative) continue
    if (cur && !same && exists(curAt)) { warns.push(`dsh-agent-memory 的 ${k} 指向 ${cur}，这台电脑上确实有这个文件，当作有意的设置没改；用本架构的自我层应该是 ${want}`); continue }
    setKey(k, `'${want}'`)
    fixes.push(`${k} ${cur || '（没写）'} → ${want}`)
  }
  const mb = blk.find((l) => /^ {4}maxBytes:/.test(l))
  if (!mb) { setKey('maxBytes', '12288'); fixes.push('补上 maxBytes: 12288') }
  else if (!/^ {4}maxBytes:\s*12288\s*$/.test(mb)) warns.push(`dsh-agent-memory 的 maxBytes 是 ${mb.split(':')[1].trim()}，没动；小于 12288 时自我层可能被截断`)
  if (fixes.length) {
    lines.splice(start, end - start, ...blk)
    y = lines.join('\n')
    notes.push(`dsh-agent-memory：${fixes.join('；')}${tail}`)
  }
  return { text: y, notes, warns, paths: mp }
}