# dsh-agent-soul 安装包

**版本 6.2**（2026-11-05）· 适用于 macOS / Windows · [安装手册](AGENT-INSTALL.md) · [迭代手册](AGENT-ITERATE.md) · [历史更新](CHANGELOG.md)

> **这是管理 dsh-agent-soul 的工具包，不要把它安装到插件市场。**
> 主要交给 Agent 阅读手册并执行操作；终端命令是辅助入口。

将仓库 clone 或下载到固定目录，交给 Agent 作为工作区使用。下面提供六种常见操作的完整提示词，可直接复制。

工具包（下文简称 kit）支持：

- 安装：使用现成方案，或自定义名字、称呼、人设、零件和 preset。
- 更新：按作者说明升级插件，报告安装完整性和配置缺项。
- 备份：把书房、账本、会话和相关配置打成一个备份包。
- 还原：在新电脑或重装后的电脑上，用备份包装好并放回数据。
- 卸载：先备份，再移除插件；旧会话可选择保留兼容入口。
- kit 迭代：同步工具包自身，并对照上游主仓更新安装、备份与还原逻辑。

插件来自 `cyanwell/dsh-agent-soul`，全部零件取自主仓 `plugins/`。每轮先检查作者更新，再固定本次安装版本；作者源码只读，适配只在临时副本与安装目标进行。

## 怎么用

**主要用法是交给 Agent 操作。** 将 kit 放到固定目录，让能访问本机文件和终端的 Agent 以该目录为工作区，再复制下面对应的提示词。Agent 先读 [AGENTS.md](AGENTS.md)，再按安装或迭代手册执行。

安装前先打开一次 DSH，生成桌面 profile；默认在线流程需要 Git 和 Node.js 18+。需要热记忆时，再从插件市场安装 dsh-mnemon。准备检查也可交给 Agent 完成。

安装、更新、备份、还原、卸载先干跑、报告计划，经你确认后再执行；安装、更新和还原沿用干跑输出的固定提交。需要退出或重开 DSH 时由你操作并确认。作者仓库只读，不在安装后附加其它工具流程。

### 安装

```text
请读这个文件夹里的 AGENT-INSTALL.md，按它把 dsh-agent-soul 装到这台电脑上。先问我用现成方案还是全新安装；全新安装就按手册一组一组问我设定。每个阶段开始前先跟我确认，需要退出或重开 DSH 时告诉我。
```

### 更新已安装的插件

```text
请读这个文件夹里的 AGENT-INSTALL.md，按第九节「更新」把 dsh-agent-soul 更新到最新版。先干跑，把上游改了什么报给我，我确认后再真跑。
```

### 备份

```text
请读这个文件夹里的 AGENT-INSTALL.md，按第十节「在旧电脑上备份」打一个备份包。先干跑，把清点结果报给我，我确认后再真跑。
```

### 还原

```text
请读这个文件夹里的 AGENT-INSTALL.md，按第十节「在新电脑上恢复」用备份包还原。先干跑，把要装的版本、要放回的数据和「需要留意」报给我，我确认后再真跑。
```

### 卸载

```text
请读这个文件夹里的 AGENT-INSTALL.md，按第十二节「卸载」把 dsh-agent-soul 卸掉。先干跑，把要删什么、有多少旧会话用的是 Soul preset 报给我，旧会话怎么处理让我选，我确认后再真跑。
```

### 迭代 kit 自身

```text
请读 AGENT-ITERATE.md，先检查 kit 自身 GitHub 仓库的更新，有必要则拉取并合入本地 kit，保留本地修改和方案；再检查插件上游作者仓库相对上次 kit 迭代基线的变化，逐项分析安装、更新、备份、还原四个流程，完成需要的 kit 修正和验证，再登记本轮迭代结果。分别告诉我两个仓库的检查结果、完成了什么、还有什么未验证。
```

## 两种装法

