// kit 修复清单（3.0）：kit 对上游插件的每一处修改都登记成一条「修复」，装完对照作者原文逐条判定。
//
// 为什么要单独成清单（2026-10-29，Boss 定的需求，全文见项目文档 kit-3.0-修复功能需求.md）：
//   作者会更新插件，kit 补的那些问题作者迟早会自己修。以前补丁写死在安装 / 更新流程里，
//   作者修好了 kit 还在打，或者锚点对不上就静默跳过。现在每条修复都带「怎么判断问题还在」：
//     问题还在 → kit 修；作者已修 → 不打，已装的 kit 修复版换回作者原文；判断不了 → 报需人工核对，不猜。
//   判定只看文件内容（和少量本机环境），不看「锚点在不在」：锚点没了可能是作者修了，也可能只是改写了那段。
//
// 四个阶段：
//   pre    装前：决定装什么（换气取哪个仓库、零件按什么包名落地），安装 / 更新的计划阶段生效
//   file   文件补丁：装好后对照作者原文重算每个文件（planFile）
//   config profile 配置（cordis.patch.yml 里的值）
//   preset Soul preset 生成时的调整
//
// 这个文件同时被 install.mjs、lib/kit-iterate.mjs 和 tests/ 使用：装的、迭代查的、测的是同一份定义。
import os from 'node:os'
import path from 'node:path'
import { homeRel, autoHomeExpr, homePathExpr, MEMORY_OLD, memoryNew, MEMORY_ANY, MEMORY_PRESSURE_OLD, memoryPressureNew, MEMORY_PRESSURE_ANY } from './home-paths.mjs'
import { OLD as HUANQI_PANEL_OLD, NEW as HUANQI_PANEL_NEW, ANY as HUANQI_PANEL_ANY, FIXED as HUANQI_PANEL_FIXED } from './huanqi-panel-patch.mjs'
import { organPatches, patchText, unpatchText, IDLE_OLD, INPUT_OLD } from './organ-patches.mjs'
import { fixQuotedBooleans } from './config-sanitize.mjs'

export { patchText, unpatchText }

