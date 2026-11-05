// 给 agent 的弹窗（5.4）：安装问答由脚本排好，agent 照原样弹，不增删、不改写、不合并，每次一样。
// 弹窗的限制：一个弹窗最多 4 道题，每道题 2–4 个选项、标题不超过 12 个字；要填写的内容走选项下面的「其他」输入框。
// 每道题除了 question / header / multiSelect / options（弹窗只用这几个，选项只用 label 和 description）以外，
// 还带 id 和选项的 value：用来把回答写回 answers.json。

const OTHER = '在下面「其他」里输入'
const HEADERS = { name: '名字', user: '称呼', userNote: '补充说明', purpose: '用途', hardLines: '硬线', customHardLines: '自定硬线', persona: '说话风格',
  multiSession: '多会话', windowSize: '上下文窗口', presets: 'preset', defaultPreset: '默认 preset', parts: '零件', setupName: '方案名' }

/** 超过 4 个选项拆成几道题，每道尽量一样多（不会拆出只剩 1 个选项的题）。 */
export function chunk(list) {
  const n = Math.ceil(list.length / 4), size = Math.ceil(list.length / n)
  return Array.from({ length: n }, (_, i) => list.slice(i * size, (i + 1) * size))
}
const mark = (o, rec) => (rec ? { ...o, label: `${o.label}（推荐）` } : o)
const recFirst = (opts) => [...opts.filter((o) => o.label.endsWith('（推荐）')), ...opts.filter((o) => !o.label.endsWith('（推荐）'))]
const dependsOn = (q) => q.optionsFrom || (q.askIf && q.askIf.split(' ')[0]) || null

/** 一道问答题 → 一道或几道弹窗题。 */
function popupQuestions(q) {
  const head = HEADERS[q.id] || q.id, base = { id: q.id, ...(q.askIf ? { askIf: q.askIf } : {}) }
  if (q.type === 'bool') return [{ ...base, header: head, question: q.ask, multiSelect: false,
    options: recFirst([mark({ label: '是', description: q.hint || '选是', value: true }, q.default === true), mark({ label: '否', description: '选否', value: false }, q.default === false)]) }]
  if (q.type === 'multi') {
    const defs = Array.isArray(q.default) ? q.default : []
    const opts = q.options.map((o) => mark({ label: o.label || o.value, description: o.desc || o.label || o.value, value: o.value, group: o.group }, defs.includes(o.value)))
    const groups = q.id === 'parts' ? [...new Set(opts.map((o) => o.group))].map((g) => [g, opts.filter((o) => o.group === g)]) : [[null, opts]]
    const out = []
    for (const [g, list] of groups) {
      const parts = list.length > 1 ? chunk(list) : [list]
      parts.forEach((p, i) => out.push({ ...base, header: `${g || head}${parts.length > 1 ? ` ${i + 1}/${parts.length}` : ''}`,
        question: `${q.ask}${g ? `（${g}）` : ''}${parts.length > 1 ? `（第 ${i + 1} 组，共 ${parts.length} 组）` : ''}`, multiSelect: true, options: p.map(({ group, ...o }) => o) }))
    }
    return out
  }
  if (q.optionsFrom) return [{ ...base, header: head, question: q.ask, multiSelect: false, optionsFrom: q.optionsFrom,
    rule: `选项是上一步选中的 ${q.optionsFrom}，按问题清单里的顺序排；默认值 ${q.default} 标「（推荐）」放第一个；超过 4 个时只列前 3 个，其余让用户在「其他」里写 id`, options: [] }]
  // 填写题：内容在「其他」输入框里写
  const example = (q.hint || '').match(/例：([^、，。/（）\s]+)/)?.[1]
  const empty = q.default === undefined || q.default === '' || (Array.isArray(q.default) && !q.default.length)
  const other = { label: OTHER, description: q.hint || '自己填', value: null }
  const keep = q.type === 'pairs' ? ['不加', '只用上面选的硬线', []] : q.type === 'voice' ? ['不设', '正常、专业的口吻', ''] : q.defaultNote ? [`用默认：${q.defaultNote}`, '不用填', ''] : ['留空', '不填', '']
  const options = !empty ? [mark({ label: `用默认：${q.default}`, description: '不用改', value: q.default }, true), other]
    : q.required ? [other, { label: `用示例：${example || '默认'}`, description: '直接用这个', value: example || '' }]
    : [mark({ label: keep[0], description: keep[1], value: keep[2] }, true), other]
  return [{ ...base, header: head, question: q.ask, multiSelect: false, options }]
}

/**
 * 问答 → 弹窗：同一组的题放一个弹窗；满 4 道、或者这道题要看同一弹窗里另一道的回答（askIf / optionsFrom）时另起一个。
 * @param questions 问题清单（lib/setup/setup.mjs 的 QUESTIONS，选项已按这台电脑填好）
 */
export function questionPopups(questions) {
  const popups = []
  let cur = null
  for (const q of questions) {
    for (const pq of popupQuestions(q)) {
      const dep = dependsOn(q)
      if (!cur || cur.group !== q.group || cur.questions.length >= 4 || (dep && cur.questions.some((x) => x.id === dep))) popups.push(cur = { group: q.group, questions: [] })
      cur.questions.push(pq)
    }
  }
  return popups.map((p, i) => ({ step: i + 1, of: popups.length, title: p.group, questions: p.questions }))
}
