// 零件目录：装哪些、叫什么包名、哪些必装、在哪个系统上用不了。install.mjs、lib/setup/setup.mjs、kit 迭代和测试共用这一份。
//
// 4.0 起所有零件都从主仓 cyanwell/dsh-agent-soul 的 plugins/ 取（作者 2026-10-31 弃用了零件仓 dsh-agent-organs，
// compact-region、换气都回了主仓）。上游 v3.0.0 把压缩三件套的包名统一成部署端的 dsh-yanqing-*，
// 4.x 装的 dsh-agent-* 留在别名里，更新时自动迁移。

// 零件：上游 plugins/ 下的目录名，顺序就是装配顺序
export const PARTS = ['compaction', 'pruner', 'memory', 'mnemon-probe', 'echo', 'clock', 'model-statusbar', 'huanqi', 'huanqi-panel', 'mobile-adapt', 'mcp-hub', 'riji', 'splash', 'yantai', 'compact-region', 'perf', 'heartbeat', 'chat', 'clawbot', 'lead-waker', 'dsh-aurabot-qq']
// 每个零件认得的包名：第一个是现在上游的，后面是用过的旧名（更新时迁移）
export const PART_NAMES = {
  compaction: ['dsh-yanqing-compaction', 'dsh-agent-compaction'], pruner: ['dsh-yanqing-pruner', 'dsh-agent-pruner'],
  memory: ['dsh-agent-memory'], 'mnemon-probe': ['dsh-agent-mnemon-probe'],
  echo: ['dsh-agent-echo'], clock: ['dsh-agent-clock'], huanqi: ['dsh-huanqi', 'dsh-agent-huanqi'],
  'huanqi-panel': ['dsh-agent-huanqi-panel'], 'mcp-hub': ['dsh-mcp-hub'],
  'model-statusbar': ['dsh-agent-model-statusbar'], 'mobile-adapt': ['dsh-agent-mobile-adapt'],
  riji: ['dsh-agent-riji'], splash: ['dsh-agent-splash'], yantai: ['dsh-agent-yantai'],
  'compact-region': ['dsh-yanqing-compact-region', 'dsh-agent-compact-region'],
  perf: ['dsh-agent-perf'], heartbeat: ['dsh-agent-heartbeat', 'dsh-yanqing-heartbeat'], chat: ['dsh-yanqing-chat'], clawbot: ['dsh-clawbot'],
  'lead-waker': ['dsh-agent-lead-waker'], 'dsh-aurabot-qq': ['dsh-aurabot-qq'], // 目录名就是包名（第三方 vendored，作者没改成短目录）
}
// 由 Soul preset 调用的三个：只进 dependencies，不进 bundles（进了 bundles 会挂到根层，和内置压缩抢名字）。新旧名都算
export const PRESET_ONLY = ['compaction', 'pruner', 'compact-region'].flatMap((p) => PART_NAMES[p])
// 必装：作者 2026-10-31 定的「全局必装」（压缩、ECHO 整套、换气 + 面板、MCP hub），加上每轮注入自我层的 memory
export const REQUIRED_PARTS = ['compaction', 'pruner', 'memory', 'echo', 'huanqi', 'huanqi-panel', 'mcp-hub']
export const OPTIONAL_PARTS = ['mnemon-probe', 'clock', 'model-statusbar', 'mobile-adapt', 'riji', 'splash', 'yantai', 'perf', 'heartbeat', 'chat', 'clawbot', 'lead-waker', 'dsh-aurabot-qq']
// 默认勾选；面板件默认不勾（没配数据源就是空面板），上游 v3.0.0 新加的 heartbeat、chat、clawbot 也默认不勾
export const DEFAULT_PARTS = ['mnemon-probe', 'clock']
// 必须有的：必装零件，加上 Soul preset 要调用的
export const MUST_HAVE = (p) => REQUIRED_PARTS.includes(p) || PRESET_ONLY.includes(PART_NAMES[p][0])
// 安装包后来才加的零件：更新时本机没有也会补装（不想要就加 --skip-part <目录名>）

