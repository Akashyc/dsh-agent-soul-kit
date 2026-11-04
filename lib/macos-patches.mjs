import fs from 'node:fs'
import { autoHomeExpr } from './home-paths.mjs'
import { macModel } from './macos/model.mjs'
import { macApps } from './macos/apps.mjs'
import { echoSocket } from './macos/echo-socket.mjs'

export const MACOS_FIXES = [
  { id: 'model-statusbar-darwin', part: 'model-statusbar', title: 'macOS 本地模型探测与进程控制',
    why: '原版依赖 PowerShell、taskkill 和 Windows Python', impact: '模型状态读不出，启动和停止失败',
    verify: ['核实 COMFYUI_HOST 指向本机、COMFYUI_DIR 含 main.py、COMFYUI_PY 是 Mac Python；未配置时不安装控制补丁', '用真实 ComfyUI 核对状态、启动、静息、停止；端口归属不明时必须拒绝停止；Apple GPU 利用率未提供时显示未知'] },
  { id: 'yantai-apps-darwin', part: 'yantai', title: 'macOS 速达扫描与打开应用',
    why: '原版应用扫描和前台激活只提供 .ps1', impact: '速达没有本机应用，点击 Windows 应用路径失败',
    verify: ['确认要使用速达；补丁扫描 /Applications、~/Applications 和 /System/Applications', '在 DSH 内打开一个已安装的 .app，核对 Electron 应用正常启动，失败要有错误提示'] },
  { id: 'heartbeat-darwin', part: 'heartbeat', title: 'macOS heartbeat 完整运行与每日自检迁移',
    why: '脚本未发布、路径和调度依赖 Windows；daily 引用的脚本未提供', impact: '只有空面板，手动巡视、定时执行及记录都无法闭环',
    verify: ['核实书房、中枢、当前 kit 每日自检和 heartbeat 配置；补丁默认关闭，不自动注册任务', '运行已装包 heartbeat.mjs --force；核对四步结果、派生物、日报、巡视历史和失败报警', '用 kit-macos.mjs --enable 注册新任务，再用 --status 核实 launchd；旧每日自检存在时新任务自动等待', '真实验收通过后运行 kit-macos.mjs --replace-kit；回退先 --restore-kit，再 --disable，最后撤回修复', '核实主导会话自主循环、审计和可选微信链路；不得把脚本通过等同于真实 DSH 验收'] },
  { id: 'echo-svc-darwin', part: 'echo', title: 'macOS 常驻检索的 Unix socket',
    why: '服务端与客户端写死 Windows 命名管道', impact: 'memq 无法使用常驻检索，会退回直接读盘',
    verify: ['确认需要 memq 常驻加速；mcp-hub 的 echo 服务可用时可以不装此项', '安装前停止已有 echo-svc；修复同时更新中枢的服务端与客户端', '手动运行中枢 echo-svc.mjs，核对客户端查询与 memq 回退；不自动创建常驻任务'] },
].map((f) => ({ ...f, phase: 'file', since: '5.3', basis: 'kit', blocking: false,
  when: `macOS 且安装了 ${f.part}、需要对应功能`, target: f.id === 'echo-svc-darwin' ? 'memory/hub/echo-svc*.mjs' : `${f.part}/index.js 及所需脚本`,
  type: 'behavior', validation: ['syntax', 'roundtrip', 'isolated-runtime'], evidence: [{ source: 'lib/macos-patches.mjs', detail: f.why }], applicability: '仅 macOS，由 Agent 核实后按计划选择' }))

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function patch(key, pkg, file, edits, extra = {}) {
  return { key, pkg, file, edits, old: edits[0].old, new: edits[0].new, any: new RegExp(escape(edits[0].new)), needed: process.platform === 'darwin', ...extra }
}
const edit = (old, value, all = false) => ({ old, new: value, all })
const mac = (old, value) => edit(old, `(process.platform === 'darwin' ? ${value} : ${old})`, true)

