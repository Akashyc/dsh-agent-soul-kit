// kit 修复清单（3.0）：kit 对上游插件的每一处修改都登记成一条「修复」。安装、更新只按作者上游装，装完由 --fix 对照作者原文逐条判定，用户选了才修（4.3）。
//
// 为什么要单独成清单（2026-10-29，Boss 定的需求，全文见项目文档 kit-3.0-修复功能需求.md）：
//   作者会更新插件，kit 补的那些问题作者迟早会自己修。以前补丁写死在安装 / 更新流程里，
//   作者修好了 kit 还在打，或者锚点对不上就静默跳过。现在每条修复都带「怎么判断问题还在」：
//     问题还在 → kit 修；作者已修 → 不打，已装的 kit 修复版换回作者原文；判断不了 → 报需人工核对，不猜。
//   判定只看文件内容（和少量本机环境），不看「锚点在不在」：锚点没了可能是作者修了，也可能只是改写了那段。
//
// 四个阶段（4.0 去掉了「装前」：作者弃用零件仓 organs、包名统一回 dsh-agent-*，换源和改包名的五条退役）：
//   pack   拷包：上游发布清单漏列的文件，--fix 时补拷进已装的包（install.mjs 的 PACK_EXTRA）
//   file   文件补丁：装好后对照作者原文重算每个文件（planFile）
//   config profile 配置（cordis.patch.yml 里的值）
//   preset Soul preset 生成时的调整
//
// 这个文件同时被 install.mjs 和 lib/kit-iterate.mjs 使用：装的、迭代查的是同一份定义。
import os from 'node:os'
import path from 'node:path'
import { homeRel, autoHomeExpr, homePathExpr, MEMORY_OLD, memoryNew, MEMORY_ANY, MEMORY_PRESSURE_OLD, memoryPressureNew, MEMORY_PRESSURE_ANY } from './home-paths.mjs'
import { OLD as HUANQI_PANEL_OLD, NEW as HUANQI_PANEL_NEW, ANY as HUANQI_PANEL_ANY, FIXED as HUANQI_PANEL_FIXED } from './huanqi-panel-patch.mjs'
import { huanqiPatches, patchText, unpatchText, INPUT_OLD } from './huanqi-patches.mjs'
import { fixQuotedBooleans } from './config-sanitize.mjs'
import { inspectPackage } from './package-contract.mjs'
import { MACOS_FIXES, macosPatches } from './macos-patches.mjs'

export { patchText, unpatchText }

