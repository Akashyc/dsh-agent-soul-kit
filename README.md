# dsh-agent-soul 安装包

**版本 2.15**（2026-10-29）· 验证过的上游：cyanwell/dsh-agent-soul v2.0.0（`6ea60a2`）· macOS、Windows 都已实测通过

> **这不是 DSH 插件，不要往插件市场里装。**
> 它是一本写给 agent 的说明书，外加一个安装脚本：agent 读懂安装、更新、备份、恢复怎么做，再去读上游的更新记录，就能自己把这套架构装好、升级，并跟着上游迭代这份说明书。

用法：clone 或下载到电脑上一个固定的位置，把这个文件夹设成 agent 的工作区，再把下面「怎么用」里对应的那段话发给它。

这个安装包（下文也叫 kit）能做这些事：

- 在 macOS 或 Windows 上装好 dsh-agent-soul 灵魂架构；
- 上游作者在 GitHub 上更新后，跟着升级；
- 把 agent 连同账本、对话一起搬到另一台电脑；
- 卸载：先打备份包，再把本体、零件、Soul preset、配置和书房一起卸掉，想回来用备份包恢复；
- 装一个全新的 agent，名字、称呼、规矩、人设、要哪些零件都由你定；
- 迭代 kit 自身：同步 kit 仓库的更新，对照上游的变化，修正安装、更新、备份、迁移四个流程。

插件本体不放在这里：脚本每次都从 GitHub（cyanwell/dsh-agent-soul）拉**最新版**，需要时可以指定版本。kit 最早是 2026-10-24 在 Boss 的 Mac 上给大肥鱼装这套架构时整理出来的。

## 两种装法

- **用现成方案**：`setups/` 里一个文件夹就是一套方案。现在有一套「大肥鱼」，就是 Boss 那台 Mac 的样子，装出来一模一样。
- **全新安装**：一步步填设定，分五组：
  - 身份
  - 硬线
  - 人设
  - 运行
  - 零件

  填完会存成一套新方案，下次别的电脑直接选它就行，不用再填。

零件分两种：

- **必装**：compaction、pruner、memory、echo。
- **可选**，装不装由你定：
  - mnemon-probe：要先装 dsh-mnemon；
  - clock；
  - huanqi；
  - huanqi-panel：要和 huanqi 一起装；
  - mcp-hub；
  - model-statusbar：要有本地模型服务（ComfyUI 一类）才有读数；
  - mobile-adapt：手机竖屏适配；
  - riji：日记入口，读的是本机日记目录；
  - splash：启动一屏；
  - yantai：工作台面板（水位 / 未结 / 账本 / 门）。

  后五个是面板件，默认不勾：装完没有数据源就是空面板，想用再选。

## 怎么用

先确认新电脑上 DSH 已经装好、打开过一次。建议在插件市场装好 dsh-mnemon。

**交给 agent 装**：把整个文件夹拷到电脑上的固定位置，打开任意一个能操作这台电脑文件和终端的 agent，把下面这段发给它：

```text
请读这个文件夹里的 AGENT-INSTALL.md，按它把 dsh-agent-soul 装到这台电脑上。先问我用现成方案还是全新安装；全新安装就按手册一组一组问我设定。每个阶段开始前先跟我确认，需要退出或重开 DSH 时告诉我。
```

**自己在终端里装**：

```bash
node install.mjs
```

直接跑会先问用现成方案还是全新安装；全新安装一问一答，回车就用默认值。最后给一份总结，确认之后才动手。动手前要先完全退出 DSH：macOS 按 Cmd+Q，Windows 连托盘图标也要右键退出。

node 不用挑：脚本按「DSH 自带 → 当前进程 → PATH → 常见安装位置」自己找，版本不够就换一个合格的把自己重跑一遍。电脑上一个 node 都没有的话，用 DSH 自带的那个来启动，路径见 AGENT-INSTALL.md 的 A3。

**更新已经装好的电脑**：

```text
请读这个文件夹里的 AGENT-INSTALL.md，按第九节「更新」把 dsh-agent-soul 更新到最新版。先干跑，把上游改了什么报给我，我确认后再真跑。
```

**把 agent 搬到另一台电脑**：

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
2. **对照上游**：agent 重新读新版手册、重跑入口，再和插件上游 `cyanwell/dsh-agent-soul` 比对，写出四流程报告，完成修正和验证。
3. **登记**：用 `--kit-accept <报告目录>` 登记这次的上游审查基线。只生成报告、只同步 kit 都不算迭代完成；整个流程也不会动本机已经装好的插件。

