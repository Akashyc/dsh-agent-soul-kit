# playbook · 安装

- 对上游：`AGENT-INSTALL.md`（锚点见 §四，提交号以 `probe/upstream.mjs` 输出为准）
- 前置：上游已同步到 `upstream/dsh-agent-soul`（`kit/sync-upstream.mjs`）；`probe/upstream.mjs` 与 `probe/local.mjs` 已跑通
- 产物：`data/<profile>/<instance>/` 下的 answers / apply / meta / report

## 一、目标

把作者这一版装到本机某个 profile，并且**让下次能判断「该不该重装」**。

四样产物缺一不可：

| 产物 | 是什么 | 没有它的后果 |
|---|---|---|
| `answers.json` | 用户这次的选项 | 下次更新问一遍同样的问题 |
| `apply/` | 本机专用脚本（拷哪些、装什么、写哪块配置） | 只能人肉敲命令，跑完没有记录 |
| `meta.json` | 四项指纹：upstream / local / kit / answers | 分不清「上游变了」还是「本机变了」 |
| `report.md` | 干跑报告 + 执行结果 | 说「装好了」但没有证据 |

**安装脚本由 `kit/setup/applygen.mjs` 生成——读本机 probe 结果 + 你的答案，不套模板，也不许手写。** 上游的 `install.mjs` 不使用：它是作者按作者的环境写的，装到别人机器上等于拿别人的答案填自己的卷子。

生成器消费四个字段：`cliTools`（CLI 脚本落点）、`register`（写 `dsh.profile.bundles`）、`skills`（拷 preset 自带技能）、`writeConfig`（写 `cordis.patch.yml`）。不手写的原因很实际：手写的脚本没人校验形状，而 `applycheck` 校验的正是形状。

## 一·五、先排查前置（问任何问题之前）

`node probe/prereqs.mjs --source <作者仓库> [--host <宿主 node_modules>]`，只读。它回答四件事：

| 看什么 | 判据 | 不满足时 |
|---|---|---|
| 宿主在不在 | `dshHome` / `profileDir` / `patchFile` 三个布尔 + `dsh --version` | 缺 profile 或 patch 文件 → **停**，先启动一次 DSH 让它生成（作者 §0） |
| 零件的运行时 `dependencies` | profile 里有没有 | `missing` → 进 apply 的 `install` 步骤，装完再验 |
| **上游文档点名的外部插件** | `docPackages`：`kind: required` 是「必须先装」（如 `dsh-mnemon` 之于 mnemon-probe），`kind: avoid` 是「别一起装」（如三个换气前身） | required 的 `missing` → 停，装完再继续；`avoid` 的已装 → 先卸或用别的方案 |
| **服务 / 账号类前置** | `declaredNeeds`：只收上游原文里点名了具体服务（QQ 网关、ComfyUI、edge-tts、Web GUI…）的行 | 查不到，**只能原样交给用户确认**；不许写成「已满足」 |
| **环境变量** | `envVars`：上游文档里要配的变量名与出处 | 装完在报告里列出「还差哪几个」，不替用户猜值 |
| **这台机器已装了什么** | profile 里所有包，分「本架构零件」与「非本架构插件」 | 同名零件（`willOverwrite`）→ 覆盖前先说清：那是旧版还是别的 kit 装的；同名多目录（`shadow`）→ 迟早抢同一个插件 id，先处理 |

三条硬要求：

1. **只读**。这一步不改任何文件，也不装包。
2. **查不到就不写「通过」**。宿主自己的包在 asar 里，普通 `fs` 读不到——那部分不查，也不写成「未判定」凑数（上游 doctor 的 L1/official 同样把它排除在失败之外）。
3. **宿主自己的包不查**（`@deepseek-ai/*` 在 asar 里，普通 `fs` 读不到）：查了也只会写「未判定」，那是宿主的事，上游 doctor 的 L1/official 也明说「不算失败」。
4. **非本架构的插件不碰**。`external` 里的包是用户自己装的（`dsh-mnemon`、`dsh-ops`、`markdown-to-jsx` 这类），安装既不覆盖也不卸载；只有 `willOverwrite` 里那些同名零件要先说。

## 二、问卷：八组题目 → `answers.json` v2

字段值只从两处来：probe 输出、用户回答。**不从记忆里取，不猜默认值。**

| 组 | 问什么 | 选项从哪来 | 落到哪 |
|---|---|---|---|
| 身份 | 名字、称呼、用途 | 建议值 `kit/setup/suggestions.json` | `answers.setup` → 权威源册、`SELF.md` |
| 硬线 | 五条内置硬线选几条、要不要自定 | `kit/setup/questions.mjs` 的 `BUILTIN_LINES` | `setup.hardLines` / `customHardLines` |
| 人设 | 说话风格（可空，可给文件路径） | 用户填 | `setup.persona` → 书房声音文件 |
| 运行 | 多会话？上下文窗口多大？ | 建议值 + 用户填 | `setup.multiSession` / `windowSize` |
| preset | 生成哪几份、**新会话默认用哪个** | 扫上游 `presets/preset-*.yml` 的显示名与说明 | `presets` / `defaultPreset` |
| 零件 | 除必装外还装哪些 | 扫上游 `plugins/`；必装集合来自 README「全局必装」表 | `parts.install` / `declined` |
| 装配 | 写不写 bundles、CLI 落点、书房根、记忆中枢根 | 写 bundles 恒问；两个根上游不猜 | `register` / `cliTools` / `paths.soul` / `paths.memory` |
| 保存 | 这套答案存成什么名字 | 建议值 + 用户填 | `setup.setupName`（下次更新直接读，不重问） |

