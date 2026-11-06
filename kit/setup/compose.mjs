// 把「一道题一个答案」的扁平结果组装成 answers.json v2。
//
// 为什么需要它：题目的 id 是给人看的（soulPath / setupName），答案文件的形状是给程序看的
// （paths.soul / setup.setupName）。让每个 agent 手拼，就会出现三种形状都叫「差不多能用」——
// 而校验器只认一种。组装只做一次，映射写死在这里，错也只错一处。

import path from 'node:path'
import { BUILTIN_LINES } from './questions.mjs'

/** 路径答案：'~' 展开成家目录；展开后还不是绝对路径就报错，不猜。 */
function expandPath(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw === '~') return process.env.HOME || ''
  if (raw.startsWith('~/')) return path.join(process.env.HOME || '', raw.slice(2))
  return raw
}

const isBool = (v) => typeof v === 'boolean'
const text = (v) => (v === undefined || v === null ? '' : String(v).trim())

/**
 * @param flat 每题一个值：name / user / purpose / hardLines(名字数组) / customHardLines /
 *             persona / multiSession / windowSize / hasIndex / presets / defaultPreset / parts(目录数组) /
 *             register / cliTools / soulPath / memoryPath / setupName
 * @param ctx  profile、必装目录、上次拒装的目录、skills、writeConfig、asked
 * @returns { answers, errors }
 */
export function composeAnswers(flat, ctx) {
  const errors = []
  const f = flat || {}
  const c = ctx || {}

  const name = text(f.name)
  const user = text(f.user)
  if (!name) errors.push('name：agent 的名字没填')
  if (!user) errors.push('user：怎么称呼用户没填')
  if (!text(c.profile)) errors.push('profile：没有 profile，装到哪都不知道')

  // 硬线：选项给的是名字，答案要规则原文。名字对不上就报，不丢、不改写。
  const picked = Array.isArray(f.hardLines) ? f.hardLines : f.hardLines ? [f.hardLines] : []
  const hardLines = []
  for (const key of picked) {
    const hit = BUILTIN_LINES.find((l) => l.name === key)
    if (!hit) { errors.push('hardLines：没有叫「' + key + '」的内置硬线'); continue }
    hardLines.push({ name: hit.name, rule: hit.rule.split('{{USER}}').join(user || '用户') })
  }
  if (hardLines.length === 0) errors.push('hardLines：至少选一条')

  // 自定硬线：可以给数组，也可以给 JSON 字符串（弹窗里只能填文本）
  let custom = []
  if (Array.isArray(f.customHardLines)) custom = f.customHardLines
  else if (text(f.customHardLines)) {
    try {
      const parsed = JSON.parse(text(f.customHardLines))
      if (!Array.isArray(parsed)) errors.push('customHardLines：要是数组')
      else custom = parsed
    } catch (error) {
      errors.push('customHardLines：不是合法 JSON（' + error.message + '）')
    }
  }
  for (const item of custom) {
    if (!item || !text(item.name) || !text(item.rule)) { errors.push('customHardLines：每条都要有 name 与 rule'); continue }
    if (hardLines.some((l) => l.name === text(item.name))) { errors.push('customHardLines：「' + text(item.name) + '」与内置硬线重名'); continue }
    hardLines.push({ name: text(item.name), rule: text(item.rule) })
  }

  // 窗口：空 = null（不编数）；给了但不是数字 = 报错
  let windowSize = null
  if (text(f.windowSize)) {
    const n = Number(text(f.windowSize))
    if (!Number.isFinite(n) || n <= 0) errors.push('windowSize：给了但不是正数（不知道就留空）')
    else windowSize = n
  }

  // 零件：必装的那批自动进 install（不问但要装），用户勾的和必装去重
  const must = Array.isArray(c.mustInstall) ? c.mustInstall : []
  const chosen = Array.isArray(f.parts) ? f.parts : []
  const install = [...new Set([...must, ...chosen])]
  const declined = Array.isArray(c.declined) ? c.declined.filter((d) => !install.includes(d)) : []

  const presets = Array.isArray(f.presets) ? f.presets : []
  const defaultPreset = text(f.defaultPreset) || presets[0] || ''
  if (presets.length && !presets.includes(defaultPreset)) errors.push('defaultPreset：不在选中的 preset 里')

  const soulPath = expandPath(f.soulPath)
  const memoryPath = expandPath(f.memoryPath)
  if (!soulPath) errors.push('soulPath：书房根不能空（上游不猜）')
  else if (!path.isAbsolute(soulPath)) errors.push('soulPath：必须是绝对路径（或 ~ 开头）：' + soulPath)
  if (!memoryPath) errors.push('memoryPath：记忆中枢根不能空（上游不猜）')
  else if (!path.isAbsolute(memoryPath)) errors.push('memoryPath：必须是绝对路径（或 ~ 开头）：' + memoryPath)
  const cliRoot = expandPath(f.cliTools)
  if (cliRoot && !path.isAbsolute(cliRoot)) errors.push('cliTools：必须是绝对路径（或 ~ 开头）：' + cliRoot)

  const answers = {
    version: 2,
    profile: text(c.profile),
    paths: { soul: soulPath, memory: memoryPath },
    setup: {
      name,
      user,
      purpose: text(f.purpose),
      hardLines,
      customHardLines: custom.map((x) => ({ name: text(x.name), rule: text(x.rule) })),
      persona: text(f.persona),
      multiSession: isBool(f.multiSession) ? f.multiSession : false,
      windowSize,
      hasIndex: isBool(f.hasIndex) ? f.hasIndex : false,
      setupName: text(f.setupName) || name,
    },
    parts: { install, declined },
    presets,
    defaultPreset: presets.length ? defaultPreset : null,
    register: isBool(f.register) ? f.register : true,
    skills: isBool(c.skills) ? c.skills : true,
    writeConfig: isBool(c.writeConfig) ? c.writeConfig : true,
    cliTools: cliRoot || null,
    asked: Array.isArray(c.asked) ? c.asked : [],
  }
  return { answers, errors }
}

export default { composeAnswers }