- **现成方案**：`setups/` 下每个文件夹是一套方案。内置「大肥鱼」，预设好身份、人设、零件和运行设置；路径按当前电脑生成。
- **全新安装**：依次填写身份、硬线、人设、运行和零件设置，完成后保存为新方案，便于在其他电脑复用。

零件分两种：

- **必装**（作者 2026-10-31 定的「全局必装」，加上每轮注入自我层的 memory）：compaction、pruner、memory、echo、huanqi（换气）、huanqi-panel、mcp-hub；Soul preset 要调用的 compact-region 也跟着装。
- **可选**，装不装由你定：
  - mnemon-probe：要先装 dsh-mnemon；
  - clock：在侧栏内置一个时钟；
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

  - heartbeat 在上游 0221d89 里面板从包外的 `lib/paths.mjs` 导入、还用了没定义的 `AI_ROOT`，一加载就报错；心跳脚本随零件目录完整复制，调度依赖作者的 Windows 布局。kit 仅报告原版兼容问题，不改运行链、不注册或启用任务。
  - chat 从 fe3c456 起使用未导入的 `join` / `dirname` / `homedir`，入口无法加载；目标会话 id 仍写死，书房按作者目录布局推算。服务设计为绑定 `0.0.0.0`、绕开 DSH 的登录鉴权，同一网络里谁都能访问。
  - clawbot 是第三方插件（腾讯 ilink 网关），要手机微信扫码绑定；凭据存在 `~/.dsh/clawbot/`，备份不带它，换电脑要重新扫码；三个自动通知默认全开（每次回复都推一条微信）。本机自己从插件市场装过 `dsh-clawbot` 的，安装包不覆盖、也不卸载它。

  已有的安装 `--update` 时不会自动补装这三个（终端里会问，默认不装）；以后想装加 `--add-part <名字>`。

各系统上的兼容问题只报告原版行为：macOS 的 model-statusbar 依赖 Windows 探测与进程控制，yantai 速达依赖 PowerShell，heartbeat 的路径与调度依赖 Windows，echo 面板找 Node 的布局也需核实。kit 不推荐或调用其它工具；配置缺项先按作者公开接口设置，阻断问题未解决时不启动 DSH。

## 作者源码只读与版本固定

默认先更新 kit 同级的 `dsh-agent-soul/`（Soul）和选装时的 `dsh-flash-presets/`（Flash）：首次 clone，后续 fetch 后只允许干净 main 快进。发现本地改动、来源或分支不符就停止，不覆盖、不 stash、不 reset；网络失败不静默用旧缓存。

**不得直接修改拉下来的作者仓库源码。** 不在其中改 `package.json.files`、配置、人设或预设，也不运行会写回来源的脚本。每轮从完整提交导出临时副本，再做称呼替换、Flash 适配和安装。

干跑会更新作者仓库并写 kit 日志，不修改 DSH。审阅后执行干跑给出的固定提交命令，Soul 使用 `--ref <完整提交>`，Flash 使用 `--flash-ref <完整提交>`；不能重新跟踪 main。离线 `--source` / `--flash-source` 同样只读，Git 来源须干净，普通目录先复制到临时区。

桌面端零件遵循作者 `plugins/README.md` 与各零件说明整目录复制；不按 npm `files` 删减，不修改作者发布清单。已有配置接口（如 `YANTAI_SOUL`、`YANTAI_MEMORY`、`RIJI_DIR`、`COMFYUI_*`）先按说明配置，不把未配置归为源码故障。

## 装出来是什么