需要 Git。相关参数：

- `--kit-update`：只检查、同步 kit；加 `--dry-run` 只检查，有更新时只报计划；
- `--kit-repo`、`--kit-ref`：指定 kit 的仓库和版本，和插件上游的 `--ref` 互不相干；
- 离线：给了 `--base-source`、`--source` 就默认不联网查 kit，想把 kit 也一起离线查，加 `--kit-source <干净的 Git 目录>`；
- `--skip-kit-update`：已经人工合入并验证过时，跳过 kit 检查继续本轮；跳过会写进报告，不代表 kit 已是最新。

常用命令（都可以加 `--dry-run` 先看会改什么；安装、更新、恢复、卸载真跑前都要先完全退出 DSH）：

```bash
node install.mjs --setup 大肥鱼     # 用现成方案装
node install.mjs --update          # 更新到上游最新版
node install.mjs --backup          # 打迁移用的备份包，放在 backups/
node install.mjs --restore         # 在新电脑上：装好并放回 backups/ 里最新的备份
node install.mjs --uninstall       # 卸载：先备份；终端里会问旧会话怎么处理（也可以加 --old-sessions shell|rewrite|keep）
node install.mjs --kit-update      # 只检查、同步 kit 自身仓库
node install.mjs --kit-iterate     # 先同步 kit，再收集上游的变化，交给 agent 修正
```

## 装出来是什么

- **本体和零件**：必装的四个，加上方案里选了的可选零件。
- **记忆检索**：`memq` 命令随时能用。装了 mcp-hub 的话，会话里还能直接调 `mcp__echo__echo_search`，快一个数量级。
- **Soul preset**：PTC / PTC · Flash / 标准 / 极简 / Cordis 五个，各自从官方同名预设原样派生；生成哪几个、默认用哪个按方案定。压缩摘要和被裁掉的工具输出都带门牌，能按 `log:<会话>#seq=<n>` 取回原文。
- **书房和记忆中枢**：在 DSH 家目录下的 `dsh-soul/`，里面有权威源册、骨架、账本、索引。
- **自我层**：身份、硬线、说话方式，每轮注入。
- **心跳**：按方案每天定时重建索引、刷新自我层、跑体检。
- **验收标准**：体检 0 错，`/compact` 的摘要第一块带门牌。门牌要在**装完后新建的会话**里测：装之前开的会话不会换成 Soul preset。

## 文件夹里有什么

| 文件 | 用途 |
|---|---|
| `AGENT-INSTALL.md` | 给 agent 的完整手册：选方案、全新安装怎么问、安装、更新、迁移、验收、已知坑、回滚 |
| `AGENT-ITERATE.md` | 给 agent 的 kit 自我迭代流程：自身仓库同步、插件上游对比、四流程分析、修正、验证、完成登记 |
| `install.mjs` | 安装 / 更新 / 备份 / 恢复 / 卸载脚本，跨平台，先 `--dry-run` 只看计划；重复跑安全 |
| `lib/home-paths.mjs` | 路径自动定位：插件运行时找 DSH 家目录的代码、memory 补丁、memory 配置的核对与改写 |
| `lib/persona.mjs` | 「说话与样子」的三条规矩：用户没写的才补，句子去重 |
| `lib/uninstall.mjs` | 卸载的规划：摘配置和锁文件里的条目、换默认 preset、改写旧会话开头的 preset |
| `lib/soul-presets.mjs` | 砚青四套逐字搬上游 `presets/`（`@include` 按作者 `soul-preset build` 的算法展开，拿作者 `soul-version.json` 核哈希）；PTC · Soul · Flash 从 Flash 源派生；卸载时做空壳 preset |
| `lib/organ-patches.mjs` | 零件仓 organs 的换气、compact-region 的本机补丁：作者写死的 `D:\AI\memory\hub` 改成运行时找家目录，外加 Boss 本机实测的行为修复 |
| `lib/huanqi-panel-patch.mjs` | 换气面板「没有 `- id: huanqi` 时自建一节」的补丁 |
| `lib/name-map.mjs` | 称呼替换：在上游源码的临时副本上把作者的称呼换成用户称呼；认出手工改过却没记下的情况 |
| `lib/package-contract.mjs` | 上游包发布清单核对：入口导入的文件要在 `files` 里，用到的 `@deepseek-ai/*` 要声明 `peerDependencies`；拷包前和 kit 迭代报告共用 |
| `lib/kit-iterate.mjs` | 上游差异与契约检查、源码快照、迭代基线和完成证据管理 |
| `lib/kit-update.mjs` | kit 自身仓库检查、安全快进更新和需人工合入时的新版快照 |
| `tests/` | 隔离回归测试，用 `node --test tests/*.test.mjs` 执行 |
| `kit-iteration.json` | 首次完成迭代后生成，保存审查基线和四流程结论；不代替端到端验收记录 |
| `setups/` | 方案。`大肥鱼/` 是 Boss 的；全新安装存下的也在这里 |
| `assets/` | 全新安装用的模板（权威源册、自我层、心跳脚本）、找不到官方预设时用的 preset 快照、离线用的砚青四套与作者 `soul-version.json`、零件仓 organs 的快照 `parts/`（提交号见 `parts/SOURCE.json`） |
| `logs/` | 每次运行的输出，脚本自动生成，可以删 |
| `backups/` | `--backup`、`--uninstall` 打出的备份包；迁移时连同整个文件夹一起拷走 |

