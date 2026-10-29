# 给 Agent 的手册：dsh-agent-soul 安装、更新、迁移与卸载

> **你的任务**：在这台电脑上，给 DeepSeek Harness（下称 DSH）装上 dsh-agent-soul 灵魂架构；已经装过的，按第九节更新到最新版；要把一台电脑上的 agent 搬到另一台，按第十节备份和恢复；要卸掉，按第十二节（先备份再卸）。
> 装成什么样的 agent 由**方案**决定：用现成方案（安装包 `setups/` 里的，例如 Boss 的「大肥鱼」），或者**全新安装**——在对话里引导用户填设定，填完存成新方案再装。
> 安装包只带方案、模板和脚本，插件本体由 `install.mjs` 从 GitHub（cyanwell/dsh-agent-soul）拉**最新版**。作者还在持续更新，所以不锁死版本。
> 适用：macOS、Windows；DSH 桌面版（DSH NEXT），profile 名为 `desktop`。

> 用户要求更新或迭代 **kit 自身** 时，转到 [AGENT-ITERATE.md](AGENT-ITERATE.md)。`--kit-update` 单独检查并同步 kit 的 GitHub 仓库；`--kit-iterate` 先处理 kit 自身更新，再准备插件上游证据，由 Agent 完成四流程分析、代码修改和验证，再用 `--kit-accept` 登记；不属于本手册的本机插件更新流程。

## 一、规矩（动手前先读）

1. 称呼用户按用户自己说的来；不知道就先问。用「大肥鱼」方案时，用户是 **Boss**。本手册涉及本机安装与数据操作的阶段开始前，用一两句话告诉用户要做什么，等用户确认后再动手。kit 源码迭代的授权与验证范围见 `AGENT-ITERATE.md`。
2. 只按本手册做。脚本报错就停下，把输出原文给用户看，不要自己绕过或手工补救。每次运行的输出也会存进本文件夹的 `logs/`。
3. **不要**用 `dsh plugin add` 安装，也**不要**运行仓库作者的 `install-desktop.ps1`：桌面版 profile 不接受 CLI 安装，作者脚本也不包含这里的修正。
4. 作者仓库自带的安装与体检工具**不是给本安装包用的**，不要拿它们的结论改配置。本手册说的 `install.mjs`、`AGENT-INSTALL.md` 一律指安装包文件夹里的这两份：
   - `tools/soul-one-shot.mjs --fix` 只认旧版的 `.agent-presets` 目录，在 DSH NEXT 上会把已经接管的压缩 / 裁剪误报成「没接管」；
   - 2026-10-28 起作者仓库根目录也有同名的 `install.mjs`、`AGENT-INSTALL.md`，连同 `tools/soul-doctor.mjs`、`tools/soul-preset.mjs`、`presets/`，管的是作者本机的「砚青」preset 和 `dsh-yanqing-*` 零件。这些零件不在仓库里，没设 `DSH_HOME` 时默认家目录还是作者的 `D:/AI/dsh/home`。拿它们查本安装包装好的 profile，会固定报 `L1/parts`、`L2/presets`、`L2/threeparts`、`L2/presetresolve` 失败，这是口径不同，不是没装好。它的 `apply` 会因 `L1/parts` 不过而拒绝动手；直接跑 `soul-preset.mjs build --write` 则会把引用了不存在零件的砚青 preset 写进配置。
5. **不要**新建 `~/.mnemon` 目录：dsh-mnemon 把它当默认全局目录，凭空建出来可能让它换地方读写。
6. 要退出、重开 DSH，都请用户来操作，并等用户确认已经做完。脚本真跑（不带 `--dry-run`）时 DSH 必须完全退出。
7. **全新安装的设定只能由用户来定**：名字、称呼、硬线、人设、要不要哪个零件，一律问用户，不要替用户编。用户说「随便」「默认」的，就用问题清单里的默认值，并告诉用户用了哪个。

## 二、装完是什么样（验收目标）

| 项 | 内容 |
|---|---|
| 本体 | `dsh-agent-soul`，GitHub main 的最新提交（装到哪一版记在安装记录里）。DSH 里会多出 8 个 `agent_soul_` 开头的工具 |
| 必装零件 | compaction（压缩摘要带门牌）、pruner（裁剪带门牌）、memory（每轮注入时钟、自我层和上下文水位）、echo（体检面板，包名 dsh-yanqing-echo）。按上游零件清单标 ✓ 的定，不能跳过 |
| 可选零件 | Ⅰ/Ⅱ 层：mnemon-probe（热记忆容量，要先装 dsh-mnemon）、clock（侧边栏时钟）、huanqi（换气：思考退化的打断和清创）、huanqi-panel（换气面板，包名 dsh-yanqing-huanqi-panel，要和 huanqi 一起装）、mcp-hub（MCP 服务总入口，接上 echo 的常驻检索）；面板件：model-statusbar（本地模型服务状态，要有 ComfyUI 一类服务）、mobile-adapt（手机竖屏适配）、riji（日记入口）、splash（启动一屏）、yantai（工作台：水位 / 未结 / 账本 / 门）。装哪些按方案；大肥鱼方案装前五个，后五个默认不勾 |
| Soul preset | 砚青 / 砚青创造 / 砚青 PTC / 砚青蒸馏，使用上游 `presets/` 原文；按作者算法展开 include，并核对 `soul-version.json` 哈希。生成哪些、默认用哪个按方案；大肥鱼默认装四套、默认砚青 |
| 默认不装的面板件 | model-statusbar、yantai、mobile-adapt、splash、riji —— 已进可选列表，默认不勾；它们装完没有数据源就是空面板，所以不默认装。上游以后新增的零件，脚本只列出来、提示更新安装包，不会自动装 |
| 书房 / 中枢 | `<DSH 家目录>/dsh-soul/soul` 和 `<DSH 家目录>/dsh-soul/memory` |
| 第 0 步 | `soul/00-authority.md` 权威源册（按方案填好；「检索能否指回原文」一项要在这台电脑上实测后再填） |
| 自我层 | `memory/hub/SELF.src.md`：agent 的身份、硬线、说话方式、门 |
| 人设完整版 | 方案带完整人设时放在 `soul/65-声音/<名字>-声音.md`（大肥鱼方案是 `大肥鱼-声音.md`） |
| 心跳 | 按方案：每天定时重建索引、装配 SELF.md、跑体检（大肥鱼方案 12:00） |
| 记忆检索 | `memq` 命令（任何时候都能用）；装了 mcp-hub 的，会话里还有常驻内存的 `mcp__echo__echo_search` 等工具，快一个数量级 |
| 安装记录 | `<DSH 家目录>/dsh-soul/.install-state.json`：装的是哪个提交、用的哪个方案、装了哪些零件、哪些是用户拒掉的、生成了哪些 preset、心跳设置。更新靠它 |
| 最终体检 | **0 错**；警告只剩「门牌回取」「压缩机制」两条：要等第一次压缩发生才会变绿，不是故障。没开心跳、没装换气的，对应那项也会是提醒 |

`<DSH 家目录>`：macOS 是 `~/.dsh`；Windows 通常是 `C:\Users\<用户名>\.dsh`。设置过环境变量 `DSH_HOME` 的，以它为准。

## 三、文件夹里有什么

