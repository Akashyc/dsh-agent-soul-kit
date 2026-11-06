#!/usr/bin/env node
// 导出给作者的问题清单。只做三件事：过滤、脱敏、渲染。
//   node kit/report.mjs --run <runs/时间目录> [--out <文件>]
// 输入 <run>/entries.json：诊断层筛出来的候选条目（已按 open 状态过滤）。
// 这个文件是**给第三方的**，路径脱敏是硬要求，宁可不出文件也不带路径出门。
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { NL, emit, exists, parseArgs, readJson, readText } from '../probe/lib/common.mjs'

const opt = parseArgs(process.argv.slice(2))
const runDir = opt['--run'] ? path.resolve(opt['--run']) : null
const outFile = opt['--out'] ? path.resolve(opt['--out']) : null

if (!runDir) {
  emit({ ok: false, notes: ['没有给 --run：不知道从哪里取条目'] })
  process.exit(0)
}
if (!exists(runDir)) {
  emit({ ok: false, notes: ['目录不存在：' + runDir] })
  process.exit(0)
}

const upstream = readJson(path.join(runDir, 'upstream.json')).value
const local = readJson(path.join(runDir, 'local.json')).value
const entriesRaw = readJson(path.join(runDir, 'entries.json'))
const notes = []

if (entriesRaw.value === null) {
  emit({ ok: false, notes: ['没有 entries.json：这条链路要先有诊断，不能凭印象写清单'] })
  process.exit(0)
}
const entries = Array.isArray(entriesRaw.value) ? entriesRaw.value : []

// ---------- 三道脱敏闸 ----------
const dshHome = local && local.dshHome ? local.dshHome : null

/** 第一闸：DSH 家目录 → <DSH_HOME>；正反斜杠两种写法都替。 */
function stripHome(text) {
  if (!dshHome) return text
  let out = text
  for (const variant of [dshHome, dshHome.split('/').join('\\')]) {
    out = out.split(variant).join('<DSH_HOME>')
  }
  return out
}

/** 第二闸：用户目录 → ~，正反斜杠与中文用户名都吃掉。 */
function stripUser(text) {
  return text.replace(/[\/\\](?:Users|home)[\/\\][^\/\\\s]+/g, '~')
}

/** 第三闸：写出去之前最后扫一遍，命中就中止。 */
const LEAK = /[\/\\](?:Users|home)[\/\\]/
const HOME_LEAK = dshHome ? new RegExp(dshHome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : null

function redact(text) {
  return stripUser(stripHome(String(text == null ? '' : text)))
}

/** 指纹：代码片段去空白后取 sha1 前 8 位。这段代码一改，指纹就变。 */
function fingerprint(snippet) {
  const normalized = String(snippet || '').replace(/\s+/g, ' ')
  return createHash('sha1').update(normalized).digest('hex').slice(0, 8)
}

// ---------- 分组 ----------
const GROUPS = [
  { key: 'crash', title: '一、加载即崩', hint: '插件一激活就报错，或功能静默消失。建议优先看' },
  { key: 'behavior', title: '二、功能不对', hint: '装得上、跑得动，但这个功能用起来不对' },
  { key: 'path', title: '三、路径推断', hint: '要靠 DSH 注入环境变量才找得到目录；拿不到时失效' },
  { key: 'platform', title: '四、平台差异', hint: '只有 Windows 实现。作者若只打算支持 Windows，这组可忽略' },
]

const grouped = new Map(GROUPS.map((group) => [group.key, []]))
for (const entry of entries) {
  const key = grouped.has(entry.group) ? entry.group : 'behavior'
  grouped.get(key).push(entry)
}

/** 只收在作者源码里能定位、并写明位置的条目。定位不到就不对外宣称已核实。 */
function keep(entry) {
  return Boolean(entry && entry.position) && Boolean(entry.title)
}

const accepted = []
const dropped = []
for (const entry of entries) {
  if (keep(entry)) accepted.push(entry)
  else dropped.push({ title: entry && entry.title ? entry.title : '(无标题)', why: '没有上游位置：定位不到就不导出' })
}

// ---------- 渲染 ----------
const sha = upstream && upstream.sha ? String(upstream.sha).slice(0, 7) : '未判定'
const repo = upstream && upstream.repo ? upstream.repo : '上游'
const env = [
  local && local.platform ? local.platform : '平台未知',
  local && local.arch ? local.arch : '架构未知',
  'Node ' + (local && local.nodeVersion ? local.nodeVersion : '未知'),
  'profile ' + (local && local.profile ? local.profile : '未知'),
].join(' ')

const groupsUsed = GROUPS.filter((group) => grouped.get(group.key).some((entry) => keep(entry)))
const lines = [
  '# ' + repo + ' 安装后问题清单',
  '',
  '只列在作者源码里确实存在、并在本机核对过的问题。按性质分组，前两组建议优先看。',
  '',
  '| 项 | 值 |',
  '|---|---|',
  '| 上游 | ' + repo + ' @ ' + sha + ' |',
  '| 生成 | ' + new Date().toISOString() + ' |',
  '| 环境 | ' + env + ' |',
  '| 条目 | ' + accepted.length + ' 条（' + groupsUsed.map((group) => grouped.get(group.key).filter(keep).length + ' ' + group.title.slice(0, 3).replace('、', '')).join('，') + '） |',
  '',
  '判定方式：拿作者源码与已装文件逐条对照，再用本机实际状态确认。',
  '本清单不含本机路径、会话内容或用户数据。',
  '',
]

for (const group of groupsUsed) {
  lines.push('## ' + group.title)
  lines.push('')
  lines.push(group.hint)
  lines.push('')
  for (const entry of grouped.get(group.key).filter(keep)) {
    lines.push('### ' + (entry.id ? entry.id + ' — ' : '') + entry.title)
    lines.push('')
    lines.push('- 位置：' + redact(entry.position))
    if (entry.snippet) {
      lines.push('')
      for (const codeLine of String(entry.snippet).split(NL)) lines.push('        ' + redact(codeLine))
      lines.push('')
    }
    if (entry.reason) lines.push('- 原因：' + redact(entry.reason))
    if (entry.wrong) lines.push('- 出问题的写法：' + redact(entry.wrong))
    if (entry.symptom) lines.push('- 现象：' + redact(entry.symptom))
    if (entry.trigger) lines.push('- 触发：' + redact(entry.trigger))
    if (entry.verified) lines.push('- 我们怎么核实的：' + redact(entry.verified))
    if (entry.suggestion) lines.push('- 建议方向：' + redact(entry.suggestion))
    lines.push('- 指纹：' + fingerprint(entry.snippet || entry.wrong || entry.title))
    lines.push('')
  }
}

const markdown = lines.join(NL)

// 最后一道闸：宁可不出文件，也不能把本机路径带出去。
const leak = LEAK.test(markdown) || (HOME_LEAK && HOME_LEAK.test(markdown))
if (leak) {
  emit({ ok: false, written: false, notes: ['脱敏后仍有本机路径残留：已中止，一个字节都没写'] })
  process.exit(0)
}

if (!outFile) {
  emit({ ok: true, written: false, markdown, counts: { accepted: accepted.length, dropped: dropped.length }, dropped, notes: ['没有 --out：只渲染，不落盘'] })
  process.exit(0)
}

fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, markdown + NL)
emit({ ok: true, written: true, out: outFile, counts: { accepted: accepted.length, dropped: dropped.length }, dropped, notes: [] })