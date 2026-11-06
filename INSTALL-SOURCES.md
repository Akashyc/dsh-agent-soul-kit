# 作者安装依据与 kit 适配边界

本轮核对固定来源：Soul `95dc0db4c5f21bdfc7b398dab81c302ed0ba7b10`。已从 origin 获取 main 并确认与本地 HEAD 一致；未修改作者源码。

## 部署方式

- Soul 桌面总说明：[plugins/README.md](https://github.com/cyanwell/dsh-agent-soul/blob/95dc0db4c5f21bdfc7b398dab81c302ed0ba7b10/plugins/README.md) 与 [soul/07-bundle.json](https://github.com/cyanwell/dsh-agent-soul/blob/95dc0db4c5f21bdfc7b398dab81c302ed0ba7b10/soul/07-bundle.json)：完整复制零件目录至 profile/node_modules，登记 bundles，重启验证。
- 桌面本体仍采用复制与登记方式，按包发布范围部署。作者 install-desktop.ps1 的目录列表没有当前新增 lib，但包导出与零件已依赖 lib/paths.mjs；不能机械照抄旧列表漏文件。kit 以当前 package.json 的 files/exports 与导入检查共同核对，保留该作者脚本与当前源码的差异。
- 非 desktop 的 CLI 路径在作者总说明中独立存在；kit 未实现该流程，当前拒绝套用桌面部署。
- 个别零件 README 泛写 dsh plugin add，与桌面总说明冲突时，桌面部署按明确针对 Electron profile 的总说明；组件加载再核对各包 cordis.patch.yml 和 preset 引用。
- compaction、pruner、compact-region 由所选 Soul preset 引用，作为依赖部署，不额外挂根 bundles。其实际包名读当前来源 package.json，并保留旧名迁移。

## 零件核对表

共同部署依据为上面的桌面总说明。逐包核对 package.json 与实际 cordis.patch.yml；存在 README 时列为补充资料，没有则如实记录，不编造专用安装说明。

| 目录 | 当前包名 | 专用说明 | 加载位置 |
|---|---|---|---|
| `chat` | `dsh-yanqing-chat` | 无专用 README；核对包与总说明 | profile bundles |
| `clawbot` | `dsh-clawbot` | [README](https://github.com/cyanwell/dsh-agent-soul/blob/95dc0db4c5f21bdfc7b398dab81c302ed0ba7b10/plugins/clawbot/README.md) | profile bundles |
| `clock` | `dsh-agent-clock` | [README](https://github.com/cyanwell/dsh-agent-soul/blob/95dc0db4c5f21bdfc7b398dab81c302ed0ba7b10/plugins/clock/README.md) | profile bundles |
| `compact-region` | `dsh-yanqing-compact-region` | [README](https://github.com/cyanwell/dsh-agent-soul/blob/95dc0db4c5f21bdfc7b398dab81c302ed0ba7b10/plugins/compact-region/README.md) | Soul preset 内组件 |
| `compaction` | `dsh-yanqing-compaction` | [README](https://github.com/cyanwell/dsh-agent-soul/blob/95dc0db4c5f21bdfc7b398dab81c302ed0ba7b10/plugins/compaction/README.md) | Soul preset 内组件 |
| `dsh-aurabot-qq` | `dsh-aurabot-qq` | [README](https://github.com/cyanwell/dsh-agent-soul/blob/57c487da8d7239f6ed8309c2fce541d97126b1c5/plugins/dsh-aurabot-qq/README.md)；第三方 vendored（原仓 accomplish07zrh-eng/dsh-aurabot-qq），目录名即包名 | profile bundles（自带 aurabot-private / -long / -social 三套 preset） |
| `echo` | `dsh-agent-echo` | [README](https://github.com/cyanwell/dsh-agent-soul/blob/95dc0db4c5f21bdfc7b398dab81c302ed0ba7b10/plugins/echo/README.md) | profile bundles |
| `heartbeat` | `dsh-agent-heartbeat`（旧名 `dsh-yanqing-heartbeat`） | 无专用 README；核对包与总说明 | profile bundles |
| `lead-waker` | `dsh-agent-lead-waker` | 无专用 README；事件层组件，心跳面板读它的 `/lead-waker/state` | profile bundles |
| `huanqi` | `dsh-huanqi` | [README](https://github.com/cyanwell/dsh-agent-soul/blob/95dc0db4c5f21bdfc7b398dab81c302ed0ba7b10/plugins/huanqi/README.md) | profile bundles |
| `huanqi-panel` | `dsh-agent-huanqi-panel` | [README](https://github.com/cyanwell/dsh-agent-soul/blob/95dc0db4c5f21bdfc7b398dab81c302ed0ba7b10/plugins/huanqi-panel/README.md) | profile bundles |
| `mcp-hub` | `dsh-mcp-hub` | [README](https://github.com/cyanwell/dsh-agent-soul/blob/95dc0db4c5f21bdfc7b398dab81c302ed0ba7b10/plugins/mcp-hub/README.md) | profile bundles |
| `memory` | `dsh-agent-memory` | [README](https://github.com/cyanwell/dsh-agent-soul/blob/95dc0db4c5f21bdfc7b398dab81c302ed0ba7b10/plugins/memory/README.md) | profile bundles |
| `mnemon-probe` | `dsh-agent-mnemon-probe` | [README](https://github.com/cyanwell/dsh-agent-soul/blob/95dc0db4c5f21bdfc7b398dab81c302ed0ba7b10/plugins/mnemon-probe/README.md) | profile bundles |
| `mobile-adapt` | `dsh-agent-mobile-adapt` | [README](https://github.com/cyanwell/dsh-agent-soul/blob/95dc0db4c5f21bdfc7b398dab81c302ed0ba7b10/plugins/mobile-adapt/README.md) | profile bundles |
| `model-statusbar` | `dsh-agent-model-statusbar` | [README](https://github.com/cyanwell/dsh-agent-soul/blob/95dc0db4c5f21bdfc7b398dab81c302ed0ba7b10/plugins/model-statusbar/README.md) | profile bundles |
| `perf` | `dsh-agent-perf` | 无专用 README；核对包与总说明 | profile bundles |
| `pruner` | `dsh-yanqing-pruner` | [README](https://github.com/cyanwell/dsh-agent-soul/blob/95dc0db4c5f21bdfc7b398dab81c302ed0ba7b10/plugins/pruner/README.md) | Soul preset 内组件 |
| `riji` | `dsh-agent-riji` | [README](https://github.com/cyanwell/dsh-agent-soul/blob/95dc0db4c5f21bdfc7b398dab81c302ed0ba7b10/plugins/riji/README.md) | profile bundles |
| `splash` | `dsh-agent-splash` | [README](https://github.com/cyanwell/dsh-agent-soul/blob/95dc0db4c5f21bdfc7b398dab81c302ed0ba7b10/plugins/splash/README.md) | profile bundles |
| `yantai` | `dsh-agent-yantai` | [README](https://github.com/cyanwell/dsh-agent-soul/blob/95dc0db4c5f21bdfc7b398dab81c302ed0ba7b10/plugins/yantai/README.md) | profile bundles |

## 中枢、配置与预设

- 中枢使用安装目标内作者 kit/echo/scaffold.mjs、install-kit.mjs；配置指向本机书房、记忆和会话目录。读取作者脚本核对写入范围，不在作者目录运行。
- 中枢脚本按作者工具同步；移除 kit 原先挪走 test-self-check.mjs 并修改 .kit-origin.json 的后处理，不为体检变绿改作者来源记录。
- 依据作者 presets/ 与 tools/soul-preset.mjs 的配置组织，将选中 preset 放入 profile 的顶层 insert；skills 随所选作者来源部署到 profile/skills，因配置文件位置决定 customSkillDirs 相对路径。
- 当前 DSH 官方基础 preset 优先从实际 app.asar 读取。没有来源则停止；只有显式 --allow-preset-snapshot 才采用包内旧官方快照，并记录其版本，不把它冒称当前宿主原文。Soul 预设和技能不再静默回退。
- 书房权威源、人设、自我层和默认项属于 kit 个性化配置；更新保护用户数据，托管代码差异在替换前报告并进入授权快照。

## 更新、备份、恢复与卸载

- 更新沿用已核对的部署方法与明确选择；更新前固定源码，比较托管文件，不按产品版本推测应额外装什么。
- 备份、事务快照、跨路径恢复、会话头迁移、问题清单与私有方案归档是 kit 自有运维能力，不宣称来自作者安装器。
- 历史备份仍读取原格式；新包附目标 profile 与实例，恢复个人方案和问题定义，旧机器的诊断状态重置为 unknown。
- 卸载只处理确认的托管内容及会话策略，kit/data 保留。

## 验证边界

本记录说明静态安装依据与实现差异。隔离流程证据放 data/_kit/logs；当前没有真实 DSH 桌面、Windows、ComfyUI 或 heartbeat 调度验收。上游文档和源码仍可能冲突或含缺陷，安装成功不等于运行通过。