const posix = (p) => String(p).replace(/\\/g, '/')
const reEsc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// ── 全部条目（id 一经使用永不复用；since 是加进 kit 的版本）────────────────────────────────
// basis：kit = kit 自己发现；author = 作者自己点过名的问题，kit 来修；boss = Boss 本机实测
export const FIXES = [
  { id: 'src-huanqi-organs', phase: 'pre', part: 'huanqi', since: '2.16', basis: 'author', title: '换气改从零件仓 organs 取', why: '作者 10-28：换气的 region 分支改成只走 /compact-region，这次改动只落在 organs，主仓那份不会调 compact-region' },
  { id: 'name-compaction', phase: 'pre', part: 'compaction', since: '2.11', basis: 'author', title: '包名 dsh-agent-compaction → dsh-yanqing-compaction', why: '上游 preset 引用的是新名，包还叫旧名就加载不到' },
  { id: 'name-pruner', phase: 'pre', part: 'pruner', since: '2.11', basis: 'author', title: '包名 dsh-agent-pruner → dsh-yanqing-pruner', why: '同上' },
  { id: 'name-compact-region', phase: 'pre', part: 'compact-region', since: '2.11', basis: 'author', title: '包名 dsh-agent-compact-region → dsh-yanqing-compact-region', why: '同上' },
  { id: 'name-huanqi', phase: 'pre', part: 'huanqi', since: '2.16', basis: 'kit', title: '包名 dsh-agent-huanqi → dsh-huanqi', why: 'organs 的包名和主仓、换气面板、本机 bundles 用的不一样' },
  { id: 'mnemon-runtime', phase: 'file', part: 'mnemon-probe', since: '2.0', basis: 'kit', title: 'mnemon-probe 热记忆目录的默认值', why: 'DSH 桌面版不传 MNEMON_RUNTIME，默认的 ~/.mnemon/runtime 不一定是真实位置' },
  { id: 'memory-home', phase: 'file', part: 'memory', since: '2.6', basis: 'kit', title: 'memory 相对路径按 DSH 家目录定位', why: '上游只认 DSH_HOME 环境变量，没有就退回插件目录' },
  { id: 'memory-pressure', phase: 'file', part: 'memory', since: '2.6', basis: 'kit', title: 'memory 上下文水位找 DSH 家目录', why: '同上' },
  { id: 'clock-panel', phase: 'file', part: 'clock', since: '2.0', basis: 'kit', title: 'clock 面板定位', why: '坐标写在没有定位的外层元素上，面板掉出窗口' },
  { id: 'mcp-hub-home', phase: 'file', part: 'mcp-hub', since: '2.1', basis: 'kit', title: 'mcp-hub 清单位置', why: '没有 DSH_HOME 时退到作者电脑的 D:\\AI\\dsh\\home' },
  { id: 'yantai-soul', phase: 'file', part: 'yantai', since: '2.3', basis: 'kit', title: 'yantai 书房路径', why: '没配环境变量时找不到书房' },
  { id: 'yantai-memory', phase: 'file', part: 'yantai', since: '2.3', basis: 'kit', title: 'yantai 记忆中枢路径', why: '没配环境变量时找不到记忆中枢' },
  { id: 'riji-diary', phase: 'file', part: 'riji', since: '2.3', basis: 'kit', title: 'riji 日记目录', why: '只认 DSH_HOME，日记目录要跟着书房走' },
  { id: 'echo-load-name', phase: 'file', part: 'echo', since: '2.2', basis: 'kit', title: 'echo 的加载名等于包名', why: '上游改了包名、cordis.patch.yml 里漏改，DSH 按旧名找不到包' },
  { id: 'panel-load-name', phase: 'file', part: 'huanqi-panel', since: '2.2', basis: 'kit', title: '换气面板的加载名等于包名', why: '同上' },
  { id: 'panel-ensure-block', phase: 'file', part: 'huanqi-panel', since: '2.4', basis: 'kit', title: '换气面板：profile 没有 `- id: huanqi` 时自建一节', why: '面板只会改已有的节，第一次保存必报错' },
  { id: 'huanqi-hub-path', phase: 'file', part: 'huanqi', since: '2.16', basis: 'author', title: '换气诊断日志和测试触发口改到 DSH 家目录的记忆中枢', why: '写死作者电脑的 D:\\AI\\memory\\hub，作者自己点过名：装到别人机器就静默失效' },
  { id: 'huanqi-full-maint', phase: 'file', part: 'huanqi', since: '2.16', basis: 'boss', title: '换气熔断后的全量压缩去掉多套的一层 runMaintenance', why: 'compactNow 自己会排队等空闲，外面再套一层内层必报 requires an idle agent' },
  { id: 'huanqi-trigger-idle', phase: 'file', part: 'huanqi', since: '2.16', basis: 'boss', title: '换气测试触发口先等回合收尾再压', why: '触发口在回合进行中被抓到，直接压会撞上忙' },
  { id: 'cr-hub-path', phase: 'file', part: 'compact-region', since: '2.16', basis: 'author', title: 'compact-region 诊断日志改到 DSH 家目录的记忆中枢', why: '写死 D:\\AI\\memory\\hub；和换气写同一个文件是作者的设计' },
  { id: 'cr-input', phase: 'file', part: 'compact-region', since: '2.16', basis: 'boss', title: '/compact-region 声明参数输入', why: '不声明 input，输入框里带参数的命令会被前端当成普通消息' },
  { id: 'huanqi-config-bool', phase: 'config', part: 'huanqi', since: '2.13', basis: 'boss', title: '换气配置的字符串布尔改回真布尔', why: "面板把布尔写成 'true'，过不了 schema，整段配置静默退回默认值" },
  { id: 'preset-summary-model', phase: 'preset', part: null, since: '2.17', basis: 'boss', title: '压缩摘要跟会话模型走', why: '作者写死 summarizationProvider: deepseek-official，要 API key；账号登录的机器压缩全失败' },
].map((fix) => ({
  ...fix,
  type: fix.phase === 'pre' ? (fix.id.startsWith('name-') ? 'package-name' : 'source')
    : fix.phase === 'config' || fix.phase === 'preset' ? fix.phase
    : fix.id.endsWith('load-name') ? 'load-name' : /path|home|runtime|soul|memory|diary/.test(fix.id) ? 'path' : 'behavior',
  target: fix.phase === 'preset' ? 'dsh-soul-preset/cordis.patch.yml'
    : fix.phase === 'config' ? 'profile/cordis.patch.yml#huanqi'
    : `${fix.part}/${fix.phase === 'pre' ? 'package.json' : /load-name$/.test(fix.id) ? 'cordis.patch.yml' : fix.part === 'memory' || fix.part === 'huanqi' ? 'lib/index.js' : fix.part === 'clock' ? 'client.js' : 'index.js'}`,
  evidence: [{ source: 'lib/fixes.mjs', detail: fix.why },
    ...(/^(huanqi-|cr-|src-huanqi|name-huanqi|name-compact-region)/.test(fix.id)
      ? [{ source: 'assets/parts/SOURCE.json', upstream: '6735d72ef039159fa611f429fd9b813e8dc4ecdc' }] : [])],
  applicability: fix.part ? `仅在 ${fix.part} 已安装或本次计划安装时适用` : '仅在安装 Soul preset 时适用',
  validation: fix.phase === 'file' ? ['syntax-or-yaml', 'byte-roundtrip'] : fix.phase === 'pre' ? ['package-name', 'client-id', 'load-name'] : ['yaml', 'byte-roundtrip']
}))
export const FIX_IDS = FIXES.map((f) => f.id)
export const fixInfo = (id) => FIXES.find((f) => f.id === id) || null
export const BASIS_TEXT = { kit: 'kit 发现', author: '作者点过名', boss: 'Boss 本机实测' }