```
README.md                    给人看的说明
AGENT-INSTALL.md             本手册
install.mjs                  安装 / 更新 / 备份 / 恢复 / 卸载脚本（跨平台，可重复跑，先 --dry-run）
lib/                         install.mjs 用的模块：Soul preset 生成与迁移、路径自动定位、人设规矩、发布清单核对、卸载规划、kit 迭代
tests/                       回归测试：node --test tests/*.test.mjs
setups/                      方案：每个子文件夹一套
  大肥鱼/
    setup.json               名字、称呼、硬线、人设类型、零件、preset、心跳
    00-authority.md          权威源册（手写）
    SELF.src.md.tpl          自我层模板（手写；{{HUB}} 由脚本换成本机路径）
    大肥鱼-声音.md            人设完整版
  <全新安装存下的方案>/        结构一样，文件由模板生成，可以直接改
assets/
  templates/                 全新安装用的通用模板：权威源册、自我层、心跳脚本
  presets/ptc.patch.yml      官方 PTC 的快照（找不到本机 DSH 的 app.asar 时才用）
  presets/standard.patch.yml 官方「标准」预设的快照（同上）
  presets/minimal.patch.yml  官方「极简」预设的快照（同上）
  presets/cordis.patch.yml   官方「Cordis」预设的快照（同上）
  presets/preset-yanqing*.yml、_shared/   上游砚青四套的快照（离线安装时用）
  presets/soul-version.json  作者给砚青四套记的哈希和契约版本（离线时拿它核对）
  parts/                     零件仓 organs 的快照：换气、compact-region（离线时用，提交号见 parts/SOURCE.json）
logs/                        每次运行的输出（脚本自动建，可以删）
backups/                     --backup、--uninstall 打出的备份包（迁移时连同文件夹一起拷走）
```

模板里的记号：`{{名字}}` 换成值；行首 `{{?条件}}` / `{{!条件}}` 表示条件成立 / 不成立时才保留这一行。名字、称呼、硬线、人设在生成方案时填好；路径、心跳时间、这台电脑有没有 dsh-mnemon 留到安装时按电脑填。

## 四、阶段 A：准备（只读，不改任何东西）

**A1. DSH 已安装，并且至少打开过一次。** 检查 profile 是否存在：

- macOS：`ls ~/.dsh/profiles/desktop/package.json`
- Windows（PowerShell）：`Test-Path "$env:USERPROFILE\.dsh\profiles\desktop\package.json"`

不存在就请用户先打开一次 DSH。

**A2. dsh-mnemon（建议装）。** 这套架构「可复用结论」那一层靠它，mnemon-probe 也只有装了它才有用。没装的话问用户要不要先在 DSH 插件市场装上、随便聊一句让它生成数据目录；不装也能继续，全新安装时 mnemon-probe 不会出现在选项里，自我层里也不写 mnemon 那一节。

**A3. 一个 node（18 以上）。** 不用手动找路径。脚本自己按「DSH 自带 → 当前进程 → PATH → 常见安装位置」的顺序找；当前这个版本不够时会自动换一个合格的、把自己重跑一遍。心跳、MCP 的 echo、开机自启这些要长期用的配置，优先写 DSH 自带的那个 node —— 它不依赖用户的 PATH，DSH 换版本重跑一次安装就会跟着更新。

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

**A4. 把整个文件夹放到一个固定位置**（例如「文稿」或「文档」下）。路径里有空格、有中文都没关系。

**A5. 网络。** 脚本要从 GitHub 下载源码（约 16MB）。它会自动用 `HTTPS_PROXY` 等环境变量或系统代理（macOS 读系统设置，Windows 读 IE 代理设置）。下载失败时二选一：

- 加 `--proxy http://127.0.0.1:<端口>` 走代理重跑；
- 请用户用浏览器打开 `https://github.com/cyanwell/dsh-agent-soul/archive/main.tar.gz` 下载，再加 `--source <下载的文件>` 重跑（也可以是 `git clone` 下来的文件夹）。

## 五、阶段 B：选方案并安装（跑脚本）

下面的命令在本文件夹里执行；macOS 写成 `"$NODE" install.mjs …`，Windows 写成 `& $NODE .\install.mjs …`。

**B1. 问用户怎么装**，二选一：

- **用现成方案**：`setups/` 里已有的（大肥鱼，或以前全新安装存下的）。把每个方案的 `setup.json` 里的名字、称呼、零件给用户看，让用户挑。
- **全新安装**：按 B2 一步步问。

用户自己在终端里装也可以：直接跑 `"$NODE" install.mjs`，脚本会在终端里列出方案、一问一答，最后给总结、确认后才动手。这条路不用你做 B2、B3，只需要在旁边答疑，装完从阶段 C 接着做。

**B2. 全新安装：在对话里问设定。**

1. 跑 `install.mjs --questions`，拿到问题清单（JSON）。里面有：
   - `用法`：步骤说明；
   - `detected`：这台电脑有没有 dsh-mnemon、已有哪些方案；
   - `questions`：每题的 `id`、`group`（分组）、`ask`（问题）、`hint`（说明）、`options`（选项和每个选项的 `desc`）、`default`、`askIf`（只在条件成立时问）；
   - `answersExample`：回答文件的样子。
2. 按分组一组一组问，不要一次把十几个问题全倒给用户：
   - **身份**：agent 叫什么、怎么称呼用户、要不要把上游代码里作者的称呼「爀曦」换成用户的称呼（默认换）、补充说明、用途；
   - **硬线**：从五条内置硬线里勾（把每条的规则念给用户听），再问要不要自己加；
   - **人设**：不设 / 写几句说话风格 / 再附一份完整人设文件；
   - **运行**：多会话、上下文窗口、生成哪几个 Soul preset、默认用哪个、心跳开不开、几点；
   - **零件**：必装的四个直接告诉用户；可选的十个逐个问（分一组两次也行），每个都把「装了有什么、不装会怎样」说清楚。后五个是面板件，默认值是不勾；model-statusbar 要先确认用户本机有没有本地模型服务，riji / yantai 的数据源（日记目录、账本、memq）由安装流程自己接好；
   - **保存**：方案名（默认和 agent 名字一样）。
3. 把回答写成一个 JSON 文件（建议放在 `logs/answers-<名字>.json`），键名就是题目的 `id`。用户没表态的题可以不写，脚本按默认值处理。完整人设文件写它的路径（`personaFile`），脚本会原样拷进方案和书房。

**B3. 先干跑**，只报计划、不改任何文件（会下载源码到临时目录，跑完就删）：

- 现成方案：`install.mjs --setup <方案名> --dry-run`
- 全新安装：`install.mjs --fresh --answers <回答文件> --dry-run`

回答缺项或不合规时，脚本会在「选方案」那一步列出每一处问题（比如没填名字、选了 huanqi-panel 没选 huanqi、没装 dsh-mnemon 却选了 mnemon-probe），就着问题回去问用户，改好再干跑。通过后，把「方案」那一段总结原样给用户看，再报：装的是哪个提交、和安装包验证过的版本是否一致、「需要留意」里的每一条。

**B4. 真装**：用户确认后，请用户**完全退出 DSH**（macOS 按 `Cmd+Q`，点红色按钮只是关窗口；Windows 连托盘图标也要右键退出），然后去掉 `--dry-run` 再跑同一条命令。

