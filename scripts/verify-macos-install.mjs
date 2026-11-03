import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const kit = fileURLToPath(new URL('../', import.meta.url))
const evidence = path.join(kit, 'logs', 'verify-macos-install')
fs.mkdirSync(evidence, { recursive: true })
assert.ok(process.argv[2], '传入已验证的上游源码目录')
const src = path.resolve(process.argv[2])
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kit-macos-install-')))
const user = path.join(root, 'user')
fs.mkdirSync(user)
const env = { ...process.env, HOME: user, USERPROFILE: user }
delete env.DSH_HOME
const yaml = fs.realpathSync(process.argv[3] || path.join(os.homedir(), '.dsh/profiles/desktop/node_modules/js-yaml'))
const json = (f) => JSON.parse(fs.readFileSync(f, 'utf8'))
const write = (f, value) => {
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, value)
}
const pj = (h) => path.join(h, 'profiles/desktop')
const summaries = []
let seq = 0
const run = (label, home, args, { code = 0, script = path.join(kit, 'install.mjs') } = {}) => {
  const cmd = [script, '--dsh-home', home, '--confirm-quit', '--no-input', ...args]
  const r = spawnSync(process.execPath, cmd, { cwd: kit, env, encoding: 'utf8', timeout: 120000, maxBuffer: 20 * 1024 * 1024 })
  const log = path.join(evidence, `${String(++seq).padStart(2, '0')}-${label}.log`)
  fs.writeFileSync(log, `${r.stdout || ''}\n${r.stderr || ''}`)
  assert.equal(r.status, code, `${label}: ${r.error || ''}; see ${log}`)
  summaries.push({ label, command: [process.execPath, ...cmd], status: r.status, log })
  console.log(`${label}: exit ${r.status}`)
  return r.stdout
}
const home = (name) => {
  const h = path.join(root, name)
  write(path.join(pj(h), 'package.json'), JSON.stringify({ name: 'isolated-profile', type: 'module', dependencies: {}, dsh: { profile: { bundles: [] } } }))
  write(path.join(pj(h), 'cordis.patch.yml'), '- id: agent-default-model\n  config:\n    provider: deepseek-account\n')
  fs.mkdirSync(path.join(pj(h), 'node_modules'), { recursive: true })
  fs.symlinkSync(yaml, path.join(pj(h), 'node_modules/js-yaml'))
  return h
}

const source = ['--source', src]
const ids = ['model-statusbar-darwin', 'yantai-apps-darwin', 'heartbeat-darwin', 'echo-svc-darwin']
try {
  const h = home('中文 空格')
  const nm = path.join(pj(h), 'node_modules')
  const hub = path.join(h, 'dsh-soul/memory/hub')
  const hp = path.join(nm, 'dsh-yanqing-heartbeat')
  run('install', h, ['--setup', '大肥鱼', '--no-heartbeat', '--add-part', 'model-statusbar,yantai,heartbeat', ...source])
  assert.equal(fs.existsSync(path.join(hp, 'kit-macos.mjs')), false)
  const reportDir = path.join(root, 'report')
  run('report', h, ['--fix', '--report', reportDir, ...source])
  const p = json(path.join(reportDir, 'fix-plan.json'))
  for (const id of ids) assert.equal(p.items.find(x => x.id === id)?.choices.includes('fix'), true, id)
  p.items = p.items.map(x => ({ ...x, decision: ids.includes(x.id) ? 'fix' : 'later', hit: 'yes', evidence: ['临时安装，原文与固定源码一致；功能验收另测'] }))
  const plan = path.join(reportDir, 'fix-plan.json')
  write(plan, JSON.stringify(p))
  run('plan-dry', h, ['--fix', '--plan', plan, '--dry-run', ...source])
  assert.equal(fs.existsSync(path.join(hp, 'kit-macos.mjs')), false)
  run('apply-plan', h, ['--fix', '--plan', plan, ...source])
  for (const f of ['kit-macos.mjs', 'heartbeat.mjs', 'heartbeat-core.mjs', 'activity.mjs']) assert.ok(fs.existsSync(path.join(hp, f)), f)
  assert.equal(fs.existsSync(path.join(user, 'Library/LaunchAgents')), false)
  const kept = fs.readFileSync(path.join(hp, 'kit-macos.mjs'), 'utf8')
  run('repeat', h, ['--fix', '--fix-only', ids.join(','), ...source])
  run('freeze', h, ['--fix', '--fix-only', 'yantai-soul', ...source])
  assert.equal(fs.readFileSync(path.join(hp, 'kit-macos.mjs'), 'utf8'), kept)
  // 一个文件被手改时，撤回不得只撤入口、留下失配依赖。
  const entry = fs.readFileSync(path.join(hp, 'index.js'), 'utf8')
  write(path.join(hp, 'kit-macos.mjs'), kept + '\n// local edit\n')
  run('local-revert', h, ['--fix', '--fix-revert', 'heartbeat-darwin', ...source])
  assert.equal(fs.readFileSync(path.join(hp, 'index.js'), 'utf8'), entry)
  write(path.join(hp, 'kit-macos.mjs'), kept)
  const migration = path.join(hub, 'heartbeat/runtime/kit-migration.json')
  write(migration, '{}')
  assert.match(run('active-migration-guard', h, ['--fix', '--fix-revert', 'heartbeat-darwin', ...source]), /restore-kit/)
  assert.equal(fs.readFileSync(path.join(hp, 'index.js'), 'utf8'), entry)
  assert.equal(fs.readFileSync(path.join(hp, 'kit-macos.mjs'), 'utf8'), kept)
  fs.unlinkSync(migration)
  run('revert', h, ['--fix', '--fix-revert', ids.join(','), ...source])
  for (const f of ['kit-macos.mjs', 'heartbeat.mjs', 'heartbeat-core.mjs', 'activity.mjs']) assert.equal(fs.existsSync(path.join(hp, f)), false, f)
  assert.equal(fs.readFileSync(path.join(hub, 'echo-svc.mjs'), 'utf8'), fs.readFileSync(path.join(src, 'kit/echo/echo-svc.mjs'), 'utf8'))
  assert.ok(!fs.readFileSync(path.join(hp, 'index.js'), 'utf8').includes('kitMac'))
  console.log(`macOS 安装流程通过：${summaries.length} 次命令；未注册任务`)
} finally { fs.rmSync(root, { recursive: true, force: true }) }
