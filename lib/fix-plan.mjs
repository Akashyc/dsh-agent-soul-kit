// 修复报告与修复计划（5.1）：修复不在终端里逐条问，交给 agent 对照本机实际核对后再定。
//   1. install.mjs --fix --report [目录]：只读，DSH 开着也能跑。写出 fix-report.json（给 agent）、fix-report.md（给人）
//      和 fix-plan.json（计划模板）。报告里每条有作者原文的判定、脚本查到的本机事实、不修会怎样、怎么核对（lib/fixes.mjs 的 CHECKS）。
//   2. agent 照每条的核对方法查本机，把结论填进 fix-plan.json：hit（会不会撞上）、decision（修 / 不修 / 这次先不动）、evidence（证据）。
//   3. 用户看过 agent 整理的结论、确认后，退出 DSH，install.mjs --fix --plan <fix-plan.json>。
//      这里校验：计划和报告是同一次出的、每条要选的都选了、选修或不修都有证据、核对结论和选择对不上要写理由；
//      install.mjs 再核对报告出完以后本机没变（指纹），才照计划修，证据记进安装记录。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const DECISIONS = { fix: '修', skip: '不修', later: '这次先不动' }
export const HITS = { yes: '会撞上', no: '不会撞上', unknown: '判断不了' }
export const REPORT_KIND = 'dsh-soul-fix-report'
export const PLAN_KIND = 'dsh-soul-fix-plan'

/** 这一条这次会不会改本机、要用户拿主意：问题还在要打上 / 换现行写法，或者作者已修而本机还带着 kit 修复。 */
export const needsDecision = (row) => ['apply', 'refresh', 'revert'].includes(row.action)
/** 已经修好的、以前选过不修的：不再要求选；情况变了想改，可以在计划里加上这一条（会让零件加载不了的不能改成不修） */
export const canRevisit = (row, fix) => !fix.blocking && (row.status === 'skipped' || (row.status === 'kit' && row.action === 'keep'))
/** 能选哪些：作者已修的只能换回作者原文或先不动；会让零件加载不了的不能选不修。 */
export const choicesFor = (row, fix) => (row.status === 'author' || fix.blocking ? ['fix', 'later'] : ['fix', 'skip', 'later'])
/** 报告指纹：已装文件、配置、跳过清单这些输入的哈希，用来认出「报告出完以后本机又变了」。 */
export const fingerprint = (input) => crypto.createHash('sha1').update(JSON.stringify(input)).digest('hex')

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')) } catch { return null } }
const filled = (list) => Array.isArray(list) && list.some((s) => typeof s === 'string' && s.trim())

/** 计划模板：每条要选的留空，agent 核对后填。 */
export function planTemplate(report) {
  return {
    kind: PLAN_KIND, format: 1, report: 'fix-report.json', fingerprint: report.fingerprint,
    _说明: 'agent 照 fix-report.md 里每条的核对方法查完本机再填：hit 填 yes / no / unknown（会不会撞上），decision 填 fix / skip / later（修 / 不修 / 这次先不动），evidence 写查到的证据；核对结论和选择对不上（不会撞上却修、会撞上却不修）在 reason 里写为什么。用户确认后：install.mjs --fix --plan <本文件>',
    items: report.items.filter((x) => x.decide).map((x) => ({ id: x.id, title: x.title, choices: x.choices, hit: '', decision: '', evidence: [], reason: '' })),
  }
}

/**
 * 读修复计划并校验（不碰本机）。报告在计划同目录（或 plan.report 指的路径）。
 * @param file fix-plan.json 的路径；savedSkip 安装记录里原来的跳过清单
 * @returns { decisions, only, skip, warnings, fingerprint }：only 这次要处理的（修和不修），skip 处理后的跳过清单
 */
export function loadPlan(file, savedSkip = []) {
  const plan = readJson(file)
  if (!plan || plan.kind !== PLAN_KIND || plan.format !== 1) throw new Error(`${file} 不是修复计划（要由 --fix --report 生成，kind 是 ${PLAN_KIND}）`)
  const reportFile = path.resolve(path.dirname(file), plan.report || 'fix-report.json')
  const report = readJson(reportFile)
  if (!report || report.kind !== REPORT_KIND || !Array.isArray(report.items)) throw new Error(`找不到这份计划对应的修复报告：${reportFile}`)
  if (report.fingerprint !== plan.fingerprint) throw new Error('计划和报告不是同一次出的（指纹对不上）：用同一个目录里的 fix-report.json 和 fix-plan.json')
  const need = report.items.filter((x) => x.decide), optional = report.items.filter((x) => x.revisit)
  const byId = new Map(), errors = []
  for (const d of Array.isArray(plan.items) ? plan.items : []) {
    if (!d || !d.id) { errors.push('items 里有一条没写 id'); continue }
    if (byId.has(d.id)) errors.push(`${d.id}：写了两遍`)
    byId.set(d.id, d)
  }
  for (const id of byId.keys()) if (![...need, ...optional].some((x) => x.id === id)) errors.push(`${id}：这次不用选（报告里它是「${report.items.find((x) => x.id === id)?.statusText || '不认识的条目'}」），从计划里删掉`)
  for (const item of [...need, ...optional]) {
    const d = byId.get(item.id)
    if (!d && item.revisit) continue
    if (!d) { errors.push(`${item.id}：计划里没有这一条；每条要选的都得写明，这次不动就填 later`); continue }
    if (!DECISIONS[d.decision]) { errors.push(`${item.id}：decision 要填 fix / skip / later`); continue }
    if (!item.choices.includes(d.decision)) {
      const why = item.choices.includes('skip') ? '' : item.status === 'author' ? '（作者已修，不修就是先不动）' : '（不修零件会加载不了）'
      errors.push(`${item.id}：只能选 ${item.choices.join(' / ')}${why}`); continue
    }
    if (d.decision === 'later') continue
    if (!HITS[d.hit]) errors.push(`${item.id}：hit 要填 yes / no / unknown（按核对方法查到的结论）`)
    if (!filled(d.evidence)) errors.push(`${item.id}：选了「${DECISIONS[d.decision]}」，evidence 要写核对到的证据`)
    const odd = (d.decision === 'fix' && d.hit === 'no') || (d.decision === 'skip' && d.hit === 'yes')
    if (odd && !String(d.reason || '').trim()) errors.push(`${item.id}：核对结论是「${HITS[d.hit]}」却选了「${DECISIONS[d.decision]}」，reason 要写为什么`)
  }
  if (errors.length) throw new Error(`修复计划有 ${errors.length} 处要改：\n      ${errors.join('\n      ')}`)
  const chosen = [...need, ...optional.filter((x) => byId.has(x.id))]
  const pick = (k) => chosen.filter((x) => byId.get(x.id).decision === k).map((x) => x.id)
  const fix = pick('fix'), skip = pick('skip')
  const warnings = need.filter((x) => x.blocking && x.status === 'kit' && byId.get(x.id).decision === 'later').map((x) => `${x.id}：这次先不动，但它会让零件加载不了；处理之前先别启动 DSH`)
  const keep = (d) => ({ hit: d.hit || null, decision: d.decision, evidence: Array.isArray(d.evidence) ? d.evidence.filter((s) => typeof s === 'string' && s.trim()) : [], reason: String(d.reason || '').trim() || null })
  return {
    decisions: Object.fromEntries(chosen.map((x) => [x.id, keep(byId.get(x.id))])),
    only: [...fix, ...skip],
    skip: [...new Set([...savedSkip.filter((id) => !fix.includes(id)), ...skip])],
    warnings, fingerprint: report.fingerprint,
  }
}
