# macOS 兼容修复与 heartbeat 迁移

kit 5.3 将下列改动放进修复清单。安装、更新仍使用作者原文；Agent 核实本机需要后，通过报告和计划选择修复。

| 修复 ID | 内容 | 运行边界 |
|---|---|---|
| `model-statusbar-darwin` | ComfyUI API 探测、Mac Python 启动、进程归属核对与 SIGTERM 停止 | 只控制回环地址；停止前必须核对 Python、main.py、工作目录。未知 GPU 利用率显示未知 |
| `yantai-apps-darwin` | 扫描 `.app`、读取 Info.plist、用 `open -a` 启动 | 清除子进程的 `ELECTRON_RUN_AS_NODE`；新增应用后重启 DSH 重扫，避免数组下标变化导致打开错应用 |
| `heartbeat-darwin` | 补入运行脚本、Mac 路径、巡视日志、配置、审计路径和 launchd 管理 | 默认关闭，不自动注册任务；kit 每日心跳已退役，验收后它才是唯一的定时巡视入口 |
| `echo-svc-darwin` | 服务端和客户端同时改用 Unix socket | 按用户及中枢隔离；目录 0700、socket 0600；不自动启动服务 |
| `echo-node-darwin` | 回声体检找到 DSH 内置 Node | 复用原有修复 |

多文件修复作为一组处理：任何一个配套文件被手改、原文锚点不符或缺少必要来源，整条不动。脚本新增文件也受计划指纹、事务备份与撤回管理。Mac 修复在其它系统上标为不需要。

5.5 起作者配套脚本先由 `pack-unshipped` 补齐，再打补丁；需要 heartbeat 修复时应同时核对该项。撤销只删除 kit 提供的 helper，作者文件还原并保留。修复前校验最终依赖图；仍被其它模块引用的 helper 不允许撤销，缺失或手改的冻结文件不会被冒认成 kit 已部署内容。删除了无行为作用的 heartbeat-core 标记补丁；升级后原验收指纹仍需重新核对。

## Agent 操作顺序

1. 读取 [安装手册](AGENT-INSTALL.md) 中的修复流程，确认 DSH 家目录、profile、已装零件、Node 运行时和目标功能。
2. 执行 `node install.mjs --fix --report`。按每条 `verify` 核对，填 `fix-plan.json` 的事实与选择。未使用的功能选 `later` 或 `skip`，不要因为系统是 Mac 就全部安装。
3. 用 `node install.mjs --fix --plan <计划路径> --dry-run` 检查，DSH 完全退出后执行同一条命令去掉 `--dry-run`。已有 echo-svc 也应先停止。
4. 重开 DSH，逐项实测。模型要用真实 ComfyUI 验证；速达要实际打开应用；echo-svc 可手动运行中枢的 `echo-svc.mjs`，同时检查服务退出后 `memq` 仍能回退。

补丁不会安装 Python、ComfyUI 或模型，也不会下载第三方依赖。

## 作者 heartbeat 的运行链

kit 5.6 起不再生成、也不再注册自带的每日心跳，作者可选零件 `heartbeat` 是唯一的定时巡视入口。修复补齐它的运行链（原来自检的三项工作，加一份日报）。旧 kit 任务不会因为装补丁或更新被自动停用：退役要单独跑 `--retire-kit`，退役和启用是两步，中间没有自动切换。

修复后的零件目录包含 `index.js`、`heartbeat.mjs`、`heartbeat-core.mjs`、`activity.mjs` 和 `kit-macos.mjs`。5.4 起修复对准上游 0221d89：原版面板从包外的 `../../lib/paths.mjs` 导入（装进 node_modules 后找不到）、还用了没定义的 `AI_ROOT`，脚本里用了没导入的 `resolveAll`；修复把这几处的路径都交给 `kit-macos.mjs`。已装的还是 fe3c456 的，先 `--update` 再修。运行数据默认位于 `<DSH 家目录>/dsh-soul/memory/hub/heartbeat/runtime`，支持原有 `YQ_HUB`、`YQ_SOUL`、`YQ_HB_DIR` 覆盖。首次加载生成关闭状态的配置，不覆盖已有配置。