## 更新会动什么

更新只换代码：

- 本体、已装的零件、Soul preset；
- 中枢里没被本机改过的脚本。

上游给零件改名时自动迁移，目录、配置、锁文件一起换。安装包后来新加的零件，更新时会问你装不装；拒掉的会记下来，以后不再问。

本机补丁（锚点写在 `install.mjs`、`lib/home-paths.mjs`、`lib/huanqi-panel-patch.mjs`、`lib/organ-patches.mjs`）每次安装或更新都会重新检查：打过的跳过，上游自己改好的也跳过，早期写死了某台电脑路径的旧补丁换成运行时自动定位的写法。目前有：mnemon-probe 默认路径、memory 的相对路径与上下文水位、clock 面板定位、mcp-hub 清单位置、yantai 账本与书房路径、riji 日记目录、echo / huanqi-panel 的加载名、换气面板「profile 里没有 `- id: huanqi` 时自建一节」，以及换气和 compact-region 的诊断日志路径、熔断后全量压缩、测试触发口、`/compact-region` 参数输入。

**换气和 compact-region 从零件仓取**：这两个零件从 `cyanwell/dsh-agent-organs` 下载（离线用 `assets/parts/` 快照），其余零件从主仓 `plugins/` 取。依据是作者 10-28 的更新记录：「换气的 region 分支改成只走 `/compact-region`」，这次改动只落在 organs，主仓的换气没同步。

**不碰**这些：方案、书房、账本、自我层、权威源册、人设、主配置、心跳，以及本机改过的脚本。

**压缩摘要模型**：作者的砚青四套把压缩摘要写死走 `deepseek-official`（要 DeepSeek API key）。kit 默认去掉这两行，让摘要跟会话模型走，账号登录也能压缩；有 key、想照作者原样就加 `--summary-model author`，记进安装记录。

**称呼替换**：上游代码里写着作者本人的称呼「爀曦」（例如换气熔断时让 agent「告诉爀曦」）。方案里的 `nameMap` 决定换成谁（大肥鱼方案是 Boss），记进安装记录，更新、备份、恢复都照做，不会被冲掉。临时要改加 `--rename 爀曦=<称呼>`，关掉加 `--rename none`。

**哪些是本机改的**：更新时会额外下载「已装那一版」的上游当基准，报告里分开列「上游改的」和「本机改过、这次会换回上游版的」；中枢脚本是不是本机改过也按它判断。

拷包之前会先核对上游每个包的发布清单：入口导入到的文件没列进 `files`（照清单装上就缺文件）时停下，不动任何东西；用到 `@deepseek-ai/*` 却没声明 `peerDependencies` 的只提示，装完验收时看那个零件有没有加载。

更新前会把要换的东西整份备份到 `dsh-soul/_backup/`，附还原方法。

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

