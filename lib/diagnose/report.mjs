import { scopedFile, matchAnchor } from './detect.mjs'
import crypto from 'node:crypto'
import { exists, readText } from '../core/io.mjs'

const BT = '\u0060'
const GROUPS = [
  ['crash', '一、加载即崩', '插件一激活就报错，或功能静默消失。建议优先看这组。'],
  ['logic', '二、功能不对', '装得上、跑得动，但这个功能用起来不对。'],
  ['path', '三、路径推断', '要靠 DSH 注入环境变量才找得到目录；拿不到时功能失效。'],
  ['platform', '四、平台差异', '只有 Windows 实现。若作者只打算支持 Windows，这组可以忽略。'],
]
const PLACEHOLDER = '<DSH_HOME>'

/** 去掉本机路径：导出物是要交给第三方的。 */
export function redact(text, home) {
  let out = String(text || '')
  for (const form of new Set([home, String(home).replace(/\\/g, '/'), String(home).replace(/\//g, '\\')])) {
    if (form) out = out.split(form).join(PLACEHOLDER)
  }
  return out
    .replace(/\/Users\/[^/\s'"]+/g, '~')
    .replace(/[A-Za-z]:\\+Users\\+[^\\\s'"]+/g, '~')
    .replace(/\/home\/[^/\s'"]+/g, '~')
}

/** 写文件前的最后一道闸：宁可不出文件，也不能把本机路径带出去。 */
export function assertClean(markdown) {
  for (const pattern of [/\/Users\//, /[A-Za-z]:\\+Users\\+/, /\/home\/[a-z]/i]) {
    const hit = pattern.exec(markdown)
    if (hit) throw new Error('导出内容里有本机路径，已中止写文件：' + hit[0])
  }
}

/** 先确认作者问题仍在，再用 cite 或 problem 定位；scope 不作问题证据。 */
function locate(entry, text) {
  const tries = []
  if (entry.cite) tries.push(entry.cite)
  if (entry.problem) tries.push(...(Array.isArray(entry.problem) ? entry.problem : [entry.problem]))
  if (entry.edits?.[0]?.old) tries.push(entry.edits[0].old)
  for (const needle of tries) {
    const hit = matchAnchor(text, needle)
    if (hit && hit !== 'unknown') return hit
  }
  return null
}

export function snippetOf(entry, authorDir, upstreamFile) {
  if (!upstreamFile || !authorDir) return null
  const file = scopedFile(authorDir, upstreamFile)
  if (!exists(file)) return null
  const text = readText(file)
  const problem = entry.problem && matchAnchor(text, entry.problem)
  if (!problem || problem === 'unknown') return null
  const hit = locate(entry, text)
  if (!hit) return null
  // 扩展到整行：命中点常在行中间，只截命中片段会丢掉上下文和缩进
  const from = text.lastIndexOf('\n', hit.at) + 1
  const stop = text.indexOf('\n', hit.at + Math.max(hit.len, 1))
  const raw = text.slice(from, stop < 0 ? undefined : stop)
  const line = text.slice(0, from).split('\n').length
  return {
    line,
    code: raw.split('\n').slice(0, 3).join('\n'),
    loose: Boolean(hit.loose),
    file: upstreamFile,
    hash: crypto.createHash('sha1').update(raw).digest('hex').slice(0, 8),
  }
}

function issueBlock(item, entry, snippet) {
  const lines = []
  lines.push('### ' + item.id + ' — ' + item.title)
  lines.push('')
  if (snippet) lines.push('- 位置：' + BT + snippet.file + ':' + snippet.line + BT + (snippet.loose ? '（判定按函数特征，行号取函数位置）' : ''))
  else lines.push('- 位置：' + (item.upstreamFile ? BT + item.upstreamFile + BT : '无单点锚点（判定基于平台或配置）'))
  lines.push('')
  if (snippet) {
    lines.push('        ' + snippet.code.replace(/\n/g, '\n        '))
    lines.push('')
  }
  if (entry?.why) lines.push('- 原因：' + entry.why)
  if (entry?.before) lines.push('- 出问题的写法：' + BT + entry.before + BT)
  if (item.impact) lines.push('- 现象：' + item.impact)
  if (item.when) lines.push('- 触发：' + item.when)
  if (item.verify?.length) lines.push('- 我们怎么核实的：' + (Array.isArray(item.verify) ? item.verify : [item.verify]).join('；'))
  lines.push('- 建议方向：' + (entry?.hint || '尚未确认，不附完整本地补丁'))
  if (snippet) lines.push('- 指纹：' + BT + snippet.hash + BT + '（这段代码一改，指纹就变，可据此判断本清单是否过期）')
  lines.push('')
  return lines.join('\n')
}

/**
 * 渲染给作者看的问题清单：只收作者源码里确实存在、且本机核实过的问题。
 * @param items 已经过滤过的条目
 * @param author 作者仓库 { dir, sha }
 * @param install 安装记录
 * @param at 生成时间
 * @param home DSH 家目录，用来做脱敏
 * @returns { markdown, issues, groups }
 */
export function renderProblems({ items, author, install, at, home, context }) {
  const groups = new Map(GROUPS.map(([kind]) => [kind, []]))
  const issues = []
  for (const item of items) {
    const entry = item.entry || {}
    const kind = GROUPS.some(([k]) => k === entry.kind) ? entry.kind : 'logic'
    const snippet = snippetOf(entry, author.dir, item.upstreamFile)
    if (item.state && item.state !== 'open') continue
    if (!snippet) continue // 作者源码不能定位时不对外宣称已核实
    issues.push({ id: item.id, kind, file: snippet?.file || item.upstreamFile || null, line: snippet?.line || null, hash: snippet?.hash || null })
    const bucket = groups.get(kind) || groups.get('logic')
    bucket.push({ item, entry, snippet })
  }
  const counts = GROUPS.filter(([kind]) => (groups.get(kind) || []).length)
    .map(([kind, title]) => title.replace(/^[一二三四]、/, '') + ' ' + groups.get(kind).length)
  const head = [
    '# dsh-agent-soul 安装后问题清单',
    '',
    '只列在作者源码里确实存在、并在本机核对过的问题。按性质分组，前两组建议优先看。',
    '',
    '| 项 | 值 |',
    '|---|---|',
    '| 上游 | ' + (install?.upstream?.repo || 'cyanwell/dsh-agent-soul') + ' @ ' + String(author.sha).slice(0, 7) + ' |',
    '| 生成 | ' + at + ' |',
    '| 环境 | ' + process.platform + ' ' + process.arch + ' · Node ' + process.versions.node + ' · profile ' + (install?.profile || 'desktop') + ' |',
    '| 条目 | ' + issues.length + ' 条（' + counts.join(' / ') + '） |',
    '',
    '判定方式：拿作者源码与已装文件逐条对照，再用本机实际状态确认。本清单不含本机路径、会话内容或用户数据。',
    '',
  ]
  const bodyOut = []
  for (const [kind, title, note] of GROUPS) {
    const list = groups.get(kind) || []
    if (!list.length) continue
    bodyOut.push('## ' + title, '', note, '')
    for (const { item, entry, snippet } of list) bodyOut.push(issueBlock(item, entry, snippet))
  }
  const markdown = redact([...head, ...bodyOut].join('\n'), home).replace(/\n+$/, '')
  assertClean(markdown)
  return { markdown, issues, groups: Object.fromEntries([...groups].map(([k, v]) => [k, v.length])) }
}