- **你本身就是 DSH 里的 agent 时**（例如在大肥鱼的会话里装）：干跑可以在会话里跑；真跑要 DSH 完全退出，你自己跑不了。干跑结束时脚本会打印现成的终端命令，交给用户在终端里跑（不要改成别的写法）。用户重开 DSH 以后，你所在的这个会话还是装之前的 preset，**阶段 C 的验收和阶段 D 都要在新建的会话里做**：告诉用户新建会话、看顶部 preset，再把脚本最后打印的那段话贴进新会话。
- 全新安装真跑时，设定先存成 `setups/<方案名>/`；中途出错的话改用 `--setup <方案名>` 重跑，不用再问一遍。
- 脚本说「无法自动判断 DSH 是否已退出」时，先向用户确认 DSH 已完全退出，再加 `--confirm-quit` 重跑。
- 其他可选参数：`--ref <提交>`（装指定版本）、`--default-preset yanqing`（覆盖方案里的默认 preset）、`--heartbeat-time HH:MM`、`--no-heartbeat`、`--skip-part <零件>`（只能跳可选零件）、`--rename <上游称呼=称呼|none>`（覆盖方案里的称呼替换）、`--dsh-home <目录>`（必须是已经含 `profiles/<profile>/package.json` 的 DSH 家目录；给相对路径会先解析成绝对路径，指错时直接停下，不会改用别的家目录）。
- **称呼替换**：上游代码里写着作者本人的称呼「爀曦」，其中一处是换气熔断时注入给 agent 的指令「告诉爀曦『需要手动压缩』」。方案的 `nameMap`（大肥鱼方案是 `爀曦 → Boss`）决定装进 DSH 的插件代码和文档里换成什么；书房和账本不动。它记进安装记录，以后更新、备份、恢复都照做。

**B5. 脚本做的事**（每一步都会先备份；已经做过的会跳过，重复跑安全）：

| 步 | 做什么 | 为什么 |
|---|---|---|
| 0 | 预检：node 版本、找 DSH 家目录和 profile、DSH 是否已退出 | 前提不满足就停，什么都不改 |
| 1 | 选方案：读现成方案并校验，或校验回答、生成新方案并存进 `setups/` | 装什么、装成谁，在动手前定死 |
| 2 | 下载并检查上游源码（缺文件、零件改成不认识的名字就停）；按方案生成 Soul preset 并校验 | 源码不对就停 |
| 3 | 备份 `package.json`、`cordis.patch.yml` 为 `*.bak-<时间>-pre-soul-kit` | 出问题能还原 |
| 4 | 本体、必装零件、方案里选了的可选零件，按各自的发布清单拷进 `profile/node_modules/`（不带演示视频） | 桌面版只能这样装 |
| 5 | 修复（kit 修复清单 `lib/fixes.mjs`，3.0 起）：逐条看问题在作者这一版里还在不在，还在才修。包括 mnemon-probe 默认路径、clock 面板定位、mcp-hub 清单目录、memory 相对路径与上下文水位、yantai / riji 的书房和日记路径、echo / 换气面板的加载名与自建一节、换气和 compact-region 的诊断日志路径与两处行为修复、换气配置的字符串布尔。路径类修复都是插件运行时自己找 DSH 家目录，不写任何一台电脑的绝对路径；以前写死了路径的旧写法会换成现行写法。输出里每条一行，「需人工核对」「本机改过」的会写进「需要留意」 | 见第十一节 3、4、16、17、23 和第九节「修复」 |
| 6 | 生成 `node_modules/dsh-soul-preset`：按方案生成上游砚青四套；移除旧 Flash，旧会话与默认入口迁到砚青 PTC（正文保留，迁移前备份，失败回滚） | 会话用的是 preset 里那份压缩，只有在 preset 里换才生效（第十一节 8） |
| 7 | `package.json`：本体、零件（compaction、pruner **不进**）、dsh-soul-preset 进 bundles；全部写进 dependencies（`file:node_modules/<包名>`）。`cordis.patch.yml`：memory 配 `selfPath: dsh-soul/memory/hub/SELF.md`、`statePath: dsh-soul/memory/hub/state.json`（相对 DSH 家目录，Mac、Windows 同一份）、`maxBytes: 12288`；已有的这一节会核对，指向别的电脑或旧写法的路径改成这台的；默认 preset 按方案 | 写进 dependencies 才不会被 pnpm 清掉；自我层上限要和装配预算对齐；配置里不带用户名，换电脑、挪家目录都不用改 |
| 8 | 装了 mcp-hub 的：清单 `<DSH 家目录>/mcp-hub/servers.json` 里加一台 echo（stdio，命令是本机 node + 中枢里的 `echo-mcp.mjs`）；已有就不动 | 记忆检索走常驻服务 |
| 9 | 放权威源册（方案里的，填上本机路径）→ `init.mjs` 按方案的回答生成其余骨架 → `install-kit --all` 把脚本装进 hub（再补上同义词表 `synonyms.json`）→ 挪走 `test-self-check.mjs` → 写配置（一主、一副本、一指针） | 第 0 步 + 记忆中枢 |
| 10 | 写入 `SELF.src.md`（方案里的模板，填上本机路径）→ `scaffold --apply` 搭骨架 → 方案带完整人设的放进 `65-声音/` | plan 的第 2、3 步 |
| 11 | 心跳：写 `soul/60-工具/heartbeat.mjs`；方案开了心跳的，macOS 注册 launchd，Windows 注册计划任务（用电池也照跑，错过会补跑），并立刻触发一次 | 每天自动刷新索引和自我层 |
| 12 | 校验：package.json 合法、各个包到位、注册 id 不撞车且面板 id 等于包名、**每个包要加载的插件都在 node_modules 里找得到**；写安装记录（含方案、拒掉的零件） | 任何一条不对都会让 DSH 一启动就崩或面板加载失败 |

**B6. 成功的样子**：最后是「文件层面的安装完成」；开了心跳的，心跳那一步显示「已注册……并已手动触发一次」。「需要留意」里出现的提醒，逐条报给用户。最后一段「接下来」里有一整段要贴进新会话的话（主导、第一条账、重建索引、装配自我层、体检、门牌实测），原样交给用户。

## 六、阶段 C：启动验收

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
| C8 | 插件市场「已安装」里看 dsh-agent-compaction、dsh-agent-pruner | 显示「已停用」，**这是正常的**：它们由 Soul preset 调用，不在 bundles 里。不要打开，也不要卸载 |
| C9 | （装了 mcp-hub）用户打开侧边栏的 mcp-hub 面板；DSH 启动几秒后，让 agent 列出名字以 `mcp__echo__` 开头的工具 | 面板里 echo 是已连接；工具有 echo_search、echo_open、echo_stats。刚启动一两秒内还没连上属正常（它是后台连接） |

## 七、阶段 D：在装完后新建的会话里完成剩下几步

这几步**必须由 DSH 里的 agent 来跑**：账本要记下是哪个会话写的，装配 SELF.md 要用当前会话 ID 和本地时间，外面代跑会写错。

**而且必须是装完、重开 DSH 之后新建的会话。** 会话的 preset 在新建会话时就定了：装之前开的会话（包括在 DSH 里跑这次安装的那个）不会自己换成 Soul preset，在里面做门牌实测，压缩走的是内置那套，只会看到「没有门牌」的假结论；主导也应该是用 Soul preset 跑的那个会话。

**D1.** 请用户新建会话，先看会话顶部的 preset：应该是方案的默认 Soul preset（大肥鱼方案是「砚青」）。不是的话，在新建会话时手动选上再开始。

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
- **正确结果**：`agent_soul_check` **0 错**；警告只剩「门牌回取」「压缩机制」（还没发生过压缩）。方案开了心跳、却还有「心跳」警告的，说明定时任务没注册上，看阶段 E。

