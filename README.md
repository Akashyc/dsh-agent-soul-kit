# dsh-agent-soul 安装包

**版本 1.0.0**（2026-11-05）· 适用于 macOS / Windows · [安装手册](AGENT-INSTALL.md) · [迭代手册](AGENT-ITERATE.md) · [历史更新](CHANGELOG.md)

> **这是管理 dsh-agent-soul 的工具包，不要把它安装到插件市场。**
> 主要交给 Agent 阅读手册并执行操作；终端命令是辅助入口。

将仓库 clone 或下载到固定目录，交给 Agent 作为工作区使用。下面提供七种常见操作的完整提示词，可直接复制。

工具包（下文简称 kit）支持：

- 安装：使用现成方案，或自定义名字、称呼、人设、零件和 preset。
- 更新：按作者说明升级插件，报告安装完整性和配置缺项。
- 备份：把书房、账本、会话和相关配置打成一个备份包。
- 还原：在新电脑或重装后的电脑上，用备份包装好并放回数据。
- 卸载：先备份，再移除插件；旧会话可选择保留兼容入口。
- 诊断：按日志和本机清单提供证据，由你决定是否修复。
- kit 迭代：同步工具包自身，并对照上游主仓更新安装、备份与还原逻辑。

插件来自 `cyanwell/dsh-agent-soul`，全部零件取自主仓 `plugins/`。每轮先检查作者更新，再固定本次安装版本；作者源码只读，适配只在临时副本与安装目标进行。

## 怎么用

**主要用法是交给 Agent 操作。** 将 kit 放到固定目录，让能访问本机文件和终端的 Agent 以该目录为工作区，再复制下面对应的提示词。Agent 先读 [AGENTS.md](AGENTS.md)，再按安装、诊断或迭代手册执行。

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

### 诊断问题

```text
请读 AGENT-DIAGNOSE.md，先确认目标 DSH 家目录和 profile，再做只读诊断。按实际证据说明问题、影响、建议改法和未知项；不要自动修复、迁移旧清单或生成快照。我确认具体方案后再动手，修后分别验证文件状态与真实功能。
```

## 安装与适配

现成方案从当前目标的本地方案优先读取，找不到再查仓库自带 `setups/` 示例；全新安装按题组询问身份、硬线、人设、运行和零件，保存到目标私有归档。不会把个人方案写进公开示例目录。

桌面零件按作者说明完整复制并登记加载；压缩组件按作者预设引用。Soul 预设读取选定作者提交，不回退到旧 Soul/技能快照。读取不到当前 DSH 的官方基础预设时停止；只有明确审阅旧快照来源后才允许 `--allow-preset-snapshot`。

Flash 当前提供的是**可选 Soul 适配预设**：发现作者全部预设，保留原简介并附改造说明，调整身份与门牌压缩。它不等于安装作者完整 Flash 包，不安装其可选 plan-mode-ui；需要原版包时按作者原版入口另行规划，不能冒称 kit 已支持原版包的生命周期。

零件及兼容说明以安装问答完整清单为准，可选项不隐藏；chat 会自开网络端口，heartbeat 调度及本地模型服务需另行核实。当前只实现桌面 `desktop` 部署，不能把同一复制流程套给其它 profile。

安装依据、作者文档冲突和 kit 自有适配见 [INSTALL-SOURCES.md](INSTALL-SOURCES.md)。作者仓库只读，所有改造只落在临时副本与安装目标。

## 本机数据放哪里

```text
data/<profile>/<instance>/
├── context.json
├── fix/issues.json
├── logs/<operation-id>/
├── backups/
├── archives/<operation-id>/
├── setups/<方案名>/
└── reports/
```

`data/` 整体不进 Git。`instance` 使用主机和 DSH 根目录指纹，隔离同名 profile 的不同安装。备份是可迁移包，archives 是本机回滚快照；所有备份和快照遵守你的授权。kit 自身迭代及隔离验证记录放 `data/_kit/logs/`。

移动或删除 kit 会影响这些本地资料，保留资料时一并转移 `data/`。不同 kit 副本不自动共享清单。卸载 DSH 插件不清理这些归档。

