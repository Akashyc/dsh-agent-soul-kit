# dsh-agent-soul 安装包

**版本 4.3**（2026-11-01）· 适用于 macOS / Windows · [安装手册](AGENT-INSTALL.md) · [迭代手册](AGENT-ITERATE.md) · [历史更新](CHANGELOG.md)

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
  - yantai：工作台面板（水位 / 未结 / 账本 / 门）。

  后五个是面板件，默认不勾：装完没有数据源就是空面板，想用再选。

各系统上的已知限制（读上游源码核对的；问答和干跑里会按这台电脑的系统提示，选了也不拦）：

| 零件 | macOS | Windows |
|---|---|---|
| model-statusbar | **不可用**：探测、拉起、停止全靠 `powershell.exe`、`taskkill` 和 Windows 版 `python.exe` | 可用 |
| yantai | 部分可用：「速达」应用启动器靠 `.ps1` 脚本，只有 Windows 有；水位、未结、账本、门照常 | 可用 |
| echo（面板体检） | 作者只按 Windows 布局找 DSH 自带的 node，安装包用修复 `echo-node-darwin` 补上 Mac 的布局 | 可用 |
| 记忆中枢的常驻检索 `echo-svc` | 用的是 Windows 命名管道，Mac 上不启动；`memq` 自动退回直接读，快路子走 mcp-hub 的 echo | 可用 |

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

```bash
node install.mjs --fix --dry-run
```

安装、更新、恢复只按作者上游装，不打修复；装完单独做这一步。先看检查结果（每条修复的判定和清单外的疑似问题），逐条选修不修，退出 DSH 后用 `--fix --fix-only <选中的 id>` 执行；在终端里直接跑 `node install.mjs --fix` 会逐条问。筛选、跳过和撤回参数见下方「更新与修复」。

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
node install.mjs --update --flash on  # 加装砚青 PTC Flash（off 去掉）；装了的每次更新都跟作者最新发布的版本
node install.mjs --fix             # 修复检查：对照已装那一版的作者原文报问题，逐条选了才修
node install.mjs --backup          # 打迁移用的备份包，放在 backups/
node install.mjs --restore         # 在新电脑上：装好并放回 backups/ 里最新的备份
node install.mjs --uninstall       # 卸载：先备份；终端里会问旧会话怎么处理（也可以加 --old-sessions shell|rewrite|keep）
node install.mjs --kit-update      # 只检查、同步 kit 自身仓库
node install.mjs --kit-iterate     # 先同步 kit，再收集上游的变化，交给 agent 修正
```

## 装出来是什么

- **本体和零件**：必装的七个（加上 Soul preset 调用的 compact-region），再加方案里选了的可选零件。
- **记忆检索**：通过 `memq` 检索；安装并接入 mcp-hub 后，还可在会话里调用 `mcp__echo__echo_search`。
- **Soul preset**：砚青、砚青创造、砚青 PTC、砚青蒸馏四套使用上游原文，照作者的装法写进 profile 的 `cordis.patch.yml`（4.3 起；以前装在独立包 `dsh-soul-preset` 里，`--update` 会搬过去）。可选第五个「砚青 PTC Flash」：照 [dsh-flash-presets](https://github.com/LarryE135/dsh-flash-presets) 的 v3 适配（压缩、裁剪带门牌），安装问答里和砚青一起选、默认不选，已装的用 `--update --flash on` 加上；每次安装、更新在线取作者最新发布的版本。内置「大肥鱼」默认安装砚青四套，新会话默认使用砚青；已有安装沿用砚青选择，旧 Flash 方案及会话入口迁到砚青 PTC。压缩摘要和裁剪后的工具输出带门牌，可按 `log:<会话>#seq=<n>` 回取原文。
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
| [CHANGELOG.md](CHANGELOG.md) | 2.17 及以前的历史更新记录 |
| `lib/home-paths.mjs` | 路径自动定位：插件运行时找 DSH 家目录的代码、memory 补丁、memory 配置的核对与改写 |
| `lib/persona.mjs` | 「说话与样子」的三条规矩：用户没写的才补，句子去重 |
| `lib/uninstall.mjs` | 卸载的规划：摘配置和锁文件里的条目、换默认 preset、改写旧会话开头的 preset |
| `lib/flash-presets.mjs` | 砚青 PTC Flash：校验 dsh-flash-presets v3 的结构，换 id 和名字、压缩裁剪换成带门牌的零件、补范围压缩，其余照作者 |
| `lib/soul-presets.mjs` | 砚青四套逐字搬上游 `presets/`（`@include` 按作者 `soul-preset build` 的算法展开），写进 profile `cordis.patch.yml` 的 `- insert:` 那一节；卸载时可保留使用官方零件的砚青空壳 |
| `lib/preset-migration.mjs` | 清理退役 preset，迁移旧会话和默认入口；会话原文纳入事务备份 |
| `lib/fixes.mjs` | 修复清单：kit 对上游插件的 19 处修改逐条登记，判定问题还在不在、按文件对照作者原文重算、给 kit 迭代归类和找疑似新问题 |
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
| `assets/` | 全新安装用的模板（权威源册、自我层、心跳脚本）、找不到官方预设时用的 preset 快照、离线用的砚青四套（跟上游 4606555） |
| `logs/` | 每次运行的输出，脚本自动生成，可以删 |
| `backups/` | `--backup`、`--uninstall` 打出的备份包；迁移时连同整个文件夹一起拷走 |

