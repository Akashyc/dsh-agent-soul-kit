# dsh-agent-soul 安装包

**版本 6.0**（2026-11-04）· 适用于 macOS / Windows · [安装手册](AGENT-INSTALL.md) · [迭代手册](AGENT-ITERATE.md) · [历史更新](CHANGELOG.md)

> **这是管理 dsh-agent-soul 的工具包，不要把它安装到插件市场。**
> 工具包包含操作手册和安装脚本，可交给 agent 使用，也可以在终端运行。

将仓库 clone 或下载到电脑上的固定目录。交给 agent 操作时，把该目录设为工作区，再发送下方对应的操作说明；在终端操作时，先进入该目录。

工具包（下文简称 kit）支持：

- 安装：使用现成方案，或自定义名字、称呼、人设、零件和 preset。
- 更新：升级上游插件；修复另由独立 dsh-agent-soul-fix 工具处理。
- 备份：把书房、账本、会话和相关配置打成一个备份包。
- 还原：在新电脑或重装后的电脑上，用备份包装好并放回数据。
- 卸载：先备份，再移除插件；旧会话可选择保留兼容入口。
- kit 迭代：同步工具包自身，并对照上游主仓更新安装、备份与还原逻辑。

安装和更新默认获取上游主仓 `cyanwell/dsh-agent-soul` 的最新版，也可指定提交或使用本地源码；所有零件都取自主仓的 `plugins/`（作者 2026-10-31 弃用了零件仓 `dsh-agent-organs`）。单独修复使用安装记录中的版本，不升级插件。

## 两种装法

- **现成方案**：`setups/` 下每个文件夹是一套方案。内置「大肥鱼」，预设好身份、人设、零件和运行设置；路径按当前电脑生成。
- **全新安装**：依次填写身份、硬线、人设、运行和零件设置，完成后保存为新方案，便于在其他电脑复用。

零件分两种：

- **必装**（作者 2026-10-31 定的「全局必装」，加上每轮注入自我层的 memory）：compaction、pruner、memory、echo、huanqi（换气）、huanqi-panel、mcp-hub；Soul preset 要调用的 compact-region 也跟着装。
- **可选**，装不装由你定：
  - mnemon-probe：要先装 dsh-mnemon；
  - clock；
  - model-statusbar：要有本地模型服务（ComfyUI 一类）才有读数；
  - mobile-adapt：手机竖屏适配；
  - riji：日记入口，读的是本机日记目录；
  - splash：启动一屏；
  - yantai：工作台面板（水位 / 未结 / 账本 / 门）；
  - perf：渲染性能护栏，界面上可以随时关掉高成本的毛玻璃（`backdrop-filter`）效果；
  - heartbeat：作者的心跳面板（自主循环、巡视记录、三档审计）；
  - chat：手机聊天页（插件自开 8898 端口，edge-tts 朗读）；
  - clawbot：微信通路（扫码绑定微信 bot，AI 主动发微信通知）。

  可选零件分三组（常用、面板件、上游新零件）**全部列给你选**，有兼容问题的也列，只是默认不勾。面板件装完没有数据源就是空面板，想用再选。最后三个是上游 v3.0.0 新加的，**照上游原样装、默认不勾**，选之前先看清已知问题：

  - heartbeat 在上游 0221d89 里面板从包外的 `lib/paths.mjs` 导入、还用了没定义的 `AI_ROOT`，一加载就报错；心跳脚本不在零件发布清单里，调度依赖作者的 Windows 布局。Mac 可选择 `heartbeat-darwin` 修好并补齐运行链；默认不启用，先显式退役旧 kit 任务，完整验收后手动启用作者零件，见独立 fix 工具的 `MACOS-REPAIRS.md`。
  - chat 从 fe3c456 起使用未导入的 `join` / `dirname` / `homedir`，入口无法加载；目标会话 id 仍写死，书房按作者目录布局推算。服务设计为绑定 `0.0.0.0`、绕开 DSH 的登录鉴权，同一网络里谁都能访问。
  - clawbot 是第三方插件（腾讯 ilink 网关），要手机微信扫码绑定；凭据存在 `~/.dsh/clawbot/`，备份不带它，换电脑要重新扫码；三个自动通知默认全开（每次回复都推一条微信）。本机自己从插件市场装过 `dsh-clawbot` 的，安装包不覆盖、也不卸载它。

  已有的安装 `--update` 时不会自动补装这三个（终端里会问，默认不装）；以后想装加 `--add-part <名字>`。

