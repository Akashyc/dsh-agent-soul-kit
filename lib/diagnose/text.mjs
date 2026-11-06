import { judge, hasLocalMarker } from './detect.mjs'
import { scanFailures } from './evidence.mjs'
import { scanStatic } from './scan.mjs'
import { KIT_VERSION } from '../core/version.mjs'

const BT = '`'
const NUMS = ['一', '二', '三']
const oneLine = (value) => String(value || '').replace(/\s*\n\s*/g, ' ').trim()
const verifyText = (entry) => Array.isArray(entry.verify) ? entry.verify.join('；') : entry.verify

/** 固定交付格式见 AGENT-DIAGNOSE.md：概览与非空三段，不扩写空章节。 */
export function renderText({ context, author, issues, scan = scanFailures(context.logs, context.home) }) {
  const { failures, coverage } = scan
  const checked = Object.values(issues.issues).map((entry) => ({ entry, verdict: judge(entry, context, author) }))
  const live = [], review = [], claimed = new Set()
  for (const { entry, verdict } of checked) {
    const evidence = (failures.get(entry.pkg || '') || []).filter((row) => entry.sig && safeTest(entry.sig, row.detail))
    for (const row of evidence) claimed.add(row)
    if (verdict.state === 'open' && evidence.length) live.push({ entry, evidence })
    if (['unknown', 'local-changed'].includes(verdict.state)) review.push({ entry, verdict, evidence })
  }
  const fresh = [...failures.values()].flat().filter((evidence) => !claimed.has(evidence))
  // 静态发现只让位给本轮仍在报告里的条目；已退役或已打补丁的旧条目不能压掉同包的新问题
  const managed = new Set([...live, ...review].map(({ entry }) => entry.pkg).filter(Boolean))
  const statScan = scanStatic(context)
  const statCoverage = statScan.coverage
  const statRaw = statScan.findings.filter((finding) => !managed.has(finding.pkg))
  // 同一个包的多处命中合并成一条，否则 statusbar 三条、heartbeat 三条会把段落撑满
  const stat = [...statRaw.reduce((map, f) => {
    const cur = map.get(f.pkg) || { pkg: f.pkg, checks: [], hits: [] }
    if (!cur.checks.includes(f.checkId)) cur.checks.push(f.checkId)
    cur.hits.push(f)
    map.set(f.pkg, cur)
    return map
  }, new Map()).values()]
  const retired = checked.filter(({ verdict }) => verdict.state === 'retired')
  const pending = retired.filter(({ entry }) => hasLocalMarker(entry, context)).length
  const sections = []
  if (live.length) {
    const body = live.map(({ entry, evidence }) => [
      '**' + BT + entry.id + BT + '** — ' + oneLine(entry.title || entry.id),
      '- 证据：' + evidence.map(evidenceLine).join('；'),
      '- 不修：' + oneLine(entry.impact || '影响待核对，不猜测'),
      '- 改法：' + (entry.file && entry.line ? BT + entry.file + ':' + entry.line + BT + ' ' : '') + oneLine(entry.hint || entry.solution || '先读代码确定修法'),
      ...(verifyText(entry) ? ['- 核实：' + oneLine(verifyText(entry))] : []),
    ].join('\n')).join('\n\n')
    sections.push({ title: '正在发生（' + live.length + '）', body })
  }
  if (retired.length) {
    const rows = ['| 条目 | 作者怎么修的 | 本地还剩什么 |', '|---|---|---|']
    const cell = (text) => oneLine(text).replace(/\|/g, '\\|')
    for (const { entry, verdict } of retired) {
      const left = hasLocalMarker(entry, context) ? '我们的旧补丁还在，撤掉后改用作者原文' : verdict.localProblem ? '本机仍有旧问题，需按作者更新' : '已退役，无本地补丁要弃用'
      rows.push('| ' + BT + entry.id + BT + ' | ' + cell(entry.authorFixed) + ' | ' + left + ' |')
    }
    sections.push({ title: '作者已修 → 改用作者的（' + retired.length + '）', body: rows.join('\n') })
  }
  if (fresh.length || review.length || stat.length) {
    const rows = fresh.map((evidence) => [
      '**' + BT + evidence.pkg + BT + '** — 加载失败，清单里没有对应条目',
      '- 证据：' + evidenceLine(evidence),
      '- 不修：该插件加载失败，对应功能不可用；具体影响待核对',
      '- 改法：先读已装代码与作者源码确认原因，不凭日志猜补丁',
      '- 核实：处理后确认对应加载错误消失，并实际使用该插件',
    ].join('\n'))
    for (const group of stat) rows.push([
      '**' + BT + group.pkg + BT + '** — 静态检查 ' + group.checks.join(' / ') + ' 命中 ' + group.hits.length + ' 处（清单里没有对应条目）',
      '- 证据：' + group.hits.map((f) => BT + f.file + (f.line ? ':' + f.line : '') + BT + ' ' + BT + oneLine(f.snippet) + BT).join('；'),
      '- 不修：' + group.hits.map((f) => oneLine(f.detail)).join('；'),
      '- 改法：读各处代码确认后处理；属作者侧问题的按 AGENT-DIAGNOSE 走报告流程，不就地改已装文件',
    ].join('\n'))
    for (const { entry, verdict, evidence } of review) rows.push([
      '**' + BT + entry.id + BT + '** — ' + oneLine(entry.title || entry.id) + '（待核对：' + verdict.state + '）',
      '- 证据：' + (evidence.length ? evidence.map(evidenceLine).join('；') : '文件核对：' + oneLine(verdict.note) + '；没有匹配的加载失败记录'),
      '- 不修：当前影响未确认，不据此认定运行故障或已经修好',
      '- 改法：读对应文件核对；local-changed 先说明本地差异，不覆盖',
      ...(verifyText(entry) ? ['- 核实：' + oneLine(verifyText(entry))] : []),
    ].join('\n'))
    sections.push({ title: '新发现（' + (fresh.length + review.length + stat.length) + '）', body: rows.join('\n\n') })
  }
  const readable = coverage.status === 'ready' || coverage.status === 'partial'
  const scope = !readable
    ? '无可读日志，未完成加载诊断'
    : `已读取 ${coverage.files.length} 份 JSONL 日志（只看插件加载失败）；零件 ${statCoverage.packages} 个、preset skills ${statCoverage.skills} 个做检测层检查（D1.1/D1.2/D2.1/D4.1/D5.1/D5.2/D5.6）` + (coverage.status === 'partial' ? '；部分记录未读或未识别，结果不完整' : '')
  const blocks = ['**概览**：' + BT + String(author.sha).slice(0, 7) + BT + ' · kit ' + KIT_VERSION + ' · 要修 ' + (readable ? live.length : '未判定') + ' · 待退役 ' + pending + ' · 新发现 ' + (readable ? fresh.length + review.length + stat.length : review.length || '未判定') + ' · 范围：' + scope]
  sections.forEach((section, index) => blocks.push('### ' + NUMS[index] + '、' + section.title + '\n\n' + section.body))
  return blocks.join('\n\n')
}

function safeTest(pattern, text) {
  try { return new RegExp(String(pattern)).test(String(text)) } catch { return false }
}

/** 证据行：日志文件、本地日期与时间、启动次数、报错和缺失文件。 */
function evidenceLine(evidence) {
  const when = evidence.at ? evidence.at + (evidence.boots > 1 ? `（${evidence.boots} 次启动均报）` : '') + ' 报 ' : ''
  const miss = evidence.missing ? '，缺 ' + BT + evidence.missing.path + BT + (evidence.missing.note ? '（' + evidence.missing.note + '）' : '') : ''
  return BT + evidence.file + BT + '，' + when + BT + oneLine(evidence.message) + BT + miss
}
