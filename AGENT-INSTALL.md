# 给 Agent 的手册：dsh-agent-soul 安装、更新、迁移与卸载

> 版本边界：kit 6.2，只负责安装、更新、迁移、卸载与安装完整性报告；安装结束不推荐、调用或引导其它修复工具。

> **你的任务**：在这台电脑上，给 DeepSeek Harness（下称 DSH）装上 dsh-agent-soul 灵魂架构；已经装过的，按第九节更新到最新版；要把一台电脑上的 agent 搬到另一台，按第十节备份和恢复；要卸掉，按第十二节（先备份再卸）。
> 装成什么样的 agent 由**方案**决定：用现成方案（安装包 `setups/` 里的，例如 Boss 的「大肥鱼」），或者**全新安装**——在对话里引导用户填设定，填完存成新方案再装。
> 默认先更新 kit 同级的作者仓库，再从选定提交导出临时源码。每轮默认检查 main 最新版；用户审阅干跑后，正式执行必须使用输出中的完整提交号，不能重新使用浮动 main。
> 适用：macOS、Windows；DSH 桌面版（DSH NEXT），profile 名为 `desktop`。完整复制仍不等于加载验收通过。

> 用户要求更新或迭代 **kit 自身** 时，转到 [AGENT-ITERATE.md](AGENT-ITERATE.md)。`--kit-update` 单独检查并同步 kit 的 GitHub 仓库；`--kit-iterate` 先处理 kit 自身更新，再准备插件上游证据，由 Agent 完成四流程分析、代码修改和验证，再用 `--kit-accept` 登记；不属于本手册的本机插件更新流程。

> **作者仓库只读**：不得直接改拉下来的仓库源码、提交适配、覆盖配置或运行会写入该目录的脚本。只允许从作者 origin 获取更新、干净 main 快进和读取固定提交；发现本地改动就停止，不 stash、不 reset。称呼、人设和 Flash 改造只在临时副本或安装目标中完成。

## 一、规矩（动手前先读）

1. 称呼用户按用户自己说的来；不知道就先问。用「大肥鱼」方案时，用户是 **Boss**。本手册涉及本机安装与数据操作的阶段开始前，用一两句话告诉用户要做什么，等用户确认后再动手。kit 源码迭代的授权与验证范围见 `AGENT-ITERATE.md`。
2. 只按本手册做。脚本报错就停下，把输出原文给用户看，不要自己绕过或手工补救。每次运行的输出也会存进本文件夹的 `logs/`。
3. **不要**用 `dsh plugin add` 安装，也**不要**运行仓库作者的 `install-desktop.ps1`：桌面版 profile 不接受 CLI 安装，作者脚本只拷本体、不装零件，也不包含这里的修正。用户想在自己的终端里一行装，用本安装包的 `install.sh`（macOS）/ `install.ps1`（Windows），命令见 README「怎么用」。
4. 作者仓库自带的安装与体检工具**不是给本安装包用的**，不要拿它们的结论改配置。本手册说的 `install.mjs`、`AGENT-INSTALL.md` 一律指安装包文件夹里的这两份：
   - `tools/soul-one-shot.mjs --fix` 只认旧版的 `.agent-presets` 目录，在 DSH NEXT 上会把已经接管的压缩 / 裁剪误报成「没接管」；
   - 2026-10-28 起作者仓库根目录也有同名的 `install.mjs`、`AGENT-INSTALL.md`，连同 `tools/soul-doctor.mjs`、`tools/soul-preset.mjs`、`presets/`，管的是 profile 里直接写 preset 块的装法。4.3 起本安装包也照这个装法：砚青几套写进 profile 的 `cordis.patch.yml`（顶层一项 `- insert:`），内容和作者 `soul-preset build` 展开的结果逐字一样，作者的 doctor 能看到。但**别拿作者的 `soul-preset.mjs build --write` 来装**：profile 里一个 preset 都没有时它会插到文件最顶上、还不带 `- insert:`，配置直接坏掉；已经装好的再跑它只报「一致 / 不一致」，不会改。它不设 `DSH_HOME` 环境变量时还会报 ReferenceError（第 40 行用了第 51 行才定义的 `argOf`）；它的 `verify` 查三件套时要求 `dsh-agent-*`、`dsh-yanqing-*` 两套包名都在，会误报缺 `dsh-yanqing-*`，以 doctor 为准（doctor 已改成任一前缀）。
5. **不要**新建 `~/.mnemon` 目录：dsh-mnemon 把它当默认全局目录，凭空建出来可能让它换地方读写。
6. 要退出、重开 DSH，都请用户来操作，并等用户确认已经做完。脚本真跑（不带 `--dry-run`）时 DSH 必须完全退出。
7. **全新安装的设定只能由用户来定**：名字、称呼、硬线、人设、要不要哪个零件，一律问用户，不要替用户编。用户说「随便」「默认」的，就用问题清单里的默认值，并告诉用户用了哪个。
8. **安装、更新以作者为准**：本体、零件、中枢脚本和 Soul preset 同步作者版本；替换本机内容前进入快照。桌面零件遵循作者 `plugins/README.md` 及各零件说明整目录复制，不按 npm `files` 筛选，不改作者的 `package.json`。作者原文仍有加载问题时只报告证据和影响，未解决前不启动 DSH；不把其它工具作为安装的下一阶段。
9. **可选零件一个都不能藏**：有兼容问题、要先装别的东西的照样列给用户，把说明念出来，只是默认不勾。装不装由用户定，不要替用户筛掉选项。
10. **问用户照弹窗规范来**（第五节末尾）：安装设定与更新确认照脚本生成的问题清单询问；不附加修复流程。

## 二、装完是什么样（验收目标）

| 项 | 内容 |
|---|---|
| 本体 | `dsh-agent-soul`，GitHub main 的最新提交（装到哪一版记在安装记录里）。DSH 里会多出 8 个 `agent_soul_` 开头的工具 |
| 必装零件 | compaction（压缩摘要带门牌）、pruner（裁剪带门牌）、memory（每轮注入时钟、自我层和上下文水位）、echo（体检面板）、huanqi（换气：思考退化的打断和清创）、huanqi-panel（换气面板）、mcp-hub（MCP 服务总入口，接上 echo 的常驻检索）；Soul preset 调用的 compact-region 跟着装。按作者 2026-10-31 定的「全局必装」，不能跳过 |
| 可选零件 | 11 个，分三组：常用 mnemon-probe（热记忆容量，要先装 dsh-mnemon）、clock（侧边栏时钟）、perf（渲染性能护栏）；面板件 model-statusbar（本地模型服务状态，要有 ComfyUI 一类服务）、mobile-adapt（手机竖屏适配）、riji（日记入口）、splash（启动一屏）、yantai（工作台）；上游新零件 heartbeat（作者的心跳面板）、chat（手机聊天页）、clawbot（微信通路）。**全部列给用户**，有兼容问题的照列，说明里写明原版兼容问题、缺少的前置配置和验收范围，只是默认不勾。大肥鱼方案装 mnemon-probe、clock |
| Soul preset | 灵魂 / 灵魂 · 创造 / 灵魂 · PTC / 灵魂 · 预判 / 灵魂 · 全能，使用上游 `presets/` 原文；按作者算法展开 include；全能只取 preset 那一块（上游文件后面是作者整份 profile 的导出，不装）。创造和全能用的 4 个技能拷进 profile 的 `skills/`。生成哪些、默认用哪个按方案；大肥鱼默认装五套、默认灵魂；可选「灵魂 · Flash（上游全部预设）」（见第九节，默认不选），数量、名称和简介跟随上游目录。v3.0.0 以前叫砚青四套（`yanqing*`），旧 id 自动换成新的，砚青建的会话留别名照常打开 |
| 默认不装的面板件 | model-statusbar、yantai、mobile-adapt、splash、riji、perf —— 已进可选列表，默认不勾；它们装完没有数据源就是空面板，所以不默认装。上游以后新增的零件，脚本只列出来、提示更新安装包，不会自动装 |
| 默认不装的新零件 | heartbeat、chat、clawbot —— 用户要装之前，**先把已知问题原样告诉他**：heartbeat 在 0221d89 里面板从包外的 `lib/paths.mjs` 导入、还用了没定义的 `AI_ROOT`，一加载就报错，心跳脚本随零件目录完整复制，计划任务依赖 Windows，每次工具调用还会试着往 `D:\_yq_guard_probe.txt` 写一行诊断；kit 不修改运行链、不注册任务；chat 在 fe3c456 起使用未导入的 `join` / `dirname` / `homedir`，入口无法加载；仍写死作者的会话 id（别的电脑连不到会话），服务绑 `0.0.0.0`、绕开 DSH 的登录鉴权；clawbot 要微信扫码绑定，凭据在 `~/.dsh/clawbot/`、备份不带，自动通知默认全开，本机自己装过的 `dsh-clawbot` 安装包不碰。已有的安装 `--update` 不自动补装，要装加 `--add-part <名字>` |
| 书房 / 中枢 | `<DSH 家目录>/dsh-soul/soul` 和 `<DSH 家目录>/dsh-soul/memory` |
| 第 0 步 | `soul/00-authority.md` 权威源册（按方案填好；「检索能否指回原文」一项要在这台电脑上实测后再填） |
| 自我层 | `memory/hub/SELF.src.md`：agent 的身份、硬线、说话方式、门 |
| 人设完整版 | 方案带完整人设时放在 `soul/65-声音/<名字>-声音.md`（大肥鱼方案是 `大肥鱼-声音.md`） |
| 心跳 | 只提供作者可选 heartbeat 零件，不生成 kit 每日脚本、不自动注册或启用任务 |
| 记忆检索 | `memq` 命令（任何时候都能用）；装了 mcp-hub 的，会话里还有常驻内存的 `mcp__echo__echo_search` 等工具，快一个数量级 |
| 安装记录 | `<DSH 家目录>/dsh-soul/.install-state.json`：装的是哪个提交、用的哪个方案、装了哪些零件、哪些是用户拒掉的、生成了哪些 preset（旧版安装记录里的心跳字段只作历史）。更新靠它 |
| 最终体检 | **0 错**；警告只剩「门牌回取」「压缩机制」两条：要等第一次压缩发生才会变绿，不是故障。没开心跳、没装换气的，对应那项也会是提醒 |