const posix = (p) => String(p).replace(/\\/g, '/')
const reEsc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// ── 每条在本机会不会撞上、怎么核对（5.1）──────────────────────────────────────────────────
// 作者原文里有那段毛病，不等于这台电脑会撞上：要看 DSH 有没有把环境变量传给插件、用不用那个功能、日志里有没有报错。
// --fix --report 把这些连同脚本查到的本机事实写进报告，agent 照 verify 逐条核对，填修复计划给用户确认后再修。
//   impact：不修会怎样（用户能感觉到的现象）；when：什么情况下本机会撞上；verify：核对步骤；
//   blocking：零件因此加载不了，启动 DSH 之前就要处理（这几条只能选修或先不动，不能选不修）
const CHECKS = {
  'pack-unshipped': { blocking: true,
    impact: '缺文件的那个零件加载失败：DSH 照常启动，但它的面板、工具都没有；插件市场重装一次后照样缺',
    when: '报告的本机事实里列出了漏列的文件，而且那个零件这台装了',
    verify: ['看本机事实：列出的文件在已装的包里确实不存在', '启动 DSH 之前就要处理；必装零件缺文件，架构少一层'] },
  'mnemon-runtime': {
    impact: 'mnemon-probe 每轮报「读盘失败」，热记忆容量看不到；记忆本身不受影响',
    when: '装了 dsh-mnemon 和 mnemon-probe，热记忆实际目录又不是 ~/.mnemon/runtime（DSH 桌面版不传 MNEMON_RUNTIME）',
    verify: ['看本机事实：解析到的热记忆目录和 ~/.mnemon/runtime 是不是同一个', '在 DSH 新会话里看每轮注入的 mnemon-probe 那一行：报「读盘失败」算撞上，有容量读数算没撞上'] },
  'memory-home': {
    impact: '配置里自我层是相对路径时，自我层读不到（每轮注入里没有 SELF.md）；是绝对路径时功能照常，只是挪 DSH 家目录、换用户名后要重跑 --update',
    when: 'DSH 没把 DSH_HOME 传给插件（有的桌面版不传，已知坑 1；看换气的加载记录能判断这台传不传）',
    verify: ['看本机事实里 dsh-agent-memory 的 selfPath：相对路径（dsh-soul/…）→ 不修会读不到；绝对路径 → 只影响挪家目录', '在 DSH 新会话里看每轮注入有没有自我层的内容', '已经打上、又要选不修的：配置里还是相对路径，选完要再跑一次 --update 把配置改回绝对路径，在那之前自我层读不到'] },
  'memory-pressure': {
    impact: '每轮注入里没有上下文水位（或不准），agent 不知道上下文快满了',
    when: 'DSH 没把 DSH_HOME 传给插件（有的桌面版不传；看换气的加载记录能判断这台传不传）',
    verify: ['在 DSH 新会话里看每轮注入有没有上下文水位那一行，聊几轮后数值会不会涨'] },
  'mcp-hub-homedir': { blocking: true,
    impact: 'mcp-hub 一激活就报错（homedir is not defined）：面板没了，会话里没有 mcp__echo__* 检索工具，记忆召回只能走慢路子',
    when: 'DSH 没把 DSH_HOME 传给插件（有的桌面版不传，已知坑 1；Boss 的 Mac 上 2.0.21-next 实测会传）；上游 6531d30 起才有',
    verify: ['看本机事实：换气最近一次加载成功时这条修复打没打（对照安装记录的修复结论）；没打还能加载，说明这台 DSH 会传 DSH_HOME，选不修；没有加载记录就按会撞上处理', '启动 DSH 之前就要处理；已经启动过的，看会话的工具列表里有没有 mcp__echo__ 开头的工具'] },
  'yantai-soul': {
    impact: '工作台面板的账本、未结、门是空的',
    when: '装了 yantai，DSH 又不传 YANTAI_SOUL',
    verify: ['打开 yantai 面板，看账本、未结有没有内容'] },
  'yantai-memory': {
    impact: '工作台面板的水位、检索没有读数',
    when: '装了 yantai，DSH 又不传 YANTAI_MEMORY',
    verify: ['打开 yantai 面板，看水位、检索有没有读数'] },
  'riji-diary': {
    impact: '顶栏的日记入口列不出日记',
    when: '装了 riji，日记在书房 50-日记/ 下，DSH 又不传 DSH_HOME',
    verify: ['看本机事实：书房 50-日记/ 下有几篇', '点开顶栏的日记入口，列不列得出这些文件'] },
  'echo-node-darwin': {
    impact: 'macOS 上回声面板的体检一项都不出',
    when: '只在 macOS 上',
    verify: ['看本机事实里的系统：不是 macOS 就不会撞上', 'macOS 上打开回声面板，看体检有没有结果'] },
  'echo-diag-join': {
    impact: '回声面板体检失败时，诊断日志写不进去（上游这一行用了没导入的 join，报错被吞掉），排错没线索；平时没感觉',
    when: '任何电脑都一样，只是要等体检失败才看得出来；上游 6531d30 起才有',
    verify: ['这条只关系到排错：问用户要不要留着诊断日志', '看本机事实：记忆中枢下有没有 _plugin-diag.log'] },
  'panel-ensure-block': {
    impact: '第一次在换气面板里改参数保存时报错，改不了',
    when: 'profile 的 cordis.patch.yml 里没有 `- id: huanqi` 这一节（安装包不写这一节，换气是 bundle 层装进来的）',
    verify: ['看本机事实：有没有这一节', '没有的话，在换气面板改一个参数保存，会报「没有 `- id: huanqi` 这一节」'] },
  'huanqi-full-maint': {
    impact: '换气熔断后的全量压缩一次都成不了（报 requires an idle agent），长会话会一路涨到上下文顶上',
    when: '用着换气，而且熔断过',
    verify: ['看本机事实：最近的会话日志里有没有「requires an idle agent」', '没熔断过的看不出来：按作者代码（外面多套了一层 runMaintenance）和 Boss 2026-10-29 的实测判断'] },
  'huanqi-homedir': { blocking: true,
    impact: '换气一加载就报错（homedir is not defined）：不再自动换气，换气面板没有数据，长会话会一路涨到上下文顶上',
    when: 'DSH 没把 DSH_HOME 传给插件（有的桌面版不传，已知坑 1；Boss 的 Mac 上 2.0.21-next 实测会传）；上游 6531d30 起才有',
    verify: ['看本机事实：换气最近一次加载成功时这条修复打没打（对照安装记录的修复结论）；没打还能加载，说明这台 DSH 会传 DSH_HOME，选不修；没有加载记录就按会撞上处理', '启动 DSH 之前就要处理；已经启动过的，看换气面板有没有数据'] },
  'huanqi-paths-import': { blocking: true,
    impact: '换气一加载就报错（找不到 lib/paths.mjs）：不再自动换气，换气面板没有数据，长会话会一路涨到上下文顶上',
    when: '每台都会撞上：上游 0221d89 起换气从包外的 ../../../lib/paths.mjs 导入，装进 node_modules 后这个文件不存在，DSH_HOME 传不传都一样',
    verify: ['看本机事实：已装的换气 lib/index.js 有没有这行导入、profile 下有没有 lib/paths.mjs', '启动 DSH 之前就要处理'] },
  'cr-input': {
    impact: '在输入框里手打带参数的 /compact-region，会被当成普通消息发出去，命令不执行；换气自动调用不受影响',
    when: '用户会手打 /compact-region <起> <止>',
    verify: ['问用户会不会手打 /compact-region 带参数', '在 DSH 里输入 /compact-region 1 2，看是执行命令还是当成消息发出去'] },
  'huanqi-config-bool': {
    impact: '换气配置整段静默退回默认值，面板里改的参数都不生效',
    when: 'profile 里换气那一节有被写成字符串的 \'true\' / \'false\'',
    verify: ['看本机事实：有没有字符串布尔（脚本查得准，不用再核对）'] },
  'preset-summary-model': {
    impact: '手动 /compact 和自动压缩都失败（no API key），长会话会一路涨到上下文顶上',
    when: '本机默认模型不走 deepseek-official（例如账号登录的 deepseek-account），或者最近的会话报过 no API key',
    verify: ['看本机事实：默认模型路由、最近的会话有没有 no API key', '在 DSH 的模型页看有没有填 DeepSeek API key'] },
}

