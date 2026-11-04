import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PACKAGE = path.dirname(fileURLToPath(import.meta.url))
const match = PACKAGE.replace(/\\/g, '/').match(/^(.*)\/profiles\/[^/]+\/node_modules\//)
export const home = process.env.DSH_HOME || match?.[1] || path.join(os.homedir(), '.dsh')
export const hub = process.env.YQ_HUB || path.join(home, 'dsh-soul', 'memory', 'hub')
export const soul = process.env.YQ_SOUL || path.join(home, 'dsh-soul', 'soul')
export const directory = process.env.YQ_HB_DIR || path.join(hub, 'heartbeat', 'runtime')
const configFile = path.join(directory, 'heartbeat.config.json')
const label = `com.dsh-soul.heartbeat.mac.${crypto.createHash('sha256').update(path.resolve(home)).digest('hex').slice(0, 12)}`
const agents = path.join(os.homedir(), 'Library', 'LaunchAgents')
const plist = path.join(agents, label + '.plist')
const oldPlist = path.join(agents, 'com.dsh-soul.heartbeat.plist')
const migration = path.join(directory, 'kit-migration.json')
const acceptance = path.join(directory, 'mac-acceptance.json')
const runner = path.join(PACKAGE, 'heartbeat.mjs')
const job = `gui/${process.getuid?.()}/${label}`
const call = (args) => execFileSync('/bin/launchctl', args, { encoding: 'utf8', timeout: 10000 })
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
const digest = (text) => crypto.createHash('sha256').update(text).digest('hex')
const plistData = (file) => JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file], { encoding: 'utf8', timeout: 5000 }))
const write = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.' + process.pid + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
  fs.renameSync(tmp, file)
}
export function init() {
  fs.mkdirSync(directory, { recursive: true })
  fs.mkdirSync(path.join(hub, 'heartbeat'), { recursive: true })
  if (!fs.existsSync(configFile)) write(configFile, { enabled: false, options: {
    idleThresholdMinutes: 15, checkIntervalMinutes: 10, graceMinutes: 5,
    schedule: { mode: 'cron', cron: '0 6,12 * * *', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    catchUpMissed: false, budget: { maxRunsPerDay: 6, maxTokensPerRun: null }, quietHours: null,
    toolsAllowlist: ['memindex', 'self', 'daily', 'doctor'], retry: { max: 1, delaySec: 5 }, customSteps: [], logLevel: 'full',
    auditLevel: 'strict', audit: { tier: 1, enabled: true, humanPresentMinutes: 15, sandboxDirs: [hub, soul], irreversible: ['delete', 'push', 'trade'] }
  }, ignoreSessionIds: [] })
  return read(configFile)
}
export const childEnv = () => ({ ...process.env, DSH_HOME: home, YQ_HUB: hub, YQ_SOUL: soul, YQ_HB_DIR: directory })
function signature() {
  const files = ['index.js', 'heartbeat.mjs', 'heartbeat-core.mjs', 'activity.mjs', 'kit-macos.mjs']
  const hash = crypto.createHash('sha256')
  for (const name of files) hash.update(fs.readFileSync(path.join(PACKAGE, name)))
  for (const name of ['memindex.mjs', 'self.mjs', 'echo-doctor.mjs']) hash.update(fs.readFileSync(path.join(hub, name)))
  const { enabled, ...config } = read(configFile)
  hash.update(JSON.stringify(config))
  return hash.digest('hex')
}
function oldTask() {
  if (!fs.existsSync(oldPlist)) return null
  const text = fs.readFileSync(oldPlist, 'utf8')
  const job = plistData(oldPlist)
  const scripts = [path.join(soul, '60-工具', 'heartbeat.mjs'), path.join(hub, 'heartbeat.sh')]
  if (job.Label !== 'com.dsh-soul.heartbeat' || !Array.isArray(job.ProgramArguments) || !scripts.includes(job.ProgramArguments[1])) throw new Error('每日自检属于另一套安装，未改动')
  return text
}
export function scheduleStatus() {
  let loaded = false
  try { call(['print', job]); loaded = true } catch { /* 未注册。 */ }
  return { label, loaded, plist: fs.existsSync(plist), kitDaily: Boolean(oldTask()), migrated: fs.existsSync(migration) }
}
export function cronDue({ now, config, lastRunAt }) {
  const schedule = config.options?.schedule
  if (schedule?.mode !== 'cron') return { due: false, reason: '非 cron 模式' }
  const m = String(schedule.cron).match(/^(\d{1,2}) (\d{1,2}(?:,\d{1,2})*) \* \* \*$/)
  if (!m || Number(m[1]) > 59 || m[2].split(',').some((h) => Number(h) > 23)) return { due: false, reason: '仅支持 M H,H * * *' }
  const zone = schedule.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
  const fields = (t) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t)).map((x) => [x.type, x.value]))
  const current = fields(now), last = lastRunAt ? fields(lastRunAt) : null
  const day = (x) => `${x.year}-${x.month}-${x.day}`
  const minute = Number(current.hour) * 60 + Number(current.minute)
  const slots = m[2].split(',').map((h) => Number(h) * 60 + Number(m[1]))
  const eligible = slots.filter((slot) => slot <= minute && (config.options.catchUpMissed || minute - slot < 60))
  const lastMinute = last && day(last) === day(current) ? Number(last.hour) * 60 + Number(last.minute) : -1
  return { due: eligible.some((slot) => slot > lastMinute), reason: `${zone} ${current.hour}:${current.minute}；cron=${schedule.cron}` }
}
// 运行前加进程锁；手动、launchd、重复点击共用，进程异常退出后可核实 PID 再清理。
export function beginRun(scheduled) {
  init()
  if (scheduled && oldTask()) { console.log('kit 每日自检尚未迁移，跳过定时巡视'); process.exit(0) }
  const lock = path.join(directory, 'run.lock')
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, 'utf8'))
    if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error('心跳锁无效，请人工核实')
    try { process.kill(pid, 0); throw new Error('已有心跳运行') } catch (error) { if (error.code !== 'ESRCH') throw error }
    fs.unlinkSync(lock)
  }
  fs.writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 })
  process.on('exit', () => { if (fs.existsSync(lock) && fs.readFileSync(lock, 'utf8') === String(process.pid)) fs.unlinkSync(lock) })
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => process.exit(1))
}
export function recordAcceptance(record) {
  const required = ['memindex build', 'self assemble', 'heartbeat daily', 'echo doctor']
  if (!record.executed) return
  if (!record.executed.ok || !required.every((step) => record.executed.steps.some((s) => s.step === step && s.ok)) || record.executed.rejectedCustom?.length) {
    fs.rmSync(acceptance, { force: true })
    return
  }
  write(acceptance, { at: new Date().toISOString(), signature: signature(), home, hub, steps: required })
}
export function nextRun(config, now = Date.now()) {
  const schedule = config.options?.schedule
  const m = String(schedule?.cron).match(/^(\d{1,2}) (\d{1,2}(?:,\d{1,2})*) \* \* \*$/)
  if (!m || Number(m[1]) > 59 || m[2].split(',').some((h) => Number(h) > 23)) return { ok: false, why: 'cron 无效' }
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: schedule.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  for (let t = Math.floor(now / 60000) * 60000 + 60000; t < now + 172800000; t += 60000) {
    const [hour, minute] = fmt.format(t).split(':').map(Number)
    if (minute === Number(m[1]) && m[2].split(',').map(Number).includes(hour)) return { ok: true, enabled: !!config.enabled, cron: schedule.cron, at: new Date(t).toISOString(), inMin: Math.ceil((t - now) / 60000) }
  }
  return { ok: false, why: '48 小时内没有触发点' }
}
export function outsidePaths(args, sandbox) {
  const paths = []
  const collect = (value) => {
    if (typeof value === 'string' && value.startsWith('/')) paths.push(value)
    else if (Array.isArray(value)) value.forEach(collect)
    else if (value && typeof value === 'object') Object.values(value).forEach(collect)
  }
  collect(args)
  if (!paths.length || !sandbox.length) return ['无法核实绝对路径或未配置沙箱']
  const canonical = (file) => {
    let parent = path.resolve(file), tail = []
    while (!fs.existsSync(parent)) { tail.unshift(path.basename(parent)); parent = path.dirname(parent) }
    return path.join(fs.realpathSync(parent), ...tail)
  }
  const roots = sandbox.map(canonical)
  return paths.filter((file) => { const full = canonical(file); return !roots.some((root) => full === root || full.startsWith(root + path.sep)) })
}
export function daily() {
  // 上游引用的 hub/heartbeat.mjs 未发布；这里只核实已生成的派生物并落日报，不冒充缺失脚本。
  const files = ['SELF.md', 'index/words.jsonl', 'index/summaries.jsonl']
  const lines = ['# 心跳 · daily 派生物检查', '', new Date().toISOString()]
  for (const name of files) {
    const file = path.join(hub, name)
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`派生物缺失：${name}`)
    lines.push(`- ${name}: ${fs.statSync(file).size} bytes`)
  }
  const day = new Date().toLocaleDateString('en-CA')
  fs.mkdirSync(path.join(hub, 'heartbeat'), { recursive: true })
  fs.writeFileSync(path.join(hub, 'heartbeat', `${day}-daily.md`), lines.join('\n') + '\n')
  console.log(lines.join('\n'))
}
export function enable() {
  const check = read(acceptance)
  if (check.signature !== signature() || check.home !== home || check.hub !== hub || Date.now() - Date.parse(check.at) > 86400000) throw new Error('需要最近 24 小时内、当前代码的完整四步验收')
  if (oldTask() || fs.existsSync(migration)) throw new Error('先用 --retire-kit 退役旧 kit 任务，再单独启用作者 heartbeat')
  const config = init()
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const args = [process.execPath, runner, '--scheduled']
  const env = childEnv()
  const envKeys = ['DSH_HOME', 'YQ_HUB', 'YQ_SOUL', 'YQ_HB_DIR', ...(process.env.ELECTRON_RUN_AS_NODE ? ['ELECTRON_RUN_AS_NODE'] : [])]
  const text = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${args.map((v) => `<string>${esc(v)}</string>`).join('')}</array><key>StartInterval</key><integer>60</integer><key>EnvironmentVariables</key><dict>${envKeys.map((k) => `<key>${k}</key><string>${esc(env[k])}</string>`).join('')}</dict><key>StandardOutPath</key><string>${esc(path.join(directory, 'launchd.log'))}</string><key>StandardErrorPath</key><string>${esc(path.join(directory, 'launchd.log'))}</string></dict></plist>`
  if (fs.existsSync(plist) && fs.readFileSync(plist, 'utf8') !== text) throw new Error('已有不同的 launchd 配置，未覆盖')
  const before = scheduleStatus()
  if (before.loaded && !before.plist) throw new Error('同名任务已加载但缺少本包 plist，请人工核实')
  fs.mkdirSync(agents, { recursive: true })
  fs.writeFileSync(plist, text)
  try { if (!scheduleStatus().loaded) call(['bootstrap', `gui/${process.getuid()}`, plist]) } catch (error) { fs.unlinkSync(plist); throw error }
  config.enabled = true
  write(configFile, config)
  return scheduleStatus()
}
export function disable() {
  if (fs.existsSync(plist)) {
    const data = plistData(plist)
    if (data.Label !== label || data.ProgramArguments?.[1] !== runner || data.EnvironmentVariables?.DSH_HOME !== home) throw new Error('launchd 文件已改成其它任务，未停用或删除')
  } else if (scheduleStatus().loaded) throw new Error('同名任务已加载但缺少本包 plist，请人工核实')
  if (scheduleStatus().loaded) call(['bootout', job])
  if (fs.existsSync(plist)) fs.unlinkSync(plist)
  const config = init()
  config.enabled = false
  write(configFile, config)
  return scheduleStatus()
}
// 只退役旧 kit 任务，不启用新任务，也不恢复或重新注册旧任务。
export function retireKit() {
  if (fs.existsSync(migration)) {
    const saved = read(migration)
    if (saved.home !== home || saved.oldPlist !== oldPlist || saved.digest !== digest(saved.old)) throw new Error('迁移记录不属于当前安装或内容已改动')
    if (fs.existsSync(oldPlist) && fs.readFileSync(oldPlist, 'utf8') !== saved.old) throw new Error('旧任务文件已改动，未处理')
  }
  const old = oldTask()
  if (old) {
    let loaded = false
    try { call(['print', `gui/${process.getuid()}/com.dsh-soul.heartbeat`]); loaded = true } catch { /* 已停用。 */ }
    if (loaded) call(['bootout', `gui/${process.getuid()}/com.dsh-soul.heartbeat`])
    fs.unlinkSync(oldPlist)
  } else {
    let loaded = false
    try { call(['print', `gui/${process.getuid()}/com.dsh-soul.heartbeat`]); loaded = true } catch { /* 没有旧任务。 */ }
    if (loaded) throw new Error('旧任务仍加载但缺少 plist，无法核对归属，未处理')
  }
  if (fs.existsSync(migration)) fs.unlinkSync(migration)
  return scheduleStatus()
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.platform !== 'darwin') throw new Error('仅用于 macOS')
    const action = process.argv[2]
    if (action === '--daily') daily()
    else if (action === '--enable') console.log(enable())
    else if (action === '--disable') console.log(disable())
    else if (action === '--retire-kit') console.log(retireKit())
    else if (action === '--status') console.log(scheduleStatus())
    else throw new Error('用法：--status | --enable | --disable | --retire-kit；先用 heartbeat.mjs --force 验收')
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