`<DSH 家目录>`：macOS 是 `~/.dsh`；Windows 通常是 `C:\Users\<用户名>\.dsh`。设置过环境变量 `DSH_HOME` 的，以它为准。

## 三、文件夹里有什么

```
README.md                    给人看的说明
AGENT-INSTALL.md             本手册
install.sh / install.ps1     一行装的引导（macOS / Windows）：找 node、放好安装包、在终端里启动 install.mjs
install.mjs                  安装 / 更新 / 备份 / 恢复 / 卸载脚本（跨平台，可重复跑，先 --dry-run）
lib/                         install.mjs 用的模块：零件目录与系统限制（parts）、方案与问答（setup）、弹窗（popups）、系统差异（platform）、
                             Soul preset 生成与迁移、配置路径、人设规矩、发布清单核对、文件事务、安装写锁、快照（archive）、卸载规划、kit 迭代
scripts/                     自测：verify-setup.mjs（问答和弹窗）、verify-macos-install.mjs（隔离安装、更新、备份和恢复）、verify-flash.mjs（动态 Flash 及旧记录生命周期）
setups/                      方案：每个子文件夹一套
  大肥鱼/
    setup.json               名字、称呼、硬线、人设类型、零件、preset
    00-authority.md          权威源册（手写）
    SELF.src.md.tpl          自我层模板（手写；{{HUB}} 由脚本换成本机路径，写成 $HOME/… 不带用户名）
    大肥鱼-声音.md            人设完整版
  <全新安装存下的方案>/        结构一样，文件由模板生成，可以直接改
assets/
  templates/                 全新安装用的通用模板：权威源册、自我层
  presets/ptc.patch.yml      官方 PTC 的快照（找不到本机 DSH 的 app.asar 时才用）
  presets/standard.patch.yml 官方「标准」预设的快照（同上）
  presets/minimal.patch.yml  官方「极简」预设的快照（同上）
  presets/cordis.patch.yml   官方「Cordis」预设的快照（同上）
  presets/preset-soul*.yml、_shared/、skills/   上游灵魂五套和 skills 的快照（上游没有时才用，例如 --ref 装 v3.0.0 以前的版本）
logs/                        每次运行的输出（脚本自动建，可以删）
backups/                     --backup、--uninstall 打出的备份包（迁移时连同文件夹一起拷走）
archives/                    安装、更新、恢复、卸载前自动留的本机快照，一套 DSH 一个子文件夹（只给本机回滚用）
```

模板里的记号：`{{名字}}` 换成值；行首 `{{?条件}}` / `{{!条件}}` 表示条件成立 / 不成立时才保留这一行。名字、称呼、硬线、人设在生成方案时填好；路径、这台电脑有没有 dsh-mnemon 留到安装时按电脑填。

## 四、阶段 A：准备（只读，不改任何东西）

**A1. DSH 已安装，并且至少打开过一次。** 检查 profile 是否存在：

- macOS：`ls ~/.dsh/profiles/desktop/package.json`
- Windows（PowerShell）：`Test-Path "$env:USERPROFILE\.dsh\profiles\desktop\package.json"`

不存在就请用户先打开一次 DSH。

**A2. dsh-mnemon（建议装）。** 这套架构「可复用结论」那一层靠它，mnemon-probe 也只有装了它才有用。没装的话问用户要不要先在 DSH 插件市场装上、随便聊一句让它生成数据目录；不装也能继续，全新安装时 mnemon-probe 不会出现在选项里，自我层里也不写 mnemon 那一节。

**A3. 一个 node（18 以上）。** 不用手动找路径。脚本自己按「`DSH_NODE` → DSH 自带（按本机架构挑 arm64 / x64）→ 当前进程 → PATH → 常见安装位置」的顺序找；当前这个版本不够时会自动换一个合格的、把自己重跑一遍。心跳、MCP 的 echo、开机自启这些要长期用的配置，优先写 DSH 自带的那个 node —— 它不依赖用户的 PATH，DSH 换版本重跑一次安装就会跟着更新。

想先确认一下：

- macOS / Linux：`node -v` 不够 18，再看 DSH 自带的：
  ```bash
  ls -d /Applications/*DSH*.app 2>/dev/null
  find /Applications -path "*dependencies/node/bin/node" -type f 2>/dev/null
  ```
- Windows（PowerShell）：
  ```powershell
  node -v
  Get-ChildItem "$env:LOCALAPPDATA\Programs","$env:ProgramFiles" -Recurse -Filter node.exe -ErrorAction SilentlyContinue |
    Where-Object FullName -like '*dependencies*' | Select-Object -First 3 -ExpandProperty FullName
  ```

都找不到就装一个 18 以上的 node（`brew install node` / nodejs.org / `apt install nodejs`），或者用 `--node <路径>` 直接指定。不要用临时目录里的 node。

**A4. 把整个文件夹放到一个固定位置**（例如「文稿」或「文档」下；用户用 README 的一行装命令时，`install.sh` / `install.ps1` 会放到「文稿 / 文档」下的 `dsh-agent-soul-kit`，并替你做完 A3）。路径里有空格、有中文都没关系。

**A5. 作者源码。** 需要 Git。默认维护 kit 同级的 `dsh-agent-soul/`，选了 Flash 时再维护 `dsh-flash-presets/`：首次克隆，之后先 fetch，只允许干净 main 快进；origin 不符、工作区有改动、分支不符或网络失败就停止，不静默用旧缓存。

- 作者仓库只读，不能为安装或修复问题就地修改代码、`files`、人设、路径或预设。安装器从固定提交导出临时副本，适配和安装只使用该副本。
- 离线用 `--source <目录或 tar.gz>`、`--flash-source <目录或 tar.gz>`；不联网，目录先复制到临时区，Git 来源必须干净。
- 干跑会更新本地作者仓库和写 kit 日志，但不改 DSH。报告需注明 Soul 与 Flash 的完整提交号；真跑执行输出中的固定版本命令。

