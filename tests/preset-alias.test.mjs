// 旧会话用的 preset 别名（lib/soul-presets.mjs）：2.11 把 standard-soul 等换成砚青四套后，用旧 id 建的会话要还能打开。
// 别名和对应的新 preset 逐字相同，只换声明行 id、preset id 和显示名；卸载留空壳时别名也要能转成合法的空壳。
import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { presetSources, buildPresetBundle, buildShellBundle, aliasBlock, PRESET_IDS } from '../lib/soul-presets.mjs'

const NM = path.join(os.tmpdir(), 'soul-kit-no-such-node-modules')
const src = presetSources(NM, { appAsar: null })
let yaml = null
try { yaml = createRequire(import.meta.url)('yaml') } catch { /* 没装 yaml 就只做文本检查 */ }

test('别名块：只换 id 和名字，正文和对应的新 preset 一样', () => {
  const { made } = buildPresetBundle(src, PRESET_IDS)
  const a = aliasBlock(made.yanqing, 'standard-soul', 'yanqing')
  assert.match(a, /^ {4}- id: preset-standard-soul$/m)
  assert.match(a, /^ {8}id: standard-soul$/m)
  assert.match(a, /^ {8}name: "标准 · Soul 模式（旧会话用，同「砚青」）"$/m)
  const strip = (t) => t.split('\n').filter((l) => !/^ {4}- id: preset-|^ {8}id: |^ {8}name: /.test(l)).join('\n')
  assert.equal(strip(a), strip(made.yanqing))
})

test('Soul preset 包：带上要的别名，id 不和新 preset 撞；没有对应新 preset 的别名不加', () => {
  const b = buildPresetBundle(src, PRESET_IDS, { aliases: { 'standard-soul': 'yanqing', 'cordis-soul': 'yanqing-cordis', 'ptc-soul': 'not-built' } })
  assert.deepEqual(b.aliases, { 'standard-soul': 'yanqing', 'cordis-soul': 'yanqing-cordis' })
  const ids = [...b.files['cordis.patch.yml'].matchAll(/^ {8}id: ([\w-]+)$/gm)].map((m) => m[1])
  assert.deepEqual(ids, [...PRESET_IDS, 'standard-soul', 'cordis-soul'])
  assert.match(b.files['cordis.patch.yml'], /旧会话用的别名.*standard-soul → yanqing/)
  if (yaml) {
    const d = yaml.parse(b.files['cordis.patch.yml'])
    assert.deepEqual(d[0].insert.map((r) => r.config.id), [...PRESET_IDS, 'standard-soul', 'cordis-soul'])
  }
})

test('卸载空壳：别名块留下来、换回官方压缩，跨行的说明整段换掉，不留本架构的包', () => {
  const b = buildPresetBundle(src, PRESET_IDS, { aliases: { 'standard-soul': 'yanqing' } })
  const shell = buildShellBundle(b.files['cordis.patch.yml'])
  assert.deepEqual(shell.ids, ['ptc-soul-flash', 'standard-soul'])
  const t = shell.files['cordis.patch.yml']
  assert.doesNotMatch(t, /name: ['"]dsh-(yanqing|agent)-/)
  assert.doesNotMatch(t, /command-compact-region/)
  if (yaml) {
    const d = yaml.parse(t)
    assert.deepEqual(d[0].insert.map((r) => r.config.id), ['ptc-soul-flash', 'standard-soul'])
    assert.ok(d[0].insert.every((r) => /已卸载/.test(r.config.description)))
  }
})