- **本体和零件**：七个必装零件，加上 Soul preset 调用的 compact-region，以及方案选中的可选零件。
- **Soul preset**：灵魂、灵魂 · 创造、灵魂 · PTC、灵魂 · 预判、灵魂 · 全能，按选择写入 profile 的 `cordis.patch.yml`。取作者预设块，不带作者本机的模型、插件等其它配置。内置「大肥鱼」选择五套，默认使用灵魂。
- **Soul skills**：创造、全能用到的技能放在 profile 的 `skills/`。同名文件与作者版本不同时会被替换，改前内容进入快照；用户另加且不在上游或历史托管记录中的文件保留。
- **Flash preset**：选装后从作者目录动态发现全部预设，有几套就适配几套。名称为「灵魂 · 上游名称」，简介保留上游原文并追加改造说明；压缩、裁剪替换为带门牌的零件，并补上范围压缩，其余规则保留。Flash 默认不选，版本与 Soul 分别固定。
- **旧会话兼容**：仍被会话使用的旧 preset id 会保留兼容别名；不能安全移除的入口会阻止迁移。旧包名与 preset 迁移细节见 [安装手册](AGENT-INSTALL.md) 第九节。
- **书房、自我层和记忆中枢**：放在 DSH 家目录的 `dsh-soul/`，包含权威源册、账本、人设、骨架和检索脚本；自我层按配置每轮注入。可通过 `memq` 检索，接入 mcp-hub 后还可调用 `mcp__echo__echo_search`。
- **心跳**：仅提供作者可选 heartbeat 零件，不生成或注册 kit 每日任务；运行与调度需另行验收、确认启用。
- **验收**：安装后新建会话，确认所选 preset、体检结果、压缩摘要门牌，以及按 `log:<会话>#seq=<n>` 回取原文。具体步骤见 [安装手册](AGENT-INSTALL.md) 阶段 C、D。

## 文件夹里有什么

| 文件或目录 | 用途 |
|---|---|
| [AGENTS.md](AGENTS.md) | Agent 必须遵守的来源只读、安装与验证边界 |
| [AGENT-INSTALL.md](AGENT-INSTALL.md) | 选方案、设定、安装、更新、迁移、卸载与验收手册 |
| [AGENT-ITERATE.md](AGENT-ITERATE.md) | kit 自身同步、作者上游对比、四流程验证与基线登记 |
| `install.sh` / `install.ps1` | 获取 kit、查找 Node.js 并启动安装入口 |
| `install.mjs` | 安装、更新、备份、还原、卸载与 kit 迭代入口，支持干跑 |
| `lib/` | 方案问答、配置、预设、迁移、事务与安装检查模块 |
| `lib/source-cache.mjs` | 更新同级作者仓库，保护来源，导出固定提交临时副本 |
| `lib/parts.mjs` | 零件包名、必装与可选范围、装配顺序及兼容提示 |
| `lib/package-contract.mjs` | 按实际安装文件集合核对入口、依赖和语法，不执行或改写作者代码 |
| `setups/` | 内置方案与全新安装保存的方案 |
| `assets/` | 设定模板与离线预设、技能快照 |
| `scripts/` | 来源保护、问答与隔离生命周期验证脚本 |
| `kit-iteration.json` | 上游审查基线与四流程完成记录，不代替真实运行验收 |
| `logs/` | 运行日志和检查报告 |
| `archives/` | 改动前的本机回滚快照 |
| `backups/` | 可跨电脑还原的迁移备份包 |
| [CHANGELOG.md](CHANGELOG.md) | README 最新三条之外的历史更新记录 |

## 更新

```bash
node install.mjs --update --dry-run
```

先更新本地作者仓库并审阅变化，再确认、退出 DSH，执行输出的固定提交命令。作者源码、本地目录来源都不做就地适配。本体、零件和中枢代码与选定作者版本不同的，替换前进入快照；用户数据、方案和书房不当成作者代码更新。

安装或更新结束只报告文件、配置与加载依赖；有阻断项时停在这里，不启动 DSH，也不自行进入其它工具。历史外部状态仅随迁移包透传，不代表操作授权。

## 备份

`--backup` 把 dsh-agent-soul 自己的东西打成一个 `.tar.gz`，默认放在 `backups/`（`--out <目录>` 可以放别处），打完会解开逐个核对一遍。打之前先完全退出 DSH，免得打出写到一半的文件。

带：