## 五、阶段 B：选方案并安装（跑脚本）

下面的命令在本文件夹里执行；macOS 写成 `"$NODE" install.mjs …`，Windows 写成 `& $NODE .\install.mjs …`。

**B1. 问用户怎么装**，二选一：

- **用现成方案**：`setups/` 里已有的（大肥鱼，或以前全新安装存下的）。把每个方案的名字、称呼给用户看，让用户挑；挑好后干跑，把干跑里「可选零件」那张表（11 个零件全列，装 / 不装、兼容问题）原样给用户，用户要改就加 `--add-part` / `--skip-part`。
- **全新安装**：按 B2 一步步问。

用户自己在终端里装也可以：直接跑 `"$NODE" install.mjs`，脚本会在终端里列出方案、一问一答，最后给总结、确认后才动手。这条路不用你做 B2、B3，只需要在旁边答疑，装完从阶段 C 接着做。

**B2. 全新安装：在对话里问设定。**

1. 跑 `install.mjs --questions`，拿到问题清单（JSON）。里面有：
   - `用法`：步骤说明；
   - `detected`：这台电脑有没有 dsh-mnemon、已有哪些方案；
   - `questions`：每题的 `id`、`group`、`ask`、`hint`、`options`、`default`、`askIf`；
   - `popups`：排好的弹窗，照它问（见本节末尾「弹窗规范」）；
   - `answersExample`：回答文件的样子。
2. 照 `popups` 一个一个弹：身份 → 硬线 → 人设 → 运行 → 零件 → 保存。
   - **人设**只有一个输入框：每行一句说话风格，或一行人设文件的路径（`.md` / `.txt`），可以混着写，留空就是正常专业的口吻。脚本自己分辨哪行是路径，文件原样拷进方案和书房 `65-声音/`；只给了文件没写句子的，自我层自动写「按人设文件说话」。
   - **零件**：必装的七个（compaction、pruner、memory、echo、huanqi、huanqi-panel、mcp-hub）直接告诉用户；可选的 11 个按常用、面板件、上游新零件三组全部列出，每个选项的说明里写着装了有什么、不装会怎样、这台系统上的兼容问题（只描述问题和前置条件，不推荐其它工具）和要先装的东西。默认值照弹窗里的「（推荐）」。
3. 把回答写成一个 JSON 文件（建议放在 `logs/answers-<名字>.json`）：键名是题目的 `id`，值取选中选项的 `value`，「其他」输入框里写的照原样填；拆成几道的多选题合在一起。人设写成数组 `"persona": ["自称小鲸", "~/Documents/人设.md"]`（旧的 `persona` + `personaBrief` + `personaFile` 写法也还认）。

**B3. 先干跑**，更新本地作者仓库、导出临时副本并报计划，不修改 DSH：

- 现成方案：`install.mjs --setup <方案名> --dry-run`
- 全新安装：`install.mjs --fresh --answers <回答文件> --dry-run`

回答缺项或不合规时，脚本会在「选方案」那一步列出每一处问题（比如没填名字、人设文件路径不对），就着问题回去问用户，改好再干跑；没装 dsh-mnemon 却选了 mnemon-probe 这类只写进「需要留意」，装不装还是用户定。通过后，把「方案」那一段总结原样给用户看，再报：装的是哪个提交、和安装包验证过的版本是否一致、「需要留意」里的每一条。

**B4. 真装**：用户确认后，请用户**完全退出 DSH**（macOS 按 `Cmd+Q`，点红色按钮只是关窗口；Windows 连托盘图标也要右键退出），然后执行干跑输出的固定提交命令（Soul `--ref`，选装 Flash 时还有 `--flash-ref`）。用户在 macOS 的真终端里自己跑时，DSH 还开着脚本会问要不要帮他退出（AppleScript，和 Cmd+Q 一样）；agent 的终端不是真终端，不会走这一步。

- **你本身就是 DSH 里的 agent 时**（例如在大肥鱼的会话里装）：干跑可以在会话里跑；真跑要 DSH 完全退出，你自己跑不了。干跑结束时脚本会打印现成的终端命令，交给用户在终端里跑（不要改成别的写法）。用户重开 DSH 以后，你所在的这个会话还是装之前的 preset，**阶段 C 的验收和阶段 D 都要在新建的会话里做**：告诉用户新建会话、看顶部 preset，再把脚本最后打印的那段话贴进新会话。
- 全新安装真跑时，设定先存成 `setups/<方案名>/`；中途出错的话改用 `--setup <方案名>` 重跑，不用再问一遍。
- 脚本说「无法自动判断 DSH 是否已退出」时，先向用户确认 DSH 已完全退出，再加 `--confirm-quit` 重跑。
- 其他可选参数：`--flash on`（加装 Flash 上游全部预设，方案里没选也行）、`--add-part <零件>`（方案之外多装一个可选零件）、`--ref <提交>`（装指定版本）、`--default-preset soul`（覆盖方案里的默认 preset）、`--skip-part <零件>`（只能跳可选零件）、`--rename <上游称呼=称呼|none>`（覆盖方案里的称呼替换）、`--dsh-home <目录>`（必须是已经含 `profiles/<profile>/package.json` 的 DSH 家目录；给相对路径会先解析成绝对路径，指错时直接停下，不会改用别的家目录）。
- **称呼替换**：默认不换（作者已把 preset 人设和文档里的人名改掉；内置方案的 `nameMap` 都是空的）。上游代码里还剩几处作者的称呼「爀曦」，其中一处是换气熔断时注入给 agent 的指令「告诉爀曦『需要手动压缩』」；用户要换，就加 `--rename 爀曦=<称呼>`，只换装进 DSH 的插件代码和文档，书房和账本不动，记进安装记录，以后更新、备份、恢复都照做。

**B5. 脚本做的事**（动手前把要改的原样存进快照；重复跑安全）：

