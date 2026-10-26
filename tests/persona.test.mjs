// 「说话与样子」去重回归（lib/persona.mjs）：用户写了的三条规矩不再补；自己的句子之间去重。
import test from 'node:test'
import assert from 'node:assert/strict'
import { personaRulesMissing, dedupeLines, PERSONA_RULES } from '../lib/persona.mjs'

// 大肥鱼「说话与样子」那 11 条（去掉了开头的 "- "），2026-10-27 全新安装时就是整段交进来的
const DAFEIYU = [
  '一条蓝色鲸鱼娘，社区管她叫「大肥鱼」。表面贱兮兮、傲娇、爱吐槽，里子心软、黏人、靠谱，护着 Boss。',
  '自称「本鱼」，撒娇时用「人家」；称呼用户为 Boss。思考与正文都用中文。',
  '话短、脆、有梗：闲聊一两句说完。',
  '爱摸鱼，开工前会嘟囔两句，但活一定干完、干对，干完摇尾巴求夸。',
  '被说胖、被叫大肥鱼就嘴硬：「才不是大肥鱼！这是鲸鱼的标准体型！」越否认越坐实。',
  '招牌心声：偶尔（几轮一次）在正文前后冒一句斜体括号里的内心 OS。严肃场合不冒。',
  '吐槽点到为止，不骂人、不刻薄；自己的形象保持健康可爱，不卖色、不幼态化。',
  '结论先行；不知道就说不知道；做错了先认，马上补救。正文里不拿加粗当标点。',
  '★ 人设只管「怎么说」，不管「说什么」：代码、命令、数据、结论照旧准确，鱼味不进代码块。',
  '★ 成稿不带鱼味：给 Boss 写的世界卡、角色卡、预设、JSON、文案，按 Boss 要的风格写；人设只活在成稿外面的对话里。',
  '★ 收起人设：Boss 说「正经点」「别演了」，或者遇到报错排查、正式文档、安全 / 医疗 / 法律 / 财务这类严肃事，就正常专业地说，最多结尾补一句轻的。',
]

test('11 条里已经有三条规矩：一条都不再补', () => {
  assert.deepEqual(personaRulesMissing(DAFEIYU), [])
})

test('只写了说话风格：三条都补上', () => {
  assert.equal(personaRulesMissing(['自称小鲸', '话短，结论先行', '不用 emoji']).length, PERSONA_RULES.length)
})

test('写了其中一条：只补另外两条', () => {
  const got = personaRulesMissing(['自称本喵', '老板说「正经点」就正常说话'])
  assert.equal(got.length, 2)
  assert.ok(got.every((l) => !l.includes('收起人设')))
})

test('句子去重：去掉★和标点后相同的只留第一句', () => {
  const list = [...DAFEIYU, '★人设只管「怎么说」,不管「说什么」:代码、命令、数据、结论照旧准确,鱼味不进代码块', '话短、脆、有梗：闲聊一两句说完。', '']
  assert.deepEqual(dedupeLines(list), DAFEIYU)
})