## 更新与修复

`--update` 获取上游新版本，更新本体、零件和 Soul preset，并同步未被本机修改的中枢脚本。方案、书房、账本、权威源册、人设和心跳设置保留；需要调整的插件配置、包名及锁文件会在计划中列出。识别出的本机修改和无法判断的修复会提示核对。

**修复清单**：`lib/fixes.mjs` 登记 19 条修复：1 条拷包补漏（上游发布清单漏列的文件）、16 条文件补丁、1 条换气配置修复和 1 条压缩摘要模型修复（4.0 去掉了装前取源 / 包名的 5 条，新增 Mac 上 echo 面板找 node、echo 面板诊断日志路径 2 条；4.1 新增拷包补漏；4.3 新增 echo 面板设置文件路径，删掉作者已修好的 clock 定位、换气触发口等待、compact-region 日志路径 3 条）。**修复和安装分开**：安装、更新、恢复只按作者上游装（称呼替换、preset 独立打包等 kit 固定处理仍保留），一条修复都不打——已经打上的照原样留着，被整包换掉的零件就是作者原文；装完单独做修复检查：先列出问题，逐条选「修 / 不修 / 这次先不动」，只修选中的。终端里装完会接着问要不要检查。清单外的问题（扫出来的疑似问题、使用中遇到的新 bug）先整理修复方案给用户确认，登记进 `lib/fixes.mjs` 再修，不直接手改已装文件。

| 检查结果 | 处理方式 |
|---|---|
| 问题仍在 | 应用 kit 修复；已修复的保持，已识别的旧写法更新 |
| 作者已修 | 停止打补丁；有原文证据时，将旧 kit 修复版换回作者版 |
| 无法判断 | 保留文件，报告「需人工核对」 |
| 本机手改过 | 保留文件，报告冲突，由用户决定如何合并 |

`--fix` 只处理已安装版本，不升级本体或重装零件（作者发布清单漏列的文件会补拷进已装的包）：

| 参数 | 用途 |
|---|---|
| `--fix --dry-run` | 只检查并报告计划 |
| `--fix` | 终端里报完问题逐条问，选完按选择执行；不在终端里只报不改 |
| `--fix-only <id,…>` | 本次仅处理指定条目，适用于所有修复阶段 |
| `--fix-skip <id,…>` | 跳过指定条目，撤回可识别的 kit 修复，并记入安装记录；`none` 清空跳过设置 |
| `--fix-revert <id,…>` | 撤回指定修复，并加入跳过清单 |