| 步 | 做什么 | 为什么 |
|---|---|---|
| 0 | 预检：node 版本、找 DSH 家目录和 profile、DSH 是否已退出 | 前提不满足就停，什么都不改 |
| 1 | 选方案：读现成方案并校验，或校验回答、生成新方案并存进 `setups/` | 装什么、装成谁，在动手前定死 |
| 2 | 更新同级作者仓库，从固定提交导出临时源码；检查结构、包名、兼容性和安装依赖 | 不重复下载归档，不修改作者工作区 |
| 3 | 快照：要改的原样存进安装包的 `archives/<主机>-<家目录指纹>/<时间>-install-…/`（附「还原方法.txt」）；以前留在 DSH 家目录里的 `.bak-*`、`dsh-soul/_backup/` 一起搬进 `legacy/` | 出问题自动回滚，事后也能照着拷回 |
| 4 | 本体按作者桌面安装范围复制；必装及选装零件按作者说明整目录复制到 `profile/node_modules/`，暂存核对后替换 | 不用 npm `files` 筛掉零件所需文件 |
| 5 | 保留作者代码；缺文件、包外导入、语法等问题只写进安装完整性报告；配置缺项先查作者公开接口 | 不自动改源码，也不进入其它工具 |
| 6 | 写 Soul preset：按方案生成上游灵魂五套（选了 Flash 的再动态加入上游全部 preset，源在线取 dsh-flash-presets），写进 profile 的 `cordis.patch.yml` 顶层一项 `- insert:`（作者的装法，作者 doctor 认的位置）；创造、全能用的技能拷进 profile 的 `skills/`（和上游不一样的换成上游原文）；4.3 以前装在独立包 `dsh-soul-preset` 里的，搬过来、把包和锁文件里的条目摘掉；移除旧 Flash，旧会话与默认入口迁到灵魂 · PTC（正文保留，迁移前备份，失败回滚） | 会话用的是 preset 里那份压缩，只有在 preset 里换才生效（第十一节 8） |
| 7 | `package.json`：本体、零件（compaction、pruner **不进**）进 bundles；全部写进 dependencies（`file:node_modules/<包名>`）。`cordis.patch.yml`：memory 配 `selfPath: dsh-soul/memory/hub/SELF.md`、`statePath: dsh-soul/memory/hub/state.json`（相对 DSH 家目录，Mac、Windows 同一份）、`maxBytes: 12288`；已有的这一节会核对，指向别的电脑或旧写法的路径改成这台的；默认 preset 按方案 | 写进 dependencies 才不会被 pnpm 清掉；自我层上限要和装配预算对齐；配置里不带用户名，换电脑、挪家目录都不用改 |
| 8 | 装了 mcp-hub 的：清单 `<DSH 家目录>/mcp-hub/servers.json` 里加一台 echo（stdio，命令是本机 node + 中枢里的 `echo-mcp.mjs`，`env` 带上 `DSH_HOME`）；已有就不动，只给本安装包登记的那台补上缺的 `DSH_HOME` | 记忆检索走常驻服务 |
| 9 | 放权威源册（方案里的，填上本机路径）→ `init.mjs` 按方案的回答生成其余骨架 → 作者的 `install-kit --all` 把全套脚本装进 hub（同义词表 `synonyms.json` 是数据，只在没有时补）→ 挪走 `test-self-check.mjs` → 写配置（一主、一副本、一指针） | 第 0 步 + 记忆中枢 |
| 10 | 写入 `SELF.src.md`（方案里的模板，填上本机路径）→ `scaffold --apply` 搭骨架 → 方案带完整人设的放进 `65-声音/` | plan 的第 2、3 步 |
| 11 | 旧 kit 心跳已退役，不生成脚本或注册任务；需要巡视时选择作者 heartbeat 零件 | 按需验收、手动启用 |
| 12 | 校验：package.json 合法、各个包到位、注册 id 不撞车且面板 id 等于包名、**每个包要加载的插件都在 node_modules 里找得到**（上游造成的不对写进「需要留意」、收尾点名，不回滚）；写安装记录（含方案、拒掉的零件；历史证据只透传） | 任何一条不对都会让 DSH 一启动就崩或面板加载失败 |

**B6. 成功的样子**：最后是「文件层面的安装完成」；不应出现 kit 每日任务注册、立即触发或装后其它工具引导。「需要留意」里出现的提醒，逐条报给用户。最后一段「接下来」里有一整段要贴进新会话的话（主导、第一条账、重建索引、装配自我层、体检、门牌实测），原样交给用户。

**B7. 安装结果与配置核对**：报告安装文件、Soul/Flash 提交、配置缺项和阻断项。yantai 先核实作者的 `YANTAI_SOUL` / `YANTAI_MEMORY`，riji 核实 `RIJI_DIR`，模型状态栏核实 `COMFYUI_HOST` / `COMFYUI_DIR` / `COMFYUI_PY`；不能把未配置当成源码故障。环境变量必须对 DSH Host 生效，不能只设在安装终端。阻断项未解决时结束本轮安装，不启动 DSH，不自行转入其它工具。

**弹窗规范**（问用户一律用弹窗；内容由脚本给或照下表，原样弹，每次一样）：

| 流程 | 弹窗（按顺序） | 选项 |
|---|---|---|
| 安装 | ① 标题「装法」：怎么装？ | 用现成方案（推荐） / 全新安装 |
| | ② 现成方案：标题「方案」：用哪个方案？ | 每个方案一项（描述写名字、称呼）；超过 4 个只列前 3 个，其余在「其他」里写方案名 |
| | ② 全新安装：`--questions` 的 `popups` | 照原样，一般 8 个弹窗 |
| | ③ 干跑后先用普通消息发方案总结、零件表、「需要留意」，再弹标题「确认安装」：照这个装吗？ | 装（推荐） / 改设定 / 先不装 |
| 更新 | 干跑后先用普通消息发「上游改了什么」全文，再弹标题「确认更新」：更新到作者最新版吗？ | 更新（推荐） / 先不更新 |

| 卸载 | 干跑后先用普通消息发要删的清单，再弹标题「确认卸载」：卸载吗？ | 卸载，保留书房和记忆 / 全部卸载 / 先不卸 |

- 一个弹窗最多 4 道题，每道 2–4 个选项，标题不超过 12 个字；脚本给的都已合规。
- 不增删、不改写、不合并选项，推荐项放第一个、带「（推荐）」。
- 要填写的内容走选项下面的「其他」输入框；用户选了「在下面「其他」里输入」却没写的，再弹同一道题。
- 报告全文、零件表、核对表这类长内容用普通消息发，不塞进弹窗。最后一个弹窗选了确认才真跑。

## 六、阶段 C：启动验收

仅在安装报告无启动阻断项、并经用户确认后进入；文件复制完成不代表运行验收通过。

请用户打开 DSH，然后逐项确认（没装的零件跳过对应那一项）：

| # | 怎么验 | 正确结果 |
|---|---|---|
| C1 | DSH 正常启动 | 没有崩溃恢复对话框。如果弹出，**先别点里面的按钮**（「停用所有插件」会清空配置），按第十二节回滚 |
| C2 | 新建会话，看 preset 名字 | 是方案里的默认 preset；列表里还有方案生成的其他 Soul preset |
| C3 | 让 DSH 里的 agent 列出名字以 `agent_soul_` 开头的工具 | 8 个：layers、manifest、doctor、plan、scaffold、check、verify、install |
| C4 | 让它原样引用这一轮运行时上下文的前几行 | 有【此刻】（当前时间）和【自我层】。心跳若已触发过，自我层就是方案里的身份；否则提示「SELF.md 读不到」，阶段 D 之后会消失 |
| C5 | （装了 mnemon-probe）让它原样引用系统提示里的 `[MNEMON 探针 v0.1]` | 「宽裕」「磁盘没问题」；出现「读盘失败」说明热记忆路径不对 |
| C6 | （装了 clock）用户点侧边栏底部的时钟按钮 | 面板完整弹在按钮附近，有时间、日期、时区 |
| C7 | （装了 huanqi-panel）用户打开「换气」面板 | 能打开；提示「账本还不存在……还没出过手（正常）」是对的 |
| C8 | 插件市场「已安装」里看 dsh-yanqing-compaction、dsh-yanqing-pruner | 显示「已停用」，**这是正常的**：它们由 Soul preset 调用，不在 bundles 里。不要打开，也不要卸载 |
| C9 | （装了 mcp-hub）用户打开侧边栏的 mcp-hub 面板；DSH 启动几秒后，让 agent 列出名字以 `mcp__echo__` 开头的工具 | 面板里 echo 是已连接；工具有 echo_search、echo_open、echo_stats。刚启动一两秒内还没连上属正常（它是后台连接） |
| C10 | 在 DSH 设置里随便改一项（例如主题），完全退出再打开，新建会话看 preset 列表 | 灵魂几套还在。4.3 起它们写在 profile 的 `cordis.patch.yml` 里，DSH 改设置时会重写这个文件；不在了就跑 `install.mjs --update` 写回，并把这件事报给维护者 |

## 七、阶段 D：在装完后新建的会话里完成剩下几步

这几步**必须由 DSH 里的 agent 来跑**：账本要记下是哪个会话写的，装配 SELF.md 要用当前会话 ID 和本地时间，外面代跑会写错。

**而且必须是装完、重开 DSH 之后新建的会话。** 会话的 preset 在新建会话时就定了：装之前开的会话（包括在 DSH 里跑这次安装的那个）不会自己换成 Soul preset，在里面做门牌实测，压缩走的是内置那套，只会看到「没有门牌」的假结论；主导也应该是用 Soul preset 跑的那个会话。

**D1.** 请用户新建会话，先看会话顶部的 preset：应该是方案的默认 Soul preset（大肥鱼方案是「灵魂」）。不是的话，在新建会话时手动选上再开始。

