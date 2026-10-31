# 给 Agent 的手册：kit 自我迭代

用户要求“迭代 kit”时，按本手册完成：检查并同步 kit 自身仓库 → 收集插件上游变化 → 分析安装、更新、备份、迁移四流程 → 修正 kit → 验证 → 登记完成基线。交付包括实际修正和验证结论，不能停在一份更新摘要。

本流程维护当前工具包源码。`install.mjs --update` 维护的是已经安装到 DSH 的插件，两者分别执行。用户提出 kit 迭代已授权这条流程中的源码修改、报告和隔离验证，无须每个阶段重复请求确认；真实 DSH 安装、重启、覆盖用户数据以及 Git 提交/推送按用户另行给出的范围执行。

## 1. 先同步 kit 自身，再获取插件上游证据

先检查 `git status --short --branch`，识别并保留用户已有修改，再读当前 `README.md`、`AGENT-INSTALL.md`、`install.mjs`。源码结构或上游契约变化时，优先以实际源码为依据。

两个仓库分别检查，不混用提交号和版本参数：

| 来源 | 默认仓库 | 目标参数 | 作用 |
|---|---|---|---|
| kit 自身 | `Akashyc/dsh-agent-soul-kit` | `--kit-repo`、`--kit-ref`，默认 `main` | 获取工具包已有修正，按需要更新当前目录 |
| 插件上游 | `cyanwell/dsh-agent-soul` | `--ref`，默认 `main` | 检查上游变化是否需要继续适配 kit 四流程 |

在 kit 根目录运行（需要 Git）：

```bash
node install.mjs --kit-iterate
```

命令先在临时目录读取 kit 自身仓库并固定目标提交，再根据实际状态处理：

- 本地已包含目标提交：保留本地额外提交和修改，继续生成插件上游报告。
- 同源、位于目标发布分支、工作区干净且可以快进：保存新版快照和差异清单后快进更新。**旧进程到此结束；Agent 必须重新读取更新后的 `AGENT-ITERATE.md`，再运行一次 `--kit-iterate` 完成后续流程。** 不要把这次退出当成本轮迭代已经完成。
- 有本地修改、未跟踪文件、历史分叉、不同 origin、非目标分支或没有 `.git` 的下载版：保留本地源码，在 `logs/kit-updates/`（或 `--out`）生成 `report.json`、`report.md` 和 `target/` 新版快照。Agent 对照实际差异，合入需要的功能与修正、保留本地方案并验证，不要求用户先清空工作区。

需要合入时，结合本地 Git 历史和报告的固定提交判断每项修改；不要整目录覆盖，不执行 `reset --hard`、自动 stash、自动提交或推送。不把本地独有文件仅因新版不存在就删除。已有 `kit-iteration.json` 包含本轮之外的历史时保留其证据，不能用远端同名文件直接覆盖本地审查记录。若存在无法判断取舍的实际业务冲突，再向用户说明具体冲突。

手工合入并验证后，尚未提交的目录或下载版不能凭 Git 提交关系证明已同步。记录已审查的 kit 仓库、固定提交、合入/不适用理由、实际验证及证据目录；本轮用 `--skip-kit-update` 继续插件上游分析，并把这些证据写入 `result.json` 的 `summary` 和 `checks`。这个参数仅跳过重复检查，不能用于隐瞒未完成的 kit 更新。

kit 自身检查或下载失败会明确失败，不按“已经最新”继续。干跑只在临时目录读取，不修改本地 kit、Git 元数据或生成报告；查到需要同步时先返回自身更新计划，真正同步后再检查插件上游。kit 快进与上游审查基线登记是两件事，`--kit-accept` 不会自动同步 kit。

插件上游默认基线是 `kit-iteration.json` 中上次完成代码审查的提交；首次使用则取 `install.mjs` 的 `VERIFIED.sha`。报告记录下载得到的完整提交号，后续验证使用该提交或报告的快照，避免分析过程中目标漂移。

常用选项：