各系统上的兼容问题（读上游源码核对的；问答和干跑里会按这台电脑的系统写明「有修复 / 没有修复」，选了也不拦）：

| 零件 | macOS | Windows |
|---|---|---|
| model-statusbar | 原版有兼容问题，有修复 `model-statusbar-darwin`（需本机 ComfyUI 和 Mac Python） | 可用 |
| yantai | 速达有兼容问题，有修复 `yantai-apps-darwin`（扫描并打开 `.app`）；其余功能照常 | 可用 |
| heartbeat | 原版有兼容问题，有修复 `heartbeat-darwin`（验收后迁移至 launchd） | 0221d89 一加载就报错，没有修复（见上） |
| echo（面板体检） | 作者只按 Windows 布局找 DSH 自带的 node，安装包用修复 `echo-node-darwin` 补上 Mac 的布局 | 可用 |
| 记忆中枢的常驻检索 `echo-svc` | 按需修复 `echo-svc-darwin` 使用 Unix socket；未启动服务时 `memq` 仍回退，mcp-hub echo 不受影响 | 可用 |

## 怎么用

先安装 DSH 并打开一次，让它生成 profile。需要 mnemon 记忆功能时，再从插件市场安装 dsh-mnemon。

**一行装**（推荐，自己在终端里装）：

macOS（终端）：

```bash
curl -fsSL https://raw.githubusercontent.com/Akashyc/dsh-agent-soul-kit/main/install.sh | bash
```

Windows（PowerShell）：

```powershell
irm https://raw.githubusercontent.com/Akashyc/dsh-agent-soul-kit/main/install.ps1 | iex
```

它会：找一个 18 以上的 node（优先 DSH 自带的，按本机架构挑）→ 把安装包放到「文稿 / 文档」下的 `dsh-agent-soul-kit`（已经有就更新；位置可用环境变量 `DSH_KIT_DIR` 改）→ 在这个终端里启动 `install.mjs`，接下来和下面「自己在终端里装」一样一问一答。Mac 上 DSH 还开着时，脚本会问要不要帮你退出（和按 Cmd+Q 一样）；Windows 上要自己连托盘图标一起退出。想直接用现成方案：macOS 写 `… | bash -s -- --setup 大肥鱼`，Windows 写 `& ([scriptblock]::Create((irm <同上地址>))) --setup 大肥鱼`。

**交给 agent 安装**：在能访问本机文件和终端的 agent 中，发送：

```text
请读这个文件夹里的 AGENT-INSTALL.md，按它把 dsh-agent-soul 装到这台电脑上。先问我用现成方案还是全新安装；全新安装就按手册一组一组问我设定。每个阶段开始前先跟我确认，需要退出或重开 DSH 时告诉我。
```

**自己在终端里装**：

```bash
node install.mjs
```

直接跑会先问用现成方案还是全新安装；全新安装一问一答，回车就用默认值。最后给一份总结，确认之后才动手。动手前要先完全退出 DSH：macOS 按 Cmd+Q，Windows 连托盘图标也要右键退出。

脚本会按「DSH 自带 → 当前进程 → PATH → 常见安装位置」查找合适的 Node.js。若终端找不到 `node`，可用 DSH 自带的 Node.js 启动，路径见 [安装手册](AGENT-INSTALL.md) 的 A3。

**更新已经装好的电脑**：

```text
请读这个文件夹里的 AGENT-INSTALL.md，按第九节「更新」把 dsh-agent-soul 更新到最新版。先干跑，把上游改了什么报给我，我确认后再真跑。
```

**只检查和修复当前安装**：

```text
请读这个文件夹里的 AGENT-INSTALL.md，按第九节「修复」操作：先出修复报告，照每条的核对方法查这台电脑的实际情况，把结论和证据整理给我确认，我确认了再按计划修。
```