### 必装集合从上游读，不从 kit 常量来

`probe/upstream.mjs` 已经给出三样东西，问卷直接吃它们：

- `mustInstall`：README「全局必装」表逐行解析（`parts` 是对得上 `plugins/` 的，`scripts` 是其余引用，一条都不许丢）；
- `parts[].required`：`plugins/清单.md` 的 ✓/○ —— **层内必选**，跟「全局必装」是两把尺子；
- `presetMeta`：每个 preset 的显示名与说明。

三样里任何一样读不出来 → `notes` 里写「未判定」，**全列给用户选，不拿常量顶替**。

### 怎么问：弹窗，不是长表格

题目清单由 `kit/setup/questions.mjs` 生成，弹窗分片由 `kit/setup/popups.mjs` 算：

- 一个弹窗 ≤4 道题；多选每题 2–4 个选项（选项多了自动均衡分片，不会切出只剩 1 个的片）；
- **单选不硬切**：默认 preset 这类必须全列出来，否则人点不到；
- 标题 ≤12 字；自由填写走选项下面的「其他」；
- 推荐项排第一并标「（推荐）」，没有建议值就不标，写「没有建议，请你定」。

**零件与 preset 全列，不许归纳成「方案 A / B / C」。** 档位会让人看不见被并进去的那个零件 —— 而零件是可组合的，不是套餐。

### 默认 preset 与身份类配置必须问到位

- **`defaultPreset` 只能从 `presets` 里挑**；它决定 `agent-preset-registry` 的 `selectedDefault`（`default` 同值做兜底）。写之前备份；作者 §6③ 说的「不许擅自改」指的是 agent 自己决定，用户选过就算确认。
- **身份/硬线/人设不是摆设**：它们要落成 `dsh-soul/` 里的权威源册、`SELF.md`、声音文件，并把 `memory` 的 `selfPath` / `statePath` 指过去。只问不写，等于装了个空壳。

### 生成 soul 骨架：调上游，不自己渲染

身份/硬线/人设不是「拼段字符串」就完事 —— 上游有四个工具各管一段，**kit 只接参数、核结果**：

| 顺序 | 上游工具 | 干什么 | 失败长什么样 |
|---|---|---|---|
| 1 | `kit/echo/install-kit.mjs --hub <memory>/hub` | 建出 hub，装插件 spawn 的那两个脚本，写 `.kit-origin.json` | hub 建不出来 → 后面全断 |
| 2 | `tools/init.mjs --answers <json> --out <dirname(soul)>` | 书房根下 5 份骨架（00-authority / 01-echo / 02-vital / 03-self / 04-doctor） | 已存在的一律跳过，不覆盖 |
| 3 | `kit/echo/scaffold.mjs --soul … --memory … --apply` | 书房 11 个目录（含 `65-声音`），hub 里放 `SELF.src.md` | 缺 hub → 报「配置不全」退出 2 |
| 4 | `plugins/tools/self/self.mjs --check` | SELF 三条判据 | `SELF.md` 不在 → 退出 1（**这是对的**） |

接线在 `kit/setup/scaffold.mjs`：默认干跑，`--run` 才动；`--scaffold-apply` 才真建书房目录。

**三处不许自己发明**：

1. **两个根只能由人给**（`answers.paths.soul` / `.memory`）。上游 echo-config 的规矩是「能推断的自动推，推不出来的报错停下」——猜错会把记忆读到错的地方，**而且不报错**。建议值取上游 `lib/paths.mjs` 的候选第一项，来源标 `upstream`。
2. **`SELF.md` 在 `<memory>/hub/` 下**，不在记忆中枢根。上游 `echo-doctor` 的注释点过这个坑：`memory` 默认 `selfPath` 是 `./SELF.md`，而 scaffold 把 SELF 写在 `memory/hub/`，两边对不上就是「装了、没报错、每轮注入空」。所以 `selfPath` / `statePath` 都指 hub 下。
3. **人设是数据文件**：上游没有「人设文件」这一层，但书房有 `65-声音/`。说话风格写成一个文件放进去；空答案不建文件，不留空壳。

**占位符必须报数。** `init.mjs` 只填空，剩下的 `<...>` 是「只有用户能答的」。做完要报「还剩几个、在哪份文件」并写明 `SELF.md` 装了没有 —— 报 63 个占位符不算完成，算**骨架建好**。

### 选项没定下来就别动手

- 用户拒掉的零件进 `declined`，下次更新不自动装回来；
- probe 探得到的（profile、路径、已装零件、必装集合）不问，写进 `answers.json` 并在报告里说明来源；
- 答完再生成 `apply.mjs`；中途中断不丢已答（`asked` 落盘）。