旧数据不会自动搬动：让 Agent 使用 `scripts/migrate-data.mjs` 只读清点，核对归属、冲突和精确计划，经确认后执行；不明确属于哪个 profile 的项目保留原位。诊断发现 DSH 内旧清单会停止并提示先核对迁移。

## 文件与流程

| 入口 | 用途 |
|---|---|
| [AGENTS.md](AGENTS.md) | 全局操作边界 |
| [AGENT-INSTALL.md](AGENT-INSTALL.md) | 安装、更新、备份、恢复、卸载和新会话验收 |
| [AGENT-DIAGNOSE.md](AGENT-DIAGNOSE.md) | 只读诊断、登记、修复确认与退役 |
| [AGENT-ITERATE.md](AGENT-ITERATE.md) | kit 自身更新与作者变更核对 |
| `install.mjs` | 兼容安装命令入口，执行逻辑在 `lib/install/` |
| `soul-fix.mjs` | 诊断入口，不自动应用修复 |
| `lib/core/`、`source/` | 目标归档、保护与作者固定来源 |
| `lib/setup/`、`presets/` | 设定、人设、预设与引用迁移 |
| `lib/backup/`、`diagnose/`、`iterate/` | 备份恢复、诊断、kit 迭代 |
| `scripts/` | 旧数据迁移及隔离验证 |
| `setups/`、`assets/` | 公开示例与公共模板，不放本机生成资料 |

安装：检查 → 设定 → 固定来源干跑 → 确认、退出与授权快照 → 部署 → 启动与新会话验收。

更新：读取现状 → 核对作者变化 → 干跑 → 确认后替换托管代码 → 验收；不按产品版本擅自补装可选项。用户数据、非托管插件和本地改动的处理必须在计划中说清。

诊断：读证据 → 报告 → 用户决定 → Agent 修改安装目标 → 重新诊断与运行验收。当前日志自动发现范围是最近五份 JSONL 的插件加载失败，不代表全部运行时问题已覆盖。

备份与恢复：只处理当前目标；备份可带本地方案和问题清单，不打包全部日志、历史备份或其它 profile。恢复的问题状态重新核对，不能沿用旧机器验收结论。

## 终端操作（辅助用法）

<details>
<summary>展开常用命令</summary>

```bash
node install.mjs --questions
node install.mjs --setup 大肥鱼 --dry-run
node install.mjs --fresh --answers <回答文件> --dry-run
node install.mjs --update --dry-run
node install.mjs --backup --dry-run
node install.mjs --restore <备份包> --dry-run
node install.mjs --uninstall --dry-run
node soul-fix.mjs --dsh-home <目录> --profile desktop
node scripts/migrate-data.mjs --dsh-home <目录> --profile desktop
```

正式安装沿用干跑输出的完整 Soul/Flash 提交号。回答文件、计划和交接记录由 Agent 放进输出的本次操作目录；授权内容不能由脚本替你推断。完整参数见各入口 `--help`，自举脚本 `install.sh` / `install.ps1` 仍使用同一安装入口；已有副本不直接 pull，更新交给带归档保护的 `--kit-update`。

</details>

## 注意

- 文件已安装、静态检查通过与真实 DSH 功能通过分别记录；不能凭退出码宣布全套可用。
- 真实操作前退出、之后重开 DSH 由你执行并确认，安装阶段不会自动转入修复。
- 来源损坏、身份不符、归档冲突或不支持的结构必须停下，不重置或覆盖掩盖问题。
- 个人清单、方案和日志可能含私有资料，保持 `data/` 不被跟踪；对外反馈报告先脱敏。
- 1.0.0 验证记录见 `data/_kit/logs/`；隔离流程不等于 macOS/Windows 桌面、模型服务或后台任务实机验收。

## 版本记录

### 1.0.0

合入本机诊断，按 profile/实例统一本地归档，整理模块职责，解除旧产品版本驱动的补装逻辑，明确作者安装依据与 kit 适配边界。详情见 [CHANGELOG.md](CHANGELOG.md)。
