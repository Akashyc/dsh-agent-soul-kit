import fs from 'node:fs'
import path from 'node:path'
import { exists, readText } from '../core/io.mjs'

/**
 * 拿本机清单逐条判定。输入只有两样东西：已装文件、作者源码；
 * 结论每轮重算，不信任上一轮记下的状态。
 *
 * 判定顺序（任何一步认不出就 unknown，绝不猜）：
 *   authorFixed 命中       → retired（作者自己修好了，本地上次那套该退役）
 *   装了我们的标记          → patched（已经改过）
 *   problem 命中            → open（问题还在）
 *   problem 不命中但认得出这段 → local-changed（没标记也没问题：手改过）
 *   连这段都认不出          → unknown
 */
export function judge(entry, context, author) {
  const at = (rel) => rel ? scopedFile(context.home, rel) : null
  const installed = at(entry.file)
  const installedText = installed && exists(installed) ? readText(installed) : null
  if (installedText === null) {
    // 没记录装了哪个文件：只可能是「这个问题在这台机器上不适用」或「还没登记位置」
    return { state: 'unknown', installed: null, note: '没有记录已装文件位置' }
  }

  const upstream = entry.upstreamFile && author?.dir ? scopedFile(author.dir, entry.upstreamFile) : null
  const authorText = upstream && exists(upstream) ? readText(upstream) : null
  const marked = Boolean(entry.solution) && String(entry.solution).trim() !== '' && installedText.includes(entry.solution)

  if (authorText !== null && entry.authorFixed) {
    const hit = matches(authorText, entry.authorFixed)
    if (hit === true) return { state: 'retired', installed, author: upstream, localProblem: Boolean(entry.problem) && matches(installedText, entry.problem) === true }
    if (hit === 'unknown') return { state: 'unknown', installed, author: upstream, note: '作者源码里认不出作者修好的特征' }
  }

  if (marked) return { state: 'patched', installed, author: upstream }

  if (entry.problem) {
    const hit = matches(installedText, entry.problem)
    if (hit === true) return { state: 'open', installed, author: upstream }
    if (hit === 'unknown') return { state: 'unknown', installed, author: upstream, note: '已装文件里认不出这个问题' }
    return entry.scope && matches(installedText, entry.scope) === true
      ? { state: 'local-changed', installed, author: upstream, note: '认出所属代码，但问题及本地标记均不在' }
      : { state: 'unknown', installed, author: upstream, note: '问题锚点消失，但无法确认所属代码仍在' }
  }

  return { state: 'unknown', installed, author: upstream, note: '条目没有 problem 锚点' }
}

/** 清单里的锚点写成字符串或 /正则/（JSON 里存的是字符串，形如 "/.../" 的按正则解）。 */
function matches(text, needle) {
  const hit = matchAnchor(text, needle)
  return hit === 'unknown' ? 'unknown' : Boolean(hit)
}

/** 判定与报告共用 JSON 锚点解析，正则定位和 flags 不能各算一套。 */
export function matchAnchor(text, needle) {
  if (typeof needle !== 'string') return 'unknown'
  const regex = needle.match(/^\/([\s\S]*)\/([a-z]*)$/i)
  if (regex) {
    try {
      const hit = new RegExp(regex[1], regex[2]).exec(text)
      return hit ? { at: hit.index, len: hit[0].length } : null
    } catch { return 'unknown' }
  }
  const at = text.indexOf(needle)
  return at < 0 ? null : { at, len: needle.length }
}

/** 本机还有没有我们的标记 —— 退役后用它判断旧补丁清没清。 */
export function hasLocalMarker(entry, context) {
  if (!entry.solution || !entry.file) return false
  const file = scopedFile(context.home, entry.file)
  if (!exists(file)) return false
  return readText(file).includes(entry.solution)
}
export function scopedFile(root, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('问题文件必须是根目录内的相对路径')
  const file = path.resolve(root, relative)
  const base = path.resolve(root) + path.sep
  if (!file.startsWith(base)) throw new Error('问题文件超出允许范围')
  // 校验存在的祖先，防止目录符号链接指向外部。
  for (let current = file; current.startsWith(base); current = path.dirname(current)) {
    try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error('问题文件不接受符号链接') } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  return file
}
