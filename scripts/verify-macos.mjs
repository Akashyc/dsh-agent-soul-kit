import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync, spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { EventEmitter } from 'node:events'
import { macosPatches } from '../lib/macos-patches.mjs'
import { macModel } from '../lib/macos/model.mjs'
import { macApps } from '../lib/macos/apps.mjs'
import { detectFix, planFile, fileFixes, unpatchText, danglingImports } from '../lib/fixes.mjs'
import { inspectPackage } from '../lib/package-contract.mjs'
import { PART_NAMES } from '../lib/parts.mjs'

const source = path.resolve(process.argv[2] || '')
assert.ok(fs.existsSync(path.join(source, 'plugins/heartbeat/index.js')), '传入已验证的上游源码目录')
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kit-mac-check-')))
const home = path.join(root, '用户 空格', '.dsh')
const nm = path.join(home, 'profiles', 'desktop', 'node_modules')
const hub = path.join(home, 'dsh-soul', 'memory', 'hub')
const env = { ...process.env, HOME: path.join(root, 'user'), USERPROFILE: path.join(root, 'user'), DSH_HOME: home, YQ_HUB: hub, YQ_HB_DIR: path.join(hub, 'heartbeat/runtime'), YQ_SOUL: path.join(home, 'dsh-soul', 'soul'), ECHO_HUB: hub, ECHO_SOUL: path.join(root, 'soul') }
delete env.ECHO_PIPE
const names = Object.fromEntries(Object.entries(PART_NAMES).map(([part, pkgs]) => [part, pkgs[0]]))
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text) }
const run = (file, args = [], expected = 0) => {
  const result = spawnSync(process.execPath, [file, ...args], { env, encoding: 'utf8', timeout: 30000 })
  assert.equal(result.status, expected, `${file}: ${result.stderr}\n${result.stdout}`)
  return result
}
let checks = 0
const plannedFiles = [] // 每条补丁装完后落盘的文件，最后用来做组级校验
try {
  for (const fix of fileFixes({ names, runtime: null, dshHome: home }).filter((f) => ['compaction-memq-path', 'echo-mcp-sessions'].includes(f.id))) {
    const upstream = fs.readFileSync(path.join(source, fix.location === 'hub' ? 'kit/echo' : 'plugins/' + fix.part, fix.file), 'utf8')
    assert.equal(detectFix(fix, upstream), 'present')
    const patched = planFile({ upstream, installed: upstream, fixes: [fix] }).target
    assert.equal(unpatchText(patched, [fix]), upstream)
    assert.equal(detectFix(fix, patched), 'absent')
    assert.equal(detectFix(fix, 'export const other = 1'), 'unknown')
    assert.equal(spawnSync(process.execPath, ['--check', '--input-type=module'], { input: patched }).status, 0)
    checks += 5
  }
  const frozen = { id: 'probe', provided: true, old: '', new: 'export const x=1', any: /export const x=1/ }
  assert.equal(planFile({ upstream: '', installed: null, fixes: [frozen], freeze: ['probe'] }).rows[0].action, 'none')
  const ref = { file: path.join(root, 'entry.mjs'), label: 'entry', dir: root, text: "import './helper.mjs'" }
  assert.deepEqual(danglingImports([ref, { file: path.join(root, 'helper.mjs'), text: 'export {}' }]), [])
  assert.deepEqual(danglingImports([ref, { file: path.join(root, 'helper.mjs'), remove: true }]), ['entry → ./helper.mjs'])
  checks += 3
  for (const f of macosPatches(names)) {
    f.id = f.key
    const part = Object.keys(names).find((part) => names[part] === f.pkg)
    const upstream = f.provided ? '' : fs.readFileSync(path.join(source, f.location === 'hub' ? 'kit/echo' : `plugins/${part}`, f.file), 'utf8')
    assert.equal(detectFix(f, upstream), 'present', f.key + '/' + f.file)
    const plan = planFile({ upstream, installed: upstream, fixes: [f] })
    assert.equal(unpatchText(plan.target, [f]), upstream)
    assert.equal(planFile({ upstream, installed: plan.target, fixes: [f] }).state, 'same')
    assert.equal(planFile({ upstream, installed: plan.target, fixes: [f], skip: [f.id] }).target, upstream)
    assert.equal(planFile({ upstream, installed: plan.target, fixes: [f], freeze: [f.id] }).target, plan.target)
    assert.equal(planFile({ upstream, installed: plan.target + '\n// local', fixes: [f] }).state, 'local')
    assert.equal(planFile({ upstream, installed: upstream, fixes: [{ ...f, needed: false }] }).target, upstream)
    const changed = { ...f, edits: f.edits.map((e) => ({ ...e, new: e.new + '\n// next version' })) }
    assert.equal(planFile({ upstream, installed: plan.target, fixes: [changed], freeze: [f.id], record: { upstream, applied: plan.target } }).target, plan.target)
    if (!f.provided) assert.equal(detectFix(f, 'export const changed = true'), 'unknown')
    const dest = path.join(f.location === 'hub' ? hub : path.join(nm, f.pkg), f.file)
    write(dest, plan.target)
    plannedFiles.push({ pkg: f.pkg, dest, text: plan.target, srcDir: path.join(source, f.location === 'hub' ? 'kit/echo' : `plugins/${part}`) })
    const syntax = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: plan.target, encoding: 'utf8' })
    assert.equal(syntax.status, 0, syntax.stderr)
    checks += 10
  }
  // ★ 组级不变量：每条 patch 单独看都对，合起来仍可能少文件（说明见 lib/fixes.mjs 的 danglingImports）。
  //   2026-11-04 就是这样漏掉的：index.js 改成 import './kit-macos.mjs' 而没人写出这个文件，
  //   单条全过，DSH 一启动 ERR_MODULE_NOT_FOUND。
  assert.deepEqual(danglingImports([{ label: 'probe', dir: root, text: "import x from './definitely-missing.mjs'" }]), ['probe → ./definitely-missing.mjs'])
  // 上游配套文件也必须真实装进 fixture；不能拿源码存在充当部署完整。
  for (const [from, to] of [
    [path.join(source, 'plugins/yantai/env-config.mjs'), path.join(nm, names.yantai, 'env-config.mjs')],
    [path.join(source, 'kit/echo/echo-config.mjs'), path.join(hub, 'echo-config.mjs')],
    [path.join(source, 'plugins/heartbeat/heartbeat-core.mjs'), path.join(nm, names.heartbeat, 'heartbeat-core.mjs')]
  ]) write(to, fs.readFileSync(from, 'utf8'))
  const dangling = danglingImports(plannedFiles.map(({ pkg, dest, text }) => ({
    file: dest, label: `${pkg}/${path.basename(dest)}`, dir: path.dirname(dest), text
  })))
  assert.deepEqual(dangling, [], '补丁往包里加的 import 没有对应文件（组内必须自带或上游提供）：' + dangling.join('、'))
  checks += 3
  // ★ 装包整链（2026-11-04 事故的完整路径）：作者的 files 只列 4 个文件，
  //   照清单装完包里就没有 heartbeat.mjs / heartbeat-core.mjs / activity.mjs。
  //   要求：契约报得出来 → 补拷之后不再报 → 补拷后补丁能落盘 → 包能加载。
  //   少任何一环，这台机器上装出来的心跳面板就是「加载失败」。
  {
    const pkg = names.heartbeat
    const src = path.join(source, 'plugins/heartbeat')
    const dst = path.join(root, 'chain', 'profiles', 'desktop', 'node_modules', pkg)
    const pj = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8'))
    for (const f of pj.files) write(path.join(dst, f), fs.readFileSync(path.join(src, f), 'utf8'))
    // 契约是对「源码目录 + 作者 files 清单」跑的：作者有、清单没列 → unshipped
    const leaked = inspectPackage(src, pj.files).filter((i) => i.kind === 'unshipped').map((i) => i.target).sort()
    assert.deepEqual(leaked, ['activity.mjs', 'heartbeat-core.mjs', 'heartbeat.mjs'], '契约必须报出这三件漏列文件，否则装完就缺')
    // pack-unshipped 干的事：把这几个文件照作者原文补进已装的包
    for (const f of leaked) write(path.join(dst, f), fs.readFileSync(path.join(src, f), 'utf8'))
    for (const f of [...pj.files, ...leaked]) assert.ok(fs.existsSync(path.join(dst, f)), `补拷后包里该有 ${f}`)
    const chainFiles = []
    for (const f of macosPatches(names).filter((x) => x.pkg === pkg)) {
      const up = f.provided ? '' : fs.readFileSync(path.join(dst, f.file), 'utf8')
      const plan = planFile({ upstream: up, installed: up, fixes: [f] })
      write(path.join(dst, f.file), plan.target)
      chainFiles.push({ label: `${pkg}/${f.file}`, dir: dst, text: plan.target, sourceDirs: [src] })
    }
    assert.deepEqual(danglingImports(chainFiles), [], '补拷出来的心跳包里还有 import 没人兜住')
    run('--input-type=module', ['-e', `await import(${JSON.stringify(pathToFileURL(path.join(dst, 'index.js')).href)})`])
    checks += 4
  }
  for (const pkg of Object.values(names)) write(path.join(nm, pkg, 'package.json'), '{"type":"module"}')
  // 主模块实际加载：覆盖插入位置、依赖名、带中文和空格的目录。
  run('--input-type=module', ['-e', `await import(${JSON.stringify(pathToFileURL(path.join(nm, names['model-statusbar'], 'index.js')).href)})`])
  const hb = path.join(nm, names.heartbeat)
  const panelCheck = path.join(root, 'panel.mjs')
  write(panelCheck, `
import assert from 'node:assert/strict';
const plugin = await import(${JSON.stringify(pathToFileURL(path.join(nm, names.heartbeat, 'index.js')).href)});
const routes = new Map(), dispose = [];
plugin.apply({ effect(fn) { dispose.push(fn()) }, tools: { guard() {} }, on() {}, get() { return { roots: () => [] } }, webServer: { register({path, handler}) { routes.set(path, handler); return () => {} }, getOrigin() { throw new Error('test host is not listening') } } });
let data;
await routes.get('/heartbeat/state')({}, {writeHead() {}, end(body) { data = JSON.parse(body) }});
assert.equal(data.scheduler.loaded, false);
assert.equal(data.next.ok, true);
for (const close of dispose) if (typeof close === 'function') close();
`)
  run(panelCheck)
  run(path.join(hb, 'heartbeat.mjs'))
  const cfg = path.join(hub, 'heartbeat/runtime/heartbeat.config.json')
  assert.equal(JSON.parse(fs.readFileSync(cfg)).enabled, false)
  assert.equal(fs.existsSync(path.join(env.HOME, 'Library/LaunchAgents')), false)
  for (const name of ['memindex.mjs', 'self.mjs', 'echo-doctor.mjs']) write(path.join(hub, name), 'console.log("fixture step passed")')
  for (const name of ['SELF.md', 'index/words.jsonl', 'index/summaries.jsonl']) write(path.join(hub, name), 'fixture\n')
  run(path.join(hb, 'heartbeat.mjs'), ['--force'])
  const rec = JSON.parse(fs.readFileSync(path.join(hub, 'heartbeat/runtime/mac-acceptance.json')))
  assert.equal(rec.steps.length, 4)
  write(path.join(hub, 'echo-doctor.mjs'), 'process.exit(2)')
  const config = JSON.parse(fs.readFileSync(cfg))
  config.options.retry.max = 0
  write(cfg, JSON.stringify(config))
  run(path.join(hb, 'heartbeat.mjs'), ['--force'], 1)
  const history = fs.readFileSync(path.join(hub, 'heartbeat/runtime/heartbeat.log.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
  assert.equal(history.at(-1).executed.ok, false)
  assert.equal(fs.existsSync(path.join(hub, 'heartbeat/runtime/mac-acceptance.json')), false)
  run(path.join(hb, 'kit-macos.mjs'), ['--enable'], 1)
  config.options.toolsAllowlist = []
  write(cfg, JSON.stringify(config))
  run(path.join(hb, 'heartbeat.mjs'), ['--force'], 1)
  assert.equal(fs.existsSync(path.join(hub, 'heartbeat/runtime/mac-acceptance.json')), false)
  config.options.toolsAllowlist = ['memindex', 'self', 'daily', 'doctor']
  write(cfg, JSON.stringify(config))
  checks += 2
  const imported = await import(pathToFileURL(path.join(hb, 'kit-macos.mjs')).href)
  assert.equal(imported.cronDue({ now: Date.parse('2026-11-04T04:29:00Z'), config: { options: { schedule: { mode: 'cron', cron: '30 12 * * *', timezone: 'Asia/Shanghai' } } } }).due, false)
  assert.equal(imported.cronDue({ now: Date.parse('2026-11-04T04:30:00Z'), config: { options: { schedule: { mode: 'cron', cron: '30 12 * * *', timezone: 'Asia/Shanghai' } } } }).due, true)
  checks += 12
  // 不用真实 ComfyUI：远程控制、陌生进程、spawn 错误必须拒绝且不杀任何进程。
  const options = { host: 'example.invalid', port: 8188, base: 'http://example.invalid:8188', directory: root, logDir: root, up: async () => false, saveState() {}, invalidate() {} }
  const remote = await macModel(options, { kill: () => assert.fail('不得停止远程进程') })
  assert.equal((await remote.start()).ok, false)
  assert.equal((await remote.stop()).ok, false)
  const calls = []
  const native = await macModel({ ...options, host: '127.0.0.1' }, { run: async (file, args) => { calls.push([file, args]); return { stdout: file.endsWith('lsof') ? '12345' : 'node' } }, kill: () => assert.fail('不得停止非 Python') })
  assert.equal((await native.stop()).ok, false)
  assert.ok(calls.length)
  let ended = false
  const signals = []
  const owned = await macModel({ ...options, host: '127.0.0.1' }, {
    run: async (file, args) => {
      if (file.endsWith('lsof') && args.includes('-t')) return { stdout: ended ? '' : '12345' }
      if (file.endsWith('lsof')) return { stdout: 'n' + root }
      if (args.includes('comm=')) return { stdout: 'python3' }
      if (args.includes('command=')) return { stdout: 'python3 main.py' }
      return { stdout: '12345 1\n12346 12345' }
    },
    kill: (pid, signal) => { signals.push([pid, signal]); ended = true }, sleep: async () => {}
  })
  assert.equal((await owned.stop()).ok, true)
  assert.deepEqual(signals, [[12346, 'SIGTERM'], [12345, 'SIGTERM']])
  write(path.join(root, 'main.py'), '# fixture')
  const spawnError = await macModel({ ...options, host: '127.0.0.1', python: process.execPath }, {
    run: async () => ({ stdout: '' }), sleep: async () => {}, spawn: () => {
      const child = new EventEmitter()
      child.unref = () => {}
      queueMicrotask(() => child.emit('error', new Error('fixture spawn denied')))
      return child
    }
  })
  assert.match((await spawnError.start()).message, /fixture spawn denied/)
  checks += 5
  const app = path.join(root, '应用 空格.app')
  write(path.join(app, 'Contents/Info.plist'), 'fixture')
  const apps = await macApps({ roots: [root], run: (file, args, opts) => {
    if (file.endsWith('plutil')) return JSON.stringify({ CFBundleExecutable: 'test', CFBundleName: '应用' })
    assert.deepEqual(args, ['-a', app])
    assert.equal(opts.env.ELECTRON_RUN_AS_NODE, undefined)
    return ''
  } })
  assert.equal(apps.scan().items.length, 1)
  assert.equal(apps.open(app), 'OK')
  assert.throws(() => apps.open('/unlisted.app'))
  checks += 8
  // 模拟 launchctl，真实生成并校验 plist；不会向系统注册任何任务。
  write(path.join(hub, 'echo-doctor.mjs'), 'console.log("fixture passed")')
  run(path.join(hb, 'heartbeat.mjs'), ['--force'])
  const schedulerCheck = path.join(root, 'check-scheduler.mjs')
  write(schedulerCheck, `
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const real = cp.execFileSync;
const loaded = new Set(['com.dsh-soul.heartbeat']);
cp.execFileSync = (file, args, opts) => {
  if (file !== '/bin/launchctl') return real(file, args, opts);
  const label = args[0] === 'bootstrap' ? path.basename(args[2], '.plist') : args[1].split('/').at(-1);
  if (args[0] === 'print' && !loaded.has(label)) throw new Error('not loaded');
  if (args[0] === 'bootstrap') loaded.add(label);
  if (args[0] === 'bootout') loaded.delete(label);
  return '';
};
syncBuiltinESMExports();
const mod = await import(${JSON.stringify(pathToFileURL(path.join(hb, 'kit-macos.mjs')).href)});
const oldFile = path.join(process.env.HOME, 'Library/LaunchAgents/com.dsh-soul.heartbeat.plist');
fs.mkdirSync(path.dirname(oldFile), { recursive: true });
const old = '<plist version="1.0"><dict><key>Label</key><string>com.dsh-soul.heartbeat</string><key>ProgramArguments</key><array><string>node</string><string>' + path.join(mod.soul, '60-工具/heartbeat.mjs') + '</string></array></dict></plist>';
fs.writeFileSync(oldFile, old);
assert.throws(() => mod.enable(), /retire-kit/);
const retired = mod.retireKit();
assert.equal(retired.kitDaily, false);
assert.equal(retired.loaded, false);
assert.equal(fs.existsSync(oldFile), false);
const status = mod.enable();
assert.equal(status.loaded, true);
real('/usr/bin/plutil', ['-lint', path.join(path.dirname(oldFile), status.label + '.plist')]);
assert.equal(loaded.has('com.dsh-soul.heartbeat'), false);
mod.disable();
assert.equal(fs.existsSync(oldFile), false);
assert.equal(loaded.has('com.dsh-soul.heartbeat'), false);
assert.equal(mod.replaceKit, undefined);
assert.equal(mod.restoreKit, undefined);
mod.retireKit(); // 重复退役不重新注册旧任务
assert.equal(mod.scheduleStatus().loaded, false);
assert.deepEqual(mod.outsidePaths({path: path.join(mod.hub, 'new.txt')}, [mod.hub]), []);
assert.equal(mod.outsidePaths({path: mod.hub + '-outside/file'}, [mod.hub]).length, 1);
`)
  run(schedulerCheck)
  checks += 12
  if (process.platform === 'darwin') {
    write(path.join(hub, 'echo-config.mjs'), `export const HUB = ${JSON.stringify(hub)}; export const SOUL = ${JSON.stringify(env.ECHO_SOUL)};`)
    let server, socket
    const start = async () => {
      const child = spawn(process.execPath, [path.join(hub, 'echo-svc.mjs')], { env, stdio: ['ignore', 'ignore', 'pipe'] })
      await new Promise((resolve, reject) => {
        let errors = ''
        const timer = setTimeout(() => { child.kill(); reject(new Error('socket server timeout')) }, 5000)
        child.once('error', (error) => { clearTimeout(timer); reject(error) })
        child.once('exit', (code) => { clearTimeout(timer); reject(new Error('socket server exit ' + code + ': ' + errors)) })
        child.stderr.on('data', (data) => { errors += String(data); if (errors.includes('echo-svc ready')) { clearTimeout(timer); resolve() } })
      })
      return child
    }
    const stop = (child) => new Promise((resolve) => { child.once('exit', resolve); child.kill('SIGTERM') })
    try {
      server = await start()
      socket = JSON.parse(fs.readFileSync(path.join(hub, '.cache/echo-svc.pid'))).pipe
      assert.equal(fs.statSync(socket).mode & 0o777, 0o600)
      const result = run(path.join(hub, 'echo-svc-client.mjs'), ['{"cmd":"stats"}'])
      assert.equal(JSON.parse(result.stdout).pid, server.pid)
      run(path.join(hub, 'echo-svc.mjs'), [], 1)
      await stop(server)
      server = null
      run(path.join(hub, 'echo-svc-client.mjs'), ['{"cmd":"stats"}'], 2)
      server = await start()
      assert.equal(JSON.parse(run(path.join(hub, 'echo-svc-client.mjs'), ['{"cmd":"stats"}']).stdout).pid, server.pid)
      checks += 6
    } finally {
      if (server) await stop(server)
      if (socket) fs.rmSync(socket, { force: true })
    }
  }
  console.log(`macOS 自检通过：${checks} 项（临时目录；没有注册真实 launchd 或打开真实应用）`)
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
