# dsh-agent-soul 安装包

**版本 5.4**（2026-11-04）· 适用于 macOS / Windows · [安装手册](AGENT-INSTALL.md) · [迭代手册](AGENT-ITERATE.md) · [历史更新](CHANGELOG.md)

> **这是管理 dsh-agent-soul 的工具包，不要把它安装到插件市场。**
> 工具包包含操作手册和安装脚本，可交给 agent 使用，也可以在终端运行。

将仓库 clone 或下载到电脑上的固定目录。交给 agent 操作时，把该目录设为工作区，再发送下方对应的操作说明；在终端操作时，先进入该目录。

工具包（下文简称 kit）支持：

- 安装：使用现成方案，或自定义名字、称呼、人设、零件和 preset。
- 更新与修复：升级上游插件，或单独检查已安装版本的问题。
- 备份与迁移：把书房、账本、会话和相关配置带到另一台电脑。
- 卸载：先备份，再移除插件；旧会话可选择保留兼容入口。
- kit 迭代：同步工具包自身，并对照上游主仓更新安装与迁移逻辑。

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

  - heartbeat 在上游 0221d89 里面板从包外的 `lib/paths.mjs` 导入、还用了没定义的 `AI_ROOT`，一加载就报错；心跳脚本不在零件发布清单里，调度依赖作者的 Windows 布局。Mac 可选择 `heartbeat-darwin` 修好并补齐运行链；默认不启用，完整验收后再替代 kit 每日自检，见 [迁移说明](MACOS-REPAIRS.md)。
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

**迁移到另一台电脑**：

```text
请读这个文件夹里的 AGENT-INSTALL.md，按第十节「迁移」操作：在旧电脑上先备份；新电脑上用备份恢复。每一步先跟我确认。
```

**卸载**：

```text
请读这个文件夹里的 AGENT-INSTALL.md，按第十二节「卸载」把 dsh-agent-soul 卸掉。先干跑，把要删什么、有多少旧会话用的是 Soul preset 报给我，旧会话怎么处理让我选，我确认后再真跑。
```

卸载前一定先打备份包（在 `backups/` 里，文件名以 `-pre-uninstall` 结尾）。用 Soul preset 建的旧会话，preset 删了多半打不开，三种处理任选：留一个空壳 preset（`shell`，旧会话照常打开）、把旧会话改成对应的官方 preset（`rewrite`）、不管（`keep`）。书房和记忆中枢默认一起删，想留着加 `--keep-data`。

**迭代 kit 自身**：

```text
请读 AGENT-ITERATE.md，先检查 kit 自身 GitHub 仓库的更新，有必要则拉取并合入本地 kit，保留本地修改和方案；再检查插件上游作者仓库相对上次 kit 迭代基线的变化，逐项分析安装、更新、备份、迁移四个流程，完成需要的 kit 修正和验证，再登记本轮迭代结果。分别告诉我两个仓库的检查结果、完成了什么、还有什么未验证。
```

迭代分三步，代码分析、修改和验证都由 agent 做：

1. **同步 kit**：`node install.mjs --kit-iterate` 先查 kit 仓库 `Akashyc/dsh-agent-soul-kit`。本地干净、能快进就直接更新；有本地修改、分叉了，或者用的是下载版，就存一份新版快照和差异，由 agent 合入。
2. **对照上游**：agent 重新读新版手册、重跑入口，再和插件上游 `cyanwell/dsh-agent-soul` 比对，写出四流程报告，并把修复清单逐条归类（仍需修 / 作者这次修好了 / 原文对不上 / 不再适用 / 疑似新问题），完成修正和验证。
3. **登记**：用 `--kit-accept <报告目录>` 登记这次的上游审查基线；作者这次修好的修复条目在登记时自动退役（条目留着，记下作者在哪个提交修好）。只生成报告、只同步 kit 都不算迭代完成；整个流程也不会动本机已经装好的插件。

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
node install.mjs --fix --report    # 修复检查：出报告和计划模板（只读），交给 agent 核对本机
node install.mjs --fix --plan <报告目录>/fix-plan.json  # 按核对过、你确认过的计划修
node install.mjs --backup          # 打迁移用的备份包，放在 backups/
node install.mjs --restore         # 在新电脑上：装好并放回 backups/ 里最新的备份
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
- **心跳**：按方案每天定时重建索引、刷新自我层、跑体检。
- **验收标准**：体检 0 错，`/compact` 的摘要第一块带门牌。门牌要在**装完后新建的会话**里测：装之前开的会话不会换成 Soul preset。