**D2. 门牌实测（Soul preset 真的接管了没有）**：**在 D1 的这个新会话里**再聊两三句，让它读一个文件，然后用户输入 `/compact`。看到「Compacted … history items」后，让 agent 把压缩摘要第一块原样贴出来：应以「⛬ 压缩索引（非原文） · log:session-…#seq=…」开头。再让它跑 `node memq.mjs open log:<那个会话>#seq=<那个数>`，能翻出原话，就把 `soul/00-authority.md` 第七节「检索能否指回原文」那一项填成「能」，并写上这次的实测。
- 摘要开头不是「⛬ 压缩索引」：先看这个会话顶部的 preset 是不是 Soul preset（第十一节 22），再看第十一节 8、21。
- 工具输出裁剪只在自动压缩时才会发生，手动 `/compact` 不触发；等第一次自动压缩后，看被裁掉的工具输出里有没有「原文在 append-only 会话日志 seq N」。

## 八、阶段 E：心跳验收（方案开了心跳才做）

- 看 `<HUB>/heartbeat/` 下有没有当天的 `.log`，里面三段的「退出码」都是 0，体检那段「心跳（自律神经）」是 ✓。
- 确认定时任务在：
  - macOS：`launchctl print gui/$(id -u)/com.dsh-soul.heartbeat | grep -E "state|runs|last exit"`
  - Windows：`Get-ScheduledTask -TaskName dsh-soul-heartbeat`
- 脚本没注册成功时手动补：
  - macOS：`launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.dsh-soul.heartbeat.plist && launchctl kickstart gui/$(id -u)/com.dsh-soul.heartbeat`
  - Windows：右键 `soul\60-工具\register-heartbeat.ps1` →「使用 PowerShell 运行」，或执行 `powershell -NoProfile -ExecutionPolicy Bypass -File "<路径>\register-heartbeat.ps1"`
- 过了定时的时间却没有当天的日志：多半是那时电脑关机了（macOS 睡眠中错过的会在唤醒时补跑，关机错过的不补），或者定时任务没加载。

## 九、更新

**什么时候更新**：作者 GitHub 上有新提交时；DSH 本身升级后核对插件与砚青四套的兼容性。安装、更新、恢复和完整修复会清理旧 Flash；`--fix-only` 只处理指定条目。迁移前检查普通与 zstd 会话，无法读取时停止，不直接删除旧入口。

**更新会动的**：
- profile 里的本体、已装的零件（只换有变化的，换上作者原版）、dsh-soul-preset（只重新生成原来装的那几个 preset）；换完自动跑「修复」一步（见本节末尾「修复」）。compact-region 从零件仓 `cyanwell/dsh-agent-organs` 取；换气取哪个仓库由修复清单 `src-huanqi-organs` 判定（主仓那份不调 `/compact-region` 就取 organs），其余零件从主仓取；
- **零件改名时自动迁移**：装新名字的目录、删旧目录（先整份备份），`package.json` 的 bundles 原位换名、dependencies 换名，三个锁文件（`pnpm-lock.yaml`、`node_modules/.pnpm/lock.yaml`、`node_modules/.modules.yaml`）同步换名；
- **安装包后来加的零件**：在终端里跑，脚本会逐个问装不装；agent 跑时，干跑报告里会写「会装上；不要就加 --skip-part <零件>」，问过用户再决定加不加。拒掉的会记进安装记录，以后更新不再补。必装零件和 Soul preset 要调用的零件（压缩三件套 compaction、pruner、compact-region）不问、不能跳过，本机没有就补上，缺了 preset 加载失败、DSH 起不来；
- **旧会话用的 preset 别名**：会话开头记着建会话时的 preset id。Soul preset 换了 id（例如 2.11 起 standard-soul、cordis-soul 换成砚青四套），还有会话在用的旧 id 会留一个别名，内容和对应的新 preset 一样，名字标着「旧会话用」，新会话别选。干跑里「Soul preset」那段会列出别名和在用的会话数；要去掉的 preset 还有会话在用时，脚本会写进「需要留意」，先停下；
- 中枢脚本：`echo-doctor.mjs`、`echo-config.mjs` 用上游的 `install-kit` 换新；其余脚本做**三方比对**——中枢里的和旧版上游一模一样（本机没改过）就换成新版，本机改过的不动、只列出来，上游新加的文件补上；检索脚本换了就顺手 `memindex build` 重建索引；
- kit 里的配置副本（照主配置重写）；`package.json` / `cordis.patch.yml` 里不对的地方（例如旧版安装包写的根层禁用会被去掉）。
- **称呼替换照安装记录做**：上游源码一拿到就先换好称呼，再拿去比对和安装，所以换过的称呼不算变化、也不会被冲掉。要改就加 `--rename 爀曦=<称呼>`，关掉加 `--rename none`（只换回本体和零件；中枢脚本按本机改过保留）。
- **修复清单的跳过设置照安装记录做**（`fixSkip`）：例如压缩摘要模型 `preset-summary-model` 默认去掉作者写死的 `summarizationProvider: deepseek-official` / `summarizationModel: deepseek-flash`、跟会话模型走（见第十一节 25）；要照作者原样加 `--fix-skip preset-summary-model`（2.17 的 `--summary-model author` 也还认），记进安装记录，以后更新照做；
- **作者契约版本**：上游的 `soul-version.json` 里有一行 `contracts`。作者原话：「零件版本怎么变，只要契约版本没变，就不需要迁移器」。脚本把它记进安装记录，下次更新拿来比；干跑里出现「★ 作者的契约版本变了」，就是要迁移的大更新，先停下，读上游 README 的更新记录，跟用户确认迁移办法再真跑。同一处还会核对砚青四套和作者记的哈希，对不上会写进「需要留意」；
- **怎么分清本机改的和上游改的**：脚本会额外下载「已装那一版」的上游源码当基准（离线更新用 `--base-source <那一版的源码>` 给），本体和零件的变化分成「上游改的」和「本机改过、这次会换回上游版的」两类列出来；中枢脚本也按它判断本机改没改过。取不到基准时脚本会写进「需要留意」，这时报告里的变化分不清来源，中枢里和本体一起被改过的脚本也会被当成没改过换掉。

**更新不动的**：方案（不用选，也不会重新生成书房和自我层）、书房（含账本 `02-墨.jsonl`、权威源册、人设）、`SELF.src.md`、主配置 `memory/hub/echo.config.json`、中枢里本机改过的脚本、mcp-hub 清单里已有的 echo、心跳、默认 preset（除非加 `--default-preset`）、用户拒掉的零件。

**步骤**：

1. **先干跑**（DSH 开着也可以）：`install.mjs --update --dry-run`。
2. **把「1. 上游改了什么」整段报给用户**：从哪个提交到哪个提交、提交列表、README 更新记录最近几条的标题（那是上游作者的开发日志，有的写的是作者本机或别的仓库，例如砚青 preset、`/compact-region`；实际会换什么以本体和零件的文件变化为准）、本体和每个零件**上游改了**哪些文件、**本机改过、会换回上游版的**有哪些（要特别指出来，问用户要不要保留）、有没有零件改名、有没有新加的零件（问用户要不要）、中枢哪些脚本会换 / 会新增 / 本机改过不动、Soul preset 会不会重新生成、「需要留意」。说「已经是最新」就到此为止。
3. 用户确认后，请用户**完全退出 DSH**，去掉 `--dry-run` 真跑（用户不要新零件的，加上 `--skip-part <零件>`）。
4. 请用户打开 DSH，按阶段 C 的 C1、C2（有新装 mcp-hub 的再加 C9）验，再让 agent 调用 `agent_soul_check`（memory 参数给 `<DSH 家目录>/dsh-soul/memory`，不是下面的 hub），期望 0 错。
5. 有问题就回滚：更新前的整份拷贝在 `<DSH 家目录>/dsh-soul/_backup/<时间>-update/`，里面有 `还原方法.txt`。