选过「不修」的条目记进跳过清单，以后检查不再问；备份与恢复会带上这份设置。4.0 去掉了 `--fix-reinstall`、`--organs-source`（取源和包名不再是修复条目，包名迁移走 `--update`）。

实际写入前先备份，修后检查语法和加载契约；失败时自动回滚涉及的包、配置、锁文件和安装记录。备份位于 `dsh-soul/_backup/`。断电或强制终止进程时，按备份清单人工恢复，详见 [安装手册](AGENT-INSTALL.md)。

安装、更新、恢复会移除旧版 PTC · Soul · Flash，把旧会话入口及默认项迁到砚青 PTC；会话正文不变，原文件留在事务备份。会话无法读取时先停止，处理后重试。修复检查不管这件事。卸载旧 Flash 安装时，若选 `shell`，会改为将旧会话迁到官方 preset，不再保留 Flash 空壳。

几个常见设置：

- **零件来源和包名**：全部来自上游主仓 `plugins/`，包名照上游原样（`dsh-agent-*`、`dsh-huanqi`、`dsh-mcp-hub`）。3.0 及以前装的 `dsh-yanqing-*` 和从 organs 装的换气、compact-region，`--update` 会迁移（装新目录、删旧目录、bundles / dependencies / 锁文件同步换名）；`--fix` 不动包名，碰到旧包名会让你先 `--update`。
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

- **验证范围**：4.0 逐个零件读上游 4606555 源码核对过修复清单。4.1 在 macOS（Apple 芯片，DSH NEXT 2.0.21-next）上用 `install.sh` 真装验收过：全新安装的终端问答、13 个零件和 21 条修复、砚青四套 preset、mcp-hub 接入 echo、心跳；新会话里体检 0 错、`/compact` 摘要带门牌、`memq open` 按门牌取回原文。更新到上游 8ba1385 时撞上作者的语法错误、按备份回滚，装前语法检查就是因此加的。4.2 的两处改动只在本机干跑核对过（更新计划里列出给 echo 补 `DSH_HOME`）。`install.ps1` 还没在 Windows 上跑过。
- **作者仓库里的同名文件**：2026-10-28 起作者仓库根目录也有 `install.mjs`、`AGENT-INSTALL.md`，还有 `tools/soul-doctor.mjs`、`tools/soul-preset.mjs`、`presets/`。包名现在和本安装包一致了（`dsh-agent-*`）；4.3 起 Soul preset 也照作者的装法写进 profile 的 `cordis.patch.yml`，作者 `soul-doctor` 的 L2 能看到。但别用作者的 `tools/soul-preset.mjs build --write` 装：profile 里还没有 preset 时它会把块插到文件最顶上、不带 `- insert:`，配置会坏；不设 `DSH_HOME` 环境变量跑还会报 ReferenceError（第 40 行先用了第 51 行才定义的 `argOf`）。说「跑 install.mjs」时，指的都是本文件夹里的这一份。
- **插件市场里的「已停用」**：压缩与裁剪零件由 Soul preset 调用，显示「已停用」不代表功能失效，不必在全局启用或卸载。
- **回声面板、换气面板的加载名**：上游把这两个包的名字改回 `dsh-agent-*`，`cordis.patch.yml` 里要加载的名字还是 `dsh-yanqing-*`，原样装会加载失败。装完的修复检查里修（修复 `echo-load-name`、`panel-load-name`；修好之前先别启动 DSH），并在收尾时检查每个包要加载的插件都找得到。
- **路径不带用户名**：安装包里没有写死任何一台电脑的路径。memory 的配置写的是相对 DSH 家目录的路径（`dsh-soul/memory/hub/SELF.md`），几个要找书房、记忆中枢的插件也是运行时自己找家目录；权威源册、自我层、要贴进新会话的话里的路径写成 `$HOME/…`（zsh、bash、PowerShell 都认）；心跳脚本按相对自己的位置找记忆中枢。只有交给操作系统和别的程序执行的几处必须是绝对路径，安装时在这台电脑上现算：launchd / 计划任务、mcp-hub 的 echo 服务器、`echo.config.json`；迁移恢复时会换成新电脑的。以前写死了某台电脑路径的配置和补丁，重跑安装或 `--update` 会自动改过来。
- **在 DSH 里让 agent 装**：agent 可以替你干跑；真跑要先退出 DSH，按干跑最后给出的命令在终端里跑。重开 DSH 后新建一个会话，把安装脚本最后打印的那段话贴进去，主导、记账、门牌实测都在那个新会话里做。
- **新电脑上的代数**：直接安装时，新电脑上的书房和账本是全新的，agent 从「第 1 代」开始。想带上旧电脑的账本和对话，用 `--backup` / `--restore` 迁移，到了新电脑再任命下一代主导。