然后把安装脚本最后打印的那段话（「┌─ 贴进新会话的话」到「└─」之间）原样贴进这个新会话。里面的路径、称呼、代数都已经按这台电脑填好了，**不要自己拼路径**（DSH 家目录不一定是 `~/.dsh`，Windows 上也可能在别处）。把 `<今天日期>` 换成今天的日期。那段话依次让 agent：

1. 用 `mo.mjs add lead` 写主导记录（`--ref` 写清是用户哪天指定的）；
2. 读 `dsh-agent-soul/soul/12-ledger.md`，写下自己的第一条账（写一件此刻确实知道的、具体的事，别写总结；有感触才加 `--feel`）；
3. `node memindex.mjs build`；
4. `node self.mjs`；
5. 调用 `agent_soul_check`，贴汇总行和所有 ✗ 的项；
6. 门牌实测的准备（见 D2）。

脚本的输出找不到了：重跑同一条安装命令（重复跑安全，做过的步骤会跳过），最后会再打印一遍。

- 自我层里有「开工」这类硬线的，agent 动手前可能会先问；用户回「直接做」即可。
- 它的终端里没有 `node` 的话，那段话最后一行写了要换成的完整路径。
- **正确结果**：`agent_soul_check` **0 错**；警告只剩「门牌回取」「压缩机制」（还没发生过压缩）。心跳能力不默认启用；仅在选择并启用作者 heartbeat 后按阶段 E 单独验收。

**D2. 门牌实测（Soul preset 真的接管了没有）**：**在 D1 的这个新会话里**再聊两三句，让它读一个文件，然后用户输入 `/compact`。看到「Compacted … history items」后，让 agent 把压缩摘要第一块原样贴出来：应以「⛬ 压缩索引（非原文） · log:session-…#seq=…」开头。再让它跑 `node memq.mjs open log:<那个会话>#seq=<那个数>`，能翻出原话，就把 `soul/00-authority.md` 第七节「检索能否指回原文」那一项填成「能」，并写上这次的实测。
- 摘要开头不是「⛬ 压缩索引」：先看这个会话顶部的 preset 是不是 Soul preset（第十一节 22），再看第十一节 8、21。
- 工具输出裁剪只在自动压缩时才会发生，手动 `/compact` 不触发；等第一次自动压缩后，看被裁掉的工具输出里有没有「原文在 append-only 会话日志 seq N」。

## 八、阶段 E：作者 heartbeat 验收（选装且需要启用时）

kit 不再创建每日脚本、launchd 或 Windows 计划任务。旧记录/备份字段不会重新启用任务。

按作者仓库当前提供的说明核实运行链、权限和真实产物。当前系统没有可用运行链时记录未验收；不能为完成安装而就地改作者源码、生成兼容补丁或自动注册任务。旧任务的停用与新任务启用需要另外确认。

## 九、更新

**什么时候更新**：作者 GitHub 上有新提交时；DSH 本身升级后核对插件与灵魂五套的兼容性。安装、更新、恢复会清理旧 Flash。迁移前检查普通与 zstd 会话，无法读取时停止，不直接删除旧入口。

**更新就是同步成作者选定版本**：本体、已装零件、中枢脚本、Soul preset 和 skills 与作者比较，本机不同内容替换前先进入快照。整个过程只读作者仓库，更新完成只报告结果及阻断项，不附加其它工具流程。

**更新会动的**：
- profile 里的本体、已装的零件（和作者原文不一样的整包换掉）、profile 里的 Soul preset 那一节（按作者的重新生成，压缩摘要也照作者写死的；4.3 以前装在独立包 `dsh-soul-preset` 里的，搬进 profile，包和锁文件里的条目摘掉）。所有零件都从主仓 `plugins/` 取。安装包 4.0 以前装的不再支持直接更新，脚本会停下，先用 4.x 的安装包更新一次，或者卸载后重装；
- **零件改名时自动迁移**（例如 kit 4.x 装的 `dsh-agent-compaction`、`dsh-agent-pruner`、`dsh-agent-compact-region` → 上游 v3.0.0 的 `dsh-yanqing-*`）：装新名字的目录、删旧目录（先整份备份），`package.json` 的 bundles 原位换名、dependencies 换名，三个锁文件（`pnpm-lock.yaml`、`node_modules/.pnpm/lock.yaml`、`node_modules/.modules.yaml`）同步换名；
- **安装包后来加的零件**：在终端里跑，脚本会逐个问装不装；agent 跑时，干跑报告里会写「会装上；不要就加 --skip-part <零件>」，问过用户再决定加不加。拒掉的会记进安装记录，以后更新不再补。必装零件和 Soul preset 要调用的零件（压缩三件套 compaction、pruner、compact-region）不问、不能跳过，本机没有就补上，缺了 preset 加载失败、DSH 起不来；4.0 起换气、换气面板、mcp-hub 也是必装，以前拒掉过的这次照样补上；
- **旧会话用的 preset 别名**：会话开头记着建会话时的 preset id。Soul preset 换了 id（例如 2.11 起 standard-soul、cordis-soul 换成砚青四套；5.0 起砚青四套 `yanqing*` 换成灵魂 `soul*`），还有会话在用的旧 id 会留一个别名，内容和对应的新 preset 一样，名字标着「旧会话用」，新会话别选。干跑里「Soul preset」那段会列出别名和在用的会话数；要去掉的 preset 还有会话在用时，脚本会写进「需要留意」，先停下；
- 中枢脚本：用作者的 `install-kit --all` 把上游 `kit/echo/` 的脚本全部换成作者原文（本机改过的也换，原样在快照里）；同义词表 `synonyms.json` 这类数据文件不动，只在没有时补；检索脚本换了就顺手 `memindex build` 重建索引；
- kit 里的配置副本（照主配置重写）；`package.json` / `cordis.patch.yml` 里不对的地方（例如旧版安装包写的根层禁用会被去掉）。
- **灵魂 · Flash**（装了的）：每次更新重新取作者 main，动态加入全部上游 preset；旧单预设记录自动升级，删除仍被旧会话或默认入口使用的 id 时停止，见本节「灵魂 · Flash」。
- **新加的东西**：kit 5.0 新加的「灵魂 · 全能」更新时自动补上；heartbeat、chat、clawbot 不自动补装（终端里会问，默认不装），用户要装再 `--add-part <名字>`，装前先把上面「默认不装的新零件」那一行的已知问题告诉他。
- **Soul preset 的 skills**（`<profile>/skills/`）：和上游不一样的换成上游原文；不再选创造、全能时，安装包装过的删掉；你自己放进去的文件不碰。
- **称呼替换照安装记录做**：仅在导出的临时源码副本中换好称呼，再拿去比对和安装，所以换过的称呼不算变化、也不会被冲掉。要改就加 `--rename 爀曦=<称呼>`，关掉加 `--rename none`。
- **历史记录只透传**：迁移包中的外部状态不解释、不执行、不据此生成下一阶段操作。
- **作者的 `soul-version.json`**：作者 2026-10-31 把它删了，安装包 4.0 不再核对 Soul preset 的哈希和契约版本；更新时以上游 README 的更新记录和干跑报告为准。
- **报告怎么分来源**：优先从本地作者仓库读取已装提交作为基线；离线更新用 `--base-source` 提供。基线拿不到时明确说明，不把来源不明说成作者改动。

**更新不动的**（这些是你的数据和设定，不是作者的代码）：方案（不用选，也不会重新生成书房和自我层）、书房（含账本 `02-墨.jsonl`、权威源册、人设）、`SELF.src.md`、主配置 `memory/hub/echo.config.json`、中枢里的索引和数据文件、mcp-hub 清单里已有的 echo、默认 preset（除非加 `--default-preset`）、用户拒掉的零件、修复清单的跳过设置、profile 配置里修过的换气布尔值。

**步骤**：

