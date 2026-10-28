/**
 * 配置消毒：把该是布尔、却被写成字符串的值掰回来。
 * ==================================================
 *
 * ★ 为什么要有这个文件
 * --------------------
 * `dsh-huanqi` 的配置 schema 是 Schemastery：
 *   `regionCompactAfterCuts: z.number()`、`fullCompactOnBreaker: z.boolean()`、
 *   `postCompactRecallHint: z.boolean()`（`lib/index.js:190-194`）。
 *
 * 而 YAML 里写 `fullCompactOnBreaker: 'true'` 是**字符串**，不是布尔。
 * 2026-10-29 实机：桌面上每次启动都报
 *   `ValidationError: invalid config: $.fullCompactOnBreaker expected boolean but got true`
 * cordis 把这条记进日志，然后**整段配置回退成默认值** —— 插件照跑，
 * 但你以为自己改过的参数一个都没生效。它不崩，所以更难发现。
 *
 * 谁写进去的？`dsh-yanqing-huanqi-panel` 的字节级编辑器按「值当文本」写，
 * 布尔就成了带引号的 `'true'`。面板没错（它只改值不动结构），
 * 错在没人把「字符串 'true'」认成「布尔 true」。
 *
 * ★ 为什么放在安装器里
 * --------------------
 * 这台机器上能改 profile 配置的有三个入口：装、更新、面板。
 * 前两个归 kit 管，所以 kit 在**写之前**统一过一遍；
 * 面板那边改完，下次跑安装/更新时也会被这里纠正回来。
 *
 * ★ 只动该动的
 * ------------
 * 只认已知是布尔的键（`BOOLEAN_KEYS`），且只在 `- id: huanqi` 这一节里动。
 * 别的插件的 `'true'` 可能是人家故意的（比如它 schema 就是字符串），
 * 一律不碰 —— 修配置的前提是不把别人的配置改坏。
 */

/** 换气 schema 里声明成 `z.boolean()` 的键。多一个都别往里加，除非真读过那边的 schema。 */
export const BOOLEAN_KEYS = ['fullCompactOnBreaker', 'postCompactRecallHint']

/**
 * 把 `- id: huanqi` 这一节里的 `'true'` / `"false"` 掰成真布尔。
 *
 * @param {string} text cordis.patch.yml 全文
 * @returns {{ text: string, fixed: Array<{ key: string, from: string, to: string }> }}
 *   只有 text 变了才代表真修了东西；fixed 用来在安装器里报一句人话。
 */
export function fixQuotedBooleans(text) {
  const src = String(text ?? '')
  const lines = src.split('\n')
  const start = lines.findIndex((l) => /^- id: ['"]?huanqi['"]?\s*$/.test(l))
  if (start < 0) return { text: src, fixed: [] }
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^- /.test(lines[i])) { end = i; break }
  }
  const fixed = []
  for (let i = start + 1; i < end; i++) {
    const m = lines[i].match(/^(\s*)([A-Za-z][\w-]*):\s*(['"])(true|false)\3\s*$/)
    if (!m) continue
    const [, indent, key, , value] = m
    if (!BOOLEAN_KEYS.includes(key)) continue
    fixed.push({ key, from: `${key}: ${m[3]}${value}${m[3]}`, to: `${key}: ${value}` })
    lines[i] = `${indent}${key}: ${value}`
  }
  return { text: lines.join('\n'), fixed }
}