安装、更新、恢复只按作者上游装，不打修复；装完单独做这一步。修不修不在终端里选：作者代码里有那段毛病，不等于这台电脑会撞上，要 agent 照报告逐条核对本机（会话注入、面板、日志、你用不用那个功能）再定。流程和参数见下方「更新与修复」。

**备份**：

```text
请读这个文件夹里的 AGENT-INSTALL.md，按第十节「在旧电脑上备份」打一个备份包。先干跑，把清点结果报给我，我确认后再真跑。
```

**还原**：

```text
请读这个文件夹里的 AGENT-INSTALL.md，按第十节「在新电脑上恢复」用备份包还原。先干跑，把要装的版本、要放回的数据和「需要留意」报给我，我确认后再真跑。
```

换电脑就是先在旧电脑上备份，把整个安装包文件夹（含 `backups/`）拷到新电脑，再在新电脑上还原。

**卸载**：

```text
请读这个文件夹里的 AGENT-INSTALL.md，按第十二节「卸载」把 dsh-agent-soul 卸掉。先干跑，把要删什么、有多少旧会话用的是 Soul preset 报给我，旧会话怎么处理让我选，我确认后再真跑。
```

卸载前一定先打备份包（在 `backups/` 里，文件名以 `-pre-uninstall` 结尾）。用 Soul preset 建的旧会话，preset 删了多半打不开，三种处理任选：留一个空壳 preset（`shell`，旧会话照常打开）、把旧会话改成对应的官方 preset（`rewrite`）、不管（`keep`）。书房和记忆中枢默认一起删，想留着加 `--keep-data`。

**迭代 kit 自身**：

```text
请读 AGENT-ITERATE.md，先检查 kit 自身 GitHub 仓库的更新，有必要则拉取并合入本地 kit，保留本地修改和方案；再检查插件上游作者仓库相对上次 kit 迭代基线的变化，逐项分析安装、更新、备份、还原四个流程，完成需要的 kit 修正和验证，再登记本轮迭代结果。分别告诉我两个仓库的检查结果、完成了什么、还有什么未验证。
```

迭代分三步，代码分析、修改和验证都由 agent 做：

1. **同步 kit**：`node install.mjs --kit-iterate` 先查 kit 仓库 `Akashyc/dsh-agent-soul-kit`。本地干净、能快进就直接更新；有本地修改、分叉了，或者用的是下载版，就存一份新版快照和差异，由 agent 合入。
2. **对照上游**：agent 重新读新版手册、重跑入口，再和插件上游 `cyanwell/dsh-agent-soul` 比对，写出四流程报告，并把修复清单逐条归类（仍需修 / 作者这次修好了 / 原文对不上 / 不再适用 / 疑似新问题），完成修正和验证。
3. **登记**：用 `--kit-accept <报告目录>` 登记这次的上游审查基线；作者修好的修复条目要从清单删掉、在完成记录里登记退役，登记时 id 写进 `kit-iteration.json`，不再复用。只生成报告、只同步 kit 都不算迭代完成；整个流程也不会动本机已经装好的插件。

需要 Git。相关参数：

- `--kit-update`：只检查、同步 kit；加 `--dry-run` 只检查，有更新时只报计划；
- `--kit-repo`、`--kit-ref`：指定 kit 的仓库和版本，和插件上游的 `--ref` 互不相干；
- 离线：给了 `--base-source`、`--source` 就默认不联网查 kit，想把 kit 也一起离线查，加 `--kit-source <干净的 Git 目录>`；
- `--skip-kit-update`：已经人工合入并验证过时，跳过 kit 检查继续本轮；跳过会写进报告，不代表 kit 已是最新。

常用命令（可加 `--dry-run` 查看计划；安装、更新、修复、恢复、卸载实际执行前须完全退出 DSH）：