1. **先干跑**（DSH 开着也可以）：`install.mjs --update --dry-run`。
2. 把「上游改了什么」完整报给用户：选定提交、提交和文件变化、本机哪些内容会被替换、零件改名与选择、配置及阻断项。替换前内容保存在快照。按弹窗规范确认更新。
3. 用户确认后，请用户完全退出 DSH，执行干跑输出的固定提交命令（包含 Soul `--ref`，选了 Flash 时也包含 `--flash-ref`），不要仅去掉 `--dry-run` 后重新跟踪 main。
4. 报告安装完整性及前置配置。仍有阻断项时到此停止，不启动 DSH；后续处理由用户另外决定。
5. 请用户打开 DSH，按阶段 C 的 C1、C2（有新装 mcp-hub 的再加 C9；这次 Soul preset 从独立包搬进 profile 的再加 C10）验，再让 agent 调用 `agent_soul_check`（memory 参数给 `<DSH 家目录>/dsh-soul/memory`，不是下面的 hub），期望 0 错。
6. 有问题就回滚：更新前的原样在安装包的 `archives/<主机>-<家目录指纹>/<时间>-update-…/`，照里面的 `还原方法.txt` 拷回去。

**脚本会自己停的**（安装包还不认识作者这一版的结构，要先 `--kit-iterate` 迭代安装包）：上游缺了安装需要的文件、零件删掉了或改成了安装包不认识的名字、源 preset 结构变了派生不出来。
**保留原文并报告的**：上游源码缺文件、包外导入、语法错误、注册 id 撞车、加载名找不到。仅记录证据和影响，不替作者修改源码；有阻断项时不能继续启动验收。
**干跑提示「本机代码看起来手工把上游作者的称呼换成了 …」时**：说明以前手工改过名、安装记录里没记。照提示加 `--rename 爀曦=<称呼>` 重新干跑，确认「本机改过」里不再有改称呼的文件，再真跑。
**要报给用户但不用停的情况**：某个包用到 `@deepseek-ai/*` 却没在 `peerDependencies` 里声明（宿主是否因此不加载随 DSH 版本而定，验收时确认那个零件的工具或面板出现了，没出现再报给上游）；Soul preset 源文件缺失或 include 未展开的提醒。

### 灵魂 · Flash（可选，上游全部预设）

安装问答中的「灵魂 · Flash（上游全部预设）」代表整组，默认不选。作者 `presets/` 下实际声明几个 agent preset，kit 就迁移几个；不按旧文件名、某个显示名或固定数量筛选。只迁移 preset，不把仓库根 patch 的全局运行时覆盖或其他组件带进 profile。