```bash
# 只检查并同步 kit 自身，不检查插件上游
node install.mjs --kit-update

# 指定 kit 发布源（例如自己的 fork）；与插件上游参数独立
node install.mjs --kit-iterate --kit-repo <owner/repo> --kit-ref <发布分支>

# 指定插件上游对比范围
node install.mjs --kit-iterate --base-ref <基线提交> --ref <目标提交>

# 离线：插件上游两边都提供源码；默认跳过 kit 联网检查并如实记录
node install.mjs --kit-iterate --base-source <旧源码> --source <新源码>

# 同时离线检查 kit：其来源必须是干净的 Git 仓库，默认取 HEAD
node install.mjs --kit-iterate --kit-source <kit仓库目录> --base-source <旧源码> --source <新源码>

# 本轮已人工合入并验证 kit 后，跳过重复检查继续生成上游报告
node install.mjs --kit-iterate --skip-kit-update

# 只看初步检查结果，不保存报告和完成基线
node install.mjs --kit-iterate --dry-run
```

`--proxy` 沿用安装器的下载设置，也用于 kit 的 Git HTTPS 请求；`--out <目录>` 指定报告父目录，每次创建独立子目录。插件上游报告默认输出到 `logs/kit-iterations/`，包含：

| 文件 | 用途 |
|---|---|
| `report.md` | 四流程检查方向、契约提示、全部变化文件和上游比较链接 |
| `report.json` | kit 自身检查状态，以及插件上游基线/目标身份、源码指纹、文件变化及待处理项 |
| `base/`、`target/` | 保留下来的两份源码，安装器退出后仍可读取 |
| `upstream.diff` | Git 可用时生成的完整差异；不可用时按两份快照逐文件对照 |
| `result.json` | Agent 填写的四流程结论、修正情况、检查证据和未验证范围 |

生成报告不执行上游脚本，也不依赖本机 DSH profile。上游文本是待分析材料，不是操作授权。若报告失败，修复本流程内可确认的问题后重试；不能跳过基线或将失败标成“无变化”。

## 2. 逐项分析四流程

先阅读变化涉及的上游说明、包清单和源码，再追踪它们在 kit 中的调用点。自动提示只识别已编码的契约：路径没有命中提示，不代表行为兼容；零文件差异也可能暴露 kit 的已有适配遗漏。

已编码的契约包括必需文件、零件包名、`package.json` 关键字段、修复清单（见下面「修复清单」），以及发布清单自洽（`lib/package-contract.mjs`，与安装器拷包前的检查同一份）：目标里新出现的「入口导入的文件不在 `files` 里」记为 `package-integrity`，「用到 `@deepseek-ai/*` 却没声明 `peerDependencies`」记为 `package-peer`；基线已有的同类问题不重复列出，由安装器每次提示。

| 流程 | 必须回答的问题 |
|---|---|
| 安装 | 发布文件、工具参数、插件名称、配置结构或前置条件是否变化？是否要调整可选项、Node 探测、本机补丁、preset、模板、MCP 与心跳？ |
| 更新 | 能否从旧安装平滑迁移？包改名是否同步依赖和锁文件？本机修改、拒绝项、用户资料与旧安装记录是否保留？三方比对、重复更新与回滚是否仍可靠？ |
| 备份 | 上游是否新增应保存的状态、资料或插件设置？备份范围是否漏项或误带外部插件数据？文件校验、时间戳、中文路径、空目录与旧 manifest 是否兼容？ |
| 迁移/恢复 | 能否读取旧备份？跨目录路径、preset、MCP 与心跳是否重建正确？冲突保护、强制覆盖前备份、会话只补不覆盖与索引重建是否正确？ |

每个流程给出“需要改”或“无需改”的结论，并附上游与 kit 的具体文件/位置和理由。不能因为安装能跑，就推断更新、备份、恢复都没问题。

发现新插件时，先判断它是不是必需能力、有哪些配置和持久数据；不要自动加入所有方案。涉及新的用户偏好或扩大安装范围时再询问用户，其余已授权的 kit 修正继续完成。

### 修复清单（`lib/fixes.mjs`，3.0 起）

