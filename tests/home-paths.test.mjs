// 路径自动定位（lib/home-paths.mjs）回归：
//   1. 家目录推算：DSH_HOME → 插件所在位置（Mac / Windows / 带空格和中文）→ ~/.dsh；
//   2. 注入插件的表达式：放进一个假的 profile 布局里真跑一遍，结果和函数一致；整个家目录挪走后照样对；
//   3. memory 补丁：相对路径落到 DSH 家目录，默认 state.json 仍在插件目录，绝对路径原样；
//   4. memory 配置：没有就写相对路径；别的电脑带过来的、旧写法的改成这台的；有意的自定义不动。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  locateDshHome, autoHomeExpr, homeRel, homePathExpr, MEMORY_OLD, memoryNew, MEMORY_ANY,
  MEMORY_PRESSURE_OLD, memoryPressureNew, MEMORY_PRESSURE_ANY, planMemoryConfig, memoryConfigPaths,
} from '../lib/home-paths.mjs'

// macOS 的 /var 是指向 /private/var 的符号链接，而 ESM 会按真实路径给 import.meta.url；
// 先取 realpath，子进程算出来的家目录才和这里的期望是同一种写法。
const tmp = (name) => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `soul-kit-${name}-`)))
const posix = (p) => p.replace(/\\/g, '/')

test('家目录推算：环境变量优先，其次插件所在位置，最后 ~/.dsh', () => {
  const mac = 'file:///Users/yu/.dsh/profiles/desktop/node_modules/dsh-agent-memory/lib/index.js'
  const win = 'file:///C:/Users/Akady/.dsh/profiles/desktop/node_modules/dsh-agent-memory/lib/index.js'
  const odd = 'file:///Users/a%20b/%E6%96%87%E6%A1%A3/dsh%20home/profiles/work/node_modules/dsh-mcp-hub/index.js'
  assert.equal(locateDshHome(mac, {}), '/Users/yu/.dsh')
  assert.equal(locateDshHome(win, {}), 'C:/Users/Akady/.dsh')
  assert.equal(locateDshHome(odd, {}), '/Users/a b/文档/dsh home')
  assert.equal(locateDshHome(mac, { DSH_HOME: 'D:\\dsh\\home\\' }), 'D:/dsh/home')
  assert.equal(locateDshHome('file:///opt/x/plugin.js', { HOME: '/home/u' }), '/home/u/.dsh')
  assert.equal(locateDshHome('file:///opt/x/plugin.js', { USERPROFILE: 'C:\\Users\\u' }), 'C:/Users/u/.dsh')
  // 路径里本来就有 profiles 这个词：取最靠里的那一层
  assert.equal(locateDshHome('file:///data/profiles/me/.dsh/profiles/desktop/node_modules/p/i.js', {}), '/data/profiles/me/.dsh')
})

test('相对部分：在家目录下返回相对路径，Windows 盘符不分大小写，不在下面返回 null', () => {
  assert.equal(homeRel('/Users/yu/.dsh/dsh-soul/memory/hub', '/Users/yu/.dsh'), 'dsh-soul/memory/hub')
  assert.equal(homeRel('c:\\Users\\Akady\\.dsh\\.mnemon\\runtime', 'C:/Users/Akady/.dsh/'), '.mnemon/runtime')
  assert.equal(homeRel('/Users/yu/.dsh', '/Users/yu/.dsh'), '')
  assert.equal(homeRel('/Users/yu/.dsh-other/x', '/Users/yu/.dsh'), null)
  assert.equal(homeRel('/opt/mnemon/runtime', '/Users/yu/.dsh'), null)
})

// 在一个假的 profile 布局里放一个 ESM 模块，导出表达式的值，用子进程跑（环境变量可控）
function evalInLayout(home, exprSrc, env = {}) {
  const dir = path.join(home, 'profiles', 'desktop', 'node_modules', 'some-plugin', 'lib')
  fs.mkdirSync(dir, { recursive: true })
  const f = path.join(dir, 'probe.mjs')
  fs.writeFileSync(f, `export const V = ${exprSrc}\nconsole.log(JSON.stringify(V))\n`)
  const clean = { ...process.env }; delete clean.DSH_HOME
  const r = spawnSync(process.execPath, [f], { encoding: 'utf8', env: { ...clean, ...env } })
  assert.equal(r.status, 0, r.stderr)
  return JSON.parse(r.stdout.trim())
}

