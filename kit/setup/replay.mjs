// 答案的保存与重放。三件事：
//   1. 落盘：answers.json 是唯一依据，写它才算「答过」；中途中断不丢已答。
//   2. 指纹：给 meta.json 用的内容哈希 —— 同样的答案必须给同样的哈希，否则「该不该重问」判不出来。
//   3. 重放：拿上次的答案跟这次上游比，只把「变了的题」列出来问；没变的一道都不重问。
//
// 判断只用数据：上游的零件集合 / 必装集合 / preset 列表，加上上次的 install 与 declined 名单。
// 没有「大概」「应该」——判不出来就整组重问，并在 notes 里说为什么。

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

/** 内容哈希：JSON 键排序后算，避免键序不同导致「同一份答案两个指纹」。 */
export function fingerprint(value) {
  const stable = JSON.stringify(sortKeys(value))
  return crypto.createHash('sha256').update(stable).digest('hex').slice(0, 32)
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (!value || typeof value !== 'object') return value
  const out = {}
  for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key])
  return out
}

/** 读上次的答案；读不出来就说读不出来，不当成「没有答案」。 */
export function loadAnswers(file) {
  try {
    return { value: JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')), error: null }
  } catch (error) {
    return { value: null, error: error.message }
  }
}

/**
 * 写答案。asked 合并：旧题保留（同一 id 以新答案为准），新题追加。
 * @returns { file, sha, merged }
 */
export function saveAnswers(file, answers, previous) {
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })
  const oldAsked = previous && Array.isArray(previous.asked) ? previous.asked : []
  const newAsked = Array.isArray(answers.asked) ? answers.asked : []
  const byId = new Map()
  for (const item of oldAsked.concat(newAsked)) {
    if (item && item.id) byId.set(item.id, item)
  }
  const merged = { ...answers, asked: [...byId.values()] }
  fs.writeFileSync(file, JSON.stringify(merged, null, 2) + String.fromCharCode(10), 'utf8')
  return { file, sha: fingerprint(merged), merged }
}

/**
 * 上次答案 vs 这次上游：哪些必须重问。
 * @param prev 上次的 answers.json（v2）
 * @param upstream probe/upstream 的输出（parts 带 mustInstall；presetMeta；）
 * @returns { ok, questions, notes, newParts, goneParts, newMust, presetAdded, presetRemoved, defaultBroken }
 */
export function diffAnswers(prev, upstream) {
  const notes = []
  const questions = []
  const parts = Array.isArray(upstream && upstream.parts) ? upstream.parts : []
  const presets = Array.isArray(upstream && upstream.presetMeta) ? upstream.presetMeta : []
  const dirs = new Set(parts.map((p) => p.dir))
  const presetBlocks = new Set(presets.map((p) => p.block))

  if (!prev || typeof prev !== 'object' || !prev.parts) {
    notes.push('没有可用的上次答案（缺失或不是 v2）：整份重问')
    return { ok: false, questions: ['all'], notes, newParts: [], goneParts: [], newMust: [], presetAdded: [], presetRemoved: [], defaultBroken: false }
  }

  // ★ v1 的 parts 存的是包名（dsh-agent-echo），v2 存目录名（echo）。
  //   直接比会把同一份清单判成「全删 + 全增」20 条噪音 —— 那是版本不同，不是上游变了。
  if (prev.version !== 2) {
    notes.push('上次答案是 v' + prev.version + '（零件用包名，v2 用目录名）：整份重问，不拿旧清单比')
    return { ok: false, questions: ['all'], notes, newParts: [], goneParts: [], newMust: [], presetAdded: [], presetRemoved: [], defaultBroken: false }
  }

  const install = Array.isArray(prev.parts.install) ? prev.parts.install : []
  const declined = Array.isArray(prev.parts.declined) ? prev.parts.declined : []
  const known = new Set([...install, ...declined])

  // 上游新增的零件：上次既没装也没拒 → 必须问
  const newParts = parts.filter((p) => !known.has(p.dir)).map((p) => p.dir)
  // 上次装/拒的，上游已经删了 → 不用问，但要在报告里说
  const goneParts = [...known].filter((dir) => !dirs.has(dir))
  // 新变成全局必装的 → 告诉用户，但不问要不要装（必装不问）
  const newMust = parts.filter((p) => p.mustInstall && !known.has(p.dir)).map((p) => p.dir)

  const prevPresets = Array.isArray(prev.presets) ? prev.presets : []
  const presetAdded = [...presetBlocks].filter((b) => !prevPresets.includes(b))
  const presetRemoved = prevPresets.filter((b) => !presetBlocks.has(b))
  const defaultBroken = Boolean(prev.defaultPreset) && !presetBlocks.has(prev.defaultPreset)

  if (newParts.length || newMust.length) questions.push('parts')
  if (presetAdded.length || presetRemoved.length || defaultBroken || !prev.defaultPreset) questions.push('presets', 'defaultPreset')
  if (upstream && upstream.mustInstall && !upstream.mustInstall.found) notes.push('必装集合这次读不出来：零件那一组整组重问，不拿上次的结论顶')

  if (goneParts.length) notes.push('上游删了这些零件（本机目录要不要清，更新时单独问）：' + goneParts.join(', '))
  if (presetRemoved.length) notes.push('上游删了这些 preset：' + presetRemoved.join(', '))
  if (defaultBroken) notes.push('上次的默认 preset「' + prev.defaultPreset + '」上游已经没有了：必须重新选')

  return {
    ok: questions.length === 0 && notes.every((n) => !n.includes('整组重问')),
    questions: [...new Set(questions)],
    notes,
    newParts,
    goneParts,
    newMust,
    presetAdded,
    presetRemoved,
    defaultBroken,
  }
}

/** 只保留要问的题；id 或 group 命中都算。返回 [] 时不问任何题。 */
export function pickQuestions(questions, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return []
  if (ids.includes('all')) return questions.slice()
  return questions.filter((q) => ids.includes(q.id) || ids.includes(q.group))
}

/** 更新时用：把上次答案原样搬过来，只改这次被问到的部分。 */
export function mergeAnswers(prev, patch) {
  const out = { ...prev, ...patch }
  out.setup = { ...(prev && prev.setup ? prev.setup : {}), ...(patch && patch.setup ? patch.setup : {}) }
  out.paths = { ...(prev && prev.paths ? prev.paths : {}), ...(patch && patch.paths ? patch.paths : {}) }
  out.parts = patch && patch.parts ? patch.parts : prev.parts
  return out
}

export default { fingerprint, loadAnswers, saveAnswers, diffAnswers, pickQuestions, mergeAnswers }