形状（v2 必填项 + `asked`）由 `probe/lib/answers.mjs` 校验；模板与映射在 `kit/setup/compose.mjs`。宿主没有弹窗工具才降级成编号列表，**降级要说出来**。

## 三、验收

作者 §5 给了三条判据。落成可执行检查：

| # | 作者判据 | 检查 | 谁执行 |
|---|---|---|---|
| 1 | doctor 三层全绿 | 跑 doctor，看 `exit=0` | apply 跑完后由 Agent 执行 |
| 2 | 重启 DSH | **不能自动做** | 交回给人 |
| 3 | 命令能被识别 | 在 30 秒内跑一条命令看有没有反应 | Agent 执行 |

第 2 条没有替代方案。DSH 不重启，装进去的插件不会加载——**这时候报「装好了」是撒谎。** 报告里写「已安装，等待重启后验收」，不写「完成」。

### 干跑是执行的一部分

顺序固定，中间任一步失败就停：

0. `node kit/setup/applygen.mjs --answers <answers.json> --instance <data/<profile>/<instance>> --source <上游> [--prereqs <prereqs.json>]` —— 生成 `apply.mjs` + `meta.json`（生成时先过 `answers` 形状与 `plan` 契约两道闸，红就退 2）；

1. `node probe/applycheck.mjs --dir <目录>` —— 静态检查：入口在不在、语法对不对、四项指纹齐不齐；
2. `node probe/applycheck.mjs --dir <目录> --run` —— 取计划，按 `probe/lib/plan.mjs` 校验（九条规则写在那份校验器里，它红就是不合契约）；
3. 计划给用户看，等确认；
4. 确认后才真跑，结果追加到同一份 `report.md`，不另开文件。

第 2 步不过就别往下走。**一份不合契约的计划，执行得越顺利越危险。**

**没有干跑报告的执行不算执行，即使结果看起来对。** 一次装对了不能证明下一次也对——上游换个版本、换台机器，就是另一回事。
## 四、引用

锚点是章节标题，保序。跑 `probe/upstream.mjs` 拿到 `installDocHeadings`，与下表比对；对不上的按下表处置。

| 作者章节 | 动作类别 | 怎么用 |
|---|---|---|
| §0 先做这一件事 | 前置探测 | 已由 `probe/local.mjs` 覆盖，不重复执行 |
| §1 三层是什么意思 | 只读 | 不执行 |
| §2 L0 地基：五种失败 | 失败形态 | 装之前先自查这五条；失败就停，不继续 |
| §3 L1 能力：两组失败 | 失败形态 | 同上 |
| §4 L2 装配：五个检查 | 失败形态 | 同上 |
| §5 装完的判据 | 验收 | 落成 §三 的检查 |
| §6 三条硬规矩 | 安全网 | 写进 apply 的固定约束，不可关闭 |
| §7 装不上时先看这个 | 排查入口 | 验收失败时把用户指到这一节 |
| §8 诚实边界 | 只读 | 不执行 |
| §9 快捷方式 install.mjs | 不使用 | 见 §一 |

### 锚点对不上时

| 变化 | 处理 |
|---|---|
| 新增一节 | 读它，判属于六种动作里的哪一种；判不出就停下问人 |
| 删除一节 | 契约失配，停下问人 |
| 改名 | 按顺序对齐后判断是不是同一节；是就更新锚点，不是就停下 |
| 只有正文变、标题没变 | 不报警。正文细节每次重读时靠你自己发现 |

**不许因为锚点对不上就整篇重写契约。** 只处理差异那一节。

### 六种动作类别

| 类别 | 谁执行 | 例子 |
|---|---|---|
| 拷 | apply | `plugins/<零件>` → `profiles/<profile>/node_modules/<包名>` |
| 装 | apply（调 pnpm / npm） | 补齐依赖 |
| 写配置 | apply，写前必先备份 | `cordis.patch.yml`、`package.json` 的 `dsh.profile.bundles` |
| 问 | Agent（宿主选择弹窗，分片由 `kit/setup/popups.mjs` 算） | 装哪些可选零件、装哪些 preset |
| 交回给人 | 报告后停 | 重启 DSH、扫码、肉眼确认 |
| 只读 | 不执行 | 背景说明、诚实边界 |

判不出类别就停下问人。猜错一次的代价是用户机器上一个静默失效的插件。

## 五、必须交回给人

这几件事 apply 做不了，别假装做了：

1. **退出并重开 DSH**——kit 不替你重启；
2. **在面板里肉眼确认插件可见**——文件装对不等于加载成功；
3. **需要账号或第三方服务的步骤**——凭据不进 kit；
4. **真实功能的端到端验收**——能跑起来不等于功能正确；
5. **填骨架里剩下的 `<...>`**——`init.mjs` 只填空，`03-self.md` 的「我是谁」、`00-authority.md` 的权威源表、`hub/SELF.src.md` 都只有人（或你能被授权的 agent）能写。骨架建好不等于能用。

报告里把这五条列成「待你确认」，不是「已完成」。