**要停下问用户的情况**：干跑里出现「★ 作者的契约版本变了」（脚本不会自己停，你要停）。**脚本会自己停的**：上游缺了安装需要的文件、零件删掉了或改成了安装包不认识的名字、上游包的发布清单不自洽（入口导入的文件没列进 `files`，照清单装上就缺文件）、源 preset 结构变了派生不出来、装完发现有包要加载的插件找不到。脚本会建议先用 `--ref <安装包验证过的提交>` 装回验证过的版本；要跟上就得先更新安装包。
**干跑提示「本机代码看起来手工把上游作者的称呼换成了 …」时**：说明以前手工改过名、安装记录里没记。照提示加 `--rename 爀曦=<称呼>` 重新干跑，确认「本机改过」里不再有改称呼的文件，再真跑。
**要报给用户但不用停的情况**：「修复」一步里「需人工核对」（作者改写了那段代码，kit 判断不了问题还在不在，没修）和「本机改过」（那个文件被手改过，整个没动）的条目；「作者已修」「改用作者修复」的条目也报一句，说明这几条 kit 不再管了；某个包用到 `@deepseek-ai/*` 却没在 `peerDependencies` 里声明（宿主是否因此不加载随 DSH 版本而定，验收时确认那个零件的工具或面板出现了，没出现再报给上游）；Soul preset 源文件缺失或 include 未展开的提醒。

### 修复（`--fix`，3.0 起）

kit 对上游插件的修改全部登记在 `lib/fixes.mjs`（23 条，每条有固定 id）。安装、更新、恢复装完都会自动跑「修复」一步；想单独查、单独修时用 `--fix`。

**它怎么判断**：每条修复都带「问题长什么样」。先看作者这一版的原文里问题还在不在，再看本机已装的文件：

| 作者原文 | 本机已装的 | 结果 |
|---|---|---|
| 问题还在 | 作者原文 / kit 旧写法 | 打上 kit 修复 / 换成现行写法 |
| 问题还在 | 已是 kit 修复版 | 保持 |
| 作者已修 | 还带着 kit 修复 | 撤掉，换回作者原文 |
| 作者已修 | 作者原文 | 不动 |
| 判断不了（作者改写了那段） | — | 不修，「需人工核对」 |
| — | 本机手改过 | 整个文件不动，「本机改过」 |

**`--fix` 对照的是已装那一版**：上游钉在安装记录里的主仓和 organs 提交号（离线主仓用 `--source <已装那一版的源码>`，organs 用 `--organs-source <对应版本源码>`），作者新改的东西要等 `--update` 才进来。`--fix` 不动本体、不补装零件、不碰中枢脚本和其它配置，只做修复清单里的事（另外按需重新生成 dsh-soul-preset）。

**步骤**：

1. 干跑：`install.mjs --fix --dry-run`。没有要修的会直接说「没有要修的」，并列出每条的结论。
2. 有要修的：把「修复」那一步的输出报给用户——哪几条要打上、换写法、撤掉，有没有「需人工核对」「本机改过」「待选」。
3. 完全退出 DSH 后，在用户已授权的范围内去掉 `--dry-run` 真跑；改动的文件先整份备份到 `<DSH 家目录>/dsh-soul/_backup/<时间>-fix/`。
4. 修后检查 JavaScript 语法、YAML 和加载契约；失败自动还原本次涉及的包、配置、锁文件和安装记录。备份保留在 `transaction/manifest.json` 对应目录。强制杀进程或断电无法运行退出处理器，可按该清单人工恢复。
5. 重开 DSH，新建会话确认 preset，再让 agent 调用 `agent_soul_check`。

**参数**（id 用逗号隔开；`--fix --dry-run` 的输出里每条都写着 id）：

- `--fix-skip <id,…>`：跳过这几条，已装的 kit 修复会撤掉、换回作者原文；记进安装记录，以后安装、更新、`--fix` 都跳过。`--fix-skip none` 清空。包名条目也可跳过；保留作者原包名时，如果作者 preset 仍引用另一个名字，报告会保留加载缺包提示。安装、更新、恢复也能用。
- `--fix-revert <id,…>`：撤掉这几条 kit 修复，并记进跳过清单。
- `--fix-only <id,…>`：这次只处理这几条，装前、文件、配置和 preset 都按此筛选；同一个文件里未选条目的旧写法也保持现状。
- `--fix-reinstall <id,…>`：装前条目（`src-huanqi-organs` 换气取哪个仓库、`name-*` 零件包名）和已装的不一样时，现在就重装对应零件。不加这个参数，终端里会逐条问；agent 跑时干跑报告里会写「待选」，问过用户再决定加不加，不重装就留到下次 `--update`。

安装记录的 `fixRecords` 保存文件/preset 的作者原文和 kit 结果，配置仅保存修改过的行；撤回须与这些证据或旧作者原文匹配。没有记录的旧版布尔配置无法推断原来的引号/空白，不伪造还原内容。

**「本机改过」怎么办**：那个文件被手改过，kit 不知道该不该覆盖。问用户：要保留就不动；需要采用作者版时，先明确核对并保留本机改动，再合并或手动还原作者文件；`--update` 不强行覆盖含手改或未知修复的零件。

## 十、迁移（备份与恢复）

**备份带什么**（只带 dsh-agent-soul 自己的东西）：

| 带 | 不带 |
|---|---|
| 书房（账本、权威源册、人设、全部文档，空目录也带） | dsh-mnemon 的数据和设置（含热记忆 `USER.md`、`MEMORY.md`） |
| 记忆中枢（`SELF.src.md`、同义词表、中枢脚本、心跳日志；索引不带，恢复时重建） | 其他插件、skills、表情包、附件 |
| 会话原文（门牌 `log:<会话>#seq=` 指向它们，不带就回取不了） | DSH 本身的设置（模型、界面、权限等） |
| 换气账本（`state/dsh-huanqi.json`、`huanqi-turns.jsonl`） | profile 里的插件文件（恢复时从 GitHub 重新装） |
| 本架构插件在 `cordis.patch.yml` 里的设置（memory、huanqi 等）、默认 preset、mcp-hub 的服务器清单、安装记录（含方案、零件、preset、心跳） | |

备份包是一个 `.tar.gz`，里面的 `manifest.json` 记着来源电脑、各项路径、版本和每个文件的校验值与修改时间；打完会解开逐个核对一遍。

**在旧电脑上备份**：

1. 请用户完全退出 DSH（会话和设置正在写入时打包，可能打出半截文件）。
2. 在安装包文件夹里跑：`install.mjs --backup`（想先看清点结果加 `--dry-run`）。
3. 备份包默认放在安装包的 `backups/` 里，文件名 `dsh-soul-backup-<电脑名>-<时间>.tar.gz`；`--out <目录>` 可以放别处。

**在新电脑上恢复**：

