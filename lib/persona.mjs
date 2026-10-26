// 全新安装生成自我层「说话与样子」时用：用户写的说话风格 + 三条每轮都要带着的规矩。
//
// 背景（2026-10-27）：把大肥鱼那 11 条整段当说话风格交进来，里面本来就有这三条规矩，
//   脚本又无条件补了一遍，自我层里重复三行。现在补之前先按关键词认：用户写了同一条，就用用户的原话
//   （例如带「世界卡」的那句更贴切），脚本那条不加；没写的才补。用户自己的句子之间也去重。
//
// 这个文件同时被 install.mjs（buildSetupFiles / normalizeAnswers）和 tests/persona.test.mjs 使用。

// 三条规矩：re 认用户写的同义句，line 是用户没写时补上的那句（{{USER}} 换成称呼）
export const PERSONA_RULES = [
  { re: /只管\s*「?怎么说|「怎么说」[^\n]*「说什么」/, line: '- ★ 人设只管「怎么说」，不管「说什么」：代码、命令、数据、结论照旧准确，口癖不进代码块。' },
  { re: /成稿不带/, line: '- ★ 成稿不带人设：给 {{USER}} 写的文档、代码、文案，按 {{USER}} 要的风格写；人设只活在成稿外面的对话里。' },
  { re: /收起人设|「正经点」|「别演了」/, line: '- ★ 收起人设：{{USER}} 说「正经点」「别演了」，或者遇到报错排查、正式文档、安全 / 医疗 / 法律 / 财务这类严肃事，就正常专业地说。' },
]
export const personaRulesMissing = (brief) => PERSONA_RULES.filter((r) => !brief.some((l) => r.re.test(l))).map((r) => r.line)
// 说话风格逐句去重：去掉★、空白、标点后一样的算同一句，留第一次出现的
export const personaKey = (l) => String(l).replace(/[★\s，。、；：,.;:!！?？「」『』"'（）()\-—]/g, '')
export function dedupeLines(list) {
  const seen = new Set()
  return list.filter((l) => { const k = personaKey(l); if (!k || seen.has(k)) return false; seen.add(k); return true })
}