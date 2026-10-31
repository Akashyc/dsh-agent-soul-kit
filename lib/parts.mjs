// 零件目录：装哪些、叫什么包名、哪些必装、在哪个系统上用不了。install.mjs、lib/setup.mjs、kit 迭代和测试共用这一份。
//
// 4.0 起所有零件都从主仓 cyanwell/dsh-agent-soul 的 plugins/ 取（作者 2026-10-31 弃用了零件仓 dsh-agent-organs，
// compact-region、换气都回了主仓），包名统一回 dsh-agent-*。旧安装装的 dsh-yanqing-* 留在别名里，更新时自动迁移。

// 零件：上游 plugins/ 下的目录名，顺序就是装配顺序
export const PARTS = ['compaction', 'pruner', 'memory', 'mnemon-probe', 'echo', 'clock', 'model-statusbar', 'huanqi', 'huanqi-panel', 'mobile-adapt', 'mcp-hub', 'riji', 'splash', 'yantai', 'compact-region']
// 每个零件认得的包名：第一个是现在上游的，后面是用过的旧名（更新时迁移）
export const PART_NAMES = {
  compaction: ['dsh-agent-compaction', 'dsh-yanqing-compaction'], pruner: ['dsh-agent-pruner', 'dsh-yanqing-pruner'],
  memory: ['dsh-agent-memory'], 'mnemon-probe': ['dsh-agent-mnemon-probe'],
  echo: ['dsh-agent-echo', 'dsh-yanqing-echo'], clock: ['dsh-agent-clock'], huanqi: ['dsh-huanqi', 'dsh-agent-huanqi'],
  'huanqi-panel': ['dsh-agent-huanqi-panel', 'dsh-yanqing-huanqi-panel'], 'mcp-hub': ['dsh-mcp-hub'],
  'model-statusbar': ['dsh-agent-model-statusbar'], 'mobile-adapt': ['dsh-agent-mobile-adapt'],
  riji: ['dsh-agent-riji'], splash: ['dsh-agent-splash'], yantai: ['dsh-agent-yantai'],
  'compact-region': ['dsh-agent-compact-region', 'dsh-yanqing-compact-region'],
}
// 由 Soul preset 调用的三个：只进 dependencies，不进 bundles（进了 bundles 会挂到根层，和内置压缩抢名字）。新旧名都算
export const PRESET_ONLY = ['compaction', 'pruner', 'compact-region'].flatMap((p) => PART_NAMES[p])
// 必装：作者 2026-10-31 定的「全局必装」（压缩、ECHO 整套、换气 + 面板、MCP hub），加上每轮注入自我层的 memory
export const REQUIRED_PARTS = ['compaction', 'pruner', 'memory', 'echo', 'huanqi', 'huanqi-panel', 'mcp-hub']
export const OPTIONAL_PARTS = ['mnemon-probe', 'clock', 'model-statusbar', 'mobile-adapt', 'riji', 'splash', 'yantai']
// 默认勾选；后 5 个面板件默认不勾（没配数据源就是空面板）
export const DEFAULT_PARTS = ['mnemon-probe', 'clock']
// 必须有的：必装零件，加上 Soul preset 要调用的
export const MUST_HAVE = (p) => REQUIRED_PARTS.includes(p) || PRESET_ONLY.includes(PART_NAMES[p][0])
// 安装包后来才加的零件：更新时本机没有也会补装（不想要就加 --skip-part <目录名>）
export const ADDED_PARTS = { 'mcp-hub': '2.1', 'model-statusbar': '2.3', 'mobile-adapt': '2.3', riji: '2.3', splash: '2.3', yantai: '2.3' }
export const PART_INFO = {
  compaction: { what: '压缩摘要带门牌，压掉的内容能按门牌取回原文' },
  pruner: { what: '被裁掉的工具输出标出原文在哪' },
  memory: { what: '每轮注入时钟、自我层和上下文水位' },
  echo: { what: '体检面板：零件坏了能第一时间看到' },
  huanqi: { what: '换气：思考陷入循环、一轮只想不说时自动打断并清理' },
  'huanqi-panel': { what: '换气面板：看触发次数、误伤记录，改参数' },
  'mcp-hub': { what: 'MCP 服务总入口，接上常驻的记忆检索' },
  'compact-region': { what: '/compact-region：只压指定的一段历史（换气的备用路径）' },
  'mnemon-probe': { what: '每轮报 dsh-mnemon 热记忆的容量', without: '热记忆条目被挤掉时没有任何提示', needsMnemon: true },
  clock: { what: '侧边栏时钟', without: '侧边栏没有时钟；agent 照样知道现在几点（memory 每轮注入）' },
  'model-statusbar': { what: '本地模型服务的状态条：进程 / 接口 / 显存 / 空闲静息', without: '不知道模型服务还占不占显存，等想干别的活才发现腾不出来', needsService: '本地模型服务（ComfyUI 一类，默认 127.0.0.1:8188）' },
  'mobile-adapt': { what: '手机竖屏适配：同一个地址在手机上收成 App 形态', without: '手机上界面挤成一团、按钮点不到；PC 端不受影响' },
  riji: { what: '日记入口：顶栏一格，直接列一手 markdown 原文', without: '日记写得再好也没人看得见，只能自己开编辑器翻' },
  splash: { what: '启动一屏：换动画、淡入淡出、选择显示项', without: '每次启动都是默认画面' },
  yantai: { what: '工作台面板：上下文水位、未结的活、最近账本、几扇门', without: '状态散在四个地方，想先看一眼的成本高到不会做' },
}

// 各系统上的已知限制（读上游源码核对的，2026-10-31 · 4606555）。
//   unsupported：这台系统上装了也用不了；partial：能装，部分功能用不了。
const PLATFORM_NOTES = {
  darwin: {
    'model-statusbar': { level: 'unsupported', why: '探测、拉起、停止全靠 powershell.exe、taskkill 和 Windows 版 python.exe，Mac 上读数一直报错' },
    yantai: { level: 'partial', why: '「速达」应用启动器靠 scan-apps.ps1 / focus-app.ps1，只有 Windows 有；水位、未结、账本、门照常' },
  },
  linux: {
    'model-statusbar': { level: 'unsupported', why: '探测、拉起、停止全靠 powershell.exe、taskkill 和 Windows 版 python.exe' },
    yantai: { level: 'partial', why: '「速达」应用启动器只有 Windows 有；其余照常' },
  },
  win32: {
    huanqi: { level: 'partial', why: '上游 issue #5：Windows 桌面打包版可能 import 不到宿主内部包（启动日志 dsh-huanqi: failed to import）；换源码或 CLI 版 DSH 才行' },
  },
}
export const PLATFORM_LABEL = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' }
/** 这个零件在这个系统上有没有已知限制；没有返回 null。 */
export const platformNote = (part, platform = process.platform) => PLATFORM_NOTES[platform]?.[part] || null
/** 一行说明：「Mac 不可用：……」/「Mac 部分可用：……」。 */
export function platformText(part, platform = process.platform) {
  const n = platformNote(part, platform)
  return n ? `${PLATFORM_LABEL[platform] || platform} ${n.level === 'unsupported' ? '不可用' : '部分可用'}：${n.why}` : null
}

// 安装包版本号按数字逐段比（字符串比的话 '2.9' < '2.11' 是 false）
export function verLess(a, b) {
  const x = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0), y = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0) }
  return false
}