以下示例使用默认目录。Agent 必须换成报告中实际的家目录和 profile；不要照抄到另一套安装。

```bash
heartbeat_pkg="$HOME/.dsh/profiles/desktop/node_modules/dsh-yanqing-heartbeat"

# 手动验收，显式绕过 enabled 开关；会重建派生物并写报告。
node "$heartbeat_pkg/heartbeat.mjs" --force

# 旧 kit 每日自检还在跑时，先显式退役它；认不出归属的会拒绝处理。
node "$heartbeat_pkg/kit-macos.mjs" --retire-kit

# 验收四步记录、DSH 面板、自主循环和审计后，再启用作者调度。
node "$heartbeat_pkg/kit-macos.mjs" --enable
node "$heartbeat_pkg/kit-macos.mjs" --status
```

四步分别是索引重建、自我层装配、daily 派生物检查和 echo doctor。上游引用的 `hub/heartbeat.mjs daily` 未随仓库提供，因此 Mac 版 daily 明确检查 `SELF.md`、words/summaries 索引并写日报；不声称复现那份缺失脚本的全部审计逻辑。

`--retire-kit` 只退役本安装的旧任务：认 `com.dsh-soul.heartbeat` 这个 label，并且 ProgramArguments 指向 `soul/60-工具/heartbeat.mjs` 或中枢的 `heartbeat.sh`（早期手工装的那套），先 `bootout` 再删 plist；同名但脚本对不上的、属于别的安装的一律拒绝处理。它不启用作者任务，也不恢复、不重新注册旧任务。

`--enable` 要求当前脚本、当前配置的完整四步验收在 24 小时内通过；旧任务还没退役、或迁移记录还在时直接拒绝，必须先 `--retire-kit`。它只写本安装的 plist（label 带家目录指纹）再 `bootstrap`，不碰旧任务。

launchd 每分钟读取当前配置，支持 `M H,H * * *`、配置时区和补跑判断。旧任务文件还在时，定时执行会跳过这一轮并打印一行，避免两套任务重复跑（真正的解法是先 `--retire-kit`）。手动执行、定时执行共用进程锁。启用后沿用 heartbeat 的静默、预算和安静时段条件；这与旧任务无条件每日执行不同，Agent 应按用户需要核对参数，并观察一次真实到点运行。DSH 内的主导会话自主循环仍由插件负责。

Mac 审计会核对 POSIX 绝对路径、目录边界及符号链接；无人值守时，无法核实绝对路径的修改请求会被拦截。它是上游工具 guard 的兼容层，不是操作系统沙箱。微信通知依赖用户已配置的 clawbot，需单独验收。

启用后检查巡视历史、日报、错误报警和实际 launchd 日志，不能只看面板有数据显示。配置改动、脚本更新、漏掉某一步或出现失败后，都应重新验收。

## 回退与更新

```bash
# 停用作者调度：删本安装的 plist 并 bootout，不碰旧任务。
node "$heartbeat_pkg/kit-macos.mjs" --disable

# 然后按修复报告核对撤回，或更新上游后重新检查修复。
node install.mjs --fix --fix-revert heartbeat-darwin --dry-run
```

kit 不再提供「恢复旧每日心跳」：旧任务退役后要按当初自己的安装方式重建，kit 不替它重新注册。

任务或迁移记录未清理时，kit 拒绝覆盖/撤回 heartbeat 的运行文件。卸载会按当前安装的精确任务标签和脚本路径停止新 launchd。备份会携带运行数据；换目录恢复后必须重新验收并注册任务，不能直接使用旧电脑的迁移记录。

## 开发验证

固定到已核实上游快照后运行（要在 macOS 上跑：里面会调用 `plutil` 等系统工具；在 Linux 上只能借 `process.platform` 垫片跑到面板加载和 `heartbeat.mjs --force` 这一步）：

```bash
node scripts/verify-macos.mjs <上游源码目录>
node scripts/verify-macos-install.mjs <上游源码目录>
```

验证使用临时 HOME/profile、模拟 launchctl 和模型进程，以及真实临时 Unix socket。不会注册实际任务、启动真实 ComfyUI 或打开真实应用；这些仍由 Agent 在目标电脑验收。