## 版本记录

这里只保留最近三条更新；4.1 及以前的记录见 [历史更新](CHANGELOG.md)。版本号与 `install.mjs` 中的 `KIT_VERSION` 一致。

| 版本 | 日期 | 更新摘要 |
|---|---|---|
| 4.4 | 2026-11-01 | 新增可选的第五个 Soul preset「砚青 PTC Flash」：照 LarryE135/dsh-flash-presets 的 v3 适配（id `yanqing-ptc-flash`，压缩、裁剪换成带门牌的零件、补上范围压缩，其余照作者），安装问答里和砚青四套一起选、默认不选，已装的用 `--update --flash on/off` 开关；每次安装、更新在线取作者最新发布的版本（`--flash-ref`、`--flash-source` 可指定），`--fix` 钉在已装那一版。 |
| 4.3 | 2026-11-01 | 修复和安装、更新、恢复分开：那几步只按作者上游装、不打修复，装完单独检查——先列出问题（清单里的逐条判定、清单外的疑似问题），用户逐条选修 / 不修 / 这次先不动，只修选中的；终端里装完会接着问，不在终端里的 `--fix` 只报不改。作者发布清单漏列的文件改由 `--fix` 补拷进已装的包，加载名对不上只提醒、不再停下。Soul preset 改照作者的装法：写进 profile 的 `cordis.patch.yml`（顶层 `- insert:`），不再用独立包 `dsh-soul-preset`，旧安装 `--update` 搬过去并摘掉包和锁文件条目；卸载留空壳也写在 profile 里。修复清单新增 `echo-settings-path`（上游 11-01 回声面板的设置兜底写死作者电脑的记忆中枢）。按上游 e6d66f5 逐条核对：clock 定位、换气触发口等待、compact-region 日志路径作者已修，这 3 条从清单删掉（id 不再使用），清单剩 19 条。修复判定改成先还原再比：已装文件是「上一版作者原文 + kit 补丁」时，不再因为作者改过版就误判成「本机改过」——那会让零件永远停在旧版、每次都说「将打上」；有安装记录或 `--source` 基线就照常换上新版。`preset-summary-model` 判成「本机不需要」时不再借用「请手动合并」的说法。 |
| 4.2 | 2026-11-01 | mcp-hub 清单里的 echo 显式带上 `env.DSH_HOME`：上游 8ba1385 的 `echo-mcp.mjs` 没有它就去作者电脑的 `D:/AI/dsh/home` 找会话日志，而 mcp-hub 会滤掉继承来的 `DSH_*`；旧安装 `--update` 补上。换气测试触发口的判定认出作者 11-01 v1.2.2 的 `waitUntilQuiet`（先等 agent 静下来再压，和 `huanqi-trigger-idle` 同一个意思），判为作者已修、不再打，不再报「需人工核对」。 |
