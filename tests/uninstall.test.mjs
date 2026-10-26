// 卸载的规划函数（lib/uninstall.mjs）和空壳 preset（lib/soul-presets.mjs 的 buildShellBundle）。
// 锁文件的样子照 2026-10-27 Boss 那台 Mac 上 pnpm 写出来的真实格式（lockfileVersion 9、hoisted、file:node_modules/<包>）。
import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import {
  officialPresetFor, planPackageJsonRemoval, removeLockEntries, removeModulesEntries, removePackageMapEntries,
  planCordisRemoval, planServersRemoval, rewriteSessionHeader, sessionPreset, isSoulHeartbeatPlist,
} from '../lib/uninstall.mjs'
import { presetSources, buildPresetBundle, buildShellBundle, PRESET_IDS } from '../lib/soul-presets.mjs'

const OURS = ['dsh-agent-soul', 'dsh-agent-memory', 'dsh-soul-preset']

test('Soul preset 换回对应的官方 preset；Flash 版看 dsh-flash-presets 装没装', () => {
  assert.equal(officialPresetFor('ptc-soul'), 'ptc')
  assert.equal(officialPresetFor('standard-soul'), 'standard')
  assert.equal(officialPresetFor('ptc-soul-flash'), 'ptc')
  assert.equal(officialPresetFor('ptc-soul-flash', { flashInstalled: true }), 'flash-lean-ptc-v3')
  assert.equal(officialPresetFor('flash-lean-ptc-v3-soul'), 'ptc')
  assert.equal(officialPresetFor('ptc'), null)
})

test('package.json：bundles、dependencies、desktopNextDeselectedBundles 里只去掉本架构的包', () => {
  const pj = { name: 'p', dependencies: { 'dsh-mnemon': '0.5.34', 'dsh-agent-soul': 'file:node_modules/dsh-agent-soul', 'dsh-agent-memory': 'file:node_modules/dsh-agent-memory' }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'dsh-mnemon', 'dsh-agent-soul', 'dsh-agent-memory'] }, desktopNextDeselectedBundles: ['dsh-agent-memory', 'dsh-armor-switch'] } }
  const r = planPackageJsonRemoval(JSON.stringify(pj, null, 2) + '\n', OURS)
  const j = JSON.parse(r.text)
  assert.deepEqual(j.dsh.profile.bundles, ['@deepseek-ai/dsh-base', 'dsh-mnemon'])
  assert.deepEqual(Object.keys(j.dependencies), ['dsh-mnemon'])
  assert.deepEqual(j.dsh.desktopNextDeselectedBundles, ['dsh-armor-switch'])
  assert.ok(r.text.endsWith('}\n'))
  assert.deepEqual(r.removed.bundles, ['dsh-agent-soul', 'dsh-agent-memory'])
})

const LOCK = `lockfileVersion: '9.0'

settings:
  autoInstallPeers: false
  excludeLinksFromLockfile: false

importers:

  .:
    dependencies:
      '@adwmc/helm-d':
        specifier: https://github.com/ADWMC/helm-d/releases/latest/download/helm-d.tgz
        version: https://github.com/ADWMC/helm-d/releases/latest/download/helm-d.tgz
      dsh-agent-memory:
        specifier: file:node_modules/dsh-agent-memory
        version: file:node_modules/dsh-agent-memory
      dsh-agent-soul:
        specifier: file:node_modules/dsh-agent-soul
        version: file:node_modules/dsh-agent-soul
      dsh-mnemon:
        specifier: 0.5.34
        version: 0.5.34
      dsh-soul-preset:
        specifier: file:node_modules/dsh-soul-preset
        version: file:node_modules/dsh-soul-preset

packages:

  '@adwmc/helm-d@https://github.com/ADWMC/helm-d/releases/latest/download/helm-d.tgz':
    resolution: {integrity: sha512-aaa, tarball: https://github.com/ADWMC/helm-d/releases/latest/download/helm-d.tgz}

  dsh-agent-memory@file:node_modules/dsh-agent-memory:
    resolution: {directory: node_modules/dsh-agent-memory, type: directory}
    engines: {node: '>=20'}
    peerDependencies:
      '@deepseek-ai/cordis': ^4.0.1

  dsh-agent-soul@file:node_modules/dsh-agent-soul:
    resolution: {directory: node_modules/dsh-agent-soul, type: directory}

  dsh-mnemon@0.5.34:
    resolution: {integrity: sha512-bbb}

  dsh-soul-preset@file:node_modules/dsh-soul-preset:
    resolution: {directory: node_modules/dsh-soul-preset, type: directory}

snapshots:

  '@adwmc/helm-d@https://github.com/ADWMC/helm-d/releases/latest/download/helm-d.tgz': {}

  dsh-agent-memory@file:node_modules/dsh-agent-memory: {}

  dsh-agent-soul@file:node_modules/dsh-agent-soul: {}

  dsh-mnemon@0.5.34:
    dependencies:
      zod: 4.1.0

  dsh-soul-preset@file:node_modules/dsh-soul-preset: {}
`