1. 新电脑装好 DSH、打开过一次（profile 要先生成）；把整个安装包文件夹（含 `backups/` 和 `setups/`）拷过去。dsh-mnemon 不在备份里，需要的话在插件市场重新装。
2. 请用户完全退出 DSH，按阶段 A 找到 node。
3. 先干跑：`install.mjs --restore --dry-run`（不写包名就用 `backups/` 里最新的一份；也可以 `--restore <备份包路径>`）。恢复**不用选方案**，按备份里记的来。把计划报给用户。
4. 去掉 `--dry-run` 真跑。脚本会：
   - **按备份时的上游版本装**（保证中枢脚本和本体对得上；装好后想升到最新，再跑 `--update`）；
   - 零件、Soul preset、心跳时间、称呼替换都照备份时的装；照常打补丁。干跑提示「备份里的中枢脚本把上游作者的称呼换成了 …，备份的安装记录里却没记」时（kit 2.9 以前手工改名打的备份就是这样），加上提示里的 `--rename 爀曦=<称呼>` 再干跑，本体和零件才会和中枢一致；
   - 放回书房、记忆中枢、会话原文、换气账本（连修改时间一起）；记忆中枢配置里的绝对路径换成新电脑的（Mac 和 Windows 互迁也换）；
   - 本架构插件的设置合并进新电脑的 `cordis.patch.yml`（新电脑已有的条目不动）；默认 preset 用备份里的；mcp-hub 清单带回 echo 以外的服务器，echo 按新电脑路径重写；
   - 收尾：中枢来源记录换成本机、重建索引、装配自我层；校验同安装。
5. 新电脑上**已经有灵魂数据**（账本里有主导记录或 `SELF.src.md` 已填过）时，脚本默认停下。用户确认要覆盖再加 `--force`：原有的书房和记忆中枢先整份备份到 `<DSH 家目录>/dsh-soul/_backup/<时间>-pre-restore/`。会话原文和换气账本只补新电脑上没有的，不覆盖。
6. 启动 DSH，按阶段 C 验收；然后让新会话接班，写一条新的 `lead`（脚本最后会给出现成的命令，代数自动接上），再跑 `node memindex.mjs build && node self.mjs`、调用 `agent_soul_check`。期望 0 错；「L1 热记忆」那条警告是因为热记忆属于 dsh-mnemon，不在备份里，等新电脑上的 dsh-mnemon 生成后自己变绿。

**迁不过去的**：
- 账本只能追加，旧记录里写死的 `file:` 绝对路径在新电脑上会失效；`log:<会话>#seq=` 门牌不受影响，照样能回取。
- 备份前已经在 DSH 里删掉的会话，原文本来就没了，指向它的门牌在哪台电脑上都取不回；账本里关于它的记录还在。
- 最后一位主导是旧电脑上的会话，新电脑上要重新任命。
- mcp-hub 里其他服务器的命令和路径是旧电脑的，用不了就在 mcp-hub 面板里改。

## 十一、已知坑（Boss 那台 Mac 上实测撞到的，脚本已处理）