## 文件夹里有什么

| 文件 | 用途 |
|---|---|
| `AGENT-INSTALL.md` | 给 agent 的完整手册：选方案、全新安装怎么问、安装、更新、迁移、验收、已知坑、回滚 |
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
| `lib/fixes.mjs` | 修复清单：kit 对上游插件的 19 处修改逐条登记，判定问题还在不在、按文件对照作者原文重算、给 kit 迭代归类和找疑似新问题 |
| `lib/fix-plan.mjs` | 修复报告和修复计划：计划模板、校验（同一次报告、每条要选的都选了、选修 / 不修都有证据）、换算成这次处理哪几条和跳过清单 |
| `lib/fix-records.mjs` | 修复原文、生成物与行级配置的核对和撤回 |
| `lib/fix-transaction.mjs` | 修复失败时恢复包、配置、锁文件和安装记录；保留恢复清单 |
| `lib/huanqi-patches.mjs` | 换气、compact-region 的本机补丁：作者写死的记忆中枢路径改成运行时找家目录，外加 Boss 本机实测的行为修复 |
| `lib/huanqi-panel-patch.mjs` | 换气面板「没有 `- id: huanqi` 时自建一节」的补丁 |
| `lib/name-map.mjs` | 称呼替换：在上游源码的临时副本上把作者的称呼换成用户称呼；认出手工改过却没记下的情况 |
| `lib/package-contract.mjs` | 上游包核对：入口导入的文件要在 `files` 里、DSH 启动时会加载的文件要能通过语法检查（`node --check`，只解析不执行），用到的 `@deepseek-ai/*` 要声明 `peerDependencies`；拷包前和 kit 迭代报告共用 |
| `lib/kit-iterate.mjs` | 上游差异与契约检查、源码快照、迭代基线和完成证据管理 |
| `lib/kit-update.mjs` | kit 自身仓库检查、安全快进更新和需人工合入时的新版快照 |
| `kit-iteration.json` | 首次完成迭代后生成，保存审查基线和四流程结论；不代替端到端验收记录 |
| `setups/` | 方案。`大肥鱼/` 是 Boss 的；全新安装存下的也在这里 |
| `assets/` | 全新安装用的模板（权威源册、自我层、心跳脚本）、找不到官方预设时用的 preset 快照、离线用的灵魂五套和 skills（跟上游 c370a69） |
| `logs/` | 每次运行的输出，脚本自动生成，可以删 |
| `backups/` | `--backup`、`--uninstall` 打出的备份包；迁移时连同整个文件夹一起拷走 |

## 更新与修复

**安装、更新以作者为准**（5.4）：`--update` 把本体、零件、中枢脚本、Soul preset 和它的 skills 同步成作者最新版，kit 修复、本机手改一律换成作者原文，换之前原样存进快照；上游包本身有问题也照装，问题交给修复检查，收尾会点名哪些修好之前不能启动 DSH。方案、书房、账本、权威源册、人设、心跳设置、索引等数据保留；需要调整的插件配置、包名及锁文件会在计划中列出。

**修复清单**：`lib/fixes.mjs` 登记 21 条修复：1 条拷包补漏（上游发布清单漏列的文件）、1 条换气配置修复、1 条压缩摘要模型修复，其余是文件补丁（含 4 条可选的 macOS 修复）。**修复清单只对准作者最新版**：作者修好的条目从清单删掉，id 记在 `kit-iteration.json` 里不再复用。**修复和安装分开**：安装、更新、恢复只按作者上游装（称呼替换、preset 独立打包等 kit 固定处理仍保留），以前打的修复也一起清掉；装完单独做修复检查，分五步：

1. `--fix --report` 出报告。每条写着判定、本机事实、不修会怎样、什么时候会撞上、怎么核对。
2. agent 照核对方法逐条查本机，把会不会撞上、修 / 不修 / 这次先不动、证据填进计划。
3. 你确认。
4. `--fix --plan` 照计划修（问你的时候照报告里排好的弹窗问）。
5. 照核对方法验收。

终端里不再逐条问。清单外的问题（扫出来的疑似问题、使用中遇到的新 bug）先整理修复方案给用户确认，登记进 `lib/fixes.mjs` 再修，不直接手改已装文件。

