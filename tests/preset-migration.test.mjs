import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { PRESET_IDS, buildPresetBundle, buildShellBundle, presetSources } from '../lib/soul-presets.mjs'
import { RETIRED_PRESETS, migratePresetDefault, migratePresetBundle, presetBlocks, planPresetSessions, applyPresetSessions } from '../lib/preset-migration.mjs'
import { beginFixTransaction } from '../lib/fix-transaction.mjs'

const source = presetSources('/nonexistent', { appAsar: '/nonexistent' })
const bundle = buildPresetBundle(source)
const patch = bundle.files['cordis.patch.yml']
const legacyBlock = (id) => `    - id: preset-${id}\n      name: '@deepseek-ai/dsh-agent-preset'\n      config:\n        id: ${id}\n        name: old\n        plugins: []\n`

test('发布内容只有砚青四套，退役 id 不能通过别名重新生成', () => {
  assert.deepEqual(PRESET_IDS, ['yanqing', 'yanqing-cordis', 'yanqing-ptc', 'yanqing-distill'])
  assert.equal(source.flash, undefined)
  const result = buildPresetBundle(source, PRESET_IDS, { aliases: RETIRED_PRESETS })
  assert.deepEqual(result.aliases, {})
  for (const text of Object.values(result.files)) assert.doesNotMatch(text, /ptc-soul-flash|PTC.*Flash|flash-lean-ptc/)
})

test('退役块删除、缺失目标补齐；其他 preset 本机修改保留', () => {
  const custom = bundle.made.yanqing.replace('order: 9', 'order: 77')
  const old = '# old\n- insert:\n' + legacyBlock('ptc-soul-flash') + custom + legacyBlock('flash-lean-ptc-v3-soul')
  const result = migratePresetBundle(old, patch)
  assert.deepEqual(presetBlocks(result).map((block) => block.id), PRESET_IDS)
  assert.match(result, /order: 77/)
  assert.doesNotMatch(result, /ptc-soul-flash|flash-lean-ptc/)
  assert.equal(migratePresetBundle(result, patch), null)
  assert.doesNotMatch(buildShellBundle('- insert:\n' + legacyBlock('ptc-soul-flash') + bundle.made.yanqing).files['cordis.patch.yml'], /ptc-soul-flash/)
})

test('旧生成头也会清理；默认入口保留引号、注释和其他配置', () => {
  assert.equal(migratePresetBundle('# PTC · Soul · Flash 从 Flash 源派生\n' + patch, patch), patch)
  const config = "- id: agent-preset-registry\n  config:\n    selectedDefault: 'ptc-soul-flash' # chosen\n    default: standard\n"
  assert.equal(migratePresetDefault(config), config.replace("'ptc-soul-flash'", "'yanqing-ptc'"))
})

test('普通及 zstd 会话只改入口；恢复按本机优先，事务可恢复原字节', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preset-migration-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const live = path.join(root, 'live'), backup = path.join(root, 'backup')
  fs.mkdirSync(live); fs.mkdirSync(backup)
  const original = '{"type":"session","agentPreset":"ptc-soul-flash"}\n{"type":"message","text":"ptc-soul-flash"}\n'
  const file = path.join(live, 'session.v1.jsonl')
  fs.writeFileSync(file, original)
  fs.writeFileSync(path.join(backup, 'session.v1.jsonl'), 'invalid backup shadowed by live')
  fs.writeFileSync(path.join(backup, 'session.v2.jsonl.zstd'), zlib.zstdCompressSync(Buffer.from(original)))
  const plans = planPresetSessions(live, backup)
  assert.equal(plans.length, 2)
  const transaction = beginFixTransaction(path.join(root, 'transaction'), plans.map((plan) => plan.file))
  fs.copyFileSync(path.join(backup, 'session.v2.jsonl.zstd'), path.join(live, 'session.v2.jsonl.zstd'))
  applyPresetSessions(plans)
  const expected = original.replace('"agentPreset":"ptc-soul-flash"', '"agentPreset":"yanqing-ptc"')
  assert.equal(fs.readFileSync(file, 'utf8'), expected)
  assert.equal(zlib.zstdDecompressSync(fs.readFileSync(path.join(live, 'session.v2.jsonl.zstd'))).toString(), expected)
  assert.deepEqual(planPresetSessions(live), [])
  transaction.rollback()
  assert.equal(fs.readFileSync(file, 'utf8'), original)
  assert.equal(fs.existsSync(path.join(live, 'session.v2.jsonl.zstd')), false)
  fs.writeFileSync(file, 'broken')
  assert.throws(() => planPresetSessions(live), /预检失败/)
  fs.writeFileSync(file, Buffer.concat([Buffer.from(original), Buffer.from([255])]))
  assert.throws(() => planPresetSessions(live), /不是有效 UTF-8/)
})