test('注入插件的表达式：真跑出来是插件所在的家目录；挪走整个家目录后跟着走；有 DSH_HOME 用它', () => {
  const root = tmp('expr')
  const a = path.join(root, '用户 甲', '.dsh')
  assert.equal(evalInLayout(a, autoHomeExpr()), posix(a))
  assert.equal(evalInLayout(a, homePathExpr('dsh-soul/soul')), posix(a) + '/dsh-soul/soul')
  const b = path.join(root, 'moved', 'dsh-home')
  fs.mkdirSync(path.dirname(b), { recursive: true })
  fs.renameSync(a, b)
  assert.equal(evalInLayout(b, autoHomeExpr()), posix(b))
  assert.equal(evalInLayout(b, autoHomeExpr(), { DSH_HOME: '/srv/dsh' }), '/srv/dsh')
  assert.ok(!autoHomeExpr().includes(root), '表达式里不能有任何一台电脑的路径')
})

test('memory 补丁：相对路径相对 DSH 家目录，默认 state.json 仍在插件目录，绝对路径原样', () => {
  const home = path.join(tmp('mem'), '.dsh')
  const dir = path.join(home, 'profiles', 'desktop', 'node_modules', 'dsh-agent-memory', 'lib')
  fs.mkdirSync(dir, { recursive: true })
  // 上游那几行的最小上下文
  const upstream = [
    "import { dirname, isAbsolute, join } from 'node:path';",
    "import { fileURLToPath } from 'node:url';",
    'const HERE = dirname(fileURLToPath(import.meta.url));',
    "const ENV = (k) => String(process.env[k] || '').trim();",
    "const isAbs = (p) => isAbsolute(p) || /^[A-Za-z]:[\\\\/]/.test(p);",
    MEMORY_OLD,
    'function readPressure() {',
    MEMORY_PRESSURE_OLD,
    '        return home;',
    '}',
    'export { anchorUser, anchorHere, readPressure, HERE };',
  ].join('\n')
  let t = upstream.replace(MEMORY_OLD, memoryNew()).replace(MEMORY_PRESSURE_OLD, memoryPressureNew())
  assert.ok(MEMORY_ANY.test(t) && MEMORY_PRESSURE_ANY.test(t), '打过补丁要认得出来')
  assert.ok(!MEMORY_ANY.test(upstream), '没打过的不能误认')
  // 再打一遍不变（幂等：install.mjs 看到 any 且写法相同就不动）
  assert.ok(t.includes(memoryNew()))
  fs.writeFileSync(path.join(dir, 'index.mjs'), t)
  const probe = path.join(dir, 'probe.mjs')
  fs.writeFileSync(probe, [
    "import { anchorUser, anchorHere, readPressure, HERE } from './index.mjs'",
    "console.log(JSON.stringify({ self: anchorUser('dsh-soul/memory/hub/SELF.md'), state: anchorHere('dsh-soul/memory/hub/state.json'),",
    "  def: anchorHere('state.json'), abs: anchorUser('/x/SELF.md'), empty: anchorUser(''), home: readPressure(), here: HERE }))",
  ].join('\n'))
  const clean = { ...process.env }; delete clean.DSH_HOME
  const r = spawnSync(process.execPath, [probe], { encoding: 'utf8', env: clean })
  assert.equal(r.status, 0, r.stderr)
  const o = JSON.parse(r.stdout)
  assert.equal(posix(o.self), posix(home) + '/dsh-soul/memory/hub/SELF.md')
  assert.equal(posix(o.state), posix(home) + '/dsh-soul/memory/hub/state.json')
  assert.equal(posix(o.def), posix(path.join(o.here, 'state.json')))
  assert.equal(o.abs, '/x/SELF.md')
  assert.equal(o.empty, '')
  assert.equal(posix(o.home), posix(home))
})

test('memory 配置：没有这一节就写相对路径', () => {
  const r = planMemoryConfig('# profile\n- id: ui-theme\n  config:\n    preference: system\n', { hub: '/Users/yu/.dsh/dsh-soul/memory/hub', dshHome: '/Users/yu/.dsh', relative: true })
  assert.match(r.text, /- id: dsh-agent-memory\n  name: dsh-agent-memory\n  config:\n    selfPath: 'dsh-soul\/memory\/hub\/SELF\.md'\n    statePath: 'dsh-soul\/memory\/hub\/state\.json'\n    maxBytes: 12288\n$/)
  assert.ok(!r.text.includes('/Users/yu'))
  // 补丁打不上 / 中枢不在家目录下：写绝对路径
  const a = planMemoryConfig('', { hub: 'C:/Users/Akady/.dsh/dsh-soul/memory/hub', dshHome: 'C:/Users/Akady/.dsh', relative: false })
  assert.ok(a.text.includes("selfPath: 'C:/Users/Akady/.dsh/dsh-soul/memory/hub/SELF.md'"))
  const o = planMemoryConfig('', { hub: '/data/soul/memory/hub', dshHome: '/Users/yu/.dsh', relative: true })
  assert.equal(o.paths.relative, false)
  assert.ok(o.text.includes("selfPath: '/data/soul/memory/hub/SELF.md'"))
})