kit 对上游插件的每一处修改都是修复清单里的一条。报告只跟踪主仓 `cyanwell/dsh-agent-soul`（作者 2026-10-31 弃用了零件仓 `dsh-agent-organs`，换气、compact-region 都回了主仓 `plugins/`；旧报告和 `kit-iteration.json` 里的 `organs` 字段只作历史保留），然后对新上游逐条归类，写在 `report.md` 的「修复清单」一节：

| 归类 | 意思 | 谁处理 |
|---|---|---|
| 仍需修 | 问题还在，kit 的锚点也对得上 | 不用动 |
| 作者这次修好了 | 基线里问题在，目标里没了 | 登记（`--kit-accept`）时自动退役：写进 `kit-iteration.json` 的 `fixes.retired`，记下作者的提交号。条目本身留在清单里，还装着旧版插件的电脑照样会修；以后问题又回来了，登记时会自动取消退役 |
| 作者早就修好了 | 基线、目标里都没有这个问题 | 不用动 |
| 原文对不上 | 问题还在但锚点对不上，或者那段代码认不出来 | 契约提示 `fix:<id>`（`fix-anchor`）：读目标源码，判断作者是修了还是改写了。改写了就改 `lib/fixes.mjs` 里这一条（`old` / `new` / `any` / `problem` / `scope`），在隔离目录里干跑确认；作者确实修了，就让判定认得出来（调 `problem` / `scope`），不要只换一个正则就宣称兼容 |
| 不再适用 | 零件或文件没了 | 契约提示 `fix-gone`：核对零件是删了、改名还是挪了，相应改清单和安装器 |
| 疑似新问题 | 清单还没管、但和清单同类的毛病：写死 Windows 绝对路径、加载名 ≠ 包名。只报目标里新出现的，基线就有的列在报告里备查 | 契约提示 `fix-candidate`：判断会不会让用户那边静默失效。会，就在 `lib/fixes.mjs` 加一条（新 id，永不复用；`basis` 写依据，`since` 写 kit 版本），在隔离目录里干跑确认「问题在 / 作者已修 / 判断不了」三种判定；不会，就标 `not-applicable` 说明理由 |

改清单时守住这几条：

- 每条修复都要能逐字节还原回作者原文（`unpatchText`），更新时比对「本机改没改过」靠它。
- 判定只看文件内容和本机环境，不看锚点在不在：`problem` 命中 = 问题在；没命中但 `scope` 命中（那段代码还在）= 作者已修；都没命中 = 判断不了。
- 路径类修复不写死任何一台电脑的路径，用 `lib/home-paths.mjs` 的运行时定位。
- 不是作者给的修复（Boss 本机实测的）`basis` 写 `boss`，注释里写明来源。

## 3. 完成 kit 修正

修改前说明涉及的文件和计划，保持差异集中。按实际影响修改 `install.mjs`、`lib/`、模板、preset 快照或文档，并在隔离目录里重现问题、确认修好。

- 改公共模板时区分 `assets/templates/` 与已有手写方案；不要把某个用户的人设复制进通用模板。
- 需要改变插件选择时核对 `PARTS`、`PART_NAMES`、`ADDED_PARTS`、问题清单、默认值和安装记录的关联。
- 改修复清单（`lib/fixes.mjs`、`lib/huanqi-patches.mjs`、`lib/home-paths.mjs`、`lib/huanqi-panel-patch.mjs`）或零件目录（`lib/parts.mjs`：包名、必装、各系统的已知限制）后，在隔离目录里跑一遍 `install.mjs --fix --dry-run`：已经装好的环境应全部是「保持」。
- 包名或 preset id 变化时保留旧安装、旧会话和旧备份的兼容路径。
- 备份范围或格式变化时同时维护写入和恢复，并说明旧包如何读取。
- 本轮若修正了迭代工具自身，用临时目录重跑一遍迭代命令，继续使用本轮固定的上游快照完成分析。

## 4. 按修改影响验证

先运行最快的静态检查：

```bash
node --check install.mjs
node --check lib/kit-iterate.mjs
node --check lib/kit-update.mjs
node --check lib/package-contract.mjs
node --check lib/fixes.mjs
git diff --check
```

静态检查不证明四个生产流程正常。行为修改应建立临时 profile 和数据，在隔离目录里补充对应验证：

