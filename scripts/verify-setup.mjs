// 问答自测（5.4）：人设输入框的解析、弹窗的格式限制、可选零件一个不少。node scripts/verify-setup.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { normalizeAnswers, questionSheet } from '../lib/setup.mjs'
import { chunk, fixPopups } from '../lib/popups.mjs'
import { OPTIONAL_PARTS } from '../lib/parts.mjs'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-setup-'))
const file = path.join(dir, '人设 完整.md')
fs.writeFileSync(file, '# 人设\n')
const base = { name: '小鲸', user: '老板', setupName: `测试-${process.pid}` }
const voice = (persona, extra = {}) => normalizeAnswers({ ...base, persona, ...extra }, { mnemon: true })
try {
  assert.equal(voice('').setup.persona, 'none')
  assert.deepEqual(voice('自称小鲸\n- 话短').setup.personaBrief, ['自称小鲸', '话短'])
  const full = voice(['话短', `"${file}"`]).setup
  assert.equal(full.persona, 'full'); assert.deepEqual(full.personaBrief, ['话短']); assert.equal(full.personaText, '# 人设\n')
  assert.match(voice([file]).setup.personaBrief[0], /65-声音\/小鲸-声音\.md/)
  assert.match(voice('/没有/这个.md').errors.join(), /人设文件不存在/)
  assert.equal(voice(undefined, { persona: 'brief', personaBrief: ['旧写法'] }).setup.persona, 'brief') // 旧回答文件
  assert.equal(voice('话短/结论先行').setup.persona, 'brief') // 句子里的斜杠不算路径
  assert.match(normalizeAnswers({ ...base, parts: ['mnemon-probe'] }, { mnemon: false }).warnings.join(), /dsh-mnemon/)
  assert.deepEqual(chunk([1, 2, 3, 4, 5]).map((x) => x.length), [3, 2])
  const sheet = questionSheet({ kitVersion: 'test', profile: 'desktop', mnemon: false, platform: 'darwin' })
  for (const p of sheet.popups) {
    assert.ok(p.questions.length <= 4)
    for (const q of p.questions) { assert.ok([...q.header].length <= 12, q.header); assert.ok(q.optionsFrom || (q.options.length >= 2 && q.options.length <= 4), q.id) }
  }
  assert.deepEqual(sheet.popups.flatMap((p) => p.questions).filter((q) => q.id === 'parts').flatMap((q) => q.options.map((o) => o.value)).sort(), [...OPTIONAL_PARTS].sort())
  const fp = fixPopups([{ id: 'a', title: 'A', decide: true, blocking: true, impact: 'x', choices: ['fix', 'later'] }, { id: 'b', title: 'B', decide: false }])
  assert.equal(fp.length, 1); assert.equal(fp[0].questions.length, 1)
  console.log('问答自测通过')
} finally { fs.rmSync(dir, { recursive: true, force: true }) }
