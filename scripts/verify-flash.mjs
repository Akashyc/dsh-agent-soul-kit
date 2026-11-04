// node scripts/verify-flash.mjs <Soul源码> <Flash源码> [js-yaml目录]
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { FLASH_PRESET_ID, FLASH_ADAPTATION, readFlashPresets, adaptFlash, isFlashPresetId } from '../lib/flash-presets.mjs'
import { presetSources, buildPresetBundle, buildShellBundle, findPresetSection } from '../lib/soul-presets.mjs'
import { officialPresetFor, isSoulPresetId } from '../lib/uninstall.mjs'
import { PART_NAMES } from '../lib/parts.mjs'

assert.ok(process.argv[2] && process.argv[3], '传入 Soul 和 Flash 作者源码目录')
const kit = fileURLToPath(new URL('../', import.meta.url))
const soul = path.resolve(process.argv[2])
const flash = path.resolve(process.argv[3])
const yamlDir = fs.realpathSync(process.argv[4] || path.join(os.homedir(), '.dsh/profiles/desktop/node_modules/js-yaml'))
const require = createRequire(path.join(yamlDir, 'package.json'))
const yaml = require(yamlDir)
const schema = yaml.DEFAULT_SCHEMA.extend([new yaml.Type('tag:yaml.org,2002:js', { kind: 'scalar', construct: (text) => ({ js: text }) })])
const parse = (text) => yaml.load(text, { schema })
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kit-flash-')))
const evidence = path.join(kit, 'logs/verify-flash')
fs.mkdirSync(evidence, { recursive: true })
const json = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const names = Object.fromEntries(['compaction', 'pruner', 'compact-region'].map((part) => [part, json(path.join(soul, 'plugins', part, 'package.json')).name]))
const commands = []

/** 写入隔离样本，不触及真实用户目录。 */
function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
}

/** 只创建本次验证自己的 profile 和 YAML 依赖链接。 */
function home(name) {
  const dir = path.join(root, name)
  const profile = path.join(dir, 'profiles/desktop')
  write(path.join(profile, 'package.json'), JSON.stringify({ name: 'isolated-profile', type: 'module', dependencies: {}, dsh: { profile: { bundles: [] } } }))
  write(path.join(profile, 'cordis.patch.yml'), '- id: agent-default-model\n  config:\n    provider: deepseek-account\n')
  fs.mkdirSync(path.join(profile, 'node_modules'))
  fs.symlinkSync(yamlDir, path.join(profile, 'node_modules/js-yaml'))
  return dir
}

/** 运行隔离生命周期命令，保留失败日志和期望退出码。 */
function run(label, target, args, code = 0) {
  const command = [path.join(kit, 'install.mjs'), '--dsh-home', target, '--confirm-quit', '--no-input', ...args]
  const result = spawnSync(process.execPath, command, {
    cwd: kit,
    env: { ...process.env, HOME: path.join(root, 'user'), USERPROFILE: path.join(root, 'user'), DSH_HOME: target },
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 20 * 1024 * 1024
  })
  const log = path.join(evidence, `${String(commands.length + 1).padStart(2, '0')}-${label}.log`)
  fs.writeFileSync(log, `${result.stdout || ''}\n${result.stderr || ''}`)
  assert.equal(result.status, code, `${label}: ${result.error || ''}; see ${log}`)
  commands.push({ label, status: result.status, log })
  console.log(`${label}: exit ${result.status}`)
  return result.stdout
}

/** 读取隔离安装记录与 preset 配置。 */
function installed(target) {
  const cfg = fs.readFileSync(path.join(target, 'profiles/desktop/cordis.patch.yml'), 'utf8')
  return { state: json(path.join(target, 'dsh-soul/.install-state.json')), cfg, presets: parse(findPresetSection(cfg).text)[0].insert }
}