| # | 现象 | 原因 | 处理 |
|---|---|---|---|
| 1 | 往 `~/.zshrc` 或系统里设的环境变量，插件读不到 | DSH 桌面版只从登录 shell 取 PATH、LANG 等少数几个变量 | 所有路径都改用配置文件或改代码默认值，不靠环境变量 |
| 2 | 在插件市场装 / 卸任何插件后，`agent_soul_*` 工具突然读不到配置 | 市场会触发 pnpm 重装整个 profile，按每个包的 `files` 清单重整文件，**清单外的文件、软链接会被删** | 配置副本放在本体的 `kit/` 里（在清单内）；所有包都写进 dependencies，补丁也会保留 |
| 3 | mnemon-probe 每轮报「读盘失败 / 到达上限」 | 它默认找 `~/.mnemon/runtime`，实际在 `<DSH 家目录>/.mnemon/runtime`；或者根本没装 dsh-mnemon | 补丁改默认值（运行时按 DSH 家目录定位）；没装 dsh-mnemon 时全新安装不让选它 |
| 4 | 时钟面板掉出窗口左下角 | 插件 bug：坐标写在了没有定位的外层元素上 | 补丁修定位 |
| 5 | 自我层每轮被截断 | memory 默认上限 8192 字节，作者的装配预算是 12288 | `maxBytes: 12288`；自我层模板控制在约 6KB 以内 |
| 6 | 体检「版本漂移」报红，点名 `test-self-check.mjs` | `install-kit --all` 带进了仓库的测试脚本 | 挪到 `memory/_kit-unused/` |
| 7 | plan 提示的 scaffold 命令跑出来全是「模板缺失」 | hub 里那份 scaffold.mjs 旁边没有模板 | 用插件包 `kit/echo/` 里那份跑 |
| 8 | 装了 compaction / pruner，压缩摘要却没有门牌 | DSH NEXT 每个 preset 自带隔离的 compaction 组，会话用的是 preset 里那份（日志里压缩出自 `include:agent-preset-registry:compaction-basic`，就是这个意思）；排 bundles、根层禁用都只改了根层。preset 嵌在声明里，profile 的 patch 也改不到它。换成我们的实现后这个 id 不变，判断是谁在压缩要看摘要开头（见 21） | 派生 Soul preset，在 preset 里把两个零件换掉（作者 FAQ 3.6 的「路 B」；作者写的 `.agent-presets` 目录 DSH 已经不读了） |
| 9 | 插件市场把 dsh-agent-compaction、dsh-agent-pruner 显示成「已停用」 | 市场按 bundles 判断启用，这两个只在 dependencies 里 | 正常，不要打开（会挂回根层和内置压缩抢名字）、不要卸载（Soul preset 会加载失败） |
| 10 | 插件市场装 / 卸插件报 `ENOENT … .tgz` | 某个插件当初从本地 .tgz 装、之后 .tgz 被删了；pnpm 每次都按锁文件去找它 | 把那个插件的来源改成 `file:node_modules/<包名>`，`pnpm-lock.yaml` 和 `node_modules/.pnpm/lock.yaml`、`node_modules/.modules.yaml` 里的对应条目一起改（Boss 的 Mac 上是 dsh-img-block） |
| 11 | 会话中途切换 preset，日志报 `tool "subagent" is already registered in this scope` | DSH 重组 preset 时的问题 | 不影响对话；把常用的 preset 设成默认，新会话就不用切 |
| 12 | 改了 preset 的 id 以后，用旧 id 建的会话打不开 | 会话按 id 找 preset，找不到直接报错 | 别改已经在用的 preset id；非改不可时（2.11 换成砚青四套），脚本给还有会话在用的旧 id 留别名（2.12 起） |
| 13 | 日志里一串「重复加载 / 路由重复」警告 | 在插件市场把某个插件关了又开，市场会用热加载再挂一份 | 重启 DSH 就会消失，与本安装无关 |
| 14 | Windows 建软链接失败 | 普通用户没有建软链接的权限 | 改写成只含 memory 一项的指针文件 |
| 15 | Windows 上 PowerShell 脚本里的中文路径乱码；计划任务插电池时不跑 | PowerShell 5.1 读无 BOM 脚本按本地代码页解码；计划任务默认「用电池时不启动」 | 注册脚本带 BOM；计划任务设成用电池也跑、错过补跑 |
| 16 | 上游 v2.0.0 起回声面板、换气面板加载失败（「应用无法启动」或面板空白） | 作者把两个包改名为 `dsh-yanqing-echo`、`dsh-yanqing-huanqi-panel`，面板 id 也跟着改了，但它们 `cordis.patch.yml` 里要加载的 `name` 还是旧的 `dsh-agent-*`；DSH 按这个名字去 node_modules 找包，找不到 | 本机修：把那一行改成和包名一致；校验阶段会检查每个包要加载的插件都找得到 |
| 17 | mcp-hub 找不到清单 | 它找 `$DSH_HOME/mcp-hub/servers.json`，环境变量里没有 DSH_HOME 时退到作者机器的 `D:\AI\dsh\home` | 本机改：默认值换成运行时找到的 DSH 家目录 |
| 18 | 作者的常驻检索服务 `echo-svc.mjs` 在 Mac 上用不了 | 它用 Windows 命名管道 | 不启动它；`memq` 连不上会自动退回直接读，快路子走 mcp-hub 的 echo |
| 19 | 下载报 `SSL_ERROR_SYSCALL` / `socket disconnected` | 代理那一刻连不上 GitHub | 过一会儿重跑，或换代理；还不行就浏览器下载源码，用 `--source` |
| 20 | 在 agent 的终端里跑 `install.mjs` 没有提问，直接停在「要先选怎么装」 | agent 的终端不是真终端，脚本不在里面提问 | 照 B1～B3 走：`--setup <方案名>`，或 `--questions` 问完写回答文件再 `--fresh --answers` |
| 21 | 上游 `agent_soul_install` 的 scan 报 dsh-agent-compaction、dsh-agent-pruner「在 node_modules 但不在 bundles —— 等于没启用」，agent 据此以为压缩是内置那套在做，要去「接管」 | scan 只看 bundles，认不出路 B。这两个按设计就不进 bundles，由 Soul preset 在 compaction 组里同 id 换 name 接管（上游源码也把它们列为只能走路 B 的零件） | 误报，不用动配置：别把它们加进 bundles（会和内置的抢名字），也别去改 `~/.dsh/.agent-presets`（DSH NEXT 不读）。判断压缩是谁做的看产物：摘要第一行是「⛬ 压缩索引（非原文）」、被裁的工具输出写着「原文在 append-only 会话日志 seq N」的，是我们的两个包；换气触发的清理压缩走内置，没有这个开头，属正常 |
| 22 | 门牌实测时压缩摘要没有「⛬ 压缩索引」开头，可是体检、配置都对 | 测试用的会话是装之前开的（例如在 DSH 里的 agent 自己跑安装的那个会话）。会话的 preset 在建会话时就定了，旧会话不会换成 Soul preset，压缩走的还是内置那套 | 不是故障。重开 DSH 后新建会话，看顶部 preset 是 Soul preset，再在新会话里测（阶段 D） |
| 23 | 换了电脑、换了用户名或挪了 DSH 家目录以后，自我层「读不到」、mcp-hub / yantai / riji 找不到东西 | 早期版本把 `/Users/<用户名>/.dsh/…`、`C:/Users/<用户名>/.dsh/…` 这样的绝对路径写进了 `cordis.patch.yml` 和插件代码，profile 从别的电脑带过来、或者家目录变了，路径就静默失效；插件只认 DSH_HOME 环境变量，DSH 桌面版不传它 | 现在 memory 配置写相对 DSH 家目录的路径，路径类补丁在运行时自己找家目录（DSH_HOME → 插件所在位置 → `~/.dsh`）。旧电脑带过来的设置和写死路径的旧补丁，重跑安装或 `--update` 会认出来改成新写法；指向这台电脑上另一个确实存在的文件的，当作有意设置不动，只提醒 |
| 24 | 卸载以后，以前的会话打不开 | 会话文件开头记着建会话时的 preset id（`yanqing`、`yanqing-ptc`、`ptc-soul-flash` 等），卸载时选了 `keep`，这些 preset 已经删了 | 用卸载留下的备份包 `--restore` 装回来，再跑 `--uninstall --old-sessions rewrite`（改成官方 preset）或 `shell`（留空壳）。卸载时先看干跑报的「用 Soul preset 建的会话」有几个，再让用户选 |
| 25 | 手动 `/compact` 一律报「Compaction could not produce a useful summary」，体检压缩一栏 start / end 有数、summary 为 0 | 会话日志里 `compaction/end` 的 error 是 `llm-deepseek: no API key for provider route "deepseek-official"`：作者砚青四套在压缩组里写死 `summarizationProvider: deepseek-official`（走 API key），Boss 的 DSH 是 `deepseek-account` 账号登录，没有 DeepSeek API key；88% 的自动压缩用同一份配置，一样压不成 | 修复清单 `preset-summary-model`（2.17 起）：生成 preset 时去掉这两行，和官方预设一样跟会话模型走；本机默认模型本来就走 deepseek-official 时不去掉。有 API key、想照作者写死的，加 `--fix-skip preset-summary-model` |

## 十二、卸载与回滚

**卸载**（`--uninstall`）把本体、零件、Soul preset、配置、心跳、书房和记忆中枢一起卸掉。动手前先用 kit 打一个备份包，想回来就 `--restore`。

1. **先干跑**：`"$NODE" install.mjs --uninstall --dry-run`。把「清点要卸的东西」「打算怎么做」两段原样报给用户，特别是这几项：要删哪些包、新会话默认 preset 改成哪个、书房和中枢删不删、多少个会话是用 Soul preset 建的。
2. **旧会话问用户**（有用 Soul preset 建的会话时才问）。会话文件开头记着建会话时的 preset id，preset 删了，这些会话多半打不开。三个选项原样给用户选，不要替用户定：
   - `shell` 留空壳 preset：dsh-soul-preset 留着，id 不变，名字后面标「（已卸载）」；压缩和裁剪换回官方原版，不依赖本架构的任何包。旧会话照常打开。
   - 旧安装含退役 Flash 时，`shell` 自动改为 `rewrite`，全部 Soul 会话迁到对应官方 preset，不留下 Flash 空壳；无法读取的会话需先处理。
   - `rewrite` 改写旧会话：把会话文件开头的 agentPreset 改成对应的官方 preset（yanqing → standard、yanqing-cordis → cordis、yanqing-ptc → ptc、yanqing-distill → minimal；退役 Flash 的两个旧 id 统一回到 ptc）。只改这一个值，会话原样在备份包里。
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
| profile 配置 | `package.json` 的 bundles、dependencies、desktopNextDeselectedBundles 去掉本架构的包。`cordis.patch.yml` 去掉本架构插件的配置块（memory、换气面板自建的 huanqi 等）；默认 preset 是 Soul preset 的，换回官方的。其他插件的配置不碰 |
| 锁文件 | `pnpm-lock.yaml`、`node_modules/.pnpm/lock.yaml`、`.modules.yaml`、`.package-map.json` 里这些包的条目摘掉。不摘的话，下次在插件市场装东西，pnpm 会照锁文件去找已经删掉的 `file:node_modules/<包>`，整个失败 |
| 本体和零件 | 删掉 node_modules 里的本体、零件、dsh-soul-preset（留空壳时换成空壳），以及更新时留下的 `<包>.bak-…` 旧拷贝 |
| DSH 家目录 | mcp-hub 清单里的 echo（清单空了、mcp-hub 也卸了，就连 `mcp-hub/` 一起删）、`hub/echo.config.json` 指针、`state/` 里换气的账本和日志、书房和记忆中枢。书房不在 DSH 家目录里的不删，只提醒 |
| 校验 | 配置和锁文件都能解析，里面没有残留的包名，剩下的包要加载的插件都找得到，默认 preset 存在 |