- **源**：默认跟踪 [LarryE135/dsh-flash-presets](https://github.com/LarryE135/dsh-flash-presets) 的 main。`--flash-ref <标签|分支|提交>` 固定版本，`--flash-source <目录|.tar.gz>` 使用离线源码。每次安装、更新、恢复都重新发现目录；取源或解析失败就停，不静默丢掉已装项。
- **名称与简介**：生成 id 为上游 id 加 `soul-` 前缀（上游 id 没有 `flash-` 前缀时先补上）；显示名是「灵魂 · 上游名称」，与 Soul preset 的风格一致。简介保留上游原文，再追加门牌压缩、裁剪和范围压缩的改造说明。干跑逐项列出名称、id 和简介，不在 kit 里维护作者文案副本。
- **适配**（`lib/flash-presets.mjs`）：压缩、裁剪、范围压缩使用这次导出的 Soul 临时源码 `plugins/*/package.json` 实际包名。当前作者 v3.0.0 使用 `dsh-yanqing-compaction`、`dsh-yanqing-pruner`、`dsh-yanqing-compact-region`（2026-11-03 的 0839f1e 从 `dsh-agent-*` 改名）。其余提示词、工具、开关、预算、阈值保留上游原文；结构对不上、id 重复、简介不是文本时明确停止。
- **开关与记录**：`--update --flash on` 安装整组，`--flash off` 去掉整组。安装记录保存实际生成的全部 id、上游 id、源文件、名称与简介，备份恢复一并携带。动态默认 preset 可用 `--default-preset <本次列出的 id>`。
- **旧记录**：已有方案里的 `soul-ptc-flash` 仍认，作为整组选择值。旧单预设的 `soul-ptc-flash`、`yanqing-ptc-flash` 有对应上游身份时保留旧会话别名。作者改显示名或文件名不改身份时，生成 id 不变；作者移除仍被会话或默认入口引用的 id、或会话无法读取时，先停止并要求明确迁移，不能猜替代项。
- **验收**：对实际安装的各个 Flash preset 新建会话，按阶段 D 验证加载和门牌回取；源码自测和隔离 profile 通过不代表真实模型、压缩与工具执行已验收。

## 十、迁移（备份与恢复）

**备份带什么**（只带 dsh-agent-soul 自己的东西）：

| 带 | 不带 |
|---|---|
| 书房（账本、权威源册、人设、全部文档，空目录也带） | dsh-mnemon 的数据和设置（含热记忆 `USER.md`、`MEMORY.md`） |
| 记忆中枢（`SELF.src.md`、同义词表、中枢脚本、心跳日志；索引不带，恢复时重建） | 其他插件、skills（Soul preset 自带的恢复时从上游重装，你自己的不带）、微信通路（clawbot）的凭据、表情包、附件 |
| 会话原文（门牌 `log:<会话>#seq=` 指向它们，不带就回取不了） | DSH 本身的设置（模型、界面、权限等） |
| 换气账本（`state/dsh-huanqi.json`、`huanqi-turns.jsonl`） | profile 里的插件文件（恢复时从 GitHub 重新装） |
| 本架构插件在 `cordis.patch.yml` 里的设置（memory、huanqi 等）、默认 preset、mcp-hub 的服务器清单、安装记录（含方案、零件、preset，旧版还带心跳字段） | |

备份包是一个 `.tar.gz`，里面的 `manifest.json` 记着来源电脑、各项路径、版本和每个文件的校验值与修改时间；打完会解开逐个核对一遍。

**在旧电脑上备份**：

1. 请用户完全退出 DSH（会话和设置正在写入时打包，可能打出半截文件）。
2. 在安装包文件夹里跑：`install.mjs --backup`（想先看清点结果加 `--dry-run`）。
3. 备份包默认放在安装包的 `backups/` 里，文件名 `dsh-soul-backup-<电脑名>-<时间>.tar.gz`；`--out <目录>` 可以放别处。

**在新电脑上恢复**：

1. 新电脑装好 DSH、打开过一次（profile 要先生成）；把整个安装包文件夹（含 `backups/` 和 `setups/`）拷过去。dsh-mnemon 不在备份里，需要的话在插件市场重新装。
2. 请用户完全退出 DSH，按阶段 A 找到 node。
3. 先干跑：`install.mjs --restore --dry-run`（不写包名就用 `backups/` 里最新的一份；也可以 `--restore <备份包路径>`）。恢复**不用选方案**，按备份里记的来。把计划报给用户。
4. 执行干跑输出的固定提交命令。脚本会：
   - **按备份时的上游版本装**（保证中枢脚本和本体对得上；装好后想升到最新，再跑 `--update`）；
   - 零件、Soul preset、称呼替换都照备份时的装（备份里的心跳时间只作历史，不重新注册任务）；历史状态仅随备份透传，不执行。干跑提示「备份里的中枢脚本把上游作者的称呼换成了 …，备份的安装记录里却没记」时（kit 2.9 以前手工改名打的备份就是这样），加上提示里的 `--rename 爀曦=<称呼>` 再干跑，本体和零件才会和中枢一致；
   - 放回书房、记忆中枢、会话原文、换气账本（连修改时间一起）；记忆中枢配置里的绝对路径换成新电脑的（Mac 和 Windows 互迁也换）；
   - 本架构插件的设置合并进新电脑的 `cordis.patch.yml`（新电脑已有的条目不动）；默认 preset 用备份里的；mcp-hub 清单带回 echo 以外的服务器，echo 按新电脑路径重写；
   - 收尾：中枢来源记录换成本机、重建索引、装配自我层；校验同安装。
5. 报告安装完整性和配置缺项；存在启动阻断项时结束本轮操作，不进入其它工具。
6. 新电脑上**已经有灵魂数据**（账本里有主导记录或 `SELF.src.md` 已填过）时，脚本默认停下。用户确认要覆盖再加 `--force`：原有的书房和记忆中枢先整份存进快照 `archives/<主机>-<家目录指纹>/<时间>-restore-…/pre-restore/`。会话原文和换气账本只补新电脑上没有的，不覆盖。
7. 启动 DSH，按阶段 C 验收；然后让新会话接班，写一条新的 `lead`（脚本最后会给出现成的命令，代数自动接上），再跑 `node memindex.mjs build && node self.mjs`、调用 `agent_soul_check`。期望 0 错；「L1 热记忆」那条警告是因为热记忆属于 dsh-mnemon，不在备份里，等新电脑上的 dsh-mnemon 生成后自己变绿。

**迁不过去的**：
- 账本只能追加，旧记录里写死的 `file:` 绝对路径在新电脑上会失效；`log:<会话>#seq=` 门牌不受影响，照样能回取。
- 备份前已经在 DSH 里删掉的会话，原文本来就没了，指向它的门牌在哪台电脑上都取不回；账本里关于它的记录还在。
- 最后一位主导是旧电脑上的会话，新电脑上要重新任命。
- mcp-hub 里其他服务器的命令和路径是旧电脑的，用不了就在 mcp-hub 面板里改。

## 十一、安装问题的判定

- 先对照同一提交的作者总安装说明与各零件 README。桌面端不能套用 CLI/npm 打包规则。
- 源码里有、安装目录缺：检查 kit 是否完整复制、更新比对是否使用同一文件集合。yantai 的 `env-config.mjs` 和 heartbeat 的配套脚本必须随目录安装，不应通过后续补丁补拷。
- 作者提供环境变量或配置接口：按公开接口配置并核实 DSH Host 生效；不改插件默认路径，不把未配置当代码故障。
- 按作者安装方式仍缺包外依赖、未导入函数或存在语法错误：记录文件、行号、提交和影响；保留来源，阻断启动验收，等待用户另行决定。
- 不得直接修改同级作者仓库或显式 `--source` 目录来消除报告问题，也不得提交第三方适配到作者来源。

## 十二、卸载与回滚

**卸载**（`--uninstall`）把本体、零件、Soul preset、配置、心跳、书房和记忆中枢一起卸掉。动手前先用 kit 打一个备份包，想回来就 `--restore`。

1. **先干跑**：`"$NODE" install.mjs --uninstall --dry-run`。把「清点要卸的东西」「打算怎么做」两段原样报给用户，特别是这几项：要删哪些包、新会话默认 preset 改成哪个、书房和中枢删不删、多少个会话是用 Soul preset 建的。
2. **旧会话问用户**（有用 Soul preset 建的会话时才问）。会话文件开头记着建会话时的 preset id，preset 删了，这些会话多半打不开。三个选项原样给用户选，不要替用户定：
   - `shell` 留空壳 preset：profile 里的 Soul preset 留着，id 不变，名字后面标「（已卸载）」；压缩和裁剪换回官方原版，不依赖本架构的任何包。旧会话照常打开。
   - 旧安装含退役 Flash 时，`shell` 自动改为 `rewrite`，全部 Soul 会话迁到对应官方 preset，不留下 Flash 空壳；无法读取的会话需先处理。
   - `rewrite` 改写旧会话：把会话文件开头的 agentPreset 改成对应的官方 preset（soul / yanqing → standard、soul-cordis / yanqing-cordis → cordis、soul-ptc / yanqing-ptc → ptc、soul-distill / yanqing-distill → minimal、soul-all → ptc、动态 Flash preset、PTC Flash 和退役 Flash 的旧 id 统一回到 ptc）。只改这一个值，会话原样在备份包里。
   - `keep` 不管：preset 全删，旧会话可能打不开；要看时用备份包装回来。
3. **书房和记忆中枢**默认一起删（备份包里有）。用户想留着，就加 `--keep-data`；以后用 `--setup <方案>` 重装，会接着用原来的书房和账本。
4. **真跑**：用户确认后，请用户**完全退出 DSH**，在终端里跑 `"$NODE" install.mjs --uninstall --old-sessions <用户选的>`（要保留书房的照加 `--keep-data`）。你本身是 DSH 里的 agent 时自己跑不了：干跑最后会打印现成的终端命令，交给用户。用户在终端里直接跑 `--uninstall` 的，脚本会一步步问，最后确认才动手。
5. **成功的样子**：最后是「卸载完成」，校验那一步全是 ✓。「需要留意」逐条报给用户。备份包在安装包的 `backups/` 里，文件名以 `-pre-uninstall.tar.gz` 结尾。

卸载按下面的顺序做，出错就停，停之前改过的都有备份：

| 步骤 | 内容 |
|---|---|
| 备份 | 和 `--backup` 同一种包：书房、记忆中枢、会话原文、换气账本、本架构插件的设置、mcp-hub 清单、安装记录。书房和中枢已经不在了（比如上次卸载时删了）又要改写会话的，只把要改的会话单独打一个包 |
| 心跳 | macOS 停掉 launchd 并删 plist（标签是 `com.dsh-soul.heartbeat`，或者调的是书房里的心跳脚本）；Windows 注销计划任务 `dsh-soul-heartbeat`；Linux 上自己加过 cron 的，手动删 |
| 旧会话 | 按用户选的处理 |
| profile 配置 | `package.json` 的 bundles、dependencies、desktopNextDeselectedBundles 去掉本架构的包。`cordis.patch.yml` 去掉本架构插件的配置块（memory、换气面板自建的 huanqi 等）和 Soul preset 那一节（留空壳时换成空壳）；默认 preset 是 Soul preset 的，换回官方的。其他插件的配置不碰 |
| 锁文件 | `pnpm-lock.yaml`、`node_modules/.pnpm/lock.yaml`、`.modules.yaml`、`.package-map.json` 里这些包的条目摘掉。不摘的话，下次在插件市场装东西，pnpm 会照锁文件去找已经删掉的 `file:node_modules/<包>`，整个失败 |
| 本体和零件 | 删掉 node_modules 里的本体、零件（4.3 以前的独立包 `dsh-soul-preset` 也删） |
| DSH 家目录 | mcp-hub 清单里的 echo（清单空了、mcp-hub 也卸了，就连 `mcp-hub/` 一起删）、`hub/echo.config.json` 指针、`state/` 里换气的账本和日志、书房和记忆中枢。书房不在 DSH 家目录里的不删，只提醒 |
| 校验 | 配置和锁文件都能解析，里面没有残留的包名，剩下的包要加载的插件都找得到，默认 preset 存在 |

改动前的配置文件原样存进快照 `archives/<主机>-<家目录指纹>/<时间>-uninstall-…/`。**不碰**：dsh-mnemon（含热记忆）、其他插件、skills、表情包、附件、DSH 本身的设置、`sessions/` 里的会话记录（`rewrite` 只改会话开头那一个值）、安装包文件夹。

卸载以后：

- **装回来**：退出 DSH，跑 `"$NODE" install.mjs --restore <备份包>`。恢复不覆盖本机已有的会话，所以选过 `rewrite` 的旧会话装回来以后仍是官方 preset。
- **留了空壳又不想要了**：再跑一次 `--uninstall --old-sessions rewrite`（或 `keep`）。
- **已经全卸了，旧会话打不开**：先 `--restore` 装回来，再跑 `--uninstall --old-sessions rewrite`。

**回滚**（只想撤回某一次改动，不卸载）：

- **快照在哪**：安装包文件夹的 `archives/<主机>-<家目录指纹>/`，安装、更新、恢复、卸载每做一次留一个 `<时间>-<操作>-<随机码>/`，按 DSH 家目录的相对路径摆放，附「还原方法.txt」和 `manifest.json`。5.3 及以前留在 DSH 家目录里的 `.bak-*`、`dsh-soul/_backup/`，下次真跑时搬进 `legacy/`。快照跟着安装包文件夹走：删了、挪了安装包文件夹，快照也就没了。`backups/` 是另一回事，放的是 `--backup` 打的迁移包。
- **安装、更新的回滚**（先退出 DSH）：照那一次快照里的「还原方法.txt」，把里面的东西拷回原位置覆盖；`manifest.json` 里 `exists` 为 false 的是那次新建的，删掉即可。DSH NEXT 每次正常启动还会在 `<DSH 家目录>/recovery/` 存一份健康快照，也能拿来还原。
- **卸载的回滚**：用备份包 `--restore`；只想撤回配置的，照卸载那次的快照拷回去。
- **方案**在安装包的 `setups/` 里，删掉某个方案只影响以后用它安装，不影响已经装好的电脑。
- **只停心跳**：
  - macOS：`launchctl bootout gui/$(id -u)/com.dsh-soul.heartbeat && rm ~/Library/LaunchAgents/com.dsh-soul.heartbeat.plist`
  - Windows：`Unregister-ScheduledTask -TaskName dsh-soul-heartbeat -Confirm:$false`

## 十三、装完以后

- **换主导**：每个新会话默认只是「执行者」（能记事实，不能许承诺）。用户想让某个会话接班，就让它写一条新的 `lead`（`--ref` 写清是用户哪天指定的），再跑 `node memindex.mjs build && node self.mjs` 让自我层跟上。
- **改人设**：有完整人设的，先改 `soul/65-声音/<名字>-声音.md`，再把需要每轮带着的几条同步进 `memory/hub/SELF.src.md` 的「说话与样子」；没有的直接改那一节。然后让 agent 跑 `node self.mjs`。
- **改方案**：想让以后装出来的不一样，改 `setups/<方案名>/` 里的文件（`setup.json` 管零件、preset；另外两个是权威源册和自我层模板）。已经装好的电脑不受影响，要改就改书房和中枢里的那份。
- **换电脑、换用户名、挪 DSH 家目录**：memory 的配置和路径类补丁不带用户名，跟着家目录走；但中枢主配置 `echo.config.json`、心跳、mcp-hub 里 echo 的命令是按这台电脑写的绝对路径，搬到别处要用第十节的备份恢复，或者在新位置重跑一次安装。
- **改配置**：只改主配置 `memory/hub/echo.config.json`，再复制到 `profile/node_modules/dsh-agent-soul/kit/echo.config.json`（`--update` 也会照主配置重写副本）。
- **换默认 preset**：在 DSH 里直接选，或 `install.mjs --update --default-preset soul`（只能选这台电脑生成了的 preset）。
- **用作者仓库 `tools/` 里的工具体检时**：kit 的装法和作者本机不完全一样，有几条结论要换个读法，别照着它的修法动手：
  - `verify-client-ids.mjs`：kit 每次装完都会跑，结论可信。`verify-live.mjs` 只读，可以跑。
  - `soul-doctor.mjs`（跑之前设好 `DSH_HOME` 环境变量，作者不再猜家目录）：`L0`、`L1/parts`、`L1/pkgintegrity`、`L1/peerdeps` 可信（它现在新旧两种包名都认）。4.3 起 `L2/presets`、`L2/threeparts`、`L2/presetresolve` 也可信（砚青几套写在 profile 里了）；还报 0 个 preset 块的，是 4.3 以前的装法（独立包 `dsh-soul-preset`），跑一次 `--update` 搬过去，**不要**照它说的跑 `soul-preset.mjs build --write`。`soul-preset.mjs verify` 的三件套会误报缺 `dsh-yanqing-*`，以 doctor 为准；内容对不对看 kit 干跑里「Soul preset 的源」那一行（作者删了 `soul-version.json`，没有哈希可核了）。
  - `soul-one-shot.mjs`：压缩、裁剪两行报「没接管」不用管，它还在找 `.agent-presets/`，作者自己写过 0.2.0-rc.2 起这个目录已经不读了。preset 有没有装好用作者给的验法：在新建会话界面切到灵魂 preset，输入 `/compact-region`，能识别就算成功。

## 十四、平台说明

- **一行装**：macOS 用 `install.sh`（`curl … | bash`），Windows 用 `install.ps1`（`irm … | iex`），两边只负责找 node、放好安装包、在终端里启动同一份 `install.mjs`。Mac 上的问答从 `/dev/tty` 读，`curl | bash` 也能一问一答；`install.ps1` 只用 ASCII 字符（Windows PowerShell 5.1 读管道来的脚本可能按本地代码页解码），出错时不关窗口。4.0 的 `install.ps1` 还没在 Windows 上真跑过。
- **各系统用不了的零件**：见 README「两种装法」那张表（原版 model-statusbar 和 yantai 速达依赖 Windows，kit 仅报告兼容性。换气在 Windows 桌面版上也能装：作者 2026-10-31 更正了「桌面版必然失败」的说法，它是新增型零件，走 insert，缺的宿主包由 DSH 从 app.asar 里提供）。脚本按 `process.platform` 提示，不拦。
- **不写死路径**：安装包里没有任何一台电脑的路径。写给人和 agent 读的文件（权威源册、自我层、要贴进新会话的话）里，用户目录下的路径写成 `$HOME/…`，zsh、bash 和 Windows 上 DSH 用的 PowerShell 都认；心跳脚本按相对自己的位置找记忆中枢。必须是绝对路径的只有交给操作系统或别的程序执行的几处（launchd / 计划任务、mcp-hub 的 echo 服务器、`echo.config.json`），安装时在这台电脑上现算，迁移恢复时换成新电脑的。

- **Boss 那台 Mac 和安装包装出来的有两处不同**：心跳是第一次手工安装时建的 `memory/hub/heartbeat.sh`（launchd 用 `/bin/bash` 调它，日志同样写进 `hub/heartbeat/`），安装包现在生成的是 `soul/60-工具/heartbeat.mjs`，效果一样；mnemon-probe 的补丁是早期手工写法，脚本认得，不会重打。排查那台 Mac 的心跳时看 `heartbeat.sh` 和 `~/Library/LaunchAgents/com.dsh-soul.heartbeat.plist`。
- **macOS**：Boss 的 Apple Silicon Mac + DSH NEXT 2.0.19-next（dsh 0.2.1-rc.2）上逐步实测装过一遍，Soul preset 的门牌也实测通过（`/compact` 摘要带门牌、`memq open` 取回原文），v2.0.0 的更新也在这台 Mac 上真跑过：启动正常、mcp-hub 的 echo 连上 3 个工具，自动压缩和裁剪的门牌都在真实会话里出现了。
- **模拟环境里跑通过的**：全新安装、重复跑、从 349b60a 更新到 9899e02、从 9899e02 更新到 v2.0.0（两个零件改名迁移、锁文件换名、补装 mcp-hub、中枢三方比对、重建索引；书房和自我层一个字节没变）、旧版安装包的配置迁移、已是最新时不动；备份与恢复（中文长路径、空目录、会话原文、修改时间、插件设置；换家目录后路径全部改写，`memq open` 用门牌取回了原话；已有数据时停下，`--force` 先备份再覆盖），并用 Boss 那台 Mac 的真备份恢复过一遍，体检 0 错。卸载（2.7）：留空壳、改写旧会话、不管三种都真跑过，配置、锁文件里没有残留，旧会话的 preset 按选的处理，正文一个字没动；卸完再用备份包恢复、留空壳后再卸一次、`--keep-data`、终端里一问一答和中途取消（一个文件都没动）也都跑过。安装包 2.2 的方案：用大肥鱼方案装出来的文件和 2.1 逐个一致（只有时间戳不同）；全新安装的终端问答、回答文件、缺项校验、只装部分零件、只生成一个 preset、不开心跳、中文和英文称呼、完整人设文件都跑过，装完体检 0 错；更新时拒掉的零件不会再补，旧安装记录（没写方案的）能按自我层认出方案。
- **Windows**：按仓库作者的 Windows 脚本和文档写成，**没有在 Windows 上实测**。脚本每一步都有校验，出错会停下并保留备份；遇到问题把输出原文给用户。Intel Mac 的 DSH 自带 node 路径里的 `arm64` 可能是别的名字，用 A3 里的搜索命令找。
