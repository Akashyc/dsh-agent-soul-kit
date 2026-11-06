// 弹窗形状：一个弹窗最多 4 道题，每道题 2–4 个选项，标题不超过 12 个字；
// 选项超过 4 个就拆成几道（同一道题的续题），自由填写走选项下面的「其他」。
// 这里是「怎么问」的唯一实现 —— playbook 只引用，不另写一套。

/** 超过 4 个选项，拆成几道题，每道尽量一样多（不会拆出只剩 1 个选项的题）。 */
export function chunk(list, per = 4) {
  if (list.length <= per) return [list]
  // 均衡切：21 个分 6 片是 4/4/4/3/3/3。按固定 size 切会切成 4/4/4/4/4/1，最后一片只剩一个。
  const n = Math.ceil(list.length / per)
  const base = Math.floor(list.length / n)
  const rem = list.length % n
  const out = []
  let at = 0
  for (let i = 0; i < n; i++) {
    const size = base + (i < rem ? 1 : 0)
    out.push(list.slice(at, at + size))
    at += size
  }
  return out
}

const recFirst = (opts) => [...opts.filter((o) => o.recommended), ...opts.filter((o) => !o.recommended)]

/** 标题最多 12 个字：超出就截断，不缩成看不懂的缩写。 */
export const header = (text) => (text.length <= 12 ? text : text.slice(0, 12))

/**
 * 题库 → 弹窗。同一组放一个弹窗；满 4 道、或换组时另起。
 * 单选超过 4 个选项时不拆（拆了就不是单选）：只列前 3 个，其余让用户在「其他」里写。
 */
export function questionPopups(questions) {
  const popups = []
  let cur = null
  for (const q of questions) {
    const parts = []
    if (q.type === 'multi') {
      const opts = recFirst(q.options)
      const groups = q.groupBy ? [...new Set(opts.map((o) => o.groupBy))] : [null]
      for (const g of groups) {
        const list = opts.filter((o) => (g === null ? true : o.groupBy === g))
        const chunks = chunk(list)
        chunks.forEach((c, i) => parts.push({
          id: chunks.length > 1 ? q.id + '#' + (i + 1) : q.id,
          header: header(chunks.length > 1 ? (g || q.header) + ' ' + (i + 1) + '/' + chunks.length : g || q.header),
          question: q.ask + (g ? '（' + g + '）' : '') + (chunks.length > 1 ? '（第 ' + (i + 1) + ' 组）' : ''),
          multiSelect: true,
          options: c.map((o) => ({ label: o.label, description: o.description, value: o.value })),
        }))
      }
    } else if (q.type === 'choice') {
      const opts = recFirst(q.options)
      // 单选不按 4 个硬切：默认 preset 这类必须全列出来才点得到。超过 8 个才收成 3 个 + 「其他」。
      const shown = opts.length > 8 ? opts.slice(0, 3) : opts
      parts.push({
        id: q.id,
        header: header(q.header),
        question: q.ask,
        multiSelect: false,
        options: [
          ...shown.map((o) => ({ label: o.label, description: o.description, value: o.value })),
          ...(opts.length > 8 ? [{ label: '在下面「其他」里写', description: '列不下：其余可选 ' + opts.slice(3).map((o) => o.value).join(' / '), value: null }] : []),
        ],
        allowOther: true,
      })
    } else {
      // bool / text：都走「推荐 + 其他」，不额外发明控件
      parts.push({
        id: q.id,
        header: header(q.header),
        question: q.ask,
        multiSelect: false,
        options: q.type === 'bool'
          ? [{ label: '是', description: q.hint || '选是', value: true, recommended: q.default === true }, { label: '否', description: '选否', value: false, recommended: q.default === false }]
          : [{ label: q.default ? '建议：' + String(q.default).split(String.fromCharCode(10))[0].slice(0, 24) : '留空', description: q.hint || '不填就空着', value: q.default === undefined ? null : q.default }, { label: '在下面「其他」里写', description: '自己填，多行也可以', value: null }],
        allowOther: true,
      })
    }
    for (const p of parts) {
      if (!cur || cur.group !== q.group || cur.questions.length >= 4) popups.push(cur = { group: q.group, questions: [] })
      cur.questions.push(p)
    }
  }
  return popups.map((p, i) => ({ step: i + 1, of: popups.length, title: p.group, questions: p.questions }))
}

export default { chunk, header, questionPopups }