test('memory 配置：Mac 带到 Windows 的旧路径改成这台的相对路径；同一位置的绝对写法也换成相对的', () => {
  const macBlock = [
    '- id: dsh-agent-memory',
    '  name: dsh-agent-memory',
    '  config:',
    '    selfPath: /Users/yu/.dsh/dsh-soul/memory/hub/SELF.md',
    '    statePath: /Users/yu/.dsh/dsh-soul/memory/hub/state.json',
    '    maxBytes: 12288',
    '- id: agent-preset-registry',
    '  config:',
    '    selectedDefault: ptc-soul-flash',
  ].join('\n')
  const win = planMemoryConfig(macBlock, { hub: 'C:/Users/Akady/.dsh/dsh-soul/memory/hub', dshHome: 'C:/Users/Akady/.dsh', relative: true, exists: () => false })
  assert.ok(win.text.includes("    selfPath: 'dsh-soul/memory/hub/SELF.md'"))
  assert.ok(win.text.includes("    statePath: 'dsh-soul/memory/hub/state.json'"))
  assert.ok(!win.text.includes('/Users/yu'))
  assert.ok(win.text.includes('selectedDefault: ptc-soul-flash'), '别的条目不能动')
  assert.equal(win.notes.length, 1)
  // Mac 自己：路径对，只是绝对写法 → 换成相对写法
  const mac = planMemoryConfig(macBlock, { hub: '/Users/yu/.dsh/dsh-soul/memory/hub', dshHome: '/Users/yu/.dsh', relative: true, exists: () => true })
  assert.ok(mac.text.includes("    selfPath: 'dsh-soul/memory/hub/SELF.md'"))
  // 已经是新写法：一个字不动
  const again = planMemoryConfig(mac.text, { hub: '/Users/yu/.dsh/dsh-soul/memory/hub', dshHome: '/Users/yu/.dsh', relative: true, exists: () => true })
  assert.equal(again.text, mac.text)
  assert.equal(again.notes.length, 0)
})

test('memory 配置：指向这台电脑上另一个确实存在的文件，当作有意设置不动；缺 maxBytes 补上，别的值只提醒', () => {
  const custom = '- id: dsh-agent-memory\n  name: dsh-agent-memory\n  config:\n    selfPath: /Users/yu/notes/MY-SELF.md\n    maxBytes: 9000\n'
  const r = planMemoryConfig(custom, { hub: '/Users/yu/.dsh/dsh-soul/memory/hub', dshHome: '/Users/yu/.dsh', relative: true, exists: (p) => p === '/Users/yu/notes/MY-SELF.md' })
  assert.ok(r.text.includes('selfPath: /Users/yu/notes/MY-SELF.md'))
  assert.ok(r.text.includes("    statePath: 'dsh-soul/memory/hub/state.json'"), '没写的补上')
  assert.ok(r.warns.some((w) => w.includes('有意的设置')))
  assert.ok(r.warns.some((w) => w.includes('maxBytes 是 9000')))
  const noCfg = planMemoryConfig('- id: dsh-agent-memory\n  name: dsh-agent-memory\n', { hub: '/h/.dsh/dsh-soul/memory/hub', dshHome: '/h/.dsh', relative: true })
  assert.match(noCfg.text, /  config:\n    maxBytes: 12288\n    statePath: 'dsh-soul\/memory\/hub\/state\.json'\n    selfPath: 'dsh-soul\/memory\/hub\/SELF\.md'\n|  config:\n[\s\S]*selfPath: 'dsh-soul\/memory\/hub\/SELF\.md'/)
  assert.ok(noCfg.text.includes('maxBytes: 12288'))
})

test('memoryConfigPaths：相对 / 绝对两种写法', () => {
  assert.deepEqual(memoryConfigPaths('/Users/yu/.dsh/dsh-soul/memory/hub', '/Users/yu/.dsh', true), { selfPath: 'dsh-soul/memory/hub/SELF.md', statePath: 'dsh-soul/memory/hub/state.json', relative: true })
  assert.equal(memoryConfigPaths('C:\\Users\\A\\.dsh\\dsh-soul\\memory\\hub', 'C:\\Users\\A\\.dsh', false).selfPath, 'C:/Users/A/.dsh/dsh-soul/memory/hub/SELF.md')
})