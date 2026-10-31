import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { buildPresetBundle, presetSources } from '../lib/soul-presets.mjs'
import { FIX_IDS } from '../lib/fixes.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')

/** 将测试素材写到隔离目录，不访问真实 DSH。 */
function put(root, file, value) {
  const dest = path.join(root, file)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, typeof value === 'string' ? value : JSON.stringify(value, null, 2))
}

/** 构造完整命令所需的作者目录和旧版安装，不执行真实插件。 */
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fix-command-')))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const kit = path.join(root, 'kit')
  const source = path.join(root, 'author')
  const home = path.join(root, 'home')
  const profile = path.join(home, 'profiles/desktop')
  const nm = path.join(profile, 'node_modules')
  fs.mkdirSync(kit)
  fs.copyFileSync(path.join(ROOT, 'install.mjs'), path.join(kit, 'install.mjs'))
  for (const dir of ['lib', 'assets', 'setups']) fs.cpSync(path.join(ROOT, dir), path.join(kit, dir), { recursive: true })
  put(source, 'package.json', { name: 'dsh-agent-soul', type: 'module', version: 'fixture', files: ['index.js', 'cordis.patch.yml', 'kit', 'tools'] })
  put(source, 'index.js', 'export const fixture = true\n')
  put(source, 'cordis.patch.yml', '- insert: []\n')
  for (const file of ['kit/echo/install-kit.mjs', 'kit/echo/scaffold.mjs', 'tools/init.mjs', 'tools/verify-client-ids.mjs']) put(source, file, '// isolated fixture\n')
  put(source, 'kit/templates/SELF.src.md', '# SELF\n')
  const parts = {
    compaction: 'dsh-agent-compaction', pruner: 'dsh-agent-pruner', memory: 'dsh-agent-memory', 'mnemon-probe': 'dsh-agent-mnemon-probe',
    echo: 'dsh-agent-echo', clock: 'dsh-agent-clock', 'model-statusbar': 'dsh-agent-model-statusbar', huanqi: 'dsh-huanqi',
    'huanqi-panel': 'dsh-agent-huanqi-panel', 'mobile-adapt': 'dsh-agent-mobile-adapt', riji: 'dsh-agent-riji', splash: 'dsh-agent-splash', yantai: 'dsh-agent-yantai',
    'compact-region': 'dsh-agent-compact-region'
  }
  for (const [part, name] of Object.entries(parts)) {
    put(source, `plugins/${part}/package.json`, { name, type: 'module', files: ['index.js', 'client.js', 'lib', 'cordis.patch.yml'] })
    put(source, `plugins/${part}/index.js`, 'export const fixture = true\n')
    put(source, `plugins/${part}/cordis.patch.yml`, `- insert:\n    - id: ${part}\n      name: ${name}\n`)
  }
  // 保留作者实际补丁锚点，同时使外围表达式语法有效。
  put(source, 'plugins/clock/client.js', 'export function render(open) { return wrap(open ? h("div", { style: panelStyle }, h(ClockPanel)) : null);\n}\n')
  put(source, 'plugins/huanqi/lib/index.js', 'export const main = true\n')
  put(source, 'plugins/huanqi-panel/index.js', "export const packageName = 'dsh-huanqi'\n")
  fs.cpSync(source, path.join(nm, 'dsh-agent-soul'), { recursive: true })
  for (const part of ['compaction', 'pruner', 'memory', 'echo', 'clock', 'huanqi', 'huanqi-panel', 'compact-region']) fs.cpSync(path.join(source, 'plugins', part), path.join(nm, parts[part]), { recursive: true })
  const bundle = buildPresetBundle(presetSources(nm, { upstreamDir: source, appAsar: null }), ['yanqing'], { summary: 'author' })
  for (const [file, text] of Object.entries(bundle.files)) put(nm, `dsh-soul-preset/${file}`, text)
  put(profile, 'package.json', { name: 'fixture-profile', private: true, dependencies: {}, dsh: { bundles: [] } })
  const config = "- id: huanqi\n  name: dsh-huanqi\n  config:\n    fullCompactOnBreaker: 'true'\n"
  put(profile, 'cordis.patch.yml', config)
  put(home, 'dsh-soul/.install-state.json', { kitVersion: '3.0', upstream: {}, presetIds: ['yanqing'], nameMap: {}, declined: [] })
  const run = (...args) => spawnSync(process.execPath, [path.join(kit, 'install.mjs'), '--fix', '--source', source, '--dsh-home', home, '--no-input', '--confirm-quit', ...args], {
    cwd: kit, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, DSH_HOME: home }
  })
  const read = (file) => fs.readFileSync(path.join(home, file), 'utf8')
  return { root, kit, source, home, profile, nm, config, run, read }
}