| 检查结果 | 处理方式 |
|---|---|
| 问题仍在 | 应用 kit 修复；已修复的保持，已识别的旧写法更新 |
| 作者已修 | 停止打补丁；有原文证据时，将旧 kit 修复版换回作者版 |
| 无法判断 | 保留文件，报告「需人工核对」 |
| 本机手改过 | `--fix` 保留文件，报告冲突；下次 `--update` 换回作者原文（原样在快照里） |

`--fix` 只处理已安装版本，不升级本体或重装零件（作者发布清单漏列的文件会补拷进已装的包）：

| 参数 | 用途 |
|---|---|
| `--fix --report [目录]` | 出修复报告（`fix-report.md` / `.json`）和计划模板 `fix-plan.json`；只读，DSH 开着也能跑 |
| `--fix --plan <fix-plan.json>` | 校验计划（同一次报告、每条要选的都选了、选修 / 不修都有证据、出报告以后本机没变），再照计划修，核对结论和证据记进安装记录；加 `--dry-run` 只校验 |
| `--fix` | 只列检查结果，不改文件 |
| `--fix-only <id,…>` | 手动指定本次只处理哪几条，适用于所有修复阶段 |
| `--fix-skip <id,…>` | 跳过指定条目，撤回可识别的 kit 修复，并记入安装记录；`none` 清空跳过设置 |
| `--fix-revert <id,…>` | 撤回指定修复，并加入跳过清单 |

选过「不修」的条目记进跳过清单，已经修好的也一样，以后报告里不再要求选；情况变了想改，核对后把那一条加进计划。备份与恢复会带上这份设置。4.0 去掉了 `--fix-reinstall`、`--organs-source`（取源和包名不再是修复条目，包名迁移走 `--update`）。

**快照**：安装、更新、修复、恢复、卸载动手前，把要改的原样存进安装包的 `archives/<主机>-<家目录指纹>/<时间>-<操作>-<随机码>/`（按 DSH 家目录的相对路径摆放，附「还原方法.txt」）；失败时据此自动回滚，事后也能照着拷回去。5.3 及以前散在 DSH 家目录里的 `.bak-*`、`dsh-soul/_backup/` 下次真跑时搬进 `legacy/`。快照跟着安装包文件夹走，删了安装包文件夹快照也就没了；`backups/` 是另一回事，放 `--backup` 打的迁移包。

安装、更新、恢复会移除旧版 PTC · Soul · Flash，把旧会话入口及默认项迁到灵魂 · PTC；会话正文不变，原文件留在事务备份。会话无法读取时先停止，处理后重试。修复检查不管这件事。卸载旧 Flash 安装时，若选 `shell`，会改为将旧会话迁到官方 preset，不再保留 Flash 空壳。

几个常见设置：

- **零件来源和包名**：全部来自上游主仓 `plugins/`，包名照上游原样（压缩三件套 `dsh-yanqing-*`，其余 `dsh-agent-*`、`dsh-huanqi`、`dsh-mcp-hub`、`dsh-clawbot`）。上游 v3.0.0 把压缩三件套从 `dsh-agent-*` 统一回部署端的 `dsh-yanqing-*`，kit 4.x 装的 `--update` 会迁移（装新目录、删旧目录、bundles / dependencies / 锁文件和 Soul preset 里的引用同步换名）；从 organs 装的换气、compact-region 也一样。`--fix` 不动包名，碰到旧包名会让你先 `--update`。
- **摘要模型**：作者 preset 指定 `deepseek-official`、而本机使用其他路由或近期会话报缺少 API key 时，修复会让摘要跟随会话模型。想保留作者设置，修复检查里把它选成「不修」，或用 `--fix-skip preset-summary-model`；旧参数 `--summary-model author` 仍兼容。
- **称呼替换**：作者已把 preset 人设和文档里的人名改掉，4.1 起安装默认不换、问答里也不再问；内置两套方案的 `nameMap` 都是空的。上游代码里还剩几处「爀曦」（例如换气熔断时注入给 agent 的「告诉爀曦『需要手动压缩』」），想换就加 `--rename 爀曦=<称呼>`，选择随安装记录保存，以后更新照做；`--rename none` 关掉。
- **离线比对**：主仓源码用 `--source`，更新时的旧版本基线用 `--base-source`。上游包缺少入口依赖文件（发布清单漏列的会自动补上）、或者 DSH 启动时要加载的文件有语法错误时，会在动手前停下，已装的照常能用（2026-11-01 上游回声面板的 `client.js` 坏过一次，照装 DSH 窗口起不来）；缺少宿主依赖声明时只提示核对。

