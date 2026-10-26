// 换气面板「没有 `- id: huanqi` 节就自建一节」的本机补丁回归。
//
// 两段：
//   1. 补丁模块本身：旧实现 → 新实现的映射是幂等的，找不到锚点时如实报 anchor-missing。
//   2. 已安装的面板（本机存在时）：空 profile 第一次 applyValues 会补节，而不是抛错；
//      已有节时只改值、不重复建节。找不到面板就 skip，不让 CI 假红。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { apply, OLD } from '../lib/huanqi-panel-patch.mjs'

const PROFILE = process.env.DSH_PROFILE || 'desktop'
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const PANEL = path.join(DSH_HOME, 'profiles', PROFILE, 'node_modules', 'dsh-yanqing-huanqi-panel', 'index.js')
const NO_PANEL = fs.existsSync(PANEL) ? false : `没装换气面板：${PANEL}`

// 一份「只有别的条目、没有换气」的 profile patch —— 就是新装机器第一次保存时的样子
const SAMPLE = [
  '# profile patch',
  '- id: ui-theme',
  '  config:',
  '    preference: system',
  '- id: ctrl-enter-submit',
  '  disabled: true',
  '',
].join('\n')

test('补丁幂等：打过的不会再打，缺锚点如实报告', () => {
  const src = OLD + '\n}\n'
  const once = apply(src)
  assert.equal(once.changed, true)
  assert.ok(once.text.includes('let loc = locate(text)'))
  assert.ok(!once.text.includes('这一节，不敢动它'))
  const twice = apply(once.text)
  assert.equal(twice.changed, false)
  assert.equal(twice.reason, 'already')
  assert.equal(apply('nothing here').reason, 'anchor-missing')
})

test('已安装面板：空 profile 第一次保存会补节，不再抛「没有这一节」', { skip: NO_PANEL }, async () => {
  const { applyValues, locate } = await import(pathToFileURL(PANEL).href)
  const r = applyValues(SAMPLE, { maxContinuations: 5, normalTurnThreshold: 8 })
  assert.ok(locate(r.text), '补完之后必须能定位到 - id: huanqi')
  assert.match(r.text, /- id: huanqi\n  config:\n/)
  assert.match(r.text, /^ {4}maxContinuations: 5$/m)
  assert.match(r.text, /^ {4}normalTurnThreshold: 8$/m)
  assert.ok(r.text.includes('  preference: system'), '原有条目必须原样保留')
  assert.ok(r.changes.some((c) => c.key === 'maxContinuations'))
})

test('已安装面板：已有换气节时只改值，不重复建节', { skip: NO_PANEL }, async () => {
  const { applyValues } = await import(pathToFileURL(PANEL).href)
  const withBlock = SAMPLE + '- id: huanqi\n  config:\n    maxContinuations: 2\n'
  const r = applyValues(withBlock, { maxContinuations: 7 })
  assert.equal((r.text.match(/^- id: huanqi$/gm) || []).length, 1)
  assert.match(r.text, /^ {4}maxContinuations: 7$/m)
})