export function macosPatches(names) {
  const list = []
  if (names['model-statusbar']) {
    const anchor = "export const name = 'dsh-agent-model-statusbar'"
    const code = `\n// soul-kit:mac-model v1\nif (process.platform === 'darwin') {
  const native = await (${macModel.toString()})({ host: COMFY_HOST, port: COMFY_PORT, base: BASE, directory: COMFY_DIR, python: ENV('COMFYUI_PY'), badEndpoint: COMFY_EP.bad, logDir: LOG_DIR, up: comfyUp, saveState, invalidate: () => { probeCache = { at: 0, data: null } } })
  runProbeRaw = native.probe
  doStart = native.start
  doStop = native.stop
  const idle = doIdle
  doIdle = (...args) => native.local ? idle(...args) : Promise.resolve({ ok: false, action: 'idle', message: '只允许控制明确配置的本机 ComfyUI' })
  const original = normalize
  normalize = (raw) => { const out = original(raw); if (out.gpu && raw.gpu.utilPct === null) out.gpu.utilPct = null; return out }
}
// soul-kit:mac-model end\n`
    // 加在最后一个函数之后，工厂读到的常量都已完成初始化。
    list.push(patch('model-statusbar-darwin', names['model-statusbar'], 'index.js', [edit(anchor, anchor + '\n// soul-kit:mac-model'), edit("    execute: async ({ action }) => await act(action),\n  })\n}", "    execute: async ({ action }) => await act(action),\n  })\n}" + code)], { requires: ["'powershell.exe'", "'taskkill'", 'async function doStart()', 'async function doStop()'] }))
    list.push(patch('model-statusbar-darwin', names['model-statusbar'], 'client.js', [edit('gpu ? "  " + Math.round(gpu.utilPct) + "%" : ""', 'gpu ? (gpu.utilPct == null ? "  利用率未知" : "  " + Math.round(gpu.utilPct) + "%") : ""')]))
  }
  if (names.yantai) {
    const anchor = 'function tryFocus(exePath) {'
    const factory = `const kitMacApps = process.platform === 'darwin' ? await (${macApps.toString()})() : null\n`
    list.push(patch('yantai-apps-darwin', names.yantai, 'index.js', [
      edit(anchor, factory + anchor + "\n  if (kitMacApps) return kitMacApps.open(exePath)"),
      edit('function readApps() {', `function readApps() {
  if (kitMacApps) {
    try {
      mkdirSync(APPS_DIR, { recursive: true })
      const data = kitMacApps.scan(), usage = readUsage()
      return { ok: true, ...data, total: data.items.length, items: data.items.map((a) => ({ ...a, cat: classify(a.name, a.target), used: usage[a.target] || 0 })), cats: CATS.map(({ id, label, color }) => ({ id, label, color })) }
    } catch (error) { return { ok: false, message: error.message, items: [], total: 0, at: 0, cats: CATS } }
  }`),
    ], { requires: ["'powershell.exe'", 'function classify(name, target)', 'function readUsage()'] }))
  }
  if (names.heartbeat) {
    const key = 'heartbeat-darwin', pkg = names.heartbeat
    list.push(patch(key, pkg, 'index.js', [
      edit("import { execFile } from 'node:child_process'", "import { execFile } from 'node:child_process'\nimport * as kitMac from './kit-macos.mjs'\nif (process.platform === 'darwin') kitMac.init()"),
      edit("process.env.DSH_HOME || join(homedir(), '.dsh')", `process.env.DSH_HOME || ${autoHomeExpr()}`),
      // 上游 0221d89 从包外的 ../../lib/paths.mjs 取路径，装进 node_modules 后找不到；Mac 上路径由 kit-macos.mjs 定
      edit("import { resolveAll, explain } from '../../lib/paths.mjs'", "const resolveAll = () => ({ soul: { path: kitMac.soul }, memory: { path: dirname(kitMac.hub) } }), explain = (label, r) => label + ': ' + r.path"),
      mac("HUB + '\\\\heartbeat\\\\_run_out.json'", "join(HUB, 'heartbeat', '_run_out.json')"),
      mac("HUB + '\\\\heartbeat\\\\reports'", "join(HUB, 'heartbeat', 'reports')"),
      mac("HUB + '\\\\heartbeat'", "join(HUB, 'heartbeat')"),
      mac("join(AI_ROOT, 'dsh-tools', 'dsh-yanqing-heartbeat')", 'kitMac.directory'),
      mac("DAILY_DIR + '\\\\' + latest", 'join(DAILY_DIR, latest)'),
      mac("HB_DIR + '\\\\heartbeat.state.json'", "join(HB_DIR, 'heartbeat.state.json')"),
      mac("HB_DIR + '\\\\heartbeat.config.json'", "join(HB_DIR, 'heartbeat.config.json')"),
      mac("process.env.USERPROFILE || 'C:\\\\Users\\\\pc'", 'homedir()'),
      edit('function readScheduledTasks() {', "function readScheduledTasks() {\n  if (process.platform === 'darwin') return Promise.resolve([kitMac.scheduleStatus()])"),
      edit('function readNextRun () {', "function readNextRun () {\n  if (process.platform === 'darwin') return kitMac.nextRun(readConfigFile())"),
      edit('        if (SANDBOX.length) {', `        if (process.platform === 'darwin') {
          const outside = kitMac.outsidePaths(exec.arguments || {}, SANDBOX)
          if (outside.length) { writeAudit({ t: ts(), tool: name, decision: 'blocked', why: 'mac-sandbox-unverified' }); return '审计拦截：' + outside[0] }
        }
        if (SANDBOX.length) {`),
      edit('function syncScheduleTasks (cron) {', "function syncScheduleTasks (cron) {\n  if (process.platform === 'darwin') return Promise.resolve({ ok: true, ...kitMac.scheduleStatus(), note: 'launchd 每分钟读取当前 cron；启停请用 kit-macos.mjs' })"),
      edit("const PROBE = 'D:\\\\_yq_guard_probe.txt'", "if (process.platform === 'darwin') throw new Error('macOS 不写 Windows 诊断探针')\n      const PROBE = 'D:\\\\_yq_guard_probe.txt'"),
      edit("[join(HB_DIR, 'heartbeat.mjs'), ...args]", "[process.platform === 'darwin' ? decodeURIComponent(new URL('./heartbeat.mjs', import.meta.url).pathname) : join(HB_DIR, 'heartbeat.mjs'), ...args]"),
      edit('{ timeout: 300000, windowsHide: true, encoding:', "{ env: process.platform === 'darwin' ? kitMac.childEnv() : process.env, timeout: 1800000, windowsHide: true, encoding:"),
      edit('      wechat: readWechat(),', "      wechat: readWechat(),\n      ...(process.platform === 'darwin' ? { scheduler: kitMac.scheduleStatus() } : {}),"),
    ]))
    list.push(patch(key, pkg, 'heartbeat.mjs', [
      edit("import { promisify } from 'node:util';", "import { promisify } from 'node:util';\nimport * as kitMac from './kit-macos.mjs';\nkitMac.beginRun(process.argv.includes('--scheduled'));"),
      edit("const HERE = dirname(fileURLToPath(import.meta.url));", 'const HERE = kitMac.directory;'),
      edit("process.env.DSH_HOME || join(homedir(), '.dsh')", 'kitMac.home'),
      edit("(() => { const p = resolveAll().memory.path; return process.env.YQ_HUB || (p ? join(p, 'hub') : ''); })()", 'kitMac.hub'),
      edit('process.env.YQ_SOUL || resolveAll().soul.path', 'kitMac.soul'),
      edit("join(SCRIPT_DIR, 'dsh-origin.txt')", "join(HERE, 'dsh-origin.txt')"),
      edit("(() => { const p = join(HUB, 'heartbeat.mjs'); return existsSync(p) ? ['daily', 'heartbeat daily', p, ['daily']] : null; })(),", "['daily', 'heartbeat daily', join(SCRIPT_DIR, 'kit-macos.mjs'), ['--daily']],"),
      edit("const cron = decideCron({ now, config, lastRunAt: state.lastRunAt });", 'const cron = kitMac.cronDue({ now, config, lastRunAt: state.lastRunAt });'),
      edit("{ timeout: 180000, windowsHide: true", "{ env: kitMac.childEnv(), cwd: HUB, timeout: 600000, windowsHide: true"),
      edit("if (!/\\.(mjs|js|cjs|cmd|ps1)$/i.test(file))", "if (!/\\.(mjs|js|cjs)$/i.test(file))"),
      edit("if (!Array.isArray(allow) || allow.length === 0) return { steps: all, skipped: [], legacy: true }", "if (!Array.isArray(allow)) return { steps: all, skipped: [] };\n  if (allow.length === 0) return { steps: [], skipped: all.map(s => s[0]) }"),
      edit('return { steps: all, skipped: [], legacy: true, raw: allow }', 'return { steps: [], skipped: all.map(s => s[0]), raw: allow }'),
      edit('const r = { ok: steps.every((x) => x.ok), ms: Date.now() - t0, steps }', 'const r = { ok: steps.length > 0 && steps.every((x) => x.ok) && custom.rejected.length === 0, ms: Date.now() - t0, steps }'),
      edit('process.exit(0);', 'kitMac.recordAcceptance(record);\nprocess.exit(record.executed?.ok === false || record.executed?.rejectedCustom?.length ? 1 : 0);'),
    ], { create: true }))
    list.push(patch(key, pkg, 'activity.mjs', [edit("import { join } from 'node:path'", "import { join } from 'node:path'\nimport { homedir } from 'node:os'")], { create: true }))
    list.push(patch(key, pkg, 'heartbeat-core.mjs', [edit('// heartbeat-core.mjs', '// soul-kit:mac-heartbeat\n// heartbeat-core.mjs')], { create: true }))
    const helper = fs.readFileSync(new URL('./macos/heartbeat-support.mjs', import.meta.url), 'utf8')
    list.push(patch(key, pkg, 'kit-macos.mjs', [edit('', helper)], { create: true, provided: true }))
  }
  if (names.echo) {
    for (const client of [false, true]) {
      const old = client ? "const PIPE = process.env.ECHO_PIPE || '\\\\\\\\.\\\\pipe\\\\echo-hub';" : 'const PIPE = process.env.ECHO_PIPE || "\\\\\\\\.\\\\pipe\\\\echo-hub";'
      const endpoint = `const PIPE = process.platform === 'darwin' ? await (${echoSocket.toString()})(${client ? "process.env.ECHO_HUB || (await import('./echo-config.mjs')).HUB" : 'HUB'}, ${!client}) : ${old.slice('const PIPE = '.length)}`
      const edits = [edit(old, endpoint)]
      if (!client) edits.push(edit('server.listen(PIPE, () => {', "server.listen(PIPE, () => {\n  if (process.platform === 'darwin') fs.chmodSync(PIPE, 0o600);"))
      list.push(patch('echo-svc-darwin', names.echo, client ? 'echo-svc-client.mjs' : 'echo-svc.mjs', edits, { location: 'hub' }))
    }
  }
  return list
}