```bash
node install.mjs --setup 大肥鱼     # 用现成方案装
node install.mjs --update          # 更新到上游最新版（不打修复，装完单独检查）
node install.mjs --update --flash on  # 加装灵魂 · PTC Flash（off 去掉）；装了的每次更新都跟作者最新发布的版本
node install.mjs --update --add-part clawbot  # 补装默认不装、或以前拒掉的可选零件
# 以下修复命令在独立 dsh-agent-soul-fix 目录执行
node fix.mjs --report    # 修复检查：出报告和计划模板（只读），交给 agent 核对本机
node fix.mjs --plan <报告目录>/fix-plan.json  # 按核对过、你确认过的计划修
node install.mjs --backup          # 打备份包，放在 backups/
node install.mjs --restore         # 还原：装好并放回 backups/ 里最新的备份
node install.mjs --uninstall       # 卸载：先备份；终端里会问旧会话怎么处理（也可以加 --old-sessions shell|rewrite|keep）
node install.mjs --kit-update      # 只检查、同步 kit 自身仓库
node install.mjs --kit-iterate     # 先同步 kit，再收集上游的变化，交给 agent 修正
```

## 装出来是什么

- **本体和零件**：必装的七个（加上 Soul preset 调用的 compact-region），再加方案里选了的可选零件。
- **记忆检索**：通过 `memq` 检索；安装并接入 mcp-hub 后，还可在会话里调用 `mcp__echo__echo_search`。
- **Soul preset**：灵魂、灵魂 · 创造、灵魂 · PTC、灵魂 · 预判、灵魂 · 全能五套使用上游原文，照作者的装法写进 profile 的 `cordis.patch.yml`（4.3 起；以前装在独立包 `dsh-soul-preset` 里，`--update` 会搬过去）。全能只取 preset 本身那一块：上游 `preset-soul-all.yml` 后面跟着作者整份 profile 的导出（模型列表、第三方插件、局域网绑定、mnemon / 换气配置），照搬会盖掉你自己的配置。创造和全能用到的 4 个技能（上游 `presets/skills/`）放进 profile 的 `skills/`，更新时只换没改过的，本机改过的留着并报出来。可选第六个「灵魂 · PTC Flash」：照 [dsh-flash-presets](https://github.com/LarryE135/dsh-flash-presets) 的 v3 适配（压缩、裁剪带门牌），安装问答里和灵魂五套一起选、默认不选，已装的用 `--update --flash on` 加上；每次安装、更新在线取作者最新发布的版本。内置「大肥鱼」默认安装灵魂五套，新会话默认使用灵魂。压缩摘要和裁剪后的工具输出带门牌，可按 `log:<会话>#seq=<n>` 回取原文。
- **从砚青换到灵魂**：上游 v3.0.0 把砚青四套去个人化，改名为灵魂四套（id `yanqing*` → `soul*`，persona 不再写具体人名）。`--update` 换上新的，以前用砚青建的会话照常能打开（留一个和对应灵魂 preset 一样的别名，列表里标「旧会话用」），新会话默认的 `yanqing` 换成 `soul`；砚青 PTC Flash 同样改名为灵魂 · PTC Flash（`soul-ptc-flash`）。全能是这次新加的，已有的安装更新时补上。
- **书房和记忆中枢**：在 DSH 家目录下的 `dsh-soul/`，里面有权威源册、骨架、账本、索引。
- **自我层**：身份、硬线、说话方式，每轮注入。
- **心跳**：统一使用作者可选 heartbeat 零件；kit 不再生成或注册每日任务，运行与调度须单独验收、确认启用。
- **验收标准**：体检 0 错，`/compact` 的摘要第一块带门牌。门牌要在**装完后新建的会话**里测：装之前开的会话不会换成 Soul preset。

## 文件夹里有什么

| 文件 | 用途 |
|---|---|
| `AGENT-INSTALL.md` | 给 agent 的完整手册：选方案、全新安装怎么问、安装、更新、备份与还原、验收、已知坑、回滚 |
| `AGENT-ITERATE.md` | 给 agent 的 kit 自我迭代流程：自身仓库同步、插件上游对比、四流程分析、修正、验证、完成登记 |
| `install.sh` / `install.ps1` | 一行装的引导：找 node、放好安装包、在终端里启动 `install.mjs`（macOS / Windows 各一份，后面的事是同一份 `install.mjs`） |
| `install.mjs` | 安装、更新、修复、备份、恢复与卸载入口；支持干跑 |
| `lib/parts.mjs` | 零件目录：装配顺序、包名（含旧名，更新时迁移）、必装 / 可选、各系统上的已知限制 |
| `lib/setup.mjs` | 方案与问答：题库、终端一问一答、给 agent 的问题清单、回答校验、方案文件生成与读取 |
| `lib/platform.mjs` | 系统差异：找 node（DSH 自带优先、按本机架构挑）、DSH 家目录候选、系统代理、Mac 上帮用户退出 DSH |
| [CHANGELOG.md](CHANGELOG.md) | 4.5 及以前的历史更新记录 |
| `lib/home-paths.mjs` | 路径自动定位：插件运行时找 DSH 家目录的代码、memory 补丁、memory 配置的核对与改写 |
| `lib/persona.mjs` | 「说话与样子」的三条规矩：用户没写的才补，句子去重 |
| `lib/uninstall.mjs` | 卸载的规划：摘配置和锁文件里的条目、换默认 preset、改写旧会话开头的 preset |
| `lib/flash-presets.mjs` | 灵魂 · PTC Flash：校验 dsh-flash-presets v3 的结构，换 id 和名字、压缩裁剪换成带门牌的零件、补范围压缩，其余照作者 |
| `lib/soul-presets.mjs` | 灵魂五套逐字搬上游 `presets/`（`@include` 按作者 `soul-preset build` 的算法展开，全能只取 preset 那一块），写进 profile `cordis.patch.yml` 的 `- insert:` 那一节；砚青等旧 id 的别名；卸载时可保留使用官方零件的空壳 |
| `lib/preset-skills.mjs` | Soul preset 自带的 skills：拷进 profile 的 `skills/`，和上游不一样的换成上游原文 |
| `lib/archive.mjs` | 自动快照：每次操作前的原样放进 `archives/`，旧版留在 DSH 家目录里的备份搬进 `legacy/` |
| `lib/popups.mjs` | 给 agent 的弹窗：问答和修复计划排成固定的弹窗，每次一样 |
| `lib/preset-migration.mjs` | 清理退役 preset，迁移旧会话和默认入口；会话原文纳入事务备份 |
| `lib/name-map.mjs` | 称呼替换：在上游源码的临时副本上把作者的称呼换成用户称呼；认出手工改过却没记下的情况 |
| `lib/package-contract.mjs` | 上游包核对：入口导入的文件要在 `files` 里、DSH 启动时会加载的文件要能通过语法检查（`node --check`，只解析不执行），用到的 `@deepseek-ai/*` 要声明 `peerDependencies`；拷包前和 kit 迭代报告共用 |
| `lib/kit-iterate.mjs` | 上游差异与契约检查、源码快照、迭代基线和完成证据管理 |
| `lib/kit-update.mjs` | kit 自身仓库检查、安全快进更新和需人工合入时的新版快照 |
| `kit-iteration.json` | 首次完成迭代后生成，保存审查基线和四流程结论；不代替端到端验收记录 |
| `setups/` | 方案。`大肥鱼/` 是 Boss 的；全新安装存下的也在这里 |
| `assets/` | 全新安装用的模板（权威源册、自我层）、找不到官方预设时用的 preset 快照、离线用的灵魂五套和 skills（跟上游 c370a69） |
| `logs/` | 每次运行的输出，脚本自动生成，可以删 |
| `backups/` | `--backup`、`--uninstall` 打出的备份包；到新电脑还原时连同整个文件夹一起拷走 |

## 更新与独立修复

`node install.mjs --update` 将本体、零件、中枢脚本、Soul preset 及 skills 同步为作者版本，修改前保存快照。书房、人设、账本和用户数据按现有规则保留。

**6.0 起，全部修复能力迁至独立工具 dsh-agent-soul-fix，首版为 1.0。** kit 不再检查修复清单、应用补丁、填写修复计划或登记修复迭代。旧 `--fix`、`--fix-only`、`--fix-skip`、`--fix-revert`、`--report`、`--plan`、`--summary-model` 参数明确报迁移提示并退出。

需要检查修复时，进入独立 fix 工具目录运行：

```bash
# 以下修复命令在独立 dsh-agent-soul-fix 目录执行
node fix.mjs --report
node fix.mjs --plan <报告目录>/fix-plan.json --dry-run
```

核对本机、确认计划并完全退出 DSH 后，去掉 `--dry-run` 执行。fix 只修已安装版本，不负责安装和升级插件。kit 更新可能清除文件补丁，更新后应重新检查；旧计划不可复用。

kit 继续检查发布文件与加载依赖，发现安装完整性问题会提示启动前处理。kit 不下载或自动执行 fix。修复状态按 profile 保存在 `<DSH_HOME>/dsh-soul/fix/<profile>/state.json`，kit 备份/恢复携带这些历史记录；首次接管所需的旧安装修复证据保留。两工具共享整套安装的写锁，不能并发修改同一 DSH。

## 备份

`--backup` 把 dsh-agent-soul 自己的东西打成一个 `.tar.gz`，默认放在 `backups/`（`--out <目录>` 可以放别处），打完会解开逐个核对一遍。打之前先完全退出 DSH，免得打出写到一半的文件。

带：

- 书房：账本、权威源册、人设；
- 记忆中枢（索引不带，还原时重建）；
- 会话原文（门牌靠它回取）；
- 换气账本；
- 本架构插件的设置、mcp-hub 清单；
- 安装记录：用的哪个方案、装了哪些零件、修复的跳过设置和核对结论。

不带：dsh-mnemon、其他插件、skills（Soul preset 自带的还原时从上游重装）、微信通路的凭据、表情包、附件、DSH 本身的设置。

卸载前也会自动打一个备份包，文件名以 `-pre-uninstall` 结尾。备份包和 `archives/` 里的快照是两回事：快照是每次操作前自动留的原样，只给这台电脑回滚用。

## 还原

`--restore [备份包]` 在新电脑（或卸载后的这台电脑）上装好 dsh-agent-soul，再放回备份里的数据；不写包名就用 `backups/` 里最新的一份。

- 不用再选方案，零件、Soul preset、称呼替换照备份安装；旧心跳时间仅作历史保留，不重新注册任务，按备份时的上游版本装（想升到最新，装好后再跑 `--update`）。
- 书房、记忆中枢、会话原文、换气账本连修改时间一起放回；配置里的绝对路径自动换成新电脑的，Mac 和 Windows 互相还原也换。
- 插件设置合并进新电脑的 `cordis.patch.yml`，新电脑已有的条目不动；mcp-hub 清单里的 echo 按新电脑路径重写。
- 新电脑上已经有灵魂数据（账本里有主导记录或自我层填过）时会停下，确认要覆盖再加 `--force`，原有的书房和记忆中枢先存进这次的快照。
- 和安装一样不打修复，还原完单独做修复检查；然后在新会话里任命新一代主导。

迁不过去的：账本里写死的 `file:` 绝对路径、备份前就删掉的会话原文、mcp-hub 里其他服务器的命令路径（在面板里改）。

## 想改内容

- **改大肥鱼**：改 `setups/大肥鱼/` 里的文件：
  - `setup.json`：管零件、preset、称呼替换（`nameMap`）；
  - `00-authority.md`：权威源册；
  - `SELF.src.md.tpl`：自我层；
  - `大肥鱼-声音.md`：完整人设。

  人设改了完整版，要把每轮带着的那几条同步进自我层的「说话与样子」。
- **心跳配置**：在作者 heartbeat 零件中配置。`--heartbeat-time` 已退役并明确报错；`--no-heartbeat` 仅为旧命令兼容、无动作。旧任务不会被升级自动停用，先核对归属再按迁移说明退役。
- **装指定版本**：加 `--ref <提交号>`。网络不通时先下载源码，再加 `--source <文件或文件夹>`。

## 注意

- **验证范围**：4.0 逐个零件读上游 4606555 源码核对过修复清单。4.1 在 macOS（Apple 芯片，DSH NEXT 2.0.21-next）上用 `install.sh` 真装验收过：全新安装的终端问答、13 个零件和 21 条修复、砚青四套 preset、mcp-hub 接入 echo、心跳；新会话里体检 0 错、`/compact` 摘要带门牌、`memq open` 按门牌取回原文。更新到上游 8ba1385 时撞上作者的语法错误、按备份回滚，装前语法检查就是因此加的。4.2 的两处改动只在本机干跑核对过（更新计划里列出给 echo 补 `DSH_HOME`）。5.0 跟上游 c370a69（v3.0.0）只在隔离目录里验证过全新安装、4.5 → 5.0 更新、修复检查、备份 / 恢复 / 卸载，还没在桌面上实装，Soul preset 的 skills 挂没挂上要看灵魂 · 创造里能不能列出 creation 等技能；heartbeat、chat、clawbot 没实测。5.2 对 fe3c456 的安装、更新、备份、恢复、卸载与修复计划完成隔离验证；没有启动真实 DSH。`install.ps1` 还没在 Windows 上跑过。 5.4 在隔离目录里验证过：fe3c456 安装并打修复、手改、留旧备份后更新到 0221d89（零件逐个等于作者原文、旧备份搬进 legacy、收尾点名必须先修的项）、修复报告和计划（修后换气在 node_modules 里能加载）、备份 / 换目录恢复 / 卸载，以及问答自测；macOS 修复只在 Linux 上借垫片跑到面板加载和 heartbeat.mjs --force，没在桌面上实装。
- **作者仓库里的同名文件**：2026-10-28 起作者仓库根目录也有 `install.mjs`、`AGENT-INSTALL.md`，还有 `tools/soul-doctor.mjs`、`tools/soul-preset.mjs`、`presets/`。包名现在和本安装包一致了；4.3 起 Soul preset 也照作者的装法写进 profile 的 `cordis.patch.yml`，作者 `soul-doctor` 的 L2 能看到。但别用作者的 `tools/soul-preset.mjs build --write` 装：profile 里还没有 preset 时它会把块插到文件最顶上、不带 `- insert:`，配置会坏；不设 `DSH_HOME` 环境变量跑还会报 ReferenceError（第 40 行先用了第 51 行才定义的 `argOf`）。说「跑 install.mjs」时，指的都是本文件夹里的这一份。
- **插件市场里的「已停用」**：压缩与裁剪零件由 Soul preset 调用，显示「已停用」不代表功能失效，不必在全局启用或卸载。
- **回声面板、换气面板的加载名**：上游 v2.0.0 及以前这两个包叫 `dsh-agent-*`，`cordis.patch.yml` 里要加载的名字却是 `dsh-yanqing-*`，原样装会加载失败。作者在 v3.0.0 修好了，修复 `echo-load-name`、`panel-load-name` 已退役；旧版电脑先用 `--update` 同步作者原文，再检查现行修复；不再提供已退役补丁。收尾仍检查每个包要加载的插件是否存在。
- **路径不带用户名**：安装包里没有写死任何一台电脑的路径。memory 的配置写的是相对 DSH 家目录的路径（`dsh-soul/memory/hub/SELF.md`），几个要找书房、记忆中枢的插件也是运行时自己找家目录；权威源册、自我层、要贴进新会话的话里的路径写成 `$HOME/…`（zsh、bash、PowerShell 都认）；作者 heartbeat 的兼容修复按 DSH 家目录定位记忆中枢。只有交给操作系统和别的程序执行的几处必须是绝对路径，安装时在这台电脑上现算：launchd / 计划任务、mcp-hub 的 echo 服务器、`echo.config.json`；还原时会换成新电脑的。以前写死了某台电脑路径的配置和补丁，重跑安装或 `--update` 会自动改过来。
- **在 DSH 里让 agent 装**：agent 可以替你干跑；真跑要先退出 DSH，按干跑最后给出的命令在终端里跑。重开 DSH 后新建一个会话，把安装脚本最后打印的那段话贴进去，主导、记账、门牌实测都在那个新会话里做。
- **新电脑上的代数**：直接安装时，新电脑上的书房和账本是全新的，agent 从「第 1 代」开始。想带上旧电脑的账本和对话，在旧电脑上 `--backup`、新电脑上 `--restore`，还原后再任命下一代主导。

## 版本记录

### 6.0（2026-11-04）

完整分离修复功能至 dsh-agent-soul-fix 1.0；旧修复参数明确退出。新增独立修复状态备份/恢复及整套安装写锁；保留旧修复证据供首次接管，kit 自身迭代不再管理修复清单。


5.6 退役 kit 自带的每日心跳：删掉心跳脚本模板、安装时的脚本生成与 launchd / 计划任务注册，问答和 setup.json 里的心跳字段一并拿掉；`--heartbeat-time` 改为明确报错，`--no-heartbeat` 只作旧命令兼容、无动作。保留旧任务（`com.dsh-soul.heartbeat` / `dsh-soul-heartbeat` / `heartbeat.sh`）的识别与停用、作者 heartbeat 可选零件、`heartbeat-darwin` 兼容修复；`kit-macos.mjs` 的 `--replace-kit` / `--restore-kit` 换成只退役旧任务的 `--retire-kit`。已装的旧任务不会被自动停用，本轮也没有在本机部署或停用任何任务。


这里只保留最近三条更新；5.2 及以前的记录见 [历史更新](CHANGELOG.md)。版本号与 `install.mjs` 中的 `KIT_VERSION` 一致。

| 版本 | 日期 | 更新摘要 |
|---|---|---|
| 5.6 | 2026-11-04 | 退役 kit 自带每日心跳：删除 `assets/templates/heartbeat.mjs.tpl`、安装时的脚本生成和 launchd / 计划任务注册、问答题目与 `setup.json` 的 `heartbeat` / `heartbeatTime` 字段。`--heartbeat-time` 明确报错，`--no-heartbeat` 仅作旧命令兼容。只保留旧任务的识别、停用与迁移（`--retire-kit`）、作者 heartbeat 零件和 `heartbeat-darwin` 兼容修复；`--replace-kit` / `--restore-kit` 删除，不再切换或恢复旧每日心跳。不自动停用已装任务。 |
| 5.5 | 2026-11-04 | 修复前校验最终文件依赖图；删除仍被引用的 helper 会拒绝整次操作，不再写空文件。补拷依赖参与干跑，未选 helper 保持原状；作者配套文件撤销后保留。新增 `compaction-memq-path`、`echo-mcp-sessions` 处理上游路径回归。删除仅加注释的 heartbeat-core 补丁、不可达旧检测和过时修复处方；不复用退役 id。隔离验证覆盖首次修复、重复、冻结、撤销和写入后失败回滚。 |
| 5.4 | 2026-11-04 | 跟上游 0221d89。**安装、更新以作者为准**：本体、零件、中枢脚本（作者的 `install-kit --all`）、Soul preset 和 skills 一律同步成作者原文，kit 修复和本机手改都换掉，原样进快照，安装记录里的修复结论清空、只留核对证据；上游包本身有问题（入口文件不存在、导入包外文件、语法错误、注册 id 撞车）不再停下，写进「需要留意」、收尾点名。修复清单只对准作者最新版：退役的 7 条从清单删掉（id 保留不复用），新增 `huanqi-paths-import`（0221d89 换气从包外的 `lib/paths.mjs` 导入，一加载就报错），`heartbeat-darwin` 按新版改写；homedir 两条改看 `state/huanqi-boot.log` 判断 DSH 传不传 `DSH_HOME`；修复检查遇到旧版安装先提示更新。发布清单检查新增「导入了包外的文件」。自动备份统一到 kit 的 `archives/<主机>-<家目录指纹>/`（新增 `lib/archive.mjs`），旧的 `.bak-*`、`dsh-soul/_backup/` 自动搬进 `legacy/`，快照同时是回滚依据。可选零件分三组全量列出，兼容问题写成「有修复 / 没有修复」，没装 dsh-mnemon 选 mnemon-probe 改成提醒。人设三问合成一个输入框（句子和文件路径混写）。`--questions` 和修复报告输出排好的弹窗 `popups`（新增 `lib/popups.mjs`），手册加「弹窗规范」。不再迁移 kit 4.0 以前的安装。新增 `scripts/verify-setup.mjs`。 |