- 书房：账本、权威源册、人设；
- 记忆中枢（索引不带，还原时重建）；
- 会话原文（门牌靠它回取）；
- 换气账本；
- 本架构插件的设置、mcp-hub 清单；
- 安装记录：方案、零件、preset 和版本信息；历史外部状态仅透传。

不带：dsh-mnemon、其他插件、skills（Soul preset 自带的还原时从上游重装）、微信通路的凭据、表情包、附件、DSH 本身的设置。

卸载前也会自动打一个备份包，文件名以 `-pre-uninstall` 结尾。备份包和 `archives/` 里的快照是两回事：快照是每次操作前自动留的原样，只给这台电脑回滚用。

## 还原

`--restore [备份包]` 在新电脑（或卸载后的这台电脑）上装好 dsh-agent-soul，再放回备份里的数据；不写包名就用 `backups/` 里最新的一份。

- 不用再选方案，零件、Soul preset、称呼替换照备份安装；旧心跳时间仅作历史保留，不重新注册任务，按备份时的上游版本装（想升到最新，装好后再跑 `--update`）。
- 书房、记忆中枢、会话原文、换气账本连修改时间一起放回；配置里的绝对路径自动换成新电脑的，Mac 和 Windows 互相还原也换。
- 插件设置合并进新电脑的 `cordis.patch.yml`，新电脑已有的条目不动；mcp-hub 清单里的 echo 按新电脑路径重写。
- 新电脑上已经有灵魂数据（账本里有主导记录或自我层填过）时会停下，确认要覆盖再加 `--force`，原有的书房和记忆中枢先存进这次的快照。
- 还原后先核对安装完整性和配置；无启动阻断项并获确认后，才在新会话里任命主导。

迁不过去的：账本里写死的 `file:` 绝对路径、备份前就删掉的会话原文、mcp-hub 里其他服务器的命令路径（在面板里改）。

## 修改方案与指定版本

- **修改方案**：编辑 kit 的 `setups/<方案名>/`。`setup.json` 管零件、preset 与称呼替换，`00-authority.md` 是权威源册，`SELF.src.md.tpl` 是自我层模板；人设文件以该方案实际配置为准。修改方案影响后续安装，不会自动同步到已安装的书房。
- **修改已安装的内容**：使用安装目标中的权威源册、自我层或人设文件，位置见 [安装手册](AGENT-INSTALL.md) 第十三节；不要到作者仓库里改。完整人设和每轮注入的简短风格应保持一致。
- **指定版本或离线来源**：Soul 用 `--ref <完整提交>`，Flash 用 `--flash-ref <完整提交>`。离线分别用 `--source <目录或 tar.gz>`、`--flash-source <目录或 tar.gz>`；Git 来源须干净，没有提交号的来源需另行核对内容。
- **心跳配置**：按作者 heartbeat 的实际配置接口与运行条件核实，启用前单独验收。`--heartbeat-time` 已退役；`--no-heartbeat` 仅作旧命令兼容。旧任务不会自动停用，处理前先确认归属。

## 终端操作（辅助用法）

通常复制前面的提示词交给 Agent 即可；需要自己操作时，在 kit 目录运行以下命令。终端找不到 `node` 时，可用 DSH 自带的 Node.js，定位方法见 [安装手册](AGENT-INSTALL.md) A3。

<details>
<summary>展开常用命令与一行入口</summary>

### 常用命令

以下命令先查看计划。安装、更新和还原经确认后执行输出的固定提交命令；备份、卸载实际执行前也须完全退出 DSH。命令中的 `--setup`、`--flash`、`--add-part` 用于选择方案、Flash 和新增零件；实际执行前先审阅完整计划。

```bash
node install.mjs --setup 大肥鱼 --dry-run
node install.mjs --update --dry-run
node install.mjs --update --flash on --dry-run
node install.mjs --update --add-part clawbot --dry-run
node install.mjs --backup --dry-run
node install.mjs --restore --dry-run
node install.mjs --uninstall --dry-run
node install.mjs --kit-update --dry-run
node install.mjs --kit-iterate --dry-run
```