try {
  fs.mkdirSync(path.join(root, 'user'))
  for (const [part, name] of Object.entries(names)) assert.ok(PART_NAMES[part].includes(name), `作者包名 ${part}: ${name}`)
  const catalog = readFlashPresets(flash, { parse })
  assert.deepEqual(readFlashPresets(flash), catalog)
  const published = parse(fs.readFileSync(path.join(flash, 'cordis.patch.yml'), 'utf8')).flatMap((entry) => entry.insert || []).filter((entry) => entry.name === '@deepseek-ai/dsh-agent-preset')
  assert.equal(catalog.length, published.length)
  for (const item of catalog) {
    const original = parse('- insert:\n' + item.text)[0].insert[0].config
    const adapted = parse('- insert:\n' + adaptFlash(item, names))[0].insert[0].config
    assert.equal(adapted.name, '灵魂 · ' + original.name)
    assert.equal(adapted.description, [original.description, FLASH_ADAPTATION].filter(Boolean).join('\n\n'))
    assert.equal(officialPresetFor(item.id), 'ptc')
    assert.ok(isSoulPresetId(item.id))
    const compaction = adapted.plugins.find((plugin) => plugin.id === 'compaction').config
    assert.deepEqual(compaction.find((plugin) => plugin.id === 'compaction-basic').config, original.plugins.find((plugin) => plugin.id === 'compaction').config.find((plugin) => plugin.id === 'compaction-basic').config)
    for (const name of Object.values(names)) assert.ok(compaction.some((plugin) => plugin.name === name))
    const oldNames = { compaction: 'dsh-agent-compaction', pruner: 'dsh-agent-pruner', 'compact-region': 'dsh-agent-compact-region' }
    const oldConfig = parse('- insert:\n' + adaptFlash(item, oldNames))[0].insert[0].config.plugins.find((plugin) => plugin.id === 'compaction').config
    for (const name of Object.values(oldNames)) assert.ok(oldConfig.some((plugin) => plugin.name === name), '适配以本次 Soul 源码包名为准')
    const before = structuredClone(original)
    const after = structuredClone(adapted)
    for (const config of [before, after]) {
      delete config.id
      delete config.name
      delete config.description
      const group = config.plugins.find((plugin) => plugin.id === 'compaction')
      group.config = group.config.filter((plugin) => plugin.id !== 'command-compact-region')
      for (const plugin of group.config) if (['compaction-basic', 'tool-result-pruner'].includes(plugin.id)) delete plugin.name
    }
    assert.deepEqual(after, before, '只适配身份、简介和压缩零件，其他上游配置原样保留')
  }
  const source = presetSources(null, { upstreamDir: soul, flash: { dir: flash, presets: catalog, from: '验证源码', version: 'test', partNames: names } })
  const bundle = buildPresetBundle(source, ['soul', ...catalog.map((item) => item.id)])
  assert.equal(parse(bundle.text)[0].insert.length, catalog.length + 1)
  assert.equal(buildShellBundle(bundle.text).ids.length, catalog.length + 1)

  const fixture = path.join(root, 'flash')
  fs.cpSync(path.join(flash, 'presets'), path.join(fixture, 'presets'), { recursive: true })
  fs.copyFileSync(path.join(flash, 'package.json'), path.join(fixture, 'package.json'))
  const first = catalog[0]
  const firstPath = path.join(fixture, first.file)
  const renamed = path.join(fixture, 'presets/作者改了文件名.yaml')
  fs.renameSync(firstPath, renamed)
  const changed = fs.readFileSync(renamed, 'utf8').replace(/^ {8}name: .*$/m, '        name: "作者新名称"').replace(/^ {8}description: .*$/m, () => '        description: >-\n          作者新的简介，保留 $& 和 $1。\n          第二行说明。')
  fs.writeFileSync(renamed, changed)
  assert.equal(readFlashPresets(fixture, { parse }).length, catalog.length)
  const changedPreset = readFlashPresets(fixture, { parse }).find((item) => item.sourceId === first.sourceId)
  assert.equal(changedPreset.label, '灵魂 · 作者新名称')
  assert.match(parse('- insert:\n' + adaptFlash(changedPreset, names))[0].insert[0].config.description, /^作者新的简介/)
  assert.ok(parse('- insert:\n' + adaptFlash(changedPreset, names))[0].insert[0].config.description.includes('$& 和 $1'))
  const unsupported = path.join(fixture, 'presets/不支持的结构.yml')
  fs.writeFileSync(unsupported, '- insert:\n  - id: preset-format-change\n    name: "@deepseek-ai/dsh-agent-preset"\n    config:\n      id: format-change\n      name: 格式变化\n')
  assert.throws(() => readFlashPresets(fixture, { parse }), /无法完整识别/)
  fs.unlinkSync(unsupported)
  const extraFile = path.join(fixture, 'presets/未来新增.yml')
  const extra = changed.replaceAll(first.sourceId, 'flash-future').replace('作者新名称', '未来预设')
  fs.writeFileSync(extraFile, extra)
  assert.equal(readFlashPresets(fixture, { parse }).length, catalog.length + 1)
  fs.writeFileSync(path.join(fixture, 'presets/重复.yml'), extra)
  assert.throws(() => readFlashPresets(fixture, { parse }), /重复/)
  fs.unlinkSync(path.join(fixture, 'presets/重复.yml'))
  assert.throws(() => adaptFlash({ ...first, text: first.text.replace('@deepseek-ai/dsh-compaction-basic', 'unknown-package') }, names), /结构变了/)
  fs.unlinkSync(extraFile)
  console.log(`Flash 源码适配通过：${catalog.length} 个上游 preset；覆盖改名、新增、折行简介、重复和结构错误`)

  const target = home('中文 空格')
  const sourceArgs = ['--source', soul, '--flash-source', fixture]
  const defaults = ['--default-preset', first.id]
  run('install', target, ['--setup', '大肥鱼', '--flash', 'on', ...defaults, ...sourceArgs])
  let result = installed(target)
  assert.equal(result.state.flash.presets.length, catalog.length)
  assert.equal(result.state.presetIds.filter(isFlashPresetId).length, catalog.length)
  assert.ok(result.presets.some((preset) => preset.config.name === '灵魂 · 作者新名称'))
  run('install-repeat', target, ['--setup', '大肥鱼', '--flash', 'on', ...defaults, ...sourceArgs])
  fs.writeFileSync(extraFile, extra)
  fs.writeFileSync(renamed, changed.replace('作者新名称', '作者又改了名称'))
  const diary = path.join(target, 'dsh-soul/soul/50-日记/验证.md')
  write(diary, '用户样本原文\n')
  run('update', target, ['--update', ...sourceArgs])
  assert.equal(installed(target).state.flash.presets.length, catalog.length + 1)
  assert.ok(installed(target).presets.some((preset) => preset.config.name === '灵魂 · 作者又改了名称'))
  const beforeRepeat = installed(target).cfg
  const stateBeforeRepeat = fs.readFileSync(path.join(target, 'dsh-soul/.install-state.json'), 'utf8')
  run('update-repeat', target, ['--update', ...sourceArgs])
  assert.equal(installed(target).cfg, beforeRepeat)
  assert.equal(fs.readFileSync(path.join(target, 'dsh-soul/.install-state.json'), 'utf8'), stateBeforeRepeat)
  const moved = path.join(fixture, 'presets/作者再次改了文件名.yaml')
  fs.renameSync(renamed, moved)
  run('source-metadata-refresh', target, ['--update', ...sourceArgs])
  assert.ok(installed(target).state.flash.presets.some((preset) => preset.file.endsWith('作者再次改了文件名.yaml')))
  assert.equal(fs.readFileSync(diary, 'utf8'), '用户样本原文\n')
  const out = path.join(root, 'backups')
  run('backup', target, ['--backup', '--out', out])
  const archive = path.join(out, fs.readdirSync(out).find((name) => name.endsWith('.tar.gz')))
  const restored = home('恢复 目标')
  run('restore', restored, ['--restore', archive, ...sourceArgs])
  assert.equal(installed(restored).state.flash.presets.length, catalog.length + 1)
  assert.equal(fs.readFileSync(path.join(restored, 'dsh-soul/soul/50-日记/验证.md'), 'utf8'), '用户样本原文\n')

  const session = path.join(target, 'sessions/future/session.v1.jsonl')
  const sessionText = JSON.stringify({ type: 'session', agentPreset: 'soul-flash-future' }) + '\n{"type":"message","text":"原文保留"}\n'
  write(session, sessionText)
  fs.unlinkSync(extraFile)
  const beforeReject = fs.readFileSync(path.join(target, 'dsh-soul/.install-state.json'), 'utf8')
  run('removed-preset-reject', target, ['--update', ...sourceArgs], 1)
  assert.equal(fs.readFileSync(path.join(target, 'dsh-soul/.install-state.json'), 'utf8'), beforeReject)
  assert.equal(fs.readFileSync(session, 'utf8'), sessionText)
  run('flash-off-in-use-reject', target, ['--update', '--flash', 'off', '--default-preset', 'soul', '--source', soul], 1)
  fs.unlinkSync(session)
  run('removed-unused-preset', target, ['--update', ...sourceArgs])
  assert.equal(installed(target).state.flash.presets.length, catalog.length)

  result = installed(target)
  const legacySource = catalog.find((item) => item.sourceId === 'flash-lean-ptc-v3')
  if (legacySource) {
    const cfgFile = path.join(target, 'profiles/desktop/cordis.patch.yml')
    const stateFile = path.join(target, 'dsh-soul/.install-state.json')
    const legacyConfig = result.cfg.replace(new RegExp('^(    - id: preset-|        id: )' + legacySource.id + '$', 'gm'), (_, prefix) => prefix + FLASH_PRESET_ID)
      .replace(/^ {4}selectedDefault: .*$/m, '    selectedDefault: ' + FLASH_PRESET_ID)
    fs.writeFileSync(cfgFile, legacyConfig)
    const legacyState = result.state
    legacyState.presetIds = legacyState.presetIds.map((id) => id === legacySource.id ? FLASH_PRESET_ID : id)
    delete legacyState.flash.presets
    fs.writeFileSync(stateFile, JSON.stringify(legacyState))
    const legacyText = JSON.stringify({ type: 'session', agentPreset: FLASH_PRESET_ID }) + '\n{"type":"message","text":"旧会话原文"}\n'
    write(path.join(target, 'sessions/legacy/session.v1.jsonl'), legacyText)
    run('legacy-single-preset', target, ['--update', ...sourceArgs])
    assert.equal(installed(target).state.presetAliases[FLASH_PRESET_ID], legacySource.id)
    assert.equal(installed(target).cfg.match(/^ {4}selectedDefault: (.*)$/m)?.[1], FLASH_PRESET_ID)
    assert.equal(fs.readFileSync(path.join(target, 'sessions/legacy/session.v1.jsonl'), 'utf8'), legacyText)
    const olderId = 'yanqing-ptc-flash'
    fs.writeFileSync(cfgFile, installed(target).cfg.replaceAll(FLASH_PRESET_ID, olderId))
    write(path.join(target, 'sessions/legacy/session.v1.jsonl'), legacyText.replace(FLASH_PRESET_ID, olderId))
    const legacyFile = path.join(fixture, legacySource.file)
    const savedSource = fs.readFileSync(legacyFile)
    fs.unlinkSync(legacyFile)
    run('legacy-upstream-removed-reject', target, ['--update', ...sourceArgs], 1)
    fs.writeFileSync(legacyFile, savedSource)
    run('legacy-yanqing-alias', target, ['--update', ...sourceArgs])
    assert.equal(installed(target).state.presetAliases[olderId], legacySource.id)
  }
  run('uninstall-shell', target, ['--uninstall', '--old-sessions', 'shell', '--keep-data'])
  assert.ok(installed(target).presets.every((preset) => preset.config.name.endsWith('（已卸载）')))
  const restoredSession = path.join(restored, 'sessions/dynamic/session.v1.jsonl')
  write(restoredSession, sessionText)
  if (zlib.zstdCompressSync) write(path.join(restored, 'sessions/compressed/session.v1.jsonl.zstd'), zlib.zstdCompressSync(Buffer.from(sessionText)))
  run('uninstall-rewrite', restored, ['--uninstall', '--old-sessions', 'rewrite', '--keep-data'])
  assert.equal(JSON.parse(fs.readFileSync(restoredSession, 'utf8').split('\n')[0]).agentPreset, 'ptc')
  if (zlib.zstdDecompressSync) assert.equal(JSON.parse(zlib.zstdDecompressSync(fs.readFileSync(path.join(restored, 'sessions/compressed/session.v1.jsonl.zstd'))).toString('utf8').split('\n')[0]).agentPreset, 'ptc')
  assert.equal(fs.readFileSync(restoredSession, 'utf8').split('\n').slice(1).join('\n'), sessionText.split('\n').slice(1).join('\n'))
  assert.equal(fs.existsSync(path.join(root, 'user/Library/LaunchAgents')), false)
  const revisions = Object.fromEntries([['soul', soul], ['flash', flash]].map(([name, directory]) => [name, spawnSync('git', ['-C', directory, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim() || null]))
  fs.writeFileSync(path.join(evidence, 'summary.json'), JSON.stringify({ soul, flash, revisions, catalog: catalog.map(({ text, ...item }) => item), commands, scope: '隔离 profile；未改真实 DSH、未启动模型、未注册任务' }, null, 2))
  console.log(`Flash 生命周期通过：${commands.length} 次命令；未修改真实 DSH 或注册任务`)
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