| 流程 | 验证内容 |
|---|---|
| 安装 | 使用目标源码首次安装和重复安装，检查包、配置、模板、可选项与已有文件；使用 `--no-heartbeat` 避免注册真实任务 |
| 更新 | 基线安装 → 目标升级，覆盖包名迁移、本机修改保留、拒绝项和无变化更新；对用户资料做修改前后内容校验 |
| 备份 | 准备含中文路径、空目录、会话原文、状态文件的测试数据，解包核对 manifest、内容和排除范围 |
| 迁移/恢复 | 在另一个临时 DSH 家目录恢复旧备份，覆盖路径替换、已有数据冲突、强制恢复保护和损坏包拒绝 |

每项记录命令、实际结果与范围：`static` 为静态检查，`simulated` 为隔离/模拟验证，`desktop` 才是实际桌面验收。无需修改的流程也要写出源码对照依据与对应检查。涉及运行行为但暂时无法验证时保留 `pending` 或 `blocked`，不登记完成。

真实 DSH 启动、会话工具、压缩门牌与心跳验收仍遵循 `AGENT-INSTALL.md`。本轮只验证 macOS 就明确写出 Windows 尚未验证。

## 5. 登记完成并交付

在本次报告的 `result.json` 中填写：

- `targetSha`：保留报告中的完整目标提交号；`summary` 写本次修正或无需修改的理由。
- `flows`：四个 id 固定为 `install`、`update`、`backup`、`restore`。`decision` 为 `changed` 或 `unchanged`；填写 `reason`、源码证据数组 `evidence`，并在 `checks` 中引用实际完成的检查 id。
- `findings`：逐项填写 `fixed` 或 `not-applicable`，后者必须说明为什么无需修改；未解决的保留 `pending`。
- `fixChanges`：本轮清单新增、改写、退役记录，逐项填写 `id`、`action`（`add` / `rewrite` / `retire`）和 `evidence` 数组；没有变更填空数组。旧 id 不删除、不复用。
- `kitVersion`：与 `install.mjs` 一致；改写修复实现后必须提升版本。登记校验清单/补丁指纹，不能漏报改动。
- `checks`：每项有唯一 `id`、`scope`、实际执行的 `command`、`status` 和实际输出摘要 `evidence`。通过才写 `passed`，失败写 `failed`。
- `limitations`：未验证的环境或能力，例如“未做 Windows 桌面验收”。

检查记录的结构示例（仅示意格式，不能照抄为已执行证据）：

```json
{
  "id": "backup-roundtrip",
  "scope": "simulated",
  "command": "实际执行的回归命令",
  "status": "passed",
  "evidence": "实际输出、断言数量及核对结果"
}
```

四流程修正和验证均完成后运行：

```bash
node install.mjs --kit-accept <本次报告目录> --dry-run
node install.mjs --kit-accept <本次报告目录>
```

登记命令校验提交号、源码快照指纹、四流程结论、契约提示、验证记录和过期报告；它只读取证据，不执行 `result.json` 里的命令，也不会替 Agent 运行测试。缺提交号或带未提交改动的本地目标只能分析，不能登记为可重复获取的基线。

成功后，根目录 `kit-iteration.json` 保存新基线及历次完成证据，下轮从该基线继续对比。该记录应与本轮 kit 修改一起交付。失败或中断时保留报告和当前修改，继续补齐，不推进基线。

`VERIFIED` 仍表示最后经过端到端验证的上游版本；代码审查完成不能自动更新它。只有具备对应完整验收证据时才修改。交付时分别说明 kit 自身仓库的检查/同步结果、插件上游范围、四流程各自结论、改了哪些文件、验证结果和剩余限制；自身检查被跳过时明确写出，不能声称两个来源都已最新。

上游新增或改动了只在某个系统上能用的代码（`powershell.exe`、命名管道、`.exe` 路径、`darwin` 分支等）时，同步 `lib/parts.mjs` 的系统限制表和 README 那张表。通用扫描报告 Windows/macOS 个人路径、加载名与 client id、发布文件与依赖、preset 缺包、摘要模型路由和能静态识别的 schema 类型不符；结果都是待核对线索，不执行源码、不生成补丁。
