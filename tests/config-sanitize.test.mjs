// 配置消毒：'true'（字符串）必须掰成 true（布尔），否则换气整段配置校验失败、静默退回默认值。
// 2026-10-29 实机：桌面上每次启动都报 `$.fullCompactOnBreaker expected boolean but got true`，
// 而插件照跑 —— 错的配置被默默换成了默认值，所以没人发现。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fixQuotedBooleans, BOOLEAN_KEYS } from '../lib/config-sanitize.mjs'

const yml = (huanqi) => [
  '- id: agent-default-model',
  '  config:',
  '    model: deepseek-flash',
  '- id: huanqi',
  '  config:',
  ...huanqi,
  '- id: image-gen',
  '  config:',
  "    provider: 'openai'",
  '',
].join('\n')

test('换气块里的字符串布尔被掰成真布尔', () => {
  const src = yml(['    fullCompactOnBreaker: \'true\'', '    postCompactRecallHint: "false"'])
  const { text, fixed } = fixQuotedBooleans(src)
  assert.match(text, /^ {4}fullCompactOnBreaker: true$/m)
  assert.match(text, /^ {4}postCompactRecallHint: false$/m)
  assert.deepEqual(fixed.map((f) => f.key).sort(), ['fullCompactOnBreaker', 'postCompactRecallHint'])
  // 别的地方一个字不动
  assert.match(text, /^ {4}model: deepseek-flash$/m)
  assert.match(text, /^ {4}provider: 'openai'$/m)
})

test('别的插件块里的 \'true\' 不碰（可能人家 schema 就是字符串）', () => {
  const src = ['- id: somebody-else', '  config:', '    enabled: \'true\'', ''].join('\n')
  const { text, fixed } = fixQuotedBooleans(src)
  assert.equal(text, src)
  assert.deepEqual(fixed, [])
})

test('换气块里的字符串键不碰（subagentPolicy 是字符串）', () => {
  const src = yml(['    subagentPolicy: \'strict\'', '    ledgerPath: \'\''])
  const { text, fixed } = fixQuotedBooleans(src)
  assert.equal(text, src)
  assert.deepEqual(fixed, [])
})

test('已经是对的就不动', () => {
  const src = yml(['    fullCompactOnBreaker: true', '    postCompactRecallHint: false'])
  const { text, fixed } = fixQuotedBooleans(src)
  assert.equal(text, src)
  assert.deepEqual(fixed, [])
})

test('没有换气块时原样返回（不抛）', () => {
  const src = '- id: image-gen\n  config: {}\n'
  assert.deepEqual(fixQuotedBooleans(src), { text: src, fixed: [] })
  assert.deepEqual(fixQuotedBooleans(''), { text: '', fixed: [] })
  assert.deepEqual(fixQuotedBooleans(null), { text: '', fixed: [] })
})

test('错的只报错的、对的不报（混着来）', () => {
  const src = yml(['    fullCompactOnBreaker: \'true\'', '    postCompactRecallHint: true'])
  const { fixed } = fixQuotedBooleans(src)
  assert.deepEqual(fixed.map((f) => f.key), ['fullCompactOnBreaker'])
})

test('BOOLEAN_KEYS 只收真读过的布尔键', () => {
  // 这个清单是白名单：多加一个键等于替别人的 schema 做主
  assert.deepEqual([...BOOLEAN_KEYS].sort(), ['fullCompactOnBreaker', 'postCompactRecallHint'])
})

test('卸载路径也过一遍消毒（不让卸载又把字符串布尔写回去）', async () => {
  const { planCordisRemoval } = await import('../lib/uninstall.mjs')
  const src = yml(["    fullCompactOnBreaker: 'true'", "    postCompactRecallHint: 'false'"])
  // ids 里故意不放 huanqi：让这一节留着，考验的是「写回前有没有消毒」
  const out = planCordisRemoval(src, { ids: ['dsh-agent-soul'], flashInstalled: false })
  assert.match(out.text, /^ {4}fullCompactOnBreaker: true$/m)
  assert.match(out.text, /^ {4}postCompactRecallHint: false$/m)
})