## 备份带什么

只带 dsh-agent-soul 自己的东西：

- 书房：账本、权威源册、人设；
- 记忆中枢；
- 会话原文（门牌靠它回取）；
- 换气账本；
- 本架构插件的设置、mcp-hub 清单；
- 安装记录：用的哪个方案、装了哪些零件。

不带：dsh-mnemon、其他插件、skills、表情包、附件、DSH 本身的设置。

恢复时不用再选方案，按备份时的上游版本和零件装，路径自动换成新电脑的。

## 想改内容

- **改大肥鱼**：改 `setups/大肥鱼/` 里的文件：
  - `setup.json`：管零件、preset、心跳、称呼替换（`nameMap`）；
  - `00-authority.md`：权威源册；
  - `SELF.src.md.tpl`：自我层；
  - `大肥鱼-声音.md`：完整人设。

  人设改了完整版，要把每轮带着的那几条同步进自我层的「说话与样子」。
- **换心跳时间**：跑脚本时加 `--heartbeat-time 09:30`。不要心跳就加 `--no-heartbeat`。
- **装指定版本**：加 `--ref <提交号>`。网络不通时先下载源码，再加 `--source <文件或文件夹>`。

## 注意

- **验证范围**：4.0 逐个零件读上游 4606555 源码核对过修复清单。4.1 在 macOS（Apple 芯片，DSH NEXT 2.0.21-next）上用 `install.sh` 真装验收过：全新安装的终端问答、13 个零件和 21 条修复、砚青四套 preset、mcp-hub 接入 echo、心跳；新会话里体检 0 错、`/compact` 摘要带门牌、`memq open` 按门牌取回原文。更新到上游 8ba1385 时撞上作者的语法错误、按备份回滚，装前语法检查就是因此加的。4.2 的两处改动只在本机干跑核对过（更新计划里列出给 echo 补 `DSH_HOME`）。5.0 跟上游 c370a69（v3.0.0）只在隔离目录里验证过全新安装、4.5 → 5.0 更新、修复检查、备份 / 恢复 / 卸载，还没在桌面上实装，Soul preset 的 skills 挂没挂上要看灵魂 · 创造里能不能列出 creation 等技能；heartbeat、chat、clawbot 没实测。5.2 对 fe3c456 的安装、更新、备份、恢复、卸载与修复计划完成隔离验证；没有启动真实 DSH。`install.ps1` 还没在 Windows 上跑过。 5.4 在隔离目录里验证过：fe3c456 安装并打修复、手改、留旧备份后更新到 0221d89（零件逐个等于作者原文、旧备份搬进 legacy、收尾点名必须先修的项）、修复报告和计划（修后换气在 node_modules 里能加载）、备份 / 换目录恢复 / 卸载，以及问答自测；macOS 修复只在 Linux 上借垫片跑到面板加载和 heartbeat.mjs --force，没在桌面上实装。
- **作者仓库里的同名文件**：2026-10-28 起作者仓库根目录也有 `install.mjs`、`AGENT-INSTALL.md`，还有 `tools/soul-doctor.mjs`、`tools/soul-preset.mjs`、`presets/`。包名现在和本安装包一致了；4.3 起 Soul preset 也照作者的装法写进 profile 的 `cordis.patch.yml`，作者 `soul-doctor` 的 L2 能看到。但别用作者的 `tools/soul-preset.mjs build --write` 装：profile 里还没有 preset 时它会把块插到文件最顶上、不带 `- insert:`，配置会坏；不设 `DSH_HOME` 环境变量跑还会报 ReferenceError（第 40 行先用了第 51 行才定义的 `argOf`）。说「跑 install.mjs」时，指的都是本文件夹里的这一份。
- **插件市场里的「已停用」**：压缩与裁剪零件由 Soul preset 调用，显示「已停用」不代表功能失效，不必在全局启用或卸载。
- **回声面板、换气面板的加载名**：上游 v2.0.0 及以前这两个包叫 `dsh-agent-*`，`cordis.patch.yml` 里要加载的名字却是 `dsh-yanqing-*`，原样装会加载失败。作者在 v3.0.0 修好了，修复 `echo-load-name`、`panel-load-name` 已退役；还装着旧版的电脑，修复检查照样会修，收尾时也会检查每个包要加载的插件都找得到。
- **路径不带用户名**：安装包里没有写死任何一台电脑的路径。memory 的配置写的是相对 DSH 家目录的路径（`dsh-soul/memory/hub/SELF.md`），几个要找书房、记忆中枢的插件也是运行时自己找家目录；权威源册、自我层、要贴进新会话的话里的路径写成 `$HOME/…`（zsh、bash、PowerShell 都认）；心跳脚本按相对自己的位置找记忆中枢。只有交给操作系统和别的程序执行的几处必须是绝对路径，安装时在这台电脑上现算：launchd / 计划任务、mcp-hub 的 echo 服务器、`echo.config.json`；迁移恢复时会换成新电脑的。以前写死了某台电脑路径的配置和补丁，重跑安装或 `--update` 会自动改过来。
- **在 DSH 里让 agent 装**：agent 可以替你干跑；真跑要先退出 DSH，按干跑最后给出的命令在终端里跑。重开 DSH 后新建一个会话，把安装脚本最后打印的那段话贴进去，主导、记账、门牌实测都在那个新会话里做。
- **新电脑上的代数**：直接安装时，新电脑上的书房和账本是全新的，agent 从「第 1 代」开始。想带上旧电脑的账本和对话，用 `--backup` / `--restore` 迁移，到了新电脑再任命下一代主导。

