// 此工厂会内联进上游插件；所有依赖都在函数内，避免另装运行时依赖。
export async function macModel(options, adapters = {}) {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const cp = await import('node:child_process')
  const { promisify } = await import('node:util')
  const run = adapters.run || promisify(cp.execFile)
  const request = adapters.fetch || fetch
  const kill = adapters.kill || process.kill.bind(process)
  const spawn = adapters.spawn || cp.spawn
  const sleep = adapters.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const { host, port, base, directory } = options
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host.toLowerCase())
  const failure = (action, message) => ({ ok: false, action, message })
  const command = (file, args) => run(file, args, { timeout: 5000, encoding: 'utf8' })
  async function listeners() {
    if (!local || !Number.isInteger(port) || port < 1 || port > 65535) return []
    try {
      const { stdout } = await command('/usr/sbin/lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])
      return [...new Set(stdout.trim().split(/\s+/).map(Number).filter((pid) => Number.isSafeInteger(pid) && pid > 1 && pid !== process.pid))]
    } catch (error) {
      if (error.code === 1 && !String(error.stderr || '').trim()) return []
      throw error
    }
  }
  async function owned(pid) {
    if (!directory) return false
    const executable = await command('/bin/ps', ['-p', String(pid), '-o', 'comm='])
    if (!/^python(?:\d+(?:\.\d+)*)?$/i.test(path.basename(executable.stdout.trim()))) return false
    const cmd = await command('/bin/ps', ['-p', String(pid), '-o', 'command='])
    if (!/(?:^|[\s/])main\.py(?:\s|$)/.test(cmd.stdout)) return false
    const cwd = await command('/usr/sbin/lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'])
    const actual = cwd.stdout.split('\n').find((line) => line.startsWith('n'))?.slice(1)
    return Boolean(actual && fs.realpathSync(actual) === fs.realpathSync(directory))
  }
  async function probe() {
    try {
      let stats = null
      try {
        const res = await request(`${base}/system_stats`, { signal: AbortSignal.timeout(3000) })
        if (res.ok) stats = await res.json()
      } catch { /* 未运行的服务没有 API 读数。 */ }
      const pids = []
      for (const pid of await listeners()) if (await owned(pid)) pids.push(pid)
      let memMB = 0
      if (pids.length) {
        const result = await command('/bin/ps', ['-p', pids.join(','), '-o', 'rss='])
        memMB = result.stdout.trim().split(/\s+/).reduce((sum, value) => sum + (Number(value) || 0), 0) / 1024
      }
      const device = stats?.devices?.[0]
      const gpu = Number.isFinite(device?.vram_total) && Number.isFinite(device?.vram_free)
        ? { name: String(device.name || device.type || ''), usedMiB: Math.max(0, device.vram_total - device.vram_free) / 1048576, totalMiB: device.vram_total / 1048576, utilPct: null }
        : null
      function models(subdir) {
        if (!directory) return []
        const dir = path.join(directory, 'models', subdir)
        if (!fs.existsSync(dir)) return []
        return fs.readdirSync(dir).flatMap((name) => {
          const st = fs.statSync(path.join(dir, name))
          return st.isFile() && st.size ? [{ name, gb: st.size / 1024 ** 3 }] : []
        })
      }
      const parts = [['unet', /^qwen_image_2\.1_turbo/i], ['text_encoders', /^qwen3vl_8b_w4a8\.safetensors$/i], ['vae', /^qwen_image_2\.1_vae_bf16\.safetensors$/i]]
        .flatMap(([part, pattern]) => models(part).filter((file) => pattern.test(file.name)).map((file) => ({ part, ...file })))
      return { ok: true, raw: { comfyui: { running: !!stats || pids.length > 0, apiUp: !!stats, pids, memMB, endpoint: base }, gpu,
        checkpoints: models('checkpoints'), bundles: parts.length ? [{ name: 'Qwen-Image 2.1 Turbo', gb: parts.reduce((sum, file) => sum + file.gb, 0), parts }] : [], ports: [{ name: 'comfyui', port, up: !!stats }] } }
    } catch (error) { return { ok: false, error: `macOS 探测失败：${error.message}` } }
  }
  async function start() {
    if (!local || options.badEndpoint) return failure('start', '只允许控制明确配置的本机 ComfyUI')
    if (await options.up()) {
      options.saveState({ phase: 'running', note: 'already' })
      options.invalidate()
      return { ok: true, action: 'start', already: true }
    }
    if (!directory || !path.isAbsolute(directory) || !fs.existsSync(path.join(directory, 'main.py'))) return failure('start', '请配置 COMFYUI_DIR 为包含 main.py 的绝对路径')
    if ((await listeners()).length) return failure('start', '端口已被占用，未启动第二个进程')
    const python = options.python || ['.venv/bin/python3', 'venv/bin/python3', '.venv/bin/python', 'venv/bin/python'].map((p) => path.join(directory, p)).find((p) => fs.existsSync(p))
    if (!python || !path.isAbsolute(python) || /\.exe$/i.test(python)) return failure('start', '请配置 COMFYUI_PY 为 macOS Python 的绝对路径')
    try { fs.accessSync(python, fs.constants.X_OK) } catch { return failure('start', 'COMFYUI_PY 不存在或没有执行权限') }
    fs.mkdirSync(options.logDir, { recursive: true })
    const logPath = path.join(options.logDir, `statusbar-comfy-${new Date().toISOString().slice(0, 10)}.log`)
    const fd = fs.openSync(logPath, 'a')
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    let child, error = null, exited = false
    try {
      child = spawn(python, ['main.py', '--listen', host === 'localhost' ? '127.0.0.1' : host.replace(/^\[|\]$/g, ''), '--port', String(port), '--disable-auto-launch'], { cwd: directory, env, detached: true, stdio: ['ignore', fd, fd] })
      child.on('error', (err) => { error = err })
      child.on('exit', () => { exited = true })
      child.unref()
    } catch (err) { error = err } finally { fs.closeSync(fd) }
    for (let i = 0; i < 120 && !error && !exited; i++) {
      await sleep(1000)
      if (error || exited) break
      if (await options.up(1500)) {
        options.saveState({ phase: 'running', startedPid: child.pid })
        options.invalidate()
        return { ok: true, action: 'start', pid: child.pid, logPath, message: 'ComfyUI 已就绪' }
      }
    }
    options.invalidate()
    return { ...failure('start', error ? error.message : exited ? '进程已退出，请查看日志' : '120 秒内未就绪，请查看日志'), logPath }
  }
  async function stop() {
    if (!local || options.badEndpoint) return failure('stop', '只允许控制明确配置的本机 ComfyUI')
    if (!directory) return failure('stop', '未配置 COMFYUI_DIR，无法核实进程归属')
    const pids = await listeners()
    for (const pid of pids) if (!await owned(pid)) return failure('stop', '端口进程不属于指定目录的 Python main.py，未停止')
    const killed = []
    for (const pid of pids) {
      const { stdout } = await command('/bin/ps', ['-axo', 'pid=,ppid='])
      const rows = stdout.trim().split('\n').map((line) => line.trim().split(/\s+/).map(Number))
      const targets = new Set([pid])
      for (let size = 0; size !== targets.size;) {
        size = targets.size
        for (const [child, parent] of rows) if (targets.has(parent) && child > 1 && child !== process.pid) targets.add(child)
      }
      if (!await owned(pid)) return failure('stop', '进程归属已变化，未停止')
      for (const target of [...targets].reverse()) {
        try { kill(target, 'SIGTERM'); killed.push(target) } catch (error) { if (error.code !== 'ESRCH') throw error }
      }
    }
    await sleep(2000)
    options.invalidate()
    const remaining = await listeners()
    const stillUp = await options.up(2000)
    if (!remaining.length && !stillUp) options.saveState({ phase: 'stopped' })
    return { ok: !remaining.length && !stillUp, action: 'stop', killed, message: remaining.length || stillUp ? '服务尚未退出，未强制杀进程' : '已关闭' }
  }
  return { probe, start, stop, local: local && !options.badEndpoint }
}