- **平台**：macOS、Windows 都实际装过、验过，测试通过。脚本每一步都有校验，出错就停，并且留有备份。
- **作者仓库里的同名文件**：2026-10-28 起作者仓库根目录也有 `install.mjs`、`AGENT-INSTALL.md`，还有 `tools/soul-doctor.mjs`、`tools/soul-preset.mjs`、`presets/`。它们管的是作者本机的「砚青」preset 和 `dsh-yanqing-*` 零件，这些零件不在仓库里，和本安装包装的不是一套。拿它们查本安装包装好的 profile 会报「零件缺失、没有 preset」，这是口径不同，不要照着修。说「跑 install.mjs」时，指的都是本文件夹里的这一份。
- **插件市场里的「已停用」**：dsh-agent-compaction、dsh-agent-pruner 显示「已停用」是正常的，它们由 Soul preset 调用。不要打开，也不要卸载。
- **上游 v2.0.0 的加载名**：回声面板、换气面板改名时漏改了一处加载名，原样装会加载失败。安装包会自动修好，并在收尾时检查每个包要加载的插件都找得到。
- **路径不带用户名**：memory 的配置写的是相对 DSH 家目录的路径（`dsh-soul/memory/hub/SELF.md`），几个要找书房、记忆中枢的插件也是运行时自己找家目录，Mac、Windows 同一份。以前写死了某台电脑路径的配置和补丁，重跑安装或 `--update` 会自动改过来。
- **在 DSH 里让 agent 装**：agent 可以替你干跑；真跑要先退出 DSH，按干跑最后给出的命令在终端里跑。重开 DSH 后新建一个会话，把安装脚本最后打印的那段话贴进去，主导、记账、门牌实测都在那个新会话里做。
- **新电脑上的代数**：直接安装时，新电脑上的书房和账本是全新的，agent 从「第 1 代」开始。想带上旧电脑的账本和对话，用 `--backup` / `--restore` 迁移，到了新电脑再任命下一代主导。

## 版本记录

版本号和 `install.mjs` 里的 `KIT_VERSION` 一致，脚本行为改了就往上加。