test('--fix-only 只修选中的文件，不修改配置和 preset；再次运行保持', (t) => {
  const f = fixture(t)
  const preset = fs.readFileSync(path.join(f.nm, 'dsh-soul-preset/cordis.patch.yml'), 'utf8')
  const result = f.run('--fix-only', 'clock-panel')
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(fs.readFileSync(path.join(f.nm, 'dsh-agent-clock/client.js'), 'utf8'), /position: "fixed"/)
  assert.equal(fs.readFileSync(path.join(f.profile, 'cordis.patch.yml'), 'utf8'), f.config)
  assert.equal(fs.readFileSync(path.join(f.nm, 'dsh-soul-preset/cordis.patch.yml'), 'utf8'), preset)
  const second = f.run('--fix-only', 'clock-panel', '--dry-run')
  assert.equal(second.status, 0, second.stdout + second.stderr)
  assert.match(second.stdout, /没有要修的/)
})

test('配置修复可撤回原字节，skip 持久化且下一次不重打', (t) => {
  const f = fixture(t)
  let result = f.run('--fix-only', 'huanqi-config-bool')
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(fs.readFileSync(path.join(f.profile, 'cordis.patch.yml'), 'utf8'), /fullCompactOnBreaker: true/)
  result = f.run('--fix-only', 'huanqi-config-bool', '--fix-revert', 'huanqi-config-bool')
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.equal(fs.readFileSync(path.join(f.profile, 'cordis.patch.yml'), 'utf8'), f.config)
  assert.ok(JSON.parse(f.read('dsh-soul/.install-state.json')).fixSkip.includes('huanqi-config-bool'))
})

test('修复后校验失败自动恢复插件、配置和安装记录', (t) => {
  const f = fixture(t)
  const clock = fs.readFileSync(path.join(f.nm, 'dsh-agent-clock/client.js'), 'utf8')
  const state = f.read('dsh-soul/.install-state.json')
  put(f.nm, 'dsh-agent-soul/tools/verify-client-ids.mjs', 'process.exit(1)\n')
  const result = f.run('--fix-only', 'clock-panel,huanqi-config-bool')
  assert.notEqual(result.status, 0)
  assert.match(result.stdout, /已自动回滚/)
  assert.equal(fs.readFileSync(path.join(f.nm, 'dsh-agent-clock/client.js'), 'utf8'), clock)
  assert.equal(fs.readFileSync(path.join(f.profile, 'cordis.patch.yml'), 'utf8'), f.config)
  assert.equal(f.read('dsh-soul/.install-state.json'), state)
})

test('装的是旧包名（3.0 的 dsh-yanqing-*）时 --fix 不动包名，让用户先 --update', (t) => {
  const f = fixture(t)
  fs.renameSync(path.join(f.nm, 'dsh-agent-compaction'), path.join(f.nm, 'dsh-yanqing-compaction'))
  const profile = fs.readFileSync(path.join(f.profile, 'package.json'), 'utf8')
  const result = f.run()
  assert.notEqual(result.status, 0)
  assert.match(result.stdout, /dsh-yanqing-compaction → dsh-agent-compaction/)
  assert.match(result.stdout, /请用 --update/)
  assert.match(result.stdout, /还没有改任何文件/)
  assert.equal(fs.readFileSync(path.join(f.profile, 'package.json'), 'utf8'), profile)
})