// ── 全部条目（id 一经使用永不复用；since 是加进 kit 的版本）────────────────────────────────
// basis：kit = kit 自己发现；author = 作者自己点过名的问题，kit 来修；boss = Boss 本机实测
// 4.3 删掉作者已修好的三条（按 Boss 的决定，不留退役条目）：clock-panel、huanqi-trigger-idle、cr-hub-path，这几个 id 不再使用
export const FIXES = [
  { id: 'pack-unshipped', phase: 'pack', part: null, since: '4.0', basis: 'kit', title: '上游发布清单漏列的文件拷包时补上', why: '入口导入了、files 却没列（4606555 的 yantai 漏了 env-config.mjs），照清单装上就缺文件、零件加载失败；插件市场 pnpm 重装也按 files 走，所以连 files 一起补' },
  { id: 'mnemon-runtime', phase: 'file', part: 'mnemon-probe', since: '2.0', basis: 'kit', title: 'mnemon-probe 热记忆目录的默认值', why: 'DSH 桌面版不传 MNEMON_RUNTIME，默认的 ~/.mnemon/runtime 不一定是真实位置' },
  { id: 'memory-home', phase: 'file', part: 'memory', since: '2.6', basis: 'kit', title: 'memory 相对路径按 DSH 家目录定位', why: '上游只认 DSH_HOME 环境变量，没有就退回插件目录' },
  { id: 'memory-pressure', phase: 'file', part: 'memory', since: '2.6', basis: 'kit', title: 'memory 上下文水位找 DSH 家目录', why: '同上' },
  { id: 'mcp-hub-homedir', phase: 'file', part: 'mcp-hub', since: '5.2', basis: 'kit', title: 'mcp-hub 找 DSH 家目录不再调用没导入的 homedir()', why: "上游 11-04 把兜底改成 join(homedir(), '.dsh')，却没导入 homedir：DSH 不传 DSH_HOME 时一激活就报错" },
  { id: 'yantai-soul', phase: 'file', part: 'yantai', since: '2.3', basis: 'kit', title: 'yantai 书房路径', why: '没配环境变量时找不到书房' },
  { id: 'yantai-memory', phase: 'file', part: 'yantai', since: '2.3', basis: 'kit', title: 'yantai 记忆中枢路径', why: '没配环境变量时找不到记忆中枢' },
  { id: 'riji-diary', phase: 'file', part: 'riji', since: '2.3', basis: 'kit', title: 'riji 日记目录', why: '只认 DSH_HOME，日记目录要跟着书房走' },
  { id: 'echo-node-darwin', phase: 'file', part: 'echo', since: '4.0', basis: 'kit', title: 'echo 面板在 macOS 上找到 DSH 自带的 node', why: '作者只按 Windows 的安装布局找 node；Mac 上找不到就拿 DSH 主程序去跑体检脚本，面板体检永远是空的' },
  { id: 'echo-diag-join', phase: 'file', part: 'echo', since: '5.2', basis: 'kit', title: 'echo 面板的诊断日志改用 path.join', why: '上游 11-04 把诊断日志改成 join(HUB, …)，这个文件却只导入了 path、没有 join：写日志那一行一直抛错被吞掉' },
  { id: 'panel-ensure-block', phase: 'file', part: 'huanqi-panel', since: '2.4', basis: 'kit', title: '换气面板：profile 没有 `- id: huanqi` 时自建一节', why: '面板只会改已有的节，第一次保存必报错' },
  { id: 'huanqi-full-maint', phase: 'file', part: 'huanqi', since: '2.16', basis: 'boss', title: '换气熔断后的全量压缩去掉多套的一层 runMaintenance', why: 'compactNow 自己会排队等空闲，外面再套一层内层必报 requires an idle agent' },
  { id: 'huanqi-homedir', phase: 'file', part: 'huanqi', since: '5.2', basis: 'kit', title: '换气找 DSH 家目录不再调用没导入的 homedir()', why: "上游 11-04 加了 join(homedir(), '.dsh')，却没导入 homedir（作者特意不引 node:os，文件里只有自己的 homeDir()）：DSH 不传 DSH_HOME 时一加载就报错" },
  { id: 'huanqi-paths-import', phase: 'file', part: 'huanqi', since: '5.4', basis: 'kit', title: '换气不再从包外导入 lib/paths.mjs', why: '上游 11-04 第二次改路径，换气从仓库根的 lib/paths.mjs 取记忆库位置；这个文件不在任何包里，装进 node_modules 后找不到，一加载就报错' },
  { id: 'cr-input', phase: 'file', part: 'compact-region', since: '2.16', basis: 'boss', title: '/compact-region 声明参数输入', why: '不声明 input，输入框里带参数的命令会被前端当成普通消息' },
  { id: 'huanqi-config-bool', phase: 'config', part: 'huanqi', since: '2.13', basis: 'boss', title: '换气配置的字符串布尔改回真布尔', why: "面板把布尔写成 'true'，过不了 schema，整段配置静默退回默认值" },
  { id: 'preset-summary-model', phase: 'preset', part: null, since: '2.17', basis: 'boss', title: '压缩摘要跟会话模型走', why: '作者写死 summarizationProvider: deepseek-official，要 API key；账号登录的机器压缩全失败' },
].map((fix) => ({
  ...fix,
  blocking: false,
  ...CHECKS[fix.id],
  type: fix.phase === 'config' || fix.phase === 'preset' || fix.phase === 'pack' ? fix.phase
    : /path|home|runtime|soul|memory|diary/.test(fix.id) ? 'path' : 'behavior',
  target: fix.phase === 'pack' ? '<零件>/package.json#files' : fix.phase === 'preset' ? 'profile/cordis.patch.yml#Soul preset'
    : fix.phase === 'config' ? 'profile/cordis.patch.yml#huanqi'
    : `${fix.part}/${fix.part === 'memory' || fix.part === 'huanqi' ? 'lib/index.js' : 'index.js'}`,
  evidence: [{ source: 'lib/fixes.mjs', detail: fix.why }],
  applicability: fix.part ? `仅在 ${fix.part} 已安装或本次计划安装时适用` : fix.phase === 'pack' ? '拷包时适用于任何发布清单漏列文件的包' : '仅在安装 Soul preset 时适用',
  validation: fix.phase === 'file' ? ['syntax-or-yaml', 'byte-roundtrip'] : fix.phase === 'pack' ? ['package-contract', 'copy-hash'] : ['yaml', 'byte-roundtrip']
})).concat(MACOS_FIXES)
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
  frozen: '这次不处理（没选它）',
  reset: '随作者原文清掉了，等修复检查',
}
export const ACTION_TEXT = {
  apply: '打上', keep: '保持', refresh: '换成现行写法', revert: '撤掉，换回作者原文', none: '不动',
  local: '本机改过，不动', manual: '不动', reinstall: '重装', pending: '待选',
}