test('pnpm 锁文件：三处条目都摘掉，别的包一个字不动，不留连着的空行', () => {
  const r = removeLockEntries(LOCK, OURS)
  assert.equal(r.removed.length, 9)
  assert.deepEqual(r.leftover, [])
  for (const n of OURS) assert.ok(!r.text.includes(n), `还有 ${n}`)
  assert.ok(r.text.includes("'@adwmc/helm-d':\n        specifier: https://github.com/ADWMC/helm-d/releases/latest/download/helm-d.tgz"))
  assert.ok(r.text.includes('  dsh-mnemon@0.5.34:\n    dependencies:\n      zod: 4.1.0\n'))
  assert.ok(!/\n\n\n/.test(r.text))
  assert.ok(r.text.endsWith('\n'))
  // 只留空壳时 dsh-soul-preset 留着
  const s = removeLockEntries(LOCK, OURS.filter((n) => n !== 'dsh-soul-preset'))
  assert.equal(s.text.match(/dsh-soul-preset/g).length, LOCK.match(/dsh-soul-preset/g).length)
})

test('pnpm 锁文件：别的包依赖着本架构的包时不硬删，列进 leftover', () => {
  const t = LOCK.replace('      zod: 4.1.0', '      zod: 4.1.0\n      dsh-agent-memory: file:node_modules/dsh-agent-memory')
  const r = removeLockEntries(t, OURS)
  assert.equal(r.leftover.length, 1)
  assert.match(r.leftover[0], /dsh-agent-memory: file:/)
})

test('.modules.yaml（JSON 写法）和 .package-map.json（单行 JSON）：去掉本架构的键，格式照旧', () => {
  const mod = JSON.stringify({ layoutVersion: 5, hoistedLocations: { 'dsh-agent-soul@file:node_modules/dsh-agent-soul': ['node_modules/dsh-agent-soul'], 'zod@4.1.0': ['node_modules/zod'] }, skipped: ['dsh-agent-memory@file:node_modules/dsh-agent-memory', 'fsevents@2'] }, null, 2)
  const m = removeModulesEntries(mod, OURS)
  const mj = JSON.parse(m.text)
  assert.deepEqual(Object.keys(mj.hoistedLocations), ['zod@4.1.0'])
  assert.deepEqual(mj.skipped, ['fsevents@2'])
  assert.ok(m.text.startsWith('{\n  "'))
  const pm = JSON.stringify({ packages: { '.': { url: '..', dependencies: { zod: 'zod', 'dsh-agent-soul': 'dsh-agent-soul' } }, 'dsh-agent-soul': { url: './dsh-agent-soul', dependencies: { 'dsh-agent-soul': 'dsh-agent-soul' } }, zod: { url: './zod' } } })
  const p = removePackageMapEntries(pm, OURS)
  assert.equal(p.text, JSON.stringify({ packages: { '.': { url: '..', dependencies: { zod: 'zod' } }, zod: { url: './zod' } } }))
  assert.equal(p.removed.length, 2)
})

test('.modules.yaml 是老版 pnpm 的 YAML 写法时，按锁文件的办法摘', () => {
  const y = 'hoistedLocations:\n  dsh-agent-soul@file:node_modules/dsh-agent-soul:\n    - node_modules/dsh-agent-soul\n  zod@4.1.0:\n    - node_modules/zod\nlayoutVersion: 5\n'
  const r = removeModulesEntries(y, OURS)
  assert.ok(!r.text.includes('dsh-agent-soul'))
  assert.ok(r.text.includes('  zod@4.1.0:\n    - node_modules/zod'))
})

const CFG = `# Your patch layer
- { id: computer-use-cua-driver-native, disabled: false }
- id: ui-chat
  config:
    transcriptView: detailed
- id: dsh-agent-memory
  name: dsh-agent-memory
  config:
    selfPath: 'dsh-soul/memory/hub/SELF.md'
- id: compaction-basic
  disabled: true
- id: agent-preset-registry
  name: "@deepseek-ai/dsh-agent-preset-registry"
  config:
    default: standard
    selectedDefault: ptc-soul-flash
- { id: dsh-agent-clock, config: { x: 1 } }
- id: huanqi
  config:
    ledgerPath: ''
- id: image-gen
  config:
    model: x
`