test('organs 时代的参数明确报已去掉', (t) => {
  const f = fixture(t)
  for (const arg of ['--organs-source', '--fix-reinstall']) {
    const result = f.run(arg, 'x')
    assert.equal(result.status, 2)
    assert.match(result.stdout, /4\.0 去掉了/)
  }
})

test('全部修复跳过并撤回后，插件文件等于作者原版', (t) => {
  const f = fixture(t)
  let result = f.run()
  assert.equal(result.status, 0, result.stdout + result.stderr)
  result = f.run('--fix-skip', FIX_IDS.join(','))
  assert.equal(result.status, 0, result.stdout + result.stderr)
  for (const [part, pkg, file] of [
    ['clock', 'dsh-agent-clock', 'client.js'],
    ['compaction', 'dsh-agent-compaction', 'package.json'],
    ['pruner', 'dsh-agent-pruner', 'package.json'],
    ['huanqi', 'dsh-huanqi', 'lib/index.js'],
    ['compact-region', 'dsh-agent-compact-region', 'index.js'],
  ]) {
    assert.deepEqual(fs.readFileSync(path.join(f.nm, pkg, file)), fs.readFileSync(path.join(f.source, 'plugins', part, file)))
  }
  assert.equal(fs.readFileSync(path.join(f.profile, 'cordis.patch.yml'), 'utf8'), f.config)
})

test('3.0 已打补丁的安装换 4.0 kit 后，干跑没有文件修复计划', (t) => {
  const f = fixture(t)
  let result = f.run()
  assert.equal(result.status, 0, result.stdout + result.stderr)
  const state = JSON.parse(f.read('dsh-soul/.install-state.json'))
  state.kitVersion = '3.0'
  delete state.fixRecords
  delete state.fixes
  put(f.home, 'dsh-soul/.install-state.json', state)
  result = f.run('--dry-run')
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /这次要动的 0 条/)
  assert.match(result.stdout, /没有要修的/)
  assert.equal(JSON.parse(f.read('dsh-soul/.install-state.json')).kitVersion, '3.0')
})

test('已登记 kit 文件可换回作者修复，用户手改过则保留', (t) => {
  const f = fixture(t)
  let result = f.run('--fix-only', 'clock-panel')
  assert.equal(result.status, 0, result.stdout + result.stderr)
  const author = 'export function render(open) { return wrap(open ? h("div", { style: Object.assign({ position: "fixed" }, panelStyle) }, h(ClockPanel)) : null);\n}\n'
  put(f.source, 'plugins/clock/client.js', author)
  result = f.run('--fix-only', 'clock-panel')
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /改用作者修复/)
  assert.equal(fs.readFileSync(path.join(f.nm, 'dsh-agent-clock/client.js'), 'utf8'), author)
  const custom = author + '// user change\n'
  put(f.nm, 'dsh-agent-clock/client.js', custom)
  result = f.run('--fix-only', 'clock-panel')
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /本机改过/)
  assert.equal(fs.readFileSync(path.join(f.nm, 'dsh-agent-clock/client.js'), 'utf8'), custom)
})

/** 模拟旧版 Flash 安装和会话，保留完整正文用于比对。 */
function addRetiredPreset(f) {
  const file = 'dsh-soul-preset/cordis.patch.yml'
  const preset = fs.readFileSync(path.join(f.nm, file), 'utf8')
  const retired = '\n    - id: preset-ptc-soul-flash\n      name: "@deepseek-ai/dsh-agent-preset"\n      config:\n        id: ptc-soul-flash\n        name: "PTC · Soul · Flash"\n        plugins: []\n'
  put(f.nm, file, preset + retired)
  const state = JSON.parse(f.read('dsh-soul/.install-state.json'))
  put(f.home, 'dsh-soul/.install-state.json', { ...state, presetIds: ['yanqing', 'ptc-soul-flash'], defaultPreset: 'ptc-soul-flash' })
  put(f.profile, 'cordis.patch.yml', f.config + '- id: agent-preset-registry\n  config:\n    selectedDefault: ptc-soul-flash\n')
  const session = '{"type":"session","version":4,"id":"legacy","agentPreset":"ptc-soul-flash"}\n{"type":"message","text":"ptc-soul-flash"}\n'
  put(f.home, 'sessions/legacy/session.v4.jsonl', session)
  return { session, preset: preset + retired }
}

