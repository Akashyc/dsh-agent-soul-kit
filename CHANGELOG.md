# 历史更新记录

这里归档 4.5 及以前的更新，按版本从新到旧排列。记录反映当时的行为；当前功能与用法以 [README](README.md) 为准。

最近三条更新见 [README 的版本记录](README.md#版本记录)。

## 4.5（2026-11-01）

跟上游 913a7b2（v2.0.0）：注册新零件 perf / `dsh-agent-perf`（渲染性能护栏，界面上可随时关掉高成本的 `backdrop-filter`；服务端 `apply` 是空的，没有配置、不写状态文件），进可选列表、默认不勾，已有的安装 `--update` 时问一句、拒掉就记进安装记录，不想装可加 `--skip-part perf`。没有新修复：本轮扫出的 5 条疑似问题逐条核对过——echo 诊断日志和换气触发口的写死路径已由 `echo-hub-path` / `huanqi-hub-path` 覆盖，clock 的浏览器候选路径是有意列出各系统安装位置、该文件不在发布清单里，换气测试里的 `D:/AI/yanqing-soul` 只是测试夹具、测试目录也不发布，perf 的 client id 与其它面板件同一约定。

## 4.4（2026-11-01）

新增可选的第五个 Soul preset「砚青 PTC Flash」：照 LarryE135/dsh-flash-presets 的 v3 适配（id `yanqing-ptc-flash`，压缩、裁剪换成带门牌的零件、补上范围压缩，其余照作者），安装问答里和砚青四套一起选、默认不选，已装的用 `--update --flash on/off` 开关；每次安装、更新在线取作者最新发布的版本（`--flash-ref`、`--flash-source` 可指定），`--fix` 钉在已装那一版。

## 4.3（2026-11-01）

修复和安装、更新、恢复分开：那几步只按作者上游装、不打修复，装完单独检查——先列出问题（清单里的逐条判定、清单外的疑似问题），用户逐条选修 / 不修 / 这次先不动，只修选中的；终端里装完会接着问，不在终端里的 `--fix` 只报不改。作者发布清单漏列的文件改由 `--fix` 补拷进已装的包，加载名对不上只提醒、不再停下。Soul preset 改照作者的装法：写进 profile 的 `cordis.patch.yml`（顶层 `- insert:`），不再用独立包 `dsh-soul-preset`，旧安装 `--update` 搬过去并摘掉包和锁文件条目；卸载留空壳也写在 profile 里。修复清单新增 `echo-settings-path`（上游 11-01 回声面板的设置兜底写死作者电脑的记忆中枢）。按上游 e6d66f5 逐条核对：clock 定位、换气触发口等待、compact-region 日志路径作者已修，这 3 条从清单删掉（id 不再使用），清单剩 19 条。修复判定改成先还原再比：已装文件是「上一版作者原文 + kit 补丁」时，不再因为作者改过版就误判成「本机改过」——那会让零件永远停在旧版、每次都说「将打上」；有安装记录或 `--source` 基线就照常换上新版。`preset-summary-model` 判成「本机不需要」时不再借用「请手动合并」的说法。

## 4.2（2026-11-01）

mcp-hub 清单里的 echo 显式带上 `env.DSH_HOME`：上游 8ba1385 的 `echo-mcp.mjs` 没有它就去作者电脑的 `D:/AI/dsh/home` 找会话日志，而 mcp-hub 会滤掉继承来的 `DSH_*`；旧安装 `--update` 补上。换气测试触发口的判定认出作者 11-01 v1.2.2 的 `waitUntilQuiet`（先等 agent 静下来再压，和 `huanqi-trigger-idle` 同一个意思），判为作者已修、不再打，不再报「需人工核对」。

## 4.1（2026-11-01）

macOS 真装验收通过。新增两道装前保护：上游发布清单漏列、入口却导入的文件拷包时补上并写进 `files`（修复 `pack-unshipped`，4606555 的 yantai 漏了 `env-config.mjs`）；DSH 启动要加载的文件先过 `node --check`，有语法错误就在动手前停下（上游 486be3d 的回声面板 `client.js` 坏了，照装 DSH 窗口起不来）。安装问答不再问替换作者称呼，默认不换，内置方案 `nameMap` 清空；问答中按 Ctrl+C 干净退出。按作者 10-31 的更正去掉换气在 Windows 桌面版装不上的警告。删掉 `tests/`，改 kit 后改用隔离干跑检查。

## 4.0（2026-10-31）

跟上游 4606555：零件仓 organs 弃用，所有零件取自主仓、包名回到 `dsh-agent-*`（旧安装 `--update` 迁移）；换气、换气面板、mcp-hub 改为必装；修复清单 20 条（去掉取源 / 包名 5 条，作者修好的 clock 定位、compact-region 日志路径、触发口等待自动退役，新增 Mac 上 echo 面板找 node、echo 面板诊断日志路径）。新增 macOS `install.sh`、Windows `install.ps1` 一行装；Mac 上可代为退出 DSH；问答和干跑提示各系统用不了的零件；生成的文档里路径写成 `$HOME/…`。`install.mjs` 拆出零件目录、方案问答、系统差异三个模块。卸载空壳兼容新包名。

## 3.0（2026-10-29）

建立 23 条修复清单，新增独立修复、筛选、跳过、撤回和重装命令；补齐原文核对、本机修改保护和失败回滚。迭代同时检查主仓与 organs，支持作者修复自动退役、疑似问题扫描及变更证据登记。preset 统一为砚青四套，移除 Flash，旧会话和默认入口自动迁移。

## 2.17（2026-10-29）

压缩摘要默认跟随会话模型，解决账号登录时缺少 `deepseek-official` API key 导致的压缩失败；可选择保留作者模型设置。

## 2.16（2026-10-29）

换气改从 organs 取源，补齐诊断路径、全量压缩、空闲等待和命令参数修复；preset 按作者算法展开并核对哈希，记录 organs 提交号与契约版本。

## 2.15（2026-10-29）

`assets/parts/compact-region` 快照跟上本机修好的那版：命令参数不再只认 `invocation.rawInput`（实机证明人打的参数到 handler 会是空串），改成依次试 `rawInput / args / argsText / input / text` 并去掉行首命令名 —— 换气程序化调用传的是整行（`commands.execute(agent, line, [], signal)`），两种形状都要接住；诊断日志顺带打出 `invocation` 的键名，下次失败能直接看到参数藏在哪

## 2.14（2026-10-29）

装、更新、卸载三处写配置前统一做一遍「布尔消毒」：换气配置里的 `fullCompactOnBreaker: 'true'` / `postCompactRecallHint: 'true'` 是字符串，过不了 Schemastery 的 `z.boolean()`，cordis 记一条 ValidationError 之后**整段配置静默退回默认值** —— 插件照跑，所以一直没人发现改的配置根本没生效。只在 `- id: huanqi` 这一段里、只掰已读过 schema 的两个布尔键（别的插件、别的键一律不碰），修了会在输出里报一行

## 2.13（2026-10-29）

Soul preset 的默认方案只装砚青四套，去掉 PTC · Soul · Flash；新会话默认 preset 从 Flash 模式改成砚青；安装问卷的默认项、`--default-preset` 参数示例和不指定时的兜底值一起改。已经装过的电脑照安装记录来，不会被强制重装

## 2.12（2026-10-29）

修 2.11 更新到一半停下、DSH 起不来的问题：更新时必装零件和 Soul preset 要调用的零件（compact-region 等）本机没有就补装，不能跳过，恢复旧备份时也一样；安装包版本号按数字比（以前按字符串，`2.9` 比 `2.11` 算大）；按新名落地的包不再被下次更新当成「本机改过」；package.json 只写真的在的零件；以前的 Soul preset id（standard-soul、cordis-soul 等）还有会话在用的，留一个和对应砚青 preset 一样的别名，旧会话照常打开；去掉还有会话在用的 preset 会报出来；`--dsh-home` 指的目录没有 profile 时不管别处有没有都停下

## 2.11（2026-10-29）

Soul preset 改成「kit 只造 PTC · Soul · Flash，砚青四套逐字搬上游 `presets/`」（以前是自己派生五套）；上游四套用 `# @include $DIR/_shared/compaction.yml` 共享压缩组，安装时按缩进展开；压缩三件套按上游 preset 的引用统一成 `dsh-yanqing-compaction` / `dsh-yanqing-pruner` / `dsh-yanqing-compact-region`，拷包时把 `package.json` 和 `cordis.patch.yml` 的 name 一起改；`compact-region` 从零件仓 `cyanwell/dsh-agent-organs` 取，离线用 `assets/parts/` 快照；卸载映射改成砚青四套；PTC · Soul · Flash 同步砚青的压缩模型（deepseek-official / deepseek-flash），打开 workflow-ptc 与 tool-workflow，补上 command-compact-region

## 2.10（2026-10-29）

修 `--dsh-home` 两处：指定的家目录里没有 `profiles/<profile>/package.json` 时明确失败，不再静默回落到 `~/.dsh`（以前真跑会把文件写进另一份家目录）；`--dsh-home` 和环境变量 `DSH_HOME` 给相对路径时先解析成绝对路径，修好预设解析阶段 `createRequire` 抛 `ERR_INVALID_ARG_VALUE` 的崩溃；补两条回归测试

## 2.9（2026-10-28）

称呼替换（方案 `nameMap`、`--rename`，记进安装记录和备份；全新安装问卷加一题，默认换成用户称呼）；更新时下载已装那一版上游当基准，分开报「上游改的」和「本机改过的」，修好中枢三方比对把本体和中枢一起改过的脚本误判成「没改过」；`--base-source` 也可用于离线更新

## 2.8（2026-10-28）

跟进上游 `504d2d0`：拷包前核对发布清单（入口导入的文件漏列进 `files` 就停下，`@deepseek-ai/*` 漏声明 `peerDependencies` 只提示），kit 迭代报告也会列出新出现的这两类问题；更新时上游更新记录只列最近 8 条，并说明实际换什么以文件变化为准；说明里分清作者仓库新加的同名 `install.mjs`、`AGENT-INSTALL.md` 和体检工具不适用于本安装包

## 2.7（2026-10-27）

新增卸载（`--uninstall`）：先打备份包，再收回本体、零件、Soul preset、配置、锁文件、心跳和书房；用 Soul preset 建的旧会话可以留空壳、改写或不管

## 2.6（2026-10-27）

路径改成运行时自动定位，配置和补丁里不再写死用户名；「说话与样子」不再重复补三条规矩；装完在新会话里验收，干跑给出现成的终端命令

## 2.5（2026-10-26）

kit 自身仓库更新与双源迭代（`--kit-update`）；新增标准、极简、Cordis 三个 Soul preset

## 2.4（2026-10-26）

kit 上游分析与自我迭代流程（`--kit-iterate`、`AGENT-ITERATE.md`）；修好换气面板第一次保存失败

## 2.3（2026-10-26）

新增五个可选面板件（model-statusbar、mobile-adapt、riji、splash、yantai）；修正 node 探测和 mnemon 记忆目录的解析

## 2.2（2026-10-26）

装的时候选现成方案或全新安装；必装以外的零件都可选；终端、agent 两种互动方式

## 2.1 及以前（2026-10-24 ~ 10-26）

在 Boss 的 Mac 上首装；跟进上游到 v2.0.0，加上 mcp-hub