// ── 文件补丁（file 阶段）───────────────────────────────────────────────────────────
// any：认得出「已经打过」的写法（包括早期手工打的）；fixed：作者自己改好的写法；
// refresh：打过但不是现在的写法（例如早期写死了路径）时换成现在的写法；all：同一处原文出现几次换几次
// problem 命中表示问题在；正向特征才能证明已修；scope 仅保留作定位线索。
// echo 面板找 DSH 自带 node 的已知布局：作者只列了 Windows 的两种
const ECHO_NODE_OLD = "    path.join(root, 'resources', 'runtime', 'bin', 'node.exe'),\n  ]"
const ECHO_NODE_NEW = "    path.join(root, 'resources', 'runtime', 'bin', 'node.exe'),\n    path.join(root, '..', 'Resources', 'runtime', process.arch, 'primary-runtime', 'dependencies', 'node', 'bin', 'node'), // 本机修：macOS 的 DSH 自带 node 在 Contents/Resources/runtime/<arch>/ 下\n  ]"
// 上游 6531d30 用了没导入的函数：代码行（不算注释）里有裸调用，文件里又没导入、没自己定义它
const bareCall = (name) => new RegExp(`^(?![ \\t]*(?:\\/\\/|\\*|\\/\\*)).*(?<![\\w.$])${name}\\(`, 'm')
const declared = (name, mod) => new RegExp(`^import\\s+(?:\\w+\\s*,\\s*)?\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['"](?:node:)?${mod}['"]|\\bfunction\\s+${name}\\b|\\b(?:const|let|var)\\s+${name}\\b`, 'm')
const unimported = (name, mod) => ({ test: (t) => bareCall(name).test(t) && !declared(name, mod).test(t) })
const ECHO_DIAG_OLD = "fs.appendFileSync(join(HUB, '_plugin-diag.log'),"
const ECHO_DIAG_NEW = "fs.appendFileSync(path.join(HUB, '_plugin-diag.log'), // 本机修：上游用了没导入的 join，这一行一直抛错被吞掉，诊断日志写不进去"
const MCP_HOMEDIR_OLD = "return process.env.DSH_HOME || join(homedir(), '.dsh')"
const PROBLEMS = {
  'mnemon-runtime': { problem: "const RUNTIME = process.env.MNEMON_RUNTIME || path.join(os.homedir(), '.mnemon', 'runtime')", scope: /const RUNTIME = / },
  'memory-home': { problem: /join\(ENV\('DSH_HOME'\) \|\| HERE, p\)/, scope: /const anchorUser = / },
  'memory-pressure': { problem: /^ {8}const home = ENV\('DSH_HOME'\);/m, scope: /ENV\('DSH_HOME'\)/ },
  'yantai-soul': { problem: /const SOUL = ENV\('YANTAI_SOUL'\)[ \t]*(?:\r?\n|$)/, scope: /ENV\('YANTAI_SOUL'\)/ },
  'yantai-memory': { problem: /const MEMORY_DIR = ENV\('YANTAI_MEMORY'\)[ \t]*(?:\r?\n|$)/, scope: /ENV\('YANTAI_MEMORY'\)/ },
  'riji-diary': { problem: "DSH_HOME ? join(DSH_HOME, 'diary') : ''", scope: /diary|日记/ },
  'panel-ensure-block': { problem: "if (!loc) throw new Error('这份 cordis.patch.yml 里没有 `- id: huanqi` 这一节", scope: /function applyValues\(/ },
  'huanqi-full-maint': { problem: /runMaintenance\s*\(\s*async\s*\([^)]*\)\s*=>\s*\{[^{}]*?await\s+svc\.compactNow\(/, scope: /svc\.compactNow\(/ },
  'cr-input': { problem: INPUT_OLD, scope: /name: 'compact-region'/ },
  'echo-node-darwin': { problem: ECHO_NODE_OLD, scope: /function resolveNode\(/ },
  // strict：在认得的功能内检查缺失导入；整段功能改写时仍交给人工核对。
  'echo-diag-join': { problem: unimported('join', 'path'), scope: /_plugin-diag\.log/ },
  'mcp-hub-homedir': { problem: unimported('homedir', 'os'), scope: /function dshHome\(/ },
  'huanqi-homedir': { problem: unimported('homedir', 'os'), scope: /const DSH_HOME\s*=|function homeDir\(/ },
  'huanqi-paths-import': { problem: /^import\s*\{[^}]*\}\s*from\s*['"](?:\.\.\/){2,}[^'"]+['"]/m, scope: /function homeDir\(/ },
}

/**
 * 文件补丁清单。
 * @param ctx runtime：mnemon 热记忆目录（解析不出就不加那一条）；names：零件目录名 → 这次落地的包名；
 *            dshHome：DSH 家目录
 */
export function fileFixes({ runtime, names, dshHome }) {
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
      key: 'mcp-hub-homedir', pkg: 'dsh-mcp-hub', file: 'index.js', label: 'mcp-hub 找 DSH 家目录不再调用没导入的 homedir()', needed: true, strict: true,
      old: MCP_HOMEDIR_OLD,
      new: `return process.env.DSH_HOME || ${autoHomeExpr()} // 本机修：上游用了没导入的 homedir()，DSH 不传 DSH_HOME 时一激活就报错；改成按插件所在位置找 DSH 家目录`,
      any: /return process\.env\.DSH_HOME \|\| [^\n]*本机修[^\n]*/,
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
  if (names.echo) list.push({
    key: 'echo-node-darwin', pkg: names.echo, file: 'index.js', label: 'echo 面板在 macOS 上找 DSH 自带的 node', needed: true,
    old: ECHO_NODE_OLD, new: ECHO_NODE_NEW,
    any: /^ {4}path\.join\(root, 'resources', 'runtime', 'bin', 'node\.exe'\),\n[^\n]*'Resources', 'runtime', process\.arch[^\n]*本机修[^\n]*\n {2}\]/m,
  }, {
    key: 'echo-diag-join', pkg: names.echo, file: 'index.js', label: 'echo 面板的诊断日志改用 path.join（上游用了没导入的 join）', needed: true, strict: true,
    old: ECHO_DIAG_OLD, new: ECHO_DIAG_NEW, any: /fs\.appendFileSync\(path\.join\(HUB, '_plugin-diag\.log'\), \/\/ 本机修[^\n]*/,
  })
  if (names['huanqi-panel']) list.push({
    key: 'panel-ensure-block', pkg: names['huanqi-panel'], file: 'index.js',
    label: '换气面板：profile 里没有 `- id: huanqi` 时自建一节', needed: true,
    old: HUANQI_PANEL_OLD, new: HUANQI_PANEL_NEW,
    any: HUANQI_PANEL_ANY, fixed: HUANQI_PANEL_FIXED,
  })
  // 换气、compact-region：作者写死的 D:\\AI\\memory\\hub 改成运行时找家目录，加两处 Boss 本机实测的行为修复（lib/huanqi-patches.mjs）
  list.push(...huanqiPatches(names))
  list.push(...macosPatches(names))
  const byPkg = Object.fromEntries(Object.entries(names).map(([part, pkg]) => [pkg, part]))
  return list.filter((p) => byPkg[p.pkg]).map((p) => {
    return { ...p, id: p.key, part: byPkg[p.pkg], title: (fixInfo(p.key) || {}).title || p.label, ...PROBLEMS[p.key] }
  })
}

/**
 * 判断一条修复要解决的问题在这段文本里还在不在。
 * @returns 'present' 问题在 / 'absent' 作者已修（或没有这个问题）/ 'unknown' 那段代码认不出来，判断不了
 */
export function detectFix(fix, text) {
  const t = String(text)
  if (fix.edits) {
    if (fix.edits.every((e) => t.includes(e.new))) return 'absent'
    if (fix.requires?.some((part) => !t.includes(part))) return 'unknown'
    return fix.edits.every((e) => t.includes(e.old)) ? 'present' : 'unknown'
  }
  const probs = Array.isArray(fix.problem) ? fix.problem : [fix.problem]
  if (probs.some((p) => p && (typeof p === 'string' ? t.includes(p) : p.test(t)))) return 'present'
  if (fix.strict) return fix.scope?.test(t) ? 'absent' : 'unknown'
  // 只改变空白的旧代码仍有问题；锚点不再精确匹配时交给人工改写。
  const compact = (value) => String(value).replace(/\s+/g, '').replace(/"/g, "'")
  if ((fix.olds || [fix.old]).some((old) => old && compact(t).includes(compact(old)))) return 'present'
  if (fix.id === 'memory-home' && /join\(ENV\('DSH_HOME'\)\|\|HERE,p\)/.test(compact(t))) return 'present'
  const positive = {
    'memory-home': /const anchorUser\s*=.*join\((?:DSH_HOME_AUTO|home\(\)|resolveUserHome\(\)),\s*p\)/,
    'memory-pressure': /const home\s*=\s*ENV\(['"]DSH_HOME['"]\)\s*\|\|\s*\S/,
    'mnemon-runtime': /const RUNTIME\s*=.*(?:DSH_HOME|resolveUserHome|soul-kit:auto-home)/,
    'yantai-soul': /const SOUL\s*=\s*ENV\(['"]YANTAI_SOUL['"]\)\s*\|\|\s*\S/,
    'yantai-memory': /const MEMORY_DIR\s*=\s*ENV\(['"]YANTAI_MEMORY['"]\)\s*\|\|\s*\S/,
    'riji-diary': /(?:soul-kit:auto-home|resolveUserHome\(\))[^\n]*50-日记/,
    'huanqi-full-maint': /await svc\.compactNow\(manualCtx,\s*(?:ac\.signal|new AbortController\(\)\.signal)\)/,
    'echo-node-darwin': /['"]Resources['"]|darwin/,
    'cr-input': /name:\s*['"]compact-region['"](?:(?!\bname\s*:|\n\s*\}\);)[\s\S])*?input:\s*\{/,
  }
  if (positive[fix.id]?.test(t)) return 'absent'
  // 路径消失、函数还在都不是修好的证据。仅采用限定到目标功能的正向特征。
  if (fix.id === 'panel-ensure-block' && fix.fixed?.test(t)) return 'absent'
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
export function planFile({ upstream, installed, fixes, skip = [], freeze = [], record = null }) {
  // 未选中的复合补丁升级了实现时，旧配套代码整份保留，不能用新版片段拼接旧文件。
  if (record && record.applied === installed && installed !== record.upstream && fixes.some((f) => f.edits && freeze.includes(f.id)) && unpatchText(installed, fixes) !== record.upstream) {
    return { target: installed, state: 'same', rows: fixes.map((f) => ({ id: f.id, detect: detectFix(f, upstream), status: 'frozen', action: 'none' })) }
  }
  let target = upstream
  const rows = []
  const has = (f) => typeof installed === 'string' && ((Boolean(f.new) && installed.includes(f.new)) || f.any.test(installed))
  for (const f of fixes) {
    const det = detectFix(f, upstream)
    let status
    if (freeze.includes(f.id)) {
      const old = has(f) && (f.olds || [f.old]).find((o) => target.includes(o))
      const existing = installed?.includes(f.new) ? f.new : installed?.match(f.any)?.[0]
      if (old !== false && old !== undefined && existing) target = patchText(target, { ...f, new: existing }, old)
      status = 'frozen'
    } else if (skip.includes(f.id)) status = 'skipped'
    else if (f.needed === false) status = 'n/a'
    else if (det === 'present') {
      const old = (f.olds || [f.old]).find((o) => target.includes(o))
      if (old !== undefined && (!f.edits || f.edits.every((e) => target.includes(e.old)))) { target = patchText(target, f, old); status = 'kit' } else status = 'manual'
    } else status = det === 'absent' ? 'author' : 'manual'
    rows.push({ id: f.id, detect: det, status })
  }
  if (installed === null || installed === undefined) {
    for (const r of rows) r.action = r.status === 'kit' ? 'apply' : r.status === 'manual' ? 'manual' : 'none'
    return { target, state: 'missing', rows }
  }
  // 已装 = 作者原文 + kit 补丁：先还原再比；kit 换过补丁写法时，按安装记录里上次写进去的全文认
  const restored = unpatchText(installed, fixes)
  const pristine = restored === upstream
    || (record && (installed === record.applied || installed === record.upstream || restored === record.upstream))
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
// 上游 v3.0.0 起是灵魂五套 preset-soul*，以前是砚青四套 preset-yanqing*：两种都认，旧基线也查得了
const PRESET_FILES = ['preset-soul', 'preset-soul-cordis', 'preset-soul-ptc', 'preset-soul-distill', 'preset-soul-all', 'preset-yanqing', 'preset-yanqing-cordis', 'preset-yanqing-ptc', 'preset-yanqing-distill']

/**
 * 对一份上游主仓逐条看修复清单里的问题还在不在、kit 的锚点还对不对得上。
 * @param main 主仓源码目录；partNames 每个零件认得的包名；read(file) 读文本，没有返回 null；
 *        packFiles(dir) 发布清单（kit 迭代传进来，用来判定 pack-unshipped；不给就记成「查不了」）
 * @returns { [id]: { detect: 'present'|'absent'|'unknown'|'missing'|'config', anchor, file } }，file 是相对主仓的路径
 */
export function inspectUpstream({ main, partNames, read, packFiles = null }) {
  const out = {}
  const at = (part) => (main ? { dir: path.join(main, 'plugins', part), rel: `plugins/${part}` } : null)
  const names = Object.fromEntries(Object.keys(partNames).map((p) => [p, partNames[p][0]]))
  for (const f of fileFixes({ runtime: '/kit-iterate/.mnemon/runtime', names, dshHome: '/kit-iterate' })) {
    const loc = f.location === 'hub' ? (main ? { dir: path.join(main, 'kit', 'echo'), rel: 'kit/echo' } : null) : at(f.part), t = f.provided ? '' : loc && read(path.join(loc.dir, f.file))
    const file = loc ? `${loc.rel}/${f.file}` : null
    const row = typeof t === 'string' ? { detect: detectFix(f, t), anchor: f.edits ? f.edits.every((e) => t.includes(e.old)) : (f.olds || [f.old]).some((o) => t.includes(o)), file } : { detect: 'missing', anchor: false, file }
    const previous = out[f.id]
    out[f.id] = previous ? { ...row, detect: [previous.detect, row.detect].some((d) => ['unknown', 'missing'].includes(d)) ? 'unknown' : previous.detect === 'present' || row.detect === 'present' ? 'present' : 'absent', anchor: previous.anchor && row.anchor, file: previous.file + ', ' + row.file } : row
  }
  const presets = main ? PRESET_FILES.map((n) => read(path.join(main, 'presets', n + '.yml'))).filter((t) => typeof t === 'string') : []
  const shared = main && read(path.join(main, 'presets', '_shared', 'compaction.yml'))
  const det = detectSummaryRoute([...presets, ...(typeof shared === 'string' ? [shared] : [])])
  out['preset-summary-model'] = presets.length ? { detect: det, anchor: true, file: 'presets/' } : { detect: 'missing', anchor: false, file: 'presets/' }
  out['huanqi-config-bool'] = { detect: 'config', anchor: true, file: null }
  const unshipped = main && packFiles ? Object.keys(partNames).map((p) => path.join(main, 'plugins', p)).filter((d) => read(path.join(d, 'package.json')))
    .find((d) => inspectPackage(d, packFiles(d)).some((i) => i.kind === 'unshipped')) : undefined
  out['pack-unshipped'] = unshipped === undefined && !packFiles ? { detect: 'config', anchor: true, file: null }
    : { detect: unshipped ? 'present' : 'absent', anchor: true, file: unshipped ? `plugins/${path.basename(unshipped)}/package.json` : 'plugins/' }
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
        // 修复 preset-summary-model 判定在管的（covered 里有 presets/），就不再当新问题报
        if (!covered.has('presets/') && /summarizationProvider:\s*['"]?deepseek-official/.test(text)) {
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