| 版本 | 日期 | 改了什么 |
|---|---|---|
| 2.17 | 2026-10-29 | 压缩摘要默认跟会话模型走：作者砚青四套在压缩组里写死 `summarizationProvider: deepseek-official` / `summarizationModel: deepseek-flash`，那是要 DeepSeek API key 的路由；账号登录（`deepseek-account`）的机器没有 key，手动 `/compact` 和 88% 的自动压缩全都报「no API key for provider route "deepseek-official"」压不成（Boss 本机会话日志里连续 6 次）。生成 preset 时去掉这两行，和官方预设一样跟会话模型走，其余逐字不动；`--summary-model author` 可以照作者原样，选择记进安装记录和方案（`summaryModel`），更新、恢复照做 |
| 2.16 | 2026-10-29 | 换气改从零件仓 organs 取：作者 10-28 的更新记录写明「换气的 region 分支改成只走 `/compact-region`」，这次改动只落在 organs（6735d72），主仓 `plugins/huanqi` 没同步，装主仓那份 compact-region 就没人调；包名照旧按 `dsh-huanqi` 落地，称呼替换照做。organs 两个零件写死的 `D:\AI\memory\hub` 改成运行时找 `<DSH 家目录>/dsh-soul/memory/hub`，两个零件写同一个 `_plugin-diag.log`（和作者的设计一致）；另带三处 Boss 本机实测的修复：熔断后的全量压缩去掉多套的一层 `runMaintenance`、测试触发口先等回合收尾、`/compact-region` 声明 `input`。2.15 改在快照里的那版退回 organs 原样，kit 的改动一律走本机补丁（`lib/organ-patches.mjs`），在线离线打的是同一份，快照提交号记在 `assets/parts/SOURCE.json`。砚青 preset 的 `@include` 展开改成作者 `soul-preset build` 的算法（段内注释保留，以前删掉了），装前拿作者 `soul-version.json` 逐套核哈希；安装记录记下 organs 提交号和作者契约版本 `contracts`，更新时契约变了醒目提示；preset 只差注释时干跑报「只有注释不同」 |
| 2.15 | 2026-10-29 | `assets/parts/compact-region` 快照跟上本机修好的那版：命令参数不再只认 `invocation.rawInput`（实机证明人打的参数到 handler 会是空串），改成依次试 `rawInput / args / argsText / input / text` 并去掉行首命令名 —— 换气程序化调用传的是整行（`commands.execute(agent, line, [], signal)`），两种形状都要接住；诊断日志顺带打出 `invocation` 的键名，下次失败能直接看到参数藏在哪 |
| 2.14 | 2026-10-29 | 装、更新、卸载三处写配置前统一做一遍「布尔消毒」：换气配置里的 `fullCompactOnBreaker: 'true'` / `postCompactRecallHint: 'true'` 是字符串，过不了 Schemastery 的 `z.boolean()`，cordis 记一条 ValidationError 之后**整段配置静默退回默认值** —— 插件照跑，所以一直没人发现改的配置根本没生效。只在 `- id: huanqi` 这一段里、只掰已读过 schema 的两个布尔键（别的插件、别的键一律不碰），修了会在输出里报一行 |
| 2.13 | 2026-10-29 | Soul preset 的默认方案只装砚青四套，去掉 PTC · Soul · Flash；新会话默认 preset 从 Flash 模式改成砚青；安装问卷的默认项、`--default-preset` 参数示例和不指定时的兜底值一起改。已经装过的电脑照安装记录来，不会被强制重装 |
| 2.12 | 2026-10-29 | 修 2.11 更新到一半停下、DSH 起不来的问题：更新时必装零件和 Soul preset 要调用的零件（compact-region 等）本机没有就补装，不能跳过，恢复旧备份时也一样；安装包版本号按数字比（以前按字符串，`2.9` 比 `2.11` 算大）；按新名落地的包不再被下次更新当成「本机改过」；package.json 只写真的在的零件；以前的 Soul preset id（standard-soul、cordis-soul 等）还有会话在用的，留一个和对应砚青 preset 一样的别名，旧会话照常打开；去掉还有会话在用的 preset 会报出来；`--dsh-home` 指的目录没有 profile 时不管别处有没有都停下 |
| 2.11 | 2026-10-29 | Soul preset 改成「kit 只造 PTC · Soul · Flash，砚青四套逐字搬上游 `presets/`」（以前是自己派生五套）；上游四套用 `# @include $DIR/_shared/compaction.yml` 共享压缩组，安装时按缩进展开；压缩三件套按上游 preset 的引用统一成 `dsh-yanqing-compaction` / `dsh-yanqing-pruner` / `dsh-yanqing-compact-region`，拷包时把 `package.json` 和 `cordis.patch.yml` 的 name 一起改；`compact-region` 从零件仓 `cyanwell/dsh-agent-organs` 取，离线用 `assets/parts/` 快照；卸载映射改成砚青四套；PTC · Soul · Flash 同步砚青的压缩模型（deepseek-official / deepseek-flash），打开 workflow-ptc 与 tool-workflow，补上 command-compact-region |
| 2.10 | 2026-10-29 | 修 `--dsh-home` 两处：指定的家目录里没有 `profiles/<profile>/package.json` 时明确失败，不再静默回落到 `~/.dsh`（以前真跑会把文件写进另一份家目录）；`--dsh-home` 和环境变量 `DSH_HOME` 给相对路径时先解析成绝对路径，修好预设解析阶段 `createRequire` 抛 `ERR_INVALID_ARG_VALUE` 的崩溃；补两条回归测试 |
| 2.9 | 2026-10-28 | 称呼替换（方案 `nameMap`、`--rename`，记进安装记录和备份；全新安装问卷加一题，默认换成用户称呼）；更新时下载已装那一版上游当基准，分开报「上游改的」和「本机改过的」，修好中枢三方比对把本体和中枢一起改过的脚本误判成「没改过」；`--base-source` 也可用于离线更新 |
| 2.8 | 2026-10-28 | 跟进上游 `504d2d0`：拷包前核对发布清单（入口导入的文件漏列进 `files` 就停下，`@deepseek-ai/*` 漏声明 `peerDependencies` 只提示），kit 迭代报告也会列出新出现的这两类问题；更新时上游更新记录只列最近 8 条，并说明实际换什么以文件变化为准；说明里分清作者仓库新加的同名 `install.mjs`、`AGENT-INSTALL.md` 和体检工具不适用于本安装包 |
| 2.7 | 2026-10-27 | 新增卸载（`--uninstall`）：先打备份包，再收回本体、零件、Soul preset、配置、锁文件、心跳和书房；用 Soul preset 建的旧会话可以留空壳、改写或不管 |
| 2.6 | 2026-10-27 | 路径改成运行时自动定位，配置和补丁里不再写死用户名；「说话与样子」不再重复补三条规矩；装完在新会话里验收，干跑给出现成的终端命令 |
| 2.5 | 2026-10-26 | kit 自身仓库更新与双源迭代（`--kit-update`）；新增标准、极简、Cordis 三个 Soul preset |
| 2.4 | 2026-10-26 | kit 上游分析与自我迭代流程（`--kit-iterate`、`AGENT-ITERATE.md`）；修好换气面板第一次保存失败 |
| 2.3 | 2026-10-26 | 新增五个可选面板件（model-statusbar、mobile-adapt、riji、splash、yantai）；修正 node 探测和 mnemon 记忆目录的解析 |
| 2.2 | 2026-10-26 | 装的时候选现成方案或全新安装；必装以外的零件都可选；终端、agent 两种互动方式 |
| 2.1 及以前 | 2026-10-24 ~ 10-26 | 在 Boss 的 Mac 上首装；跟进上游到 v2.0.0，加上 mcp-hub |