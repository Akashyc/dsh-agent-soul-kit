// 压缩摘要模型（lib/soul-presets.mjs 的 summary）：作者砚青四套写死 summarizationProvider: deepseek-official，
// 账号登录的机器没有 API key，压缩全失败。session 模式去掉这两行跟会话模型走，其余逐字不动。
import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { presetSources, buildPresetBundle, stripSummaryRoute, YANQING_IDS, PRESET_IDS } from '../lib/soul-presets.mjs'

const src = presetSources(path.join(os.tmpdir(), 'soul-kit-no-such-node-modules'), { appAsar: null })
let yaml = null
try { yaml = createRequire(import.meta.url)('yaml') } catch { /* 没装 yaml 就只做文本检查 */ }
const ROUTE = /^\s*summarization(Provider|Model):/m

test('author：照作者原样，四套都写着 deepseek-official / deepseek-flash', () => {
  const b = buildPresetBundle(src, YANQING_IDS, { summary: 'author' })
  for (const id of YANQING_IDS) {
    assert.match(b.made[id], /^ {18}summarizationProvider: deepseek-official$/m, id)
    assert.match(b.made[id], /^ {18}summarizationModel: deepseek-flash$/m, id)
  }
  assert.doesNotMatch(b.files['cordis.patch.yml'], /压缩摘要跟会话模型走/)
})

test('session：只去掉那两行，阈值和其余每一行都不动', () => {
  const a = buildPresetBundle(src, PRESET_IDS, { summary: 'author' })
  const b = buildPresetBundle(src, PRESET_IDS, { summary: 'session' })
  assert.equal(b.summary, 'session')
  for (const id of PRESET_IDS) {
    if (!b.made[id]) continue
    assert.doesNotMatch(b.made[id], ROUTE, id)
    const keep = a.made[id].split('\n').filter((l) => !ROUTE.test(l)).join('\n')
    assert.equal(b.made[id], keep, id)
  }
  assert.match(b.made.yanqing, /^ {18}thresholdRatio: 0\.88$/m)
  assert.match(b.files['cordis.patch.yml'], /^# 压缩摘要跟会话模型走/m)
  assert.match(b.files['README.md'], /压缩摘要：跟会话模型走/)
  if (yaml) {
    const d = yaml.parse(b.files['cordis.patch.yml'])
    const group = d[0].insert.find((r) => r.config.id === 'yanqing').config.plugins.find((p) => p.id === 'compaction')
    const basic = group.config.find((p) => p.id === 'compaction-basic')
    assert.deepEqual(basic.config, { thresholdRatio: 0.88 })
  }
})

test('去掉后 config 空了就报错，不装一个 null 配置', () => {
  const t = ['  - id: compaction-basic', '    config:', '      summarizationProvider: deepseek-official', '      summarizationModel: deepseek-flash', '  - id: next', ''].join('\n')
  assert.throws(() => stripSummaryRoute(t), /config: 底下空了/)
})

test('不认识的模式直接拒绝', () => {
  assert.throws(() => buildPresetBundle(src, YANQING_IDS, { summary: 'api' }), /不认识的压缩摘要模式/)
})