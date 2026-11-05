import { operationDir } from '../lib/core/data-paths.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const kit = fileURLToPath(new URL('../', import.meta.url))
const evidence = operationDir(path.join(kit, 'data/_kit/logs'), 'verify-macos-install')
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
const run = (label, home, args, { code = 0, script = path.join(kit, 'install.mjs'), preload = null } = {}) => {
  const cmd = [...(preload ? ['--import', preload] : []), script, '--dsh-home', home, '--confirm-quit', '--no-input', '--allow-preset-snapshot', ...args]
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
const ids = ['pack-unshipped', 'model-statusbar-darwin', 'yantai-apps-darwin', 'heartbeat-darwin', 'echo-svc-darwin']
try {
  const h = home('中文 空格')
  const nm = path.join(pj(h), 'node_modules')
  const hub = path.join(h, 'dsh-soul/memory/hub')
  const hp = path.join(nm, 'dsh-yanqing-heartbeat')
  run('install', h, ['--setup', '大肥鱼', '--no-heartbeat', '--add-part', 'model-statusbar,yantai,heartbeat', ...source])
  assert.equal(fs.existsSync(path.join(hp, 'kit-macos.mjs')), false)
  const data = path.join(h, 'dsh-soul/soul/50-日记/迭代验收.md')
  write(data, '用户原文不丢\n')
  const empty = path.join(h, 'dsh-soul/memory/空目录')
  fs.mkdirSync(empty, { recursive: true })
  const out = path.join(root, 'backups')
  run('backup', h, ['--backup', '--out', out])
  const archive = path.join(out, fs.readdirSync(out).find((f) => f.endsWith('.tar.gz')))
  run('update', h, ['--update', ...source])
  assert.equal(fs.readFileSync(data, 'utf8'), '用户原文不丢\n')
  run('update-repeat', h, ['--update', ...source])
  const restored = home('迁移 目标')
  run('restore', restored, ['--restore', archive, '--no-heartbeat', ...source])
  assert.equal(fs.readFileSync(path.join(restored, 'dsh-soul/soul/50-日记/迭代验收.md'), 'utf8'), '用户原文不丢\n')
  assert.ok(fs.statSync(path.join(restored, 'dsh-soul/memory/空目录')).isDirectory())
  assert.equal(fs.existsSync(path.join(user, 'Library/LaunchAgents')), false)
  console.log(`kit 安装流程通过：${summaries.length} 次命令；含备份/更新/迁移；未注册任务`)
} finally { fs.rmSync(root, { recursive: true, force: true }) }
