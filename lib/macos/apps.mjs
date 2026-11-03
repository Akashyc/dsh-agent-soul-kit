// 内联进 yantai，沿用 readApps / tryFocus 的接口。
export async function macApps(adapters = {}) {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const os = await import('node:os')
  const { execFileSync } = await import('node:child_process')
  const run = adapters.run || execFileSync
  const roots = adapters.roots || ['/Applications', path.join(os.homedir(), 'Applications'), '/System/Applications']
  let cache = null
  function scan() {
    // shortcut: 上游按数组下标启动应用，重启 DSH 才重扫；改成稳定应用 ID 后再支持热刷新。
    if (cache) return cache
    const items = [], seen = new Set(), warnings = []
    function walk(dir, depth) {
      let entries
      try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch (error) { if (error.code !== 'ENOENT') warnings.push(`${dir}: ${error.code}`); return }
      for (const entry of entries) {
        const file = path.join(dir, entry.name)
        if (/\.app$/i.test(entry.name)) {
          try {
            const target = fs.realpathSync(file)
            if (seen.has(target)) continue
            const plist = path.join(target, 'Contents', 'Info.plist')
            const info = JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', plist], { encoding: 'utf8', timeout: 3000 }))
            if (!info.CFBundleExecutable) continue
            seen.add(target)
            items.push({ name: String(info.CFBundleDisplayName || info.CFBundleName || entry.name.slice(0, -4)), target, icon: '' })
          } catch (error) { warnings.push(`${entry.name}: ${error.code || 'Info.plist 无效'}`) }
        } else if (entry.isDirectory() && depth < 2) walk(file, depth + 1)
      }
    }
    for (const root of roots) walk(root, 0)
    items.sort((a, b) => a.name.localeCompare(b.name))
    cache = { at: Date.now(), items, warnings }
    return cache
  }
  function open(target) {
    if (!path.isAbsolute(target) || !/\.app$/i.test(target) || !scan().items.some((app) => app.target === target)) throw new Error('只能打开已扫描的本机 .app')
    if (!fs.existsSync(path.join(target, 'Contents', 'Info.plist'))) throw new Error('应用已移除，请刷新列表')
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    run('/usr/bin/open', ['-a', target], { env, encoding: 'utf8', timeout: 8000 })
    return 'OK'
  }
  return { scan, open }
}