// ── 判定结果的说法（报告和安装记录共用）──────────────────────────────────────────────
// status：这一条在作者这一版上的结论；action：对本机已装文件做什么
export const STATUS_TEXT = {
  kit: '问题还在，kit 修',
  author: '作者已修（或上游没有这个问题）',
  'n/a': '本机不需要',
  skipped: '按设置跳过',
  manual: '需人工核对',
  'not-installed': '没装这个零件',
  clean: '没有这个问题',
  frozen: '这次不处理（--fix-only 没选它）',
}
export const ACTION_TEXT = {
  apply: '打上', keep: '保持', refresh: '换成现行写法', revert: '撤掉，换回作者原文', none: '不动',
  local: '本机改过，不动', manual: '不动', reinstall: '重装', pending: '待选',
}

// ── 文件补丁（file 阶段）───────────────────────────────────────────────────────────
// any：认得出「已经打过」的写法（包括早期手工打的）；fixed：作者自己改好的写法；
// refresh：打过但不是现在的写法（例如早期写死了路径）时换成现在的写法；all：同一处原文出现几次换几次
// problem 命中表示问题在；正向特征才能证明已修；scope 仅保留作定位线索。
const PROBLEMS = {
  'mnemon-runtime': { problem: "const RUNTIME = process.env.MNEMON_RUNTIME || path.join(os.homedir(), '.mnemon', 'runtime')", scope: /const RUNTIME = / },
  'memory-home': { problem: /join\(ENV\('DSH_HOME'\) \|\| HERE, p\)/, scope: /const anchorUser = / },
  'memory-pressure': { problem: /^ {8}const home = ENV\('DSH_HOME'\);/m, scope: /ENV\('DSH_HOME'\)/ },
  'clock-panel': { problem: 'h("div", { style: panelStyle }, h(ClockPanel))', scope: /h\(ClockPanel\)/ },
  'mcp-hub-home': { problem: /['"]D:[\\/]+AI[\\/]+dsh[\\/]+home['"]/, scope: /process\.env\.DSH_HOME/ },
  'yantai-soul': { problem: /const SOUL = ENV\('YANTAI_SOUL'\)[ \t]*(?:\r?\n|$)/, scope: /ENV\('YANTAI_SOUL'\)/ },
  'yantai-memory': { problem: /const MEMORY_DIR = ENV\('YANTAI_MEMORY'\)[ \t]*(?:\r?\n|$)/, scope: /ENV\('YANTAI_MEMORY'\)/ },
  'riji-diary': { problem: "DSH_HOME ? join(DSH_HOME, 'diary') : ''", scope: /diary|日记/ },
  'panel-ensure-block': { problem: "if (!loc) throw new Error('这份 cordis.patch.yml 里没有 `- id: huanqi` 这一节", scope: /function applyValues\(/ },
  'huanqi-hub-path': { problem: /['"`]D:[\\/]+AI[\\/]+memory[\\/]+hub/, scope: /_plugin-diag\.log/ },
  'huanqi-full-maint': { problem: /runMaintenance\s*\(\s*async\s*\([^)]*\)\s*=>\s*\{[^{}]*?await\s+svc\.compactNow\(/, scope: /svc\.compactNow\(/ },
  'huanqi-trigger-idle': { problem: IDLE_OLD, scope: /const tryOnce = async/ },
  'cr-hub-path': { problem: /['"`]D:[\\/]+AI[\\/]+memory[\\/]+hub/, scope: /_plugin-diag\.log/ },
  'cr-input': { problem: INPUT_OLD, scope: /name: 'compact-region'/ },
}

/**
 * 文件补丁清单。
 * @param ctx runtime：mnemon 热记忆目录（解析不出就不加那一条）；names：零件目录名 → 这次落地的包名；
 *            dshHome：DSH 家目录；partNames：每个零件认得的包名（第一个是现在的）
 */
export function fileFixes({ runtime, names, dshHome, partNames }) {
  const list = [
    // 路径类补丁都不写死某台电脑的路径：运行时自己找 DSH 家目录（lib/home-paths.mjs），换电脑、换用户名、挪家目录都不用重打。
    // refresh：以前写死了绝对路径的旧补丁（或别的电脑带过来的），认出来就换成自动定位的写法。
    // 解析不出热记忆目录时整个条目不加：让 probe 保持上游默认（每轮报读盘失败是诚实的），
    // 绝不能把 null 拼进它的默认路径
    ...(runtime ? [(() => {
      const rel = homeRel(runtime, dshHome)
      const def = rel ? `path.join(${autoHomeExpr()}, ${rel.split('/').map((x) => JSON.stringify(x)).join(', ')})` : JSON.stringify(posix(runtime))
      return {
        key: 'mnemon-runtime', pkg: 'dsh-agent-mnemon-probe', file: 'index.js', label: 'mnemon-probe 默认路径', refresh: true,
        needed: path.resolve(runtime) !== path.resolve(os.homedir(), '.mnemon', 'runtime'),
        old: "const RUNTIME = process.env.MNEMON_RUNTIME || path.join(os.homedir(), '.mnemon', 'runtime')",
        new: `const RUNTIME = process.env.MNEMON_RUNTIME || ${def} // 本机改：DSH 不传环境变量，默认值指向真实的 mnemon 热记忆目录${rel ? '（运行时按 DSH 家目录定位）' : '（不在 DSH 家目录下，只能写绝对路径）'}`,
        any: /const RUNTIME = process\.env\.MNEMON_RUNTIME \|\| [^\n]*本机改[^\n]*/,
      }
    })()] : []),
    {
      key: 'memory-home', pkg: 'dsh-agent-memory', file: 'lib/index.js', label: 'memory 相对路径按 DSH 家目录定位', needed: true, refresh: true,
      old: MEMORY_OLD, new: memoryNew(), any: MEMORY_ANY,
    },
    {
      key: 'memory-pressure', pkg: 'dsh-agent-memory', file: 'lib/index.js', label: 'memory 上下文水位找 DSH 家目录', needed: true, refresh: true,
      old: MEMORY_PRESSURE_OLD, new: memoryPressureNew(), any: MEMORY_PRESSURE_ANY,
    },
    {
      key: 'clock-panel', pkg: 'dsh-agent-clock', file: 'client.js', label: 'clock 面板定位', needed: true,
      old: 'open ? h("div", { style: panelStyle }, h(ClockPanel)) : null);',
      new: 'open ? h("div", { style: Object.assign({ position: "fixed", zIndex: 300 }, panelStyle) }, h(ClockPanel)) : null);   // 本机修：坐标要落在固定定位的元素上',
      any: /open \? h\("div", \{ style: Object\.assign\(\{ position: "fixed", zIndex: 300 \}, panelStyle\) \}, h\(ClockPanel\)\) : null\);[^\n]*/,
    },
    {
      key: 'mcp-hub-home', pkg: 'dsh-mcp-hub', file: 'index.js', label: 'mcp-hub 清单位置', needed: true, refresh: true,
      old: "return process.env.DSH_HOME || 'D:\\\\AI\\\\dsh\\\\home'",
      new: `return process.env.DSH_HOME || ${autoHomeExpr()} // 本机改：DSH 家目录不一定在环境变量里，运行时按插件所在位置找`,
      any: /return process\.env\.DSH_HOME \|\| [^\n]*本机改[^\n]*/,
    },
    {
      key: 'yantai-soul', pkg: 'dsh-agent-yantai', file: 'index.js', label: 'yantai 账本 / 书房路径', needed: true, refresh: true,
      old: "const SOUL = ENV('YANTAI_SOUL')",
      new: `const SOUL = ENV('YANTAI_SOUL') || ${homePathExpr('dsh-soul/soul')} // 本机改：DSH 不传环境变量，默认指向 DSH 家目录下的书房`,
      any: /const SOUL = ENV\('YANTAI_SOUL'\) \|\| [^\n]*本机改[^\n]*/,
    },
    {
      key: 'yantai-memory', pkg: 'dsh-agent-yantai', file: 'index.js', label: 'yantai 记忆中枢路径', needed: true, refresh: true,
      old: "const MEMORY_DIR = ENV('YANTAI_MEMORY')",
      new: `const MEMORY_DIR = ENV('YANTAI_MEMORY') || ${homePathExpr('dsh-soul/memory')} // 本机改：指向 DSH 家目录下的记忆中枢（memq 在它下面）`,
      any: /const MEMORY_DIR = ENV\('YANTAI_MEMORY'\) \|\| [^\n]*本机改[^\n]*/,
    },
    {
      key: 'riji-diary', pkg: 'dsh-agent-riji', file: 'index.js', label: 'riji 日记目录', needed: true, refresh: true,
      old: "DSH_HOME ? join(DSH_HOME, 'diary') : '',",
      new: `${homePathExpr('dsh-soul/soul/50-日记')},  // 本机改：日记目录跟着书房走（运行时按 DSH 家目录定位）`,
      any: /(?<=^[ \t]*)\S[^\n]*50-日记[^\n]*本机改[^\n]*/m,
    },
  ]
  for (const part of ['echo', 'huanqi-panel']) {
    const pkg = names[part]
    if (!pkg || pkg !== partNames[part][0]) continue // 上游还是旧名时不用改
    const olds = partNames[part].slice(1)
    list.push({
      key: part === 'echo' ? 'echo-load-name' : 'panel-load-name', pkg, file: 'cordis.patch.yml', label: `${pkg} 的加载名`, needed: olds.length > 0,
      old: `name: ${olds[0]}`, olds: olds.map((n) => `name: ${n}`),
      new: `name: ${pkg}   # 本机修：要等于包名（上游改了包名，这里漏改）`,
      // 也认 2.16 以前改名时顺手写成的不带注释的写法（name: <包名>），更新时换成现行写法
      any: new RegExp(`name: ['"]?${reEsc(pkg)}['"]?(?:[ \\t]+# 本机修[^\\n]*)?(?=[ \\t]*$)`, 'm'),
      fixed: new RegExp(`^\\s*name: ['"]?${reEsc(pkg)}['"]?\\s*$`, 'm'),
    })
  }
  if (names['huanqi-panel']) list.push({
    key: 'panel-ensure-block', pkg: names['huanqi-panel'], file: 'index.js',
    label: '换气面板：profile 里没有 `- id: huanqi` 时自建一节', needed: true,
    old: HUANQI_PANEL_OLD, new: HUANQI_PANEL_NEW,
    any: HUANQI_PANEL_ANY, fixed: HUANQI_PANEL_FIXED,
  })
  // 换气、compact-region（organs 零件）：作者写死的 D:\\AI\\memory\\hub 改成运行时找家目录，加两处 Boss 本机实测的行为修复（lib/organ-patches.mjs）
  list.push(...organPatches(names))
  const byPkg = Object.fromEntries(Object.entries(names).map(([part, pkg]) => [pkg, part]))
  return list.filter((p) => byPkg[p.pkg]).map((p) => {
    // 加载名：问题 = cordis.patch.yml 还在用旧包名加载
    const extra = /-load-name$/.test(p.key)
      ? { problem: new RegExp(`^\\s*name:\\s*['"]?(?:${(p.olds || [p.old]).map((o) => reEsc(o.replace(/^name: /, ''))).join('|')})['"]?\\s*$`, 'm'), scope: /^\s*name:/m }
      : PROBLEMS[p.key] || {}
    return { ...p, id: p.key, part: byPkg[p.pkg], title: (fixInfo(p.key) || {}).title || p.label, ...extra }
  })
}

/**
 * 判断一条修复要解决的问题在这段文本里还在不在。
 * @returns 'present' 问题在 / 'absent' 作者已修（或没有这个问题）/ 'unknown' 那段代码认不出来，判断不了
 */
export function detectFix(fix, text) {
  const t = String(text)
  const probs = Array.isArray(fix.problem) ? fix.problem : [fix.problem]
  if (probs.some((p) => p && (typeof p === 'string' ? t.includes(p) : p.test(t)))) return 'present'
  // 只改变空白的旧代码仍有问题；锚点不再精确匹配时交给人工改写。
  const compact = (value) => String(value).replace(/\s+/g, '').replace(/"/g, "'")
  if ((fix.olds || [fix.old]).some((old) => old && compact(t).includes(compact(old)))) return 'present'
  if (fix.id === 'memory-home' && /join\(ENV\('DSH_HOME'\)\|\|HERE,p\)/.test(compact(t))) return 'present'
  const positive = {
    'memory-home': /const anchorUser\s*=.*join\((?:DSH_HOME_AUTO|home\(\)|resolveUserHome\(\)),\s*p\)/,
    'memory-pressure': /const home\s*=\s*ENV\(['"]DSH_HOME['"]\)\s*\|\|\s*\S/,
    'mnemon-runtime': /const RUNTIME\s*=.*(?:DSH_HOME|resolveUserHome|soul-kit:auto-home)/,
    'clock-panel': /position:\s*['"]fixed['"][^\n]*panelStyle[^\n]*h\(ClockPanel\)/,
    'mcp-hub-home': /return process\.env\.DSH_HOME\s*\|\|\s*(?:.*soul-kit:auto-home|.*os\.homedir\(|resolveUserHome\()/,
    'yantai-soul': /const SOUL\s*=\s*ENV\(['"]YANTAI_SOUL['"]\)\s*\|\|\s*\S/,
    'yantai-memory': /const MEMORY_DIR\s*=\s*ENV\(['"]YANTAI_MEMORY['"]\)\s*\|\|\s*\S/,
    'riji-diary': /(?:soul-kit:auto-home|resolveUserHome\(\))[^\n]*50-日记/,
    'huanqi-full-maint': /await svc\.compactNow\(manualCtx,\s*(?:ac\.signal|new AbortController\(\)\.signal)\)/,
    'huanqi-trigger-idle': /const tryOnce\s*=\s*async[\s\S]*?await target\.whenIdle\(\)[\s\S]*?await compactOnce\(target,/,
    'huanqi-hub-path': /(?:join|resolve)\([^\n]*['_"]_plugin-diag\.log['"]\)/,
    'cr-hub-path': /(?:join|resolve)\([^\n]*['_"]_plugin-diag\.log['"]\)/,
    'cr-input': /name:\s*['"]compact-region['"](?:(?!\bname\s*:|\n\s*\}\);)[\s\S])*?input:\s*\{/,
  }
  if (positive[fix.id]?.test(t)) return 'absent'
  // 路径消失、函数还在都不是修好的证据。仅采用限定到目标功能的正向特征。
  if (['echo-load-name', 'panel-load-name', 'panel-ensure-block'].includes(fix.id) && fix.fixed?.test(t)) return 'absent'
  if (fix.new && t.includes(fix.new)) return 'absent'
  if (fix.fixed && !FIX_IDS.includes(fix.id) && fix.fixed.test(t)) return 'absent'
  return 'unknown'
}

/**
 * 一个文件：对照作者原文，算出这个文件应该是什么样（target），以及每条修复的结论和动作。
 * 作者原文先打上所有「问题还在」的修复得到 target；已装文件按清单还原后等于作者原文，才认作「作者原文 + kit 修复」可以重写，
 * 否则就是本机手改过，整个文件不动。
 * @param upstream 作者这一版的原文（已做称呼替换、包名改名）
 * @param installed 本机已装的文件文本；null 表示还没装（按 target 装）
 * @param fixes 这个文件上的修复（fileFixes 的条目，同一文件按清单顺序）
 * @param skip 跳过的 id（已装的 kit 修复会撤掉）
 * @param freeze 这次不处理的 id（--fix-only 没选的）：已装里有就照现行写法留着，没有就不加
 * @returns { target, state: 'same' | 'rewrite' | 'local' | 'missing', rows: [{ id, detect, status, action }] }
 */
export function planFile({ upstream, installed, fixes, skip = [], freeze = [], record = null, baseUpstream = null }) {
  let target = upstream
  const rows = []
  const has = (f) => typeof installed === 'string' && ((Boolean(f.new) && installed.includes(f.new)) || f.any.test(installed))
  for (const f of fixes) {
    const det = detectFix(f, upstream)
    let status
    if (freeze.includes(f.id)) {
      const old = has(f) && (f.olds || [f.old]).find((o) => target.includes(o))
      const existing = installed?.includes(f.new) ? f.new : installed?.match(f.any)?.[0]
      if (old && existing) target = patchText(target, { ...f, new: existing }, old)
      status = 'frozen'
    } else if (skip.includes(f.id)) status = 'skipped'
    else if (f.needed === false) status = 'n/a'
    else if (det === 'present') {
      const old = (f.olds || [f.old]).find((o) => target.includes(o))
      if (old) { target = patchText(target, f, old); status = 'kit' } else status = 'manual'
    } else status = det === 'absent' ? 'author' : 'manual'
    rows.push({ id: f.id, detect: det, status })
  }
  if (installed === null || installed === undefined) {
    for (const r of rows) r.action = r.status === 'kit' ? 'apply' : r.status === 'manual' ? 'manual' : 'none'
    return { target, state: 'missing', rows }
  }
  const pristine = unpatchText(installed, fixes) === upstream
    || (record && (installed === record.applied || installed === record.upstream))
    || (typeof baseUpstream === 'string' && unpatchText(installed, fixes) === baseUpstream)
  if (rows.some((r) => r.status === 'manual') && installed !== target) {
    return { target: installed, state: pristine ? 'same' : 'local', rows: rows.map((r) => ({ ...r, action: pristine ? 'manual' : 'local' })) }
  }
  const state = installed === target ? 'same' : pristine ? 'rewrite' : 'local'
  for (const [i, r] of rows.entries()) {
    const f = fixes[i]
    const hasNew = Boolean(f.new) && installed.includes(f.new), hasAny = f.any.test(installed)
    if (state === 'same') r.action = r.status === 'kit' ? 'keep' : r.status === 'manual' ? 'manual' : 'keep'
    else if (state === 'local') r.action = 'local'
    else if (r.status === 'frozen') r.action = 'none'
    else if (r.status === 'kit') r.action = hasNew ? 'keep' : hasAny ? 'refresh' : 'apply'
    else if (r.status === 'manual') r.action = hasNew || hasAny ? 'revert' : 'manual'
    else r.action = hasNew || hasAny ? 'revert' : 'none'
  }
  return { target, state, rows }
}

// ── 装前（pre 阶段）──────────────────────────────────────────────────────────────
/** 换气取哪个仓库：主仓那份调 /compact-region 就用主仓（作者同步过了）；只有 organs 那份调，就用 organs。 */
export function detectHuanqiSource(mainLib, organsLib) {
  const has = (text) => {
    if (typeof text !== 'string') return false
    const code = text.replace(/(['"`])(?:\\[\s\S]|(?!\1)[^\\])*?\1|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (token) => token.startsWith('/') ? '' : token)
    return /\b[\w.]+\(\s*(?:[\w.]+\s*,\s*)?['"`]\/compact-region(?:\s|['"`])/.test(code)
  }
  if (typeof mainLib !== 'string') return 'unknown'
  if (has(mainLib)) return 'absent'
  if (has(organsLib)) return 'present'
  return 'unknown'
}
/** 包名：上游包名和 kit 要落地的名字不一样，就是问题还在。 */
export function detectName(upstreamName, wanted) {
  if (!upstreamName || !wanted) return 'unknown'
  return upstreamName === wanted ? 'absent' : 'present'
}

/**
 * 包名只跟已读取的上游引用走，引用不唯一时不猜。
 * @param part 零件目录名
 * @param upstreamName 作者包名
 * @param texts 上游展开后的 preset 或换气面板文本
 * @param known 当前零件历史包名
 * @returns 目标包名；无法确认时返回 null
 */
export function referencedPackageName(part, upstreamName, texts, known) {
  const refs = known.filter((name) => texts.some((text) => new RegExp(`(?:name:\\s*['"]?|['"])${reEsc(name)}(?:['"]|\\s|$)`, 'm').test(text)))
  if (refs.length === 1) return refs[0]
  return null
}

// ── 配置（config 阶段）───────────────────────────────────────────────────────────
export function detectConfigBool(cfgText) {
  return fixQuotedBooleans(String(cfgText || '')).fixed.length ? 'present' : 'absent'
}

// ── preset（preset 阶段）─────────────────────────────────────────────────────────
/** 作者的 preset 里还写死要 API key 的摘要路由，就是问题还在。 */
export function detectSummaryRoute(presetTexts) {
  const ts = presetTexts.filter((t) => typeof t === 'string')
  if (!ts.length) return 'unknown'
  if (ts.some((t) => /^\s*summarizationProvider:\s*['"]?deepseek-official['"]?\s*$/m.test(t))) return 'present'
  return ts.some((t) => /(?:thresholdRatio:|id:\s*compaction|summarizationProvider:)/.test(t)) ? 'absent' : 'unknown'
}
/** 本机默认模型走哪条路由（profile 的 agent-default-model）；走的就是 deepseek-official（有 API key）时，不用去掉。 */
export function defaultProvider(cfgText) {
  const m = String(cfgText || '').replace(/\r\n/g, '\n').match(/^- id: ['"]?agent-default-model['"]?\n(?: {2,}.*\n?)*/m)
  const p = m && m[0].match(/^ {4}provider:\s*['"]?([\w.-]+)['"]?\s*$/m)
  return p ? p[1] : null
}

// ── kit 迭代（lib/kit-iterate.mjs）：对一份上游快照逐条判定，不碰本机、不打补丁 ─────────────────
const NAME_FIX_PARTS = { compaction: 'name-compaction', pruner: 'name-pruner', 'compact-region': 'name-compact-region', huanqi: 'name-huanqi' }
const PRESET_FILES = ['preset-yanqing', 'preset-yanqing-cordis', 'preset-yanqing-ptc', 'preset-yanqing-distill']

/**
 * 对一份上游（主仓 + organs）逐条看修复清单里的问题还在不在、kit 的锚点还对不对得上。
 * @param main 主仓源码目录；organs 零件仓目录（没有就是 null）；partNames 每个零件认得的包名；read(file) 读文本，没有返回 null
 * @returns { [id]: { detect: 'present'|'absent'|'unknown'|'missing'|'config', anchor, file } }，file 是相对「主仓」或「organs/」的路径
 */
export function inspectUpstream({ main, organs, partNames, read }) {
  const out = {}
  const at = (part) => (part === 'compact-region' || (part === 'huanqi' && hqOrgans) ? (organs ? { dir: path.join(organs, part), rel: `organs/${part}` } : null) : main ? { dir: path.join(main, 'plugins', part), rel: `plugins/${part}` } : null)
  const src = detectHuanqiSource(main ? read(path.join(main, 'plugins', 'huanqi', 'lib', 'index.js')) : null, organs ? read(path.join(organs, 'huanqi', 'lib', 'index.js')) : null)
  const hqOrgans = src === 'present'
  out['src-huanqi-organs'] = { detect: src, anchor: true, file: 'plugins/huanqi/lib/index.js' }
  for (const [part, id] of Object.entries(NAME_FIX_PARTS)) {
    const loc = at(part), t = loc && read(path.join(loc.dir, 'package.json'))
    let name = null
    try { name = t ? JSON.parse(t.replace(/^﻿/, '')).name : null } catch { name = null }
    const texts = part === 'huanqi'
      ? [main ? `name: ${(() => { try { return JSON.parse(read(path.join(main, 'plugins', 'huanqi', 'package.json'))).name } catch { return '' } })()}` : '']
      : main ? [...PRESET_FILES.map((file) => read(path.join(main, 'presets', file + '.yml'))), read(path.join(main, 'presets', '_shared', 'compaction.yml'))].filter((text) => typeof text === 'string') : []
    const wanted = referencedPackageName(part, name, texts, partNames[part])
    out[id] = name ? { detect: detectName(name, wanted), anchor: true, file: `${loc.rel}/package.json` } : { detect: 'missing', anchor: false, file: loc ? `${loc.rel}/package.json` : null }
  }
  const names = Object.fromEntries(Object.keys(partNames).map((p) => [p, partNames[p][0]]))
  for (const f of fileFixes({ runtime: '/kit-iterate/.mnemon/runtime', names, dshHome: '/kit-iterate', partNames })) {
    const loc = at(f.part), t = loc && read(path.join(loc.dir, f.file))
    const file = loc ? `${loc.rel}/${f.file}` : null
    out[f.id] = typeof t === 'string' ? { detect: detectFix(f, t), anchor: (f.olds || [f.old]).some((o) => t.includes(o)), file } : { detect: 'missing', anchor: false, file }
  }
  const presets = main ? PRESET_FILES.map((n) => read(path.join(main, 'presets', n + '.yml'))).filter((t) => typeof t === 'string') : []
  const shared = main && read(path.join(main, 'presets', '_shared', 'compaction.yml'))
  const det = detectSummaryRoute([...presets, ...(typeof shared === 'string' ? [shared] : [])])
  out['preset-summary-model'] = presets.length ? { detect: det, anchor: true, file: 'presets/' } : { detect: 'missing', anchor: false, file: 'presets/' }
  out['huanqi-config-bool'] = { detect: 'config', anchor: true, file: null }
  return out
}

export const CATEGORY_TEXT = {
  'still-needed': '仍需修',
  'author-fixed': '作者这次修好了（自动退役）',
  'already-fixed': '作者早就修好了 / 上游没有这个问题',
  'anchor-broken': '原文对不上，要 agent 改写或判断',
  'not-applicable': '不再适用（零件或文件没了）',
  unchecked: '本机配置类，上游查不了，保留',
}
/** 拿基线和目标两份判定，归成迭代要处理的类别。 */
export function classifyFix(base, target) {
  if (!target || target.detect === 'missing') return 'not-applicable'
  if (target.detect === 'config') return 'unchecked'
  if (target.detect === 'present') return target.anchor ? 'still-needed' : 'anchor-broken'
  if (target.detect === 'absent') return base && base.detect === 'present' ? 'author-fixed' : 'already-fixed'
  return 'anchor-broken'
}

/**
 * 找疑似新问题：清单还没管、但和清单里同类的毛病（写死作者电脑的路径、加载名 ≠ 包名）。
 * @param dirs [{ dir, rel, files }]：每个零件的源码目录、报告里用的相对路径、发布清单内的文件
 * @param covered 清单已经在管的文件（相对路径）→ 不重复报
 */
export function scanCandidates({ dirs, read, covered = new Set() }) {
  const out = []
  const PATH_RE = /(['"`])(?:[A-Za-z]:(?:\\\\|\/)|\/Users\/[^/]+\/)[^'"`\n]{0,160}\1/
  const packages = new Set(dirs.flatMap(({ dir }) => {
    try { return [JSON.parse(read(path.join(dir, 'package.json'))).name] } catch { return [] }
  }))
  for (const { dir, rel, files } of dirs) {
    const pj = read(path.join(dir, 'package.json'))
    let pkg = null
    try { pkg = pj ? JSON.parse(pj.replace(/^﻿/, '')).name : null } catch { pkg = null }
    for (const f of files) {
      const r = `${rel}/${f}`
      if (/\.(?:m?js|cjs|ts)$/.test(f)) {
        const t = read(path.join(dir, f))
        if (typeof t !== 'string') continue
        const lines = t.split('\n')
        const hit = lines.findIndex((l) => !/^\s*(?:\/\/|\*|\/\*)/.test(l) && PATH_RE.test(l))
        if (hit >= 0 && !covered.has(r)) out.push({ id: `candidate:path:${r}`, kind: 'hardcoded-path', file: r, message: `第 ${hit + 1} 行写死了个人电脑绝对路径，装到别的电脑会静默失效` })
        const client = t.match(/(?:clientId|client\.id|\bid)\s*[:=]\s*['"](dsh-[\w-]+)['"]/)
        if (/client\.[mc]?js$/.test(f) && client && pkg && client[1] !== pkg) {
          out.push({ id: `candidate:client-id:${r}`, kind: 'client-id', file: r, message: `client id ${client[1]} ≠ 包名 ${pkg}` })
        }
      }
      if (f === 'cordis.patch.yml' && pkg && !covered.has(r)) {
        const t = read(path.join(dir, f))
        const m = typeof t === 'string' && t.match(/^\s*name:\s*['"]?([\w@/.-]+)['"]?\s*$/m)
        if (m && m[1] !== pkg && !m[1].startsWith('@deepseek-ai/') && !m[1].startsWith('cordis:')) out.push({ id: `candidate:load-name:${r}`, kind: 'load-name', file: r, message: `加载名 ${m[1]} ≠ 包名 ${pkg}，DSH 按加载名找包会找不到` })
      }
      if (/\.ya?ml$/.test(f)) {
        const text = read(path.join(dir, f)) || ''
        if (/summarizationProvider:\s*['"]?deepseek-official/.test(text)) {
          out.push({ id: `candidate:model-route:${r}`, kind: 'model-route', file: r, message: '压缩摘要指定需要 API key 的 deepseek-official 路由，需核对本机模型' })
        }
        if (/preset|presets/.test(r)) {
          const names = [...text.matchAll(/^\s*name:\s*['"]?(dsh-[\w-]+)['"]?\s*$/gm)].map((match) => match[1])
          for (const name of new Set(names.filter((name) => !packages.has(name)))) {
            out.push({ id: `candidate:preset-package:${r}:${name}`, kind: 'preset-package', file: r, message: `preset 引用 ${name}，扫描范围内没有对应包；核对宿主自带包和修复后的包名` })
          }
        }
        const code = files.filter((file) => /\.[mc]?js$/.test(file)).map((file) => read(path.join(dir, file)) || '').join('\n')
        for (const [, key, type] of code.matchAll(/\b(\w+)\s*:\s*(?:z|Schema)\.(boolean|number)\(/g)) {
          if (new RegExp(`^\\s*${reEsc(key)}:\\s*['"][^'"\\n]+['"]\\s*$`, 'm').test(text)) {
            out.push({ id: `candidate:config-type:${r}:${key}`, kind: 'config-type', file: r, message: `${key} 的 schema 要求 ${type}，配置却是字符串` })
          }
        }
      }
    }
  }
  return out
}