// 别处也单独发布的第三方插件：本机自己装的（安装记录里没有）安装包不碰——不覆盖、不卸载
export const EXTERNAL_PARTS = ['clawbot', 'dsh-aurabot-qq']
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
  perf: { what: '渲染性能护栏：界面上可以随时关掉高成本的毛玻璃（backdrop-filter）效果', without: '界面卡的时候只能整套关掉效果或忍着' },
  heartbeat: { what: '心跳面板：作者的自主循环、巡视记录和三档审计', without: '没有自主循环和定时巡视；kit 不再另建每日心跳',
    caveat: '心跳源码随目录完整复制；当前作者调度和部分脚本仍依赖 Windows/PowerShell。kit 不注册任务，运行与调度需分别验证' },
  'lead-waker': { what: '事件层：分会话有固定通路上来、主导回信能自动下发（心跳面板里画它的状态）', without: '分会话只能靠碰巧能写上来，主导的回信没有固定通路',
    caveat: '作者的事件层组件，和 heartbeat 面板配套用（面板读它的 /lead-waker/state）；不装 heartbeat 时它自己也能跑。默认不勾' },
  'dsh-aurabot-qq': { what: 'QQ 通路：Aurabot 插件，分会话走 SnowLuma / OneBot v11 接 QQ，自带 3 套 preset（私聊 / 私聊长任务 / 群聊）',
    without: '没有 QQ 通路，只能在本机用 DSH',
    caveat: '第三方插件（vendored 进作者仓，2.3MB）：要 QQ 账号和 OneBot 实现扫码/登录；自带 aurabot-private / -long / -social 三套 preset 会一起出现在 DSH 预设列表里。默认不勾；本机自己装过 dsh-aurabot-qq 的，安装包不动它' },
  chat: { what: '手机聊天页：插件自己开 HTTP 服务（端口 8898），手机直连会话，回复用 edge-tts 朗读', without: '手机上只能用 DSH 自带的网页', needsService: 'edge-tts 朗读服务（127.0.0.1:8899）',
    caveat: '插件自开 0.0.0.0:8898，不复用 DSH 登录鉴权；目标会话仍有作者固定 id，需核对实际会话与公开配置。当前导入错误已由作者修复，不等于手机聊天功能通过验收' },
  clawbot: { what: '微信通路：扫码绑定微信 bot，AI 能主动发微信通知，可选监听微信消息', without: '没有微信通知',
    caveat: '第三方插件（腾讯 ilink 网关）：要手机微信扫码绑定，凭据存在 ~/.dsh/clawbot/，安装包不备份它，换电脑要重新扫码；三个自动通知默认全开（每次回复都推一条微信）。本机自己装过 dsh-clawbot 的，安装包不动它' },
}

// 各系统上的兼容问题（读上游源码核对的，2026-10-31 · 4606555；2026-11-04 · 0221d89 复核）。装不装由用户定：有问题的照样列出来，只是默认不勾。
//   unsupported：原版在这个系统上用不了；partial：部分功能用不了
const PLATFORM_NOTES = {
  darwin: {
    'model-statusbar': { level: 'unsupported', why: '探测、拉起、停止依赖 PowerShell、taskkill 和 Windows 版 Python' },
    yantai: { level: 'partial', why: '「速达」应用启动器靠 .ps1 脚本；水位、未结、账本、门照常' },
    heartbeat: { level: 'unsupported', why: '路径和计划任务依赖 Windows' },
  },
  linux: {
    'model-statusbar': { level: 'unsupported', why: '探测、拉起、停止依赖 PowerShell、taskkill 和 Windows 版 Python' },
    yantai: { level: 'partial', why: '「速达」应用启动器靠 .ps1 脚本；其余照常' },
    heartbeat: { level: 'unsupported', why: '路径和计划任务依赖 Windows' },
  },
}
export const PLATFORM_LABEL = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' }
/** 这个零件在这个系统上有没有兼容问题；没有返回 null。 */
export const platformNote = (part, platform = process.platform) => PLATFORM_NOTES[platform]?.[part] || null
/** 只描述原版兼容问题，不推荐或调用其它工具。 */
export function platformText(part, platform = process.platform) {
  const n = platformNote(part, platform)
  return n ? `${PLATFORM_LABEL[platform] || platform} ${n.level === 'unsupported' ? '原版' : '部分功能'}有兼容问题：${n.why}` : null
}
// 选项分组（问答和弹窗都按这个顺序、这个分法列，每次一样）
export const PART_GROUPS = [['常用', ['mnemon-probe', 'clock', 'perf']], ['面板件', ['model-statusbar', 'mobile-adapt', 'riji', 'splash', 'yantai']], ['上游新零件', ['heartbeat', 'lead-waker', 'chat', 'clawbot', 'dsh-aurabot-qq']]]