## 版本记录

5.4 把安装、更新改成先同步作者最新版、问题全部归修复；自动备份统一放进 `archives/`；可选零件全量列出；人设一个输入框；问答和修复计划按脚本排好的弹窗问。跟上游 0221d89。


这里只保留最近三条更新；5.1 及以前的记录见 [历史更新](CHANGELOG.md)。版本号与 `install.mjs` 中的 `KIT_VERSION` 一致。

| 版本 | 日期 | 更新摘要 |
|---|---|---|
| 5.4 | 2026-11-04 | 跟上游 0221d89。**安装、更新以作者为准**：本体、零件、中枢脚本（作者的 `install-kit --all`）、Soul preset 和 skills 一律同步成作者原文，kit 修复和本机手改都换掉，原样进快照，安装记录里的修复结论清空、只留核对证据；上游包本身有问题（入口文件不存在、导入包外文件、语法错误、注册 id 撞车）不再停下，写进「需要留意」、收尾点名。修复清单只对准作者最新版：退役的 7 条从清单删掉（id 保留不复用），新增 `huanqi-paths-import`（0221d89 换气从包外的 `lib/paths.mjs` 导入，一加载就报错），`heartbeat-darwin` 按新版改写；homedir 两条改看 `state/huanqi-boot.log` 判断 DSH 传不传 `DSH_HOME`；修复检查遇到旧版安装先提示更新。发布清单检查新增「导入了包外的文件」。自动备份统一到 kit 的 `archives/<主机>-<家目录指纹>/`（新增 `lib/archive.mjs`），旧的 `.bak-*`、`dsh-soul/_backup/` 自动搬进 `legacy/`，快照同时是回滚依据。可选零件分三组全量列出，兼容问题写成「有修复 / 没有修复」，没装 dsh-mnemon 选 mnemon-probe 改成提醒。人设三问合成一个输入框（句子和文件路径混写）。`--questions` 和修复报告输出排好的弹窗 `popups`（新增 `lib/popups.mjs`），手册加「弹窗规范」。不再迁移 kit 4.0 以前的安装。新增 `scripts/verify-setup.mjs`。 |
| 5.3 | 2026-11-04 | 新增模型状态栏、速达、heartbeat 和 echo-svc 四条 macOS 可选修复；多文件成组保护，脚本新增/撤回纳入事务和计划指纹。heartbeat 默认关闭，四步验收与代码/配置指纹通过后才允许切换旧每日自检，可恢复原任务；使用说明见 [MACOS-REPAIRS.md](MACOS-REPAIRS.md)。 |
| 5.2 | 2026-11-04 | 跟上游 fe3c456（含 6531d30 的路径调整）。新增 mcp-hub-homedir、huanqi-homedir、echo-diag-join、huanqi-hub-home 四条修复，处理缺失导入和换气记忆中枢定位；原 mcp-hub-home、echo-hub-path、huanqi-hub-path 退役但保留旧版识别。安装收尾点名会阻止加载的修复，仍需单独核对计划后应用。认不出的上游代码保持人工核对；计划绑定本机、安装记录及源码内容，离线源变化也拒绝旧计划；备份恢复保留修复核对结论和证据。同步 heartbeat / chat 当前限制。隔离验证覆盖安装、升级、修复计划、备份恢复和卸载，未做桌面验收。 |
