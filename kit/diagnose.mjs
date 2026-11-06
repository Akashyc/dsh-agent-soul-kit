#!/usr/bin/env node
// 诊断渲染：把 probe 的事实 + 补丁库的状态，投影成两份东西。
//   node kit/diagnose.mjs --run <runs/时间目录>    # 目录里放 probe 的 *.json
// 输入的 JSON 是唯一事实来源。这里不读磁盘上的目标代码，也不下新结论。
// 输出：Markdown（给人看，固定三段式）+ diagnose.json（给补丁引擎/下次比对）。
import path from 'node:path'
import { NL, emit, exists, kitVersion, parseArgs, readJson } from '../probe/lib/common.mjs'

const opt = parseArgs(process.argv.slice(2))
const runDir = opt['--run'] ? path.resolve(opt['--run']) : null

if (!runDir) {
  emit({ readable: false, notes: ['没有给 --run：不知道该渲染哪一次的证据'] })
  process.exit(0)
}
if (!exists(runDir)) {
  emit({ readable: false, notes: ['目录不存在：' + runDir] })
  process.exit(0)
}

/** 报文只留第一行，且限长：多行栈会把 Markdown 标题冲垮，全文在 logs.json 里。 */
function brief(text) {
  const first = String(text == null ? '' : text).split(NL)[0].trim()
  return first.length > 140 ? first.slice(0, 140) + '…' : first
}

/** 读一份证据；缺失时返回 null 并留下原因，不拿空对象冒充「检查过」。 */
function load(name) {
  const parsed = readJson(path.join(runDir, name))
  return { value: parsed.value, error: parsed.value === null ? parsed.error : null }
}

const upstream = load('upstream.json')
const local = load('local.json')
const logs = load('logs.json')
const diff = load('diff.json')
const patchPlan = load('patch-plan.json')

const notes = []
for (const [name, holder] of [['upstream.json', upstream], ['local.json', local], ['logs.json', logs]]) {
  if (holder.value === null) notes.push('缺 ' + name + '：相关字段判不了，会写「未判定」')
}

// ---------- 归类：只按输入事实分，不新增判断 ----------
const happening = []   // 一、正在发生
const fixedUpstream = [] // 二、作者已修
const discovered = []  // 三、新发现

// 1. 日志里的错误 → 正在发生（有已生效补丁覆盖的除外，那些算静默项）
const logEntries = logs.value && Array.isArray(logs.value.entries) ? logs.value.entries : []
const patchedSignatures = new Set()
if (patchPlan.value && Array.isArray(patchPlan.value.steps)) {
  for (const step of patchPlan.value.steps) {
    if (step.action === 'apply' && Array.isArray(step.targets)) {
      for (const target of step.targets) patchedSignatures.add(target)
    }
  }
}

// 范围来自上游清单，不是常量表：清单里没有的包（含 DSH 宿主）不算本架构的零件。
const knownParts = new Set()
if (upstream.value && Array.isArray(upstream.value.parts)) {
  for (const part of upstream.value.parts) {
    if (part && part.name) knownParts.add(part.name)
  }
}
const outOfScope = []

const seen = new Set()
for (const entry of logEntries) {
  const pkg = entry.pkg || '未认领'
  const key = pkg + '|' + (entry.message || '')
  if (seen.has(key)) continue
  seen.add(key)
  const evidence = [entry.file || '日志', entry.at || '时间未知', brief(entry.message) || '报文缺失'].filter(Boolean).join('，')
  if (entry.pkg !== null && knownParts.size && !knownParts.has(entry.pkg)) {
    outOfScope.push(entry.pkg)
    continue
  }
  if (entry.pkg === null) {
    discovered.push({
      id: 'unclaimed',
      title: '日志里有认不出归属的错误',
      lines: ['- 证据：' + evidence, '- 不修：影响未知，需要先认领到具体包', '- 改法：未确认，不猜'],
    })
    continue
  }
  happening.push({
    id: pkg,
    title: pkg + ' — ' + (brief(entry.message) || '运行期报错'),
    lines: [
      '- 证据：' + evidence,
      '- 不修：这个包在当前状态下出错；具体影响要看它在装配里的位置',
      '- 改法：待核对（需要读已装文件定位）',
    ],
  })
}

