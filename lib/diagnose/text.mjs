import { judge } from './detect.mjs'
import { allFailures } from './evidence.mjs'

const BT = '`'
const NUMS = ['一', '二', '三', '四', '五', '六']

/**
 * 输出 Markdown：只写有证据的，空段整段消失，序号按实际出现的段顺排。
 * 正在发生 = 清单里的条目判定为 open，且日志里对得上它的证据签名 sig。
 * 作者已修 = 判定 retired 的。
 * 新发现   = 日志里有加载失败，但清单里没有任何条目认得它。
 */
export function renderText({ context, author, issues, install, at }) {
  const failures = allFailures(context.logs, context.home)
  const entries = Object.values(issues.issues)

  const live = []
  const claimed = new Set()
  for (const entry of entries) {
    const candidates = failures.get(entry.pkg || '') || []
    for (const evidence of candidates) {
      const hit = entry.sig && safeTest(entry.sig, evidence.detail)
      if (!hit) continue
      claimed.add(evidence)
      const verdict = judge(entry, context, author)
      if (verdict.state === 'open') live.push({ entry, verdict, evidence })
    }
  }
  const fresh = [...failures.values()].flat().filter((evidence) => !claimed.has(evidence))

  const sections = []

  if (live.length) {
    const lines = live.map(({ entry, verdict, evidence }) => {
      const where = entry.file && entry.line ? BT + entry.file + ':' + entry.line + BT + ' ' : ''
      return [
        '**' + BT + entry.id + BT + '** — ' + (entry.title || entry.id),
        '- 证据：' + evidenceLine(evidence),
        '- 不修：' + (entry.impact || '-'),
        '- 改法：' + where + (entry.solution || '-'),
      ].join('\n')
    })
    sections.push({ title: '正在发生（' + live.length + '）', body: lines.join('\n\n') })
  }

  const retired = entries.filter((entry) => judge(entry, context, author).state === 'retired')
  if (retired.length) {
    const rows = ['| 条目 | 作者怎么修的 | 本地还剩什么 |', '|---|---|---|']
    for (const entry of retired) {
      const left = entry.cleanup === 'pending' ? '我们的旧补丁还在，撤掉后改用作者原文' : '已退役，无本地补丁要弃用'
      rows.push('| ' + BT + entry.id + BT + ' | ' + (entry.authorFixed ? String(entry.authorFixed).replace(/^\/|\/$/g, '').slice(0, 60) : '作者源码里已无该锚点') + ' | ' + left + ' |')
    }
    sections.push({ title: '作者已修 → 改用作者的（' + retired.length + '）', body: rows.join('\n') })
  }

  if (fresh.length) {
    const lines = fresh.map((evidence) => [
      '**' + BT + evidence.pkg + BT + '** — 加载失败，清单里没有对应条目',
      '- 证据：' + evidenceLine(evidence),
      '- 处理：读代码判断是什么问题，确认后补进本机清单',
    ].join('\n'))
    sections.push({ title: '新发现（' + fresh.length + '）', body: lines.join('\n\n') })
  }

  const blocks = []
  blocks.push('**概览**：' + BT + String(author.sha).slice(0, 7) + BT + ' · kit ' + (install?.kitVersion || '-') + ' · 要修 ' + live.length + ' · 待退役 ' + retired.filter((entry) => entry.cleanup === 'pending').length + ' · 新发现 ' + fresh.length + ' · 范围：最近 5 份日志中的插件加载失败；不代表全部运行故障')
  sections.forEach((section, index) => {
    blocks.push('### ' + (NUMS[index] || String(index + 1)) + '、' + section.title + '\n\n' + section.body)
  })
  return blocks.join('\n\n')
}

function safeTest(pattern, text) {
  try { return new RegExp(String(pattern)).test(String(text)) } catch { return false }
}

/** 证据行：日志文件、报的时刻（几次启动）、什么错、缺哪个文件（在不在）。 */
function evidenceLine(evidence) {
  const times = evidence.times || []
  const when = !times.length ? ''
    : evidence.boots > 1
      ? times.join('、') + ' ' + evidence.boots + ' 次启动均报 '
      : times[0] + ' 起报 '
  const miss = evidence.missing
    ? '，缺 ' + BT + evidence.missing.path + BT + (evidence.missing.note ? '（' + evidence.missing.note + '）' : '')
    : ''
  return BT + evidence.file + BT + '，' + when + BT + evidence.message + BT + miss
}