test('完整修复迁移旧 Flash：干跑不写、会话正文不变、默认和安装记录同步、重复执行不再迁移', (t) => {
  const f = fixture(t)
  const old = addRetiredPreset(f)
  let result = f.run('--dry-run')
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.equal(f.read('sessions/legacy/session.v4.jsonl'), old.session)
  assert.equal(fs.readFileSync(path.join(f.nm, 'dsh-soul-preset/cordis.patch.yml'), 'utf8'), old.preset)
  result = f.run()
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.equal(f.read('sessions/legacy/session.v4.jsonl'), old.session.replace('"agentPreset":"ptc-soul-flash"', '"agentPreset":"yanqing-ptc"'))
  assert.match(fs.readFileSync(path.join(f.profile, 'cordis.patch.yml'), 'utf8'), /selectedDefault: yanqing-ptc/)
  for (const file of ['cordis.patch.yml', 'package.json', 'README.md']) assert.doesNotMatch(fs.readFileSync(path.join(f.nm, 'dsh-soul-preset', file), 'utf8'), /ptc-soul-flash|PTC.*Flash/)
  const state = JSON.parse(f.read('dsh-soul/.install-state.json'))
  assert.deepEqual(state.presetIds, ['yanqing', 'yanqing-ptc'])
  assert.equal(state.defaultPreset, 'yanqing-ptc')
  result = f.run('--dry-run')
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.doesNotMatch(result.stdout, /退役 preset 清理/)
})

test('Flash 迁移后校验失败，恢复会话、preset、默认配置和安装记录', (t) => {
  const f = fixture(t)
  const old = addRetiredPreset(f)
  const state = f.read('dsh-soul/.install-state.json')
  const config = fs.readFileSync(path.join(f.profile, 'cordis.patch.yml'), 'utf8')
  put(f.nm, 'dsh-agent-soul/tools/verify-client-ids.mjs', 'process.exit(1)\n')
  const result = f.run()
  assert.notEqual(result.status, 0)
  assert.match(result.stdout, /已自动回滚/)
  assert.equal(f.read('sessions/legacy/session.v4.jsonl'), old.session)
  assert.equal(f.read('dsh-soul/.install-state.json'), state)
  assert.equal(fs.readFileSync(path.join(f.profile, 'cordis.patch.yml'), 'utf8'), config)
  assert.equal(fs.readFileSync(path.join(f.nm, 'dsh-soul-preset/cordis.patch.yml'), 'utf8'), old.preset)
})

test('局部修复不迁移 Flash；无法读取的会话在完整迁移写入前阻止执行', (t) => {
  const f = fixture(t)
  const old = addRetiredPreset(f)
  let result = f.run('--fix-only', 'clock-panel')
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.equal(f.read('sessions/legacy/session.v4.jsonl'), old.session)
  assert.equal(fs.readFileSync(path.join(f.nm, 'dsh-soul-preset/cordis.patch.yml'), 'utf8'), old.preset)
  assert.ok(JSON.parse(f.read('dsh-soul/.install-state.json')).presetIds.includes('ptc-soul-flash'))
  put(f.home, 'sessions/broken/session.v4.jsonl.zstd', 'broken')
  result = f.run()
  assert.notEqual(result.status, 0)
  assert.match(result.stdout + result.stderr, /会话迁移预检失败/)
  assert.equal(f.read('sessions/legacy/session.v4.jsonl'), old.session)
  assert.equal(fs.readFileSync(path.join(f.nm, 'dsh-soul-preset/cordis.patch.yml'), 'utf8'), old.preset)
})