test('cordis.patch.yml：本架构的配置块（含单行写法、旧版根层禁用）去掉，默认 preset 换回官方，其余逐字不动', () => {
  const r = planCordisRemoval(CFG, { ids: ['dsh-agent-memory', 'dsh-agent-clock', 'huanqi'] })
  assert.deepEqual(r.removed, ['dsh-agent-memory', 'compaction-basic', 'dsh-agent-clock', 'huanqi'])
  assert.equal(r.defaultFrom, 'ptc-soul-flash')
  assert.equal(r.defaultTo, 'ptc')
  assert.equal(r.text, `# Your patch layer
- { id: computer-use-cua-driver-native, disabled: false }
- id: ui-chat
  config:
    transcriptView: detailed
- id: agent-preset-registry
  name: "@deepseek-ai/dsh-agent-preset-registry"
  config:
    default: standard
    selectedDefault: ptc
- id: image-gen
  config:
    model: x
`)
  assert.equal(planCordisRemoval(CFG, { ids: [], flashInstalled: true }).defaultTo, 'flash-lean-ptc-v3')
  const off = CFG.replace('selectedDefault: ptc-soul-flash', 'selectedDefault: standard')
  assert.equal(planCordisRemoval(off, { ids: [] }).defaultTo, null)
})

test('mcp-hub 清单：只去掉指向 echo-mcp.mjs 的 echo', () => {
  const doc = { version: 1, servers: [{ serverName: 'echo', args: ['/x/dsh-soul/memory/hub/echo-mcp.mjs'] }, { serverName: 'github', args: [] }, { serverName: 'echo', args: ['/my/own/echo.js'] }] }
  const r = planServersRemoval(doc)
  assert.equal(r.removed, 1)
  assert.deepEqual(r.others, ['github', 'echo'])
  assert.equal(r.doc.version, 1)
  assert.equal(planServersRemoval({ version: 1, servers: [doc.servers[0]] }).others.length, 0)
})

test('会话文件：只改第一行会话头里的 agentPreset，正文里同样的字不动', () => {
  const head = '{"type":"session","version":4,"id":"a","cwd":"/x","agentPreset":"ptc-soul-flash"}'
  const body = '{"type":"message","text":"\\"agentPreset\\":\\"ptc-soul-flash\\""}\n'
  const t = head + '\n' + body
  assert.equal(sessionPreset(t), 'ptc-soul-flash')
  const r = rewriteSessionHeader(t, { 'ptc-soul-flash': 'ptc' })
  assert.equal(r.text, head.replace('"ptc-soul-flash"', '"ptc"') + '\n' + body)
  assert.equal(r.from, 'ptc-soul-flash')
  assert.equal(rewriteSessionHeader(t.replace('ptc-soul-flash"}', 'standard"}'), { 'ptc-soul-flash': 'ptc' }), null)
  assert.equal(rewriteSessionHeader('not json\n', { a: 'b' }), null)
})

test('心跳 plist：认标签，或者认书房里的心跳脚本', () => {
  assert.ok(isSoulHeartbeatPlist('<key>Label</key>\n  <string>com.dsh-soul.heartbeat</string>'))
  assert.ok(isSoulHeartbeatPlist('<string>/bin/bash</string><string>/Users/x/.dsh/dsh-soul/memory/hub/heartbeat.sh</string>', { label: 'nope', soulRoot: '/Users/x/.dsh/dsh-soul' }))
  assert.ok(!isSoulHeartbeatPlist('<string>com.apple.other</string>', { soulRoot: '/Users/x/.dsh/dsh-soul' }))
})

test('空壳 preset：id 不变、名字标「（已卸载）」、换回官方压缩和裁剪、不引用本架构的包', () => {
  const src = presetSources(path.join(os.tmpdir(), 'no-such-profile-node_modules'), { appAsar: path.join(os.tmpdir(), 'no-such.asar') })
  const real = buildPresetBundle(src, PRESET_IDS).files['cordis.patch.yml']
  assert.ok(real.includes("name: 'dsh-agent-compaction'"))
  const shell = buildShellBundle(real)
  assert.deepEqual(shell.ids, PRESET_IDS)
  const y = shell.files['cordis.patch.yml']
  assert.ok(!/name: '(dsh-agent-|dsh-yanqing-)/.test(y))
  assert.equal((y.match(/（已卸载）"/g) || []).length, PRESET_IDS.length)
  assert.ok(y.includes("name: '@deepseek-ai/dsh-compaction-basic'"))
  assert.equal(JSON.parse(shell.files['package.json']).dshSoulShell, true)
  // 再做一次空壳：名字不会叠两个「（已卸载）」
  assert.equal((buildShellBundle(y).files['cordis.patch.yml'].match(/（已卸载）（已卸载）/g) || []).length, 0)
  assert.throws(() => buildShellBundle('# 空的'), /insert/)
})