// 2. 补丁退役 / 上游文件变了 + 症状消失 → 作者已修
if (patchPlan.value && Array.isArray(patchPlan.value.steps)) {
  for (const step of patchPlan.value.steps) {
    if (step.action === 'stale') {
      discovered.push({
        id: step.id,
        title: step.id + ' — 补丁打不上了',
        lines: ['- 证据：' + (step.reason || '哈希对不上'), '- 不修：这条修复暂时失效，症状可能重现', '- 改法：待核对（上游可能已经改了同一处）'],
      })
    }
    if (step.action === 'blocked') {
      discovered.push({ id: step.id, title: step.id + ' — 补丁无法应用', lines: ['- 证据：' + (step.reason || '原因缺失'), '- 改法：待核对'] })
    }
  }
}

// 3. 上游结构变了但本机没跟 → 新发现
if (diff.value) {
  const added = Array.isArray(diff.value.parts && diff.value.parts.added) ? diff.value.parts.added : []
  const renamed = Array.isArray(diff.value.parts && diff.value.parts.renamed) ? diff.value.parts.renamed : []
  if (added.length) {
    discovered.push({
      id: 'upstream-added',
      title: '作者新增了 ' + added.length + ' 个零件',
      lines: ['- 证据：' + added.map((item) => item.dir).join(', '), '- 不修：本机没有这些零件，对应功能不存在', '- 改法：走更新流程决定装不装'],
    })
  }
  if (renamed.length) {
    discovered.push({
      id: 'upstream-renamed',
      title: '作者改了 ' + renamed.length + ' 个零件的目录名',
      lines: ['- 证据：' + renamed.map((item) => item.from + ' → ' + item.to).join(', '), '- 不修：引用还指着旧名字时，插件不会加载', '- 改法：跑 references 查旧名字的命中，逐个改'],
    })
  }
}

// ---------- 渲染 ----------
function headline() {
  const sha = upstream.value && upstream.value.sha ? String(upstream.value.sha).slice(0, 7) : '上游未判定'
  const version = kitVersion() || '未知'
  const parts = [];
  const logFiles = logs.value && typeof logs.value.filesRead === 'number' ? logs.value.filesRead : null
  const readable = logs.value && logs.value.readable === true
  parts.push(logFiles === null ? '日志未判定' : '读了 ' + logFiles + ' 份日志')
  if (local.value && Array.isArray(local.value.installedPackages)) parts.push('扫了 ' + local.value.installedPackages.length + ' 个零件')
  else parts.push('零件未判定')
  if (outOfScope.length) parts.push('另有 ' + outOfScope.length + ' 条 error 不在上游零件清单里，未计入')
  if (!readable && logFiles === null) parts.push('日志目录不可读，现象部分整体未判定')
  return '**概览**：' + sha + ' · kit ' + version + ' · 要修 ' + happening.length + ' · 待退役 ' + fixedUpstream.length + ' · 新发现 ' + discovered.length + ' · 范围：' + parts.join('，')
}

const CN = ['一', '二', '三']
const out = [headline(), '']
const sections = []
if (happening.length) sections.push({ title: '正在发生', items: happening })
if (fixedUpstream.length) sections.push({ title: '作者已修 → 改用作者的', items: fixedUpstream })
if (discovered.length) sections.push({ title: '新发现', items: discovered })

sections.forEach((section, index) => {
  out.push('### ' + CN[index] + '、' + section.title)
  out.push('')
  for (const item of section.items) {
    out.push('**' + item.title + '**')
    for (const line of item.lines) out.push(line)
    out.push('')
  }
})

if (!sections.length) {
  out.push(noFindings())
}

/** 没发现时怎么写：说清读到了什么，不把「没匹配到」写成「一切正常」。 */
function noFindings() {
  if (!logs.value || logs.value.readable !== true) {
    return '### 未判定' + NL + NL + '没有可读日志，这次不构成任何结论。' + NL
  }
  return '### 未判定' + NL + NL + '在已读的 ' + (logs.value.filesRead || 0) + ' 份日志里没有匹配到 error，'
    + '本机零件与上游结构也未发现差异。' + NL + NL
    + '这只代表读取范围内没有匹配项，不等于没有问题。' + NL
}

const markdown = out.join(NL)
emit({
  runDir,
  readable: true,
  markdown,
  counts: { happening: happening.length, retired: fixedUpstream.length, discovered: discovered.length, outOfScope: outOfScope.length },
  outOfScope: Array.from(new Set(outOfScope)),
  verdict: sections.length ? 'has-findings' : 'undetermined',
  notes,
})