改过的配置文件旁边各留一份 `.bak-<时间>-pre-uninstall`。**不碰**：dsh-mnemon（含热记忆）、其他插件、skills、表情包、附件、DSH 本身的设置、`sessions/` 里的会话记录（`rewrite` 只改会话开头那一个值）、安装包文件夹。

卸载以后：

- **装回来**：退出 DSH，跑 `"$NODE" install.mjs --restore <备份包>`。恢复不覆盖本机已有的会话，所以选过 `rewrite` 的旧会话装回来以后仍是官方 preset。
- **留了空壳又不想要了**：再跑一次 `--uninstall --old-sessions rewrite`（或 `keep`）。
- **已经全卸了，旧会话打不开**：先 `--restore` 装回来，再跑 `--uninstall --old-sessions rewrite`。

**回滚**（只想撤回某一次改动，不卸载）：

- **安装的回滚**（先退出 DSH）：用 profile 目录里的 `package.json.bak-<时间>-pre-soul-kit` 和 `cordis.patch.yml.bak-<时间>-pre-soul-kit` 覆盖回去。DSH NEXT 每次正常启动还会在 `<DSH 家目录>/recovery/` 存一份健康快照，也能拿来还原。
- **更新的回滚**：看 `<DSH 家目录>/dsh-soul/_backup/<时间>-update/还原方法.txt`。
- **卸载的回滚**：用备份包 `--restore`；只想撤回配置的，用各文件旁边的 `.bak-<时间>-pre-uninstall` 覆盖回去。
- **方案**在安装包的 `setups/` 里，删掉某个方案只影响以后用它安装，不影响已经装好的电脑。
- **只停心跳**：
  - macOS：`launchctl bootout gui/$(id -u)/com.dsh-soul.heartbeat && rm ~/Library/LaunchAgents/com.dsh-soul.heartbeat.plist`
  - Windows：`Unregister-ScheduledTask -TaskName dsh-soul-heartbeat -Confirm:$false`

## 十三、装完以后

- **换主导**：每个新会话默认只是「执行者」（能记事实，不能许承诺）。用户想让某个会话接班，就让它写一条新的 `lead`（`--ref` 写清是用户哪天指定的），再跑 `node memindex.mjs build && node self.mjs` 让自我层跟上。
- **改人设**：有完整人设的，先改 `soul/65-声音/<名字>-声音.md`，再把需要每轮带着的几条同步进 `memory/hub/SELF.src.md` 的「说话与样子」；没有的直接改那一节。然后让 agent 跑 `node self.mjs`。
- **改方案**：想让以后装出来的不一样，改 `setups/<方案名>/` 里的文件（`setup.json` 管零件、preset、心跳；另外两个是权威源册和自我层模板）。已经装好的电脑不受影响，要改就改书房和中枢里的那份。
- **换电脑、换用户名、挪 DSH 家目录**：memory 的配置和路径类补丁不带用户名，跟着家目录走；但中枢主配置 `echo.config.json`、心跳、mcp-hub 里 echo 的命令是按这台电脑写的绝对路径，搬到别处要用第十节的备份恢复，或者在新位置重跑一次安装。
- **改配置**：只改主配置 `memory/hub/echo.config.json`，再复制到 `profile/node_modules/dsh-agent-soul/kit/echo.config.json`（`--update` 也会照主配置重写副本）。
- **换默认 preset**：在 DSH 里直接选，或 `install.mjs --update --default-preset yanqing`（只能选这台电脑生成了的 preset）。
- **用作者仓库 `tools/` 里的工具体检时**：kit 的装法和作者本机不完全一样，有几条结论要换个读法，别照着它的修法动手：
  - `verify-client-ids.mjs`：kit 每次装完都会跑，结论可信。`verify-live.mjs` 只读，可以跑。
  - `soul-doctor.mjs`：`L0`、`L1/pkgintegrity`、`L1/peerdeps` 可信。`L1/parts` 报缺 `dsh-yanqing-memory` 不用管：作者主仓 memory 包的包名就是 `dsh-agent-memory`，preset 里也不引用它。`L2/presets` 报 profile 里 0 个 preset 块，是因为 kit 把砚青四套放在 `dsh-soul-preset` 包里；**不要**照它说的跑 `soul-preset.mjs build --write`，那会在 profile 里再插一份同 id 的四套。`soul-preset.mjs verify` 同理看不到包里的 preset；内容对不对看 kit 干跑里「哈希逐套对上」那一行。
  - `soul-one-shot.mjs`：压缩、裁剪两行报「没接管」不用管，它还在找 `.agent-presets/`，作者自己写过 0.2.0-rc.2 起这个目录已经不读了。preset 有没有装好用作者给的验法：在新建会话界面切到砚青 preset，输入 `/compact-region`，能识别就算成功。

## 十四、平台说明

- **Boss 那台 Mac 和安装包装出来的有两处不同**：心跳是第一次手工安装时建的 `memory/hub/heartbeat.sh`（launchd 用 `/bin/bash` 调它，日志同样写进 `hub/heartbeat/`），安装包现在生成的是 `soul/60-工具/heartbeat.mjs`，效果一样；mnemon-probe 的补丁是早期手工写法，脚本认得，不会重打。排查那台 Mac 的心跳时看 `heartbeat.sh` 和 `~/Library/LaunchAgents/com.dsh-soul.heartbeat.plist`。
- **macOS**：Boss 的 Apple Silicon Mac + DSH NEXT 2.0.19-next（dsh 0.2.1-rc.2）上逐步实测装过一遍，Soul preset 的门牌也实测通过（`/compact` 摘要带门牌、`memq open` 取回原文），v2.0.0 的更新也在这台 Mac 上真跑过：启动正常、mcp-hub 的 echo 连上 3 个工具，自动压缩和裁剪的门牌都在真实会话里出现了。
- **模拟环境里跑通过的**：全新安装、重复跑、从 349b60a 更新到 9899e02、从 9899e02 更新到 v2.0.0（两个零件改名迁移、锁文件换名、补装 mcp-hub、中枢三方比对、重建索引；书房和自我层一个字节没变）、旧版安装包的配置迁移、已是最新时不动；备份与恢复（中文长路径、空目录、会话原文、修改时间、插件设置；换家目录后路径全部改写，`memq open` 用门牌取回了原话；已有数据时停下，`--force` 先备份再覆盖），并用 Boss 那台 Mac 的真备份恢复过一遍，体检 0 错。卸载（2.7）：留空壳、改写旧会话、不管三种都真跑过，配置、锁文件里没有残留，旧会话的 preset 按选的处理，正文一个字没动；卸完再用备份包恢复、留空壳后再卸一次、`--keep-data`、终端里一问一答和中途取消（一个文件都没动）也都跑过。安装包 2.2 的方案：用大肥鱼方案装出来的文件和 2.1 逐个一致（只有时间戳不同）；全新安装的终端问答、回答文件、缺项校验、只装部分零件、只生成一个 preset、不开心跳、中文和英文称呼、完整人设文件都跑过，装完体检 0 错；更新时拒掉的零件不会再补，旧安装记录（没写方案的）能按自我层认出方案。
- **Windows**：按仓库作者的 Windows 脚本和文档写成，**没有在 Windows 上实测**。脚本每一步都有校验，出错会停下并保留备份；遇到问题把输出原文给用户。Intel Mac 的 DSH 自带 node 路径里的 `arm64` 可能是别的名字，用 A3 里的搜索命令找。