`--kit-update` 只同步工具包；`--update` 更新已装插件；`--kit-iterate` 准备上游对比与四流程报告，仍需 Agent 完成适配、验证后用 `--kit-accept <报告目录>` 登记。只同步仓库或生成报告不代表迭代完成。参数与离线迭代方式见 [迭代手册](AGENT-ITERATE.md)。

### 一行获取 kit 并干跑

macOS：

```bash
curl -fsSL https://raw.githubusercontent.com/Akashyc/dsh-agent-soul-kit/main/install.sh | bash -s -- --dry-run
```

Windows PowerShell：

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/Akashyc/dsh-agent-soul-kit/main/install.ps1))) --dry-run
```

入口会查找 Node.js，把 kit 放到文稿目录下的 `dsh-agent-soul-kit`，再启动同一份 `install.mjs`；可用 `DSH_KIT_DIR` 指定位置。已有 kit 时会尝试更新；无法快进或联网失败时可能沿用现有 kit，须留意终端提示。作者源码仓库的更新策略见 [作者源码只读与版本固定](#作者源码只读与版本固定)。


</details>

## 注意

- **验证范围**：6.2 已通过来源保护、问答与隔离生命周期验证，覆盖安装、更新、备份、还原和卸载；这些检查不代表真实 DSH 加载或功能验收通过。当前版本尚未完成桌面端与 Windows 实机验收，旧版本的验证记录见 [CHANGELOG.md](CHANGELOG.md)。
- **脚本入口**：本文中的 `install.mjs` 均指 kit 目录里的文件；作者仓库有同名脚本和手册，职责不同。执行前确认当前目录，操作步骤见 [安装手册](AGENT-INSTALL.md)。
- **安装完成与启动验收**：文件安装完成后，先检查配置缺项和启动阻断项；有阻断项就停止。确认可以启动时，完全退出并重开 DSH，再新建会话完成验收；旧会话不会自动换成新 preset。
- **插件市场里的「已停用」**：压缩与裁剪零件由 Soul preset 调用，市场状态不能单独证明功能失效。不要仅为消除这个标记而全局启用或卸载；应检查新会话的压缩产物与门牌回取。
- **本机路径与配置**：路径按当前 DSH 家目录和安装位置生成，部分配置需要绝对路径；还原时会按新电脑重写受管理的路径。面板没有数据时，先按作者说明核对数据源及 DSH Host 的实际配置，不要直接改作者源码。
- **换电脑**：全新安装会创建新的书房和账本；要延续原有记录，应先在旧电脑备份，再在新电脑还原，并在新会话里重新任命主导。迁移范围和限制见 [还原](#还原)。

## 版本记录

### 6.2（2026-11-05）

安装流程移除装后修复引导；默认更新同级作者仓库、导出固定提交临时副本，来源只读并拒绝覆盖本地改动。桌面零件遵循作者说明整目录复制，检查和更新使用同一文件集合；干跑给出固定 Soul/Flash 提交命令，阻断项未解决时停止启动验收。

### 6.1（2026-11-04）

Flash 改为整组动态适配：默认跟踪作者 main，不写死文件名、显示名和数量；简介来自上游并追加改造说明。安装记录、更新、恢复、卸载支持动态 id，旧单预设记录保留兼容入口；删除仍有会话引用的 Flash preset 时停止。三件套包名核对为作者 v3.0.0 的 `dsh-yanqing-*`，Flash 使用本次源码实际名称。新增 `node scripts/verify-flash.mjs <Soul源码> <Flash源码>` 隔离自测，未进行真实桌面安装。

### 6.0（2026-11-04）

完整分离修复功能至 dsh-agent-soul-fix 1.0；旧修复参数明确退出。新增独立修复状态备份/恢复及整套安装写锁；保留旧修复证据供首次接管，kit 自身迭代不再管理修复清单。

这里只保留最新三条记录；其他版本详情见 [CHANGELOG.md](CHANGELOG.md)。版本号与 `install.mjs` 中的 `KIT_VERSION` 一致。
