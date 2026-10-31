#!/usr/bin/env node
// dsh-agent-soul 安装包：安装 / 更新 / 备份迁移 / 卸载
//
// 默认从 GitHub 拉 cyanwell/dsh-agent-soul 的最新版（main）。装成什么样的 agent 由「方案」决定：
// 用现成方案（setups/ 下的，例如 大肥鱼），或者全新安装（按引导填设定，填完存成新方案再装）。
// 详细说明见同目录 AGENT-INSTALL.md。必须用 node 18+，推荐用 DSH 自带的 node。
//
//   node install.mjs                        在终端里跑：先选方案（或全新安装），一问一答，确认后才动手
//   node install.mjs --setup 大肥鱼 --dry-run  用现成方案：只报计划，不写任何文件
//   node install.mjs --setup 大肥鱼          用现成方案安装
//   node install.mjs --questions            全新安装（给 agent 用）：打印问题清单（JSON）
//   node install.mjs --fresh --answers <文件> [--dry-run]   全新安装：按回答文件装，并把设定存成新方案
//   node install.mjs --update --dry-run     更新：列出上游改了什么、会动哪些文件
//   node install.mjs --update               更新到最新版
//   node install.mjs --fix --dry-run        修复：对照已装那一版的作者原文，逐条看 kit 修复清单（lib/fixes.mjs）里的问题还在不在
//   node install.mjs --fix                  修复：问题还在就修；作者修好了就换回作者原文（安装、更新、恢复装完也会自动跑这一步）
//   node install.mjs --backup               打一个迁移用的备份包（放在本文件夹的 backups/）
//   node install.mjs --restore [备份包]      在新电脑上：装好并放回备份里的数据（不写包名就用 backups/ 里最新的）
//   node install.mjs --uninstall --dry-run  卸载：先用 kit 打备份包，再卸掉本体、零件、Soul preset、配置和书房
//   node install.mjs --kit-update           检查并安全同步 kit 自身仓库；不能快进时输出合入材料
//   node install.mjs --kit-iterate          先检查 kit 自身更新，再对比插件上游并准备四流程报告
//   node install.mjs --kit-accept <报告目录>  校验 Agent 的完成记录，保存新的 kit 迭代基线
//
// 可选参数：
//   --ref <分支|标签|提交>       装 / 更新到指定版本，默认 main（最新）
//   --source <目录|.tar.gz>      用本地源码，不联网（网络不通时先手动下载）
//   --proxy <地址|none>          下载用的代理；默认依次读 HTTPS_PROXY 等环境变量、系统代理
//   --default-preset <id|keep>   新会话默认用的 preset：yanqing、yanqing-ptc、yanqing-distill、yanqing-cordis 或 keep（更新默认）；安装默认按方案
//   --fix-skip <id,…|none>       修复清单里跳过这几条（已装的 kit 修复会撤掉，换回作者原文）；none 清空。记进安装记录，以后照做
//   --fix-only <id,…>            只用于 --fix：所有阶段只处理这几条（未选条目的旧写法保持现状）
//   --fix-revert <id,…>          只用于 --fix：撤掉这几条 kit 修复，换回作者原文，并记进跳过清单
//   --summary-model <session|author>  2.17 的写法，等于 preset-summary-model 这一条：author = 跳过（照作者写死 deepseek-official），
//                                session = 不跳过（压缩摘要跟会话模型走，没有 DeepSeek API key 的账号登录也能压缩）
//   --app-asar <路径>            DSH 的 app.asar（找不到官方 PTC 时手动指定）
//   --node <路径>                指定用哪个 node 跑（默认自动找：DSH_NODE > DSH 自带 > 当前进程 > PATH > 常见位置）
//   --dsh-home <目录>            DSH 家目录，默认按 DSH_HOME → <用户目录>/.dsh → Windows 的 %APPDATA%\dsh 依次找
//   --profile <名字>             默认 desktop
//   --runtime <目录>             mnemon 热记忆目录；不给就按 dsh-mnemon 的 storageScope 自动解析
//   --data-dir <目录>            mnemon 数据根目录（热记忆在 <目录>/runtime；代替默认的 ~/.mnemon）
//   --confirm-quit               无法自动判断 DSH 是否已退出时，由你确认它已完全退出
//   --skip-part <目录名,…>       不装某个可选零件（例如 mcp-hub）；更新时用它拒掉的，以后也不再补
//   --rename <上游称呼=称呼|none>  称呼替换：把上游代码里作者的称呼（爀曦）换成这台的用户称呼，例如 --rename 爀曦=Boss；
//                                记进安装记录和备份，以后更新、恢复自动照做；none 关掉。不给就安装按方案、更新按安装记录
//   --no-heartbeat               不注册每日心跳（仅安装；默认按方案）
//   --heartbeat-time HH:MM       心跳时间（仅安装；默认按方案）
//   --out <目录>                 备份或 kit 报告父目录，默认 backups/、logs/kit-updates/ 或 logs/kit-iterations/
//   --base-ref <提交>             kit 迭代的对比基线，默认上次完成迭代的提交或 VERIFIED
//   --base-source <目录|.tar.gz>   kit 迭代的本地基线，和 --source 配合可离线检查；离线更新时给「已装那一版」的上游源码
//   --kit-repo <owner/repo>       kit 自身 GitHub 仓库，默认 Akashyc/dsh-agent-soul-kit
//   --kit-ref <分支|标签|提交>    kit 自身目标，默认 main；不影响插件上游的 --ref
//   --kit-source <Git 目录>      kit 自身的离线更新源，默认读取该目录 HEAD
//   --skip-kit-update           本轮跳过 kit 自身检查；离线上游检查未给 --kit-source 时自动跳过
//   --force                      新电脑上已经有灵魂数据时仍然恢复（原有的先整份备份）
//   --old-sessions <shell|rewrite|keep>  卸载时怎么处理用 Soul preset 建的旧会话：shell 留空壳 preset（id 不变、换回官方压缩）、
//                                rewrite 把会话开头的 preset 改成对应的官方 preset、keep 不管（旧会话可能打不开）；终端里不给就问
//   --keep-data                  卸载时保留书房和记忆中枢（DSH 家目录下的 dsh-soul/）；默认一起删，备份包里有
//
// 原则：先备份再动手；重复跑安全；任何一步失败就停下。输出同时存进本文件夹的 logs/。
// 更新只换代码，不碰书房、账本、SELF.src.md、权威源册、人设、主配置和心跳。
// 备份只带 dsh-agent-soul 自己的东西：书房、记忆中枢、会话原文、换气账本、本架构插件的设置；不带 dsh-mnemon 等别的插件。
// 零件目录（必装 / 可选 / 包名 / 各系统上的已知限制）在 lib/parts.mjs；方案和问答在 lib/setup.mjs；找 node、家目录、代理在 lib/platform.mjs。
// 所有零件都从主仓 cyanwell/dsh-agent-soul 的 plugins/ 取（4.0 起，作者弃用了零件仓 organs）。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { once } from 'node:events'
import { createInterface } from 'node:readline/promises'
import { fixQuotedBooleans } from './lib/config-sanitize.mjs'
import { planMemoryConfig } from './lib/home-paths.mjs'
import { inspectPackage, describeIssue } from './lib/package-contract.mjs'
import { parseNameMap, hasNames, nameMapLabel, sameNameMap, renameTree, guessNameMap } from './lib/name-map.mjs'
import { PRESET_IDS, OLD_PRESET_IDS, PRESET_LABEL, PRESET_SOURCE, presetSources, buildPresetBundle, buildShellBundle, OLD_PRESET_LABEL, SUMMARY_MODES } from './lib/soul-presets.mjs'
import { RETIRED_PRESETS, migratePresetDefault, migratePresetBundle, presetBlocks, planPresetSessions, applyPresetSessions } from './lib/preset-migration.mjs'
import { beginFixTransaction } from './lib/fix-transaction.mjs'
import { planManagedText, changedLines, revertConfigLines, hasMissingApiKey } from './lib/fix-records.mjs'
import { FIXES, FIX_IDS, fixInfo, fileFixes, planFile, detectConfigBool, detectSummaryRoute, defaultProvider, unpatchText, STATUS_TEXT, ACTION_TEXT, BASIS_TEXT } from './lib/fixes.mjs'
import { OLD_SESSION_MODES, SOUL_PRESET_IDS, officialPresetFor, planPackageJsonRemoval, removeLockEntries, removeModulesEntries, removePackageMapEntries, planCordisRemoval, planServersRemoval, rewriteSessionHeader, sessionPreset, isSoulHeartbeatPlist } from './lib/uninstall.mjs'
import { PARTS, PART_NAMES, PRESET_ONLY, OPTIONAL_PARTS, MUST_HAVE, ADDED_PARTS, PART_INFO, platformText, verLess } from './lib/parts.mjs'
import { SETUPS, render, parseBool, normalizeAnswers, buildSetupFiles, loadSetup, listSetups, initAnswers, describeSetup, questionSheet, askTerminal } from './lib/setup.mjs'
import { IS_MAC, NODE_MIN_MAJOR, dshHomeCandidates, nodeVersionOf, nodesOnPath, detectNode, resolveProxy as systemProxy, quitDshMac } from './lib/platform.mjs'

const KIT = path.dirname(fileURLToPath(import.meta.url))
const ASSETS = path.join(KIT, 'assets')
const TPL = path.join(ASSETS, 'templates')
const REPO = 'cyanwell/dsh-agent-soul'
const KIT_VERSION = '4.0'
// 这份安装包对照过的上游提交（4.0：逐个零件读源码核对过，桌面端真装验收另记在 CHANGELOG）
const VERIFIED = { sha: '460655554609cb3c6f6dbbeca46206a311b42bd9', date: '2026-10-31' }
const partSrc = (p) => path.join(SRC.dir, 'plugins', p)
// 上游旧版本里还没有的零件（用 --ref 装旧版时不算错）
const OPTIONAL_SRC = ['mcp-hub']
// 中枢同步时不碰的：安装器自己、带写死日志名的测试脚本
const HUB_EXCLUDE = ['install-kit.mjs', 'test-self-check.mjs']
const PRESET_PKG = 'dsh-soul-preset'
const PREDECESSORS = ['dsh-loop-guard', 'dsh-reasoning-only-guard', 'dsh-stalled-turn-continue']
const KIT_SET = ['echo-doctor.mjs', 'echo-config.mjs'] // 中枢里归仓库管的两个脚本，其余按本机演化
const SKIP_RE = /(^|\/)(\.DS_Store|\.git|node_modules)(\/|$)|\.(mp4|mov|webm)$/i

// ── 参数 ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const flag = (k) => argv.includes(k)
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d }
if (flag('--help') || flag('-h')) {
  const head = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n')
  console.log(head.slice(0, head.findIndex((l) => l.startsWith('import '))).join('\n'))
  process.exit(0)
}
const DRY = flag('--dry-run')
// --fix：单独跑修复（3.0）。它沿用更新的流程，但上游钉在已装的那一版，只做修复清单里的事
const FIX_MODE = flag('--fix')
const UPDATE = flag('--update') || FIX_MODE
const BACKUP = flag('--backup')
const RESTORE = flag('--restore')
const RESTORE_FILE = opt('--restore')
const UNINSTALL = flag('--uninstall')
const OLD_SESSIONS = opt('--old-sessions')
const KEEP_DATA = flag('--keep-data')
const KIT_ITERATE = flag('--kit-iterate')
const KIT_ACCEPT = flag('--kit-accept')
const KIT_UPDATE = flag('--kit-update')
const FORCE = flag('--force')
const RENAME_OPT = opt('--rename')
const SUMMARY_OPT = opt('--summary-model')
if (flag('--rename') && RENAME_OPT === undefined) { console.log('--rename 后面要跟「上游称呼=你的称呼」（例如 --rename 爀曦=Boss），或者 none'); process.exit(2) }
const MODE = KIT_UPDATE ? 'kit-update' : KIT_ITERATE ? 'kit-iterate' : KIT_ACCEPT ? 'kit-accept' : BACKUP ? 'backup' : RESTORE ? 'restore' : FIX_MODE ? 'fix' : UPDATE ? 'update' : UNINSTALL ? 'uninstall' : 'install'
let REF = opt('--ref', 'main')
const SOURCE = opt('--source')
const PROXY_OPT = opt('--proxy')
const PROFILE = opt('--profile', 'desktop')
const RUNTIME_OPT = opt('--runtime')
const DATA_DIR_OPT = opt('--data-dir')
let HB_TIME = opt('--heartbeat-time')
let NO_HB = flag('--no-heartbeat')
let DEFAULT_PRESET = opt('--default-preset', UPDATE ? 'keep' : null)
const FRESH = flag('--fresh') || Boolean(opt('--answers'))
const ANSWERS_FILE = opt('--answers')
const SETUP_OPT = opt('--setup')
const QUESTIONS_MODE = flag('--questions')
const TTY = Boolean(process.stdin.isTTY && process.stdout.isTTY) && !flag('--no-input')
let SKIP_PARTS = String(opt('--skip-part', '')).split(',').map((x) => x.trim()).filter(Boolean)
if ([flag('--update'), FIX_MODE, BACKUP, RESTORE, UNINSTALL, KIT_ITERATE, KIT_ACCEPT, KIT_UPDATE].filter(Boolean).length > 1) {
  console.log('--update、--fix、--backup、--restore、--uninstall、--kit-iterate、--kit-accept、--kit-update 一次只能用一个')
  process.exit(2)
}
if ((KIT_ITERATE || KIT_ACCEPT || KIT_UPDATE) && QUESTIONS_MODE) {
  console.log('kit 迭代不能和 --questions 一起使用')
  process.exit(2)
}
if (KIT_ACCEPT && !opt('--kit-accept')) {
  console.log('--kit-accept 需要给出报告目录')
  process.exit(2)
}
if (flag('--base-ref') && !KIT_ITERATE) {
  console.log('--base-ref 只用于 --kit-iterate')
  process.exit(2)
}
if (flag('--base-source') && !KIT_ITERATE && !UPDATE) {
  console.log('--base-source 只用于 --kit-iterate，或离线 --update 时给「已装那一版」的上游源码')
  process.exit(2)
}
if (flag('--base-source') && !opt('--base-source')) {
  console.log('--base-source 需要给出参数值')
  process.exit(2)
}
if (KIT_ITERATE) {
  for (const key of ['--base-ref', '--base-source', '--ref', '--source', '--out']) {
    if (flag(key) && !opt(key)) {
      console.log(`${key} 需要给出参数值`)
      process.exit(2)
    }
  }
}
for (const key of ['--kit-repo', '--kit-ref', '--kit-source', '--skip-kit-update']) {
  if (flag(key) && !KIT_ITERATE && !KIT_UPDATE) {
    console.log(`${key} 只用于 --kit-iterate 或 --kit-update`)
    process.exit(2)
  }
  if (flag(key) && key !== '--skip-kit-update' && !opt(key)) {
    console.log(`${key} 需要给出参数值`)
    process.exit(2)
  }
}
if ((KIT_UPDATE && (flag('--skip-kit-update') || flag('--source') || flag('--ref'))) ||
    (flag('--skip-kit-update') && ['--kit-source', '--kit-repo', '--kit-ref'].some(flag))) {
  console.log('kit 自身更新参数冲突：使用 --kit-source/--kit-ref，且不能同时要求跳过自身检查')
  process.exit(2)
}
if (KIT_UPDATE && flag('--out') && !opt('--out')) {
  console.log('--out 需要给出参数值')
  process.exit(2)
}
if ((flag('--old-sessions') || KEEP_DATA) && !UNINSTALL) { console.log('--old-sessions、--keep-data 只用于 --uninstall'); process.exit(2) }
if (flag('--old-sessions') && !Object.keys(OLD_SESSION_MODES).includes(OLD_SESSIONS)) { console.log(`--old-sessions 只能是 ${Object.keys(OLD_SESSION_MODES).join(' / ')}：\n${Object.entries(OLD_SESSION_MODES).map(([k, v]) => `  ${k}：${v}`).join('\n')}`); process.exit(2) }
if (RUNTIME_OPT && DATA_DIR_OPT) { console.log('--runtime（直接给热记忆目录）和 --data-dir（给数据根目录）只能用一个'); process.exit(2) }
if (DEFAULT_PRESET !== null && ![...PRESET_IDS, 'keep'].includes(DEFAULT_PRESET)) { console.log(`--default-preset 只能是 ${PRESET_IDS.join(' / ')} / keep`); process.exit(2) }
if (flag('--summary-model') && !SUMMARY_MODES[SUMMARY_OPT]) { console.log(`--summary-model 只能是：\n${Object.entries(SUMMARY_MODES).map(([k, v]) => `  ${k}：${v}`).join('\n')}`); process.exit(2) }
// 修复清单的参数（lib/fixes.mjs）：id 用逗号隔开
const idsOpt = (k) => String(opt(k, '')).split(',').map((x) => x.trim()).filter(Boolean)
const FIX_ONLY = idsOpt('--fix-only'), FIX_REVERT = idsOpt('--fix-revert')
const FIX_SKIP_OPT = flag('--fix-skip') ? opt('--fix-skip') : undefined
for (const k of ['--organs-source', '--organs-base-source', '--fix-reinstall']) if (flag(k)) { console.log(`${k} 在安装包 4.0 去掉了：作者弃用了零件仓 organs，所有零件都从主仓取；包名迁移改用 --update`); process.exit(2) }
for (const k of ['--fix-only', '--fix-revert']) if (flag(k) && !FIX_MODE) { console.log(`${k} 只用于 --fix`); process.exit(2) }
if (FIX_MODE && (flag('--rename') || flag('--default-preset') || flag('--skip-part') || flag('--ref'))) { console.log('--fix 只按已装的那一版修：改称呼替换、默认 preset、零件取舍或换版本请用 --update'); process.exit(2) }
for (const k of ['--fix-only', '--fix-revert', '--fix-skip']) if (flag(k) && !opt(k)) { console.log(`${k} 后面要跟修复条目的 id（逗号隔开）${k === '--fix-skip' ? '，或者 none 清空' : ''}；全部 id 见 node install.mjs --fix --dry-run`); process.exit(2) }
if (FIX_SKIP_OPT !== undefined && ['backup', 'uninstall', 'kit-update', 'kit-iterate', 'kit-accept'].includes(MODE)) { console.log('--fix-skip 只用于安装、更新、恢复和 --fix'); process.exit(2) }
{
  const given = [...FIX_ONLY, ...FIX_REVERT, ...(FIX_SKIP_OPT && FIX_SKIP_OPT !== 'none' ? FIX_SKIP_OPT.split(',').map((x) => x.trim()).filter(Boolean) : [])]
  const bad = given.filter((id) => !FIX_IDS.includes(id))
  if (bad.length) { console.log(`不认识的修复条目：${bad.join('、')}。认得的：\n${FIXES.map((f) => `  ${f.id}：${f.title}`).join('\n')}`); process.exit(2) }
}
if ((FRESH || SETUP_OPT) && MODE !== 'install') { console.log('--setup、--fresh、--answers 只用于安装；更新、备份、恢复、卸载不需要选方案'); process.exit(2) }
if (FRESH && SETUP_OPT) { console.log('--setup（用现成方案）和 --fresh（全新安装）只能选一个'); process.exit(2) }
if (opt('--heartbeat-time') && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(opt('--heartbeat-time'))) { console.log(`--heartbeat-time 格式不对：${opt('--heartbeat-time')}，要 HH:MM`); process.exit(2) }

// ── 输出（同时记进 logs/）──────────────────────────────────────────────
const TS = (() => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}` })()
const LOG_LINES = []
const out = (m) => { console.log(m); LOG_LINES.push(m) }
const ok = (m) => out('  ✓ ' + m)
const info = (m) => out('    ' + m)
const WARNS = []
const warn = (m) => { WARNS.push(m); out('  ! ' + m) }
let STEP_N = 0
const step = (m) => out(`\n■ ${STEP_N++}. ${m}`)
const TMP_DIRS = []
let LOG_FILE = null
let FIX_TRANSACTION = null
process.on('SIGINT', () => process.exit(130))
process.on('SIGTERM', () => process.exit(143))
process.on('exit', (code) => {
  if (FIX_TRANSACTION && code !== 0) {
    try {
      FIX_TRANSACTION.rollback()
      out('修复失败，已自动回滚本次涉及的文件、包和安装记录。')
    } catch (error) {
      out(error.message)
    }
  }
  for (const d of TMP_DIRS) { try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* 清不掉就算了 */ } }
  if (QUESTIONS_MODE || KIT_ITERATE || KIT_ACCEPT || KIT_UPDATE) return // kit 模式自行保存报告，不写安装日志
  try {
    fs.mkdirSync(path.join(KIT, 'logs'), { recursive: true })
    LOG_FILE = path.join(KIT, 'logs', `${MODE}${DRY ? '-dry' : ''}-${TS}.log`)
    fs.writeFileSync(LOG_FILE, LOG_LINES.join('\n'), 'utf8')
    console.log(`\n（这次的输出已存到 ${LOG_FILE}）`)
  } catch { /* 写不了日志不影响结果 */ }
})
let TOUCHED = false // 过了备份那一步才算动过文件
function die(m) {
  out('\n  ✗ ' + m)
  out(TOUCHED ? '  已停止。到这一步为止改过的文件都有备份，见上面的输出。' : '  已停止。还没有改任何文件。')
  process.exit(1)
}

// ── 小工具 ────────────────────────────────────────────────────────────
// 干跑时 DSH 开着（多半是 DSH 里的 agent 在跑）：它自己没法在 DSH 退出后真跑，把现成的终端命令给用户
function printTerminalHint(extra = []) {
  const q = (a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `"${a.replace(/(["\\$`])/g, '\\$1')}"`)
  // 命令先 cd 到安装包，所以带路径的参数要换成绝对路径；--proxy 里的账号密码不进日志
  const PATH_OPTS = ['--source', '--base-source', '--kit-source', '--app-asar', '--answers', '--restore', '--runtime', '--data-dir', '--dsh-home', '--node', '--out']
  let masked = false
  const args = [...argv.filter((a) => a !== '--dry-run'), ...extra].map((a, i, all) => {
    const prev = all[i - 1]
    if (PATH_OPTS.includes(prev) && !a.startsWith('--')) return path.resolve(a)
    if (prev === '--proxy' && /\/\/[^/@\s]*@/.test(a)) { masked = true; return a.replace(/\/\/[^/@\s]*@/, '//***@') }
    return a
  })
  const cmd = process.platform === 'win32'
    ? `cd "${KIT}"; & "${process.execPath}" .\\install.mjs ${args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`
    : `cd ${q(posix(KIT))} && ${q(posix(process.execPath))} install.mjs ${args.map(q).join(' ')}`
  out(`\n真跑：先完全退出 DSH${process.platform === 'darwin' ? '（Cmd+Q）' : process.platform === 'win32' ? '（托盘图标也要退出），再在 PowerShell 里跑' : ''}${process.platform === 'win32' ? '' : '，再在终端里跑'}：\n  ${cmd.replace(/ +$/, '')}`)
  if (masked) out('（--proxy 里的账号密码没有照抄进来，跑之前把 *** 换回原来的）')
}
const posix = (p) => p.replace(/\\/g, '/')
// 给人和 agent 读的路径：在用户目录下的写成 $HOME/…（不带用户名）
const homePath = (p) => { const r = path.relative(os.homedir(), p); return r && !r.startsWith('..') && !path.isAbsolute(r) ? '$HOME/' + posix(r) : posix(p) }
const exists = (p) => fs.existsSync(p)
const readText = (p) => fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')
const readJson = (p) => { try { return JSON.parse(readText(p)) } catch { return null } }
const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex')
const short = (s) => (s ? s.slice(0, 7) : '未知')

function write(p, content, what) {
  if (DRY) { info(`[干跑] 将写入 ${what || p}`); return }
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content, 'utf8')
}
function mkdir(p) { if (!DRY) fs.mkdirSync(p, { recursive: true }) }
function backup(p, tag) {
  if (!exists(p)) return null
  const b = `${p}.bak-${TS}-${tag}`
  if (!DRY) fs.copyFileSync(p, b)
  return b
}
function runNode(script, args, label, { dryRun = DRY } = {}) {
  if (dryRun) { info(`[干跑] 将运行 ${label}`); return { ok: true, out: '' } }
  const r = spawnSync(process.execPath, [script, ...args], { cwd: path.dirname(script), encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, maxBuffer: 64 * 1024 * 1024, windowsHide: true })
  return { ok: r.status === 0, code: r.status, out: String(r.stdout || '') + String(r.stderr || ''), error: r.error }
}

// 终端里问一句（每次单开单关，问完不留着 stdin，脚本才能正常结束）
async function askLine(prompt) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try { return String(await rl.question(prompt)).trim() } finally { rl.close() }
}

// 列出一个包「发布出去」会有的文件：按 package.json 的 files 清单（和 npm / pnpm 的规则一致），
// 外加 package.json、README、LICENSE。没有 files 清单就是整个目录。返回相对路径（/ 分隔）。
function walk(root, rel = '', acc = []) {
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name
    if (SKIP_RE.test(r)) continue
    if (e.isDirectory()) walk(root, r, acc)
    else if (e.isFile()) acc.push(r)
  }
  return acc
}
function packFiles(dir) {
  const all = walk(dir)
  const pj = readJson(path.join(dir, 'package.json'))
  if (!pj || !Array.isArray(pj.files) || !pj.files.length) return all.sort()
  const rules = pj.files.map((f) => String(f).replace(/^\.\//, '').replace(/\/+$/, ''))
  const globs = rules.filter((f) => f.includes('*')).map((g) => new RegExp('^' + g.split('**').map((s) => s.split('*').map((t) => t.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*') + '(/.*)?$'))
  const plain = rules.filter((f) => !f.includes('*'))
  return all.filter((f) => /^package\.json$|^(readme|license|licence)(\.[^/]*)?$/i.test(f) || plain.some((p) => f === p || f.startsWith(p + '/')) || globs.some((g) => g.test(f))).sort()
}
function hashFiles(root, files) { const m = new Map(); for (const f of files) m.set(f, sha1(fs.readFileSync(path.join(root, f)))); return m }
function hashDir(root, ignore = []) { return exists(root) ? hashFiles(root, walk(root).filter((f) => !ignore.includes(f))) : new Map() }
// 已装的包：只看它 files 清单内的文件（清单外的文档、测试本来就不归运行时管，pnpm 重装也会清掉）
function hashInstalled(root, ignore = []) { return exists(root) ? hashFiles(root, packFiles(root).filter((f) => !ignore.includes(f))) : new Map() }
function diffMaps(oldM, newM) {
  const added = [], removed = [], changed = []
  for (const [f, h] of newM) { if (!oldM.has(f)) added.push(f); else if (oldM.get(f) !== h) changed.push(f) }
  for (const f of oldM.keys()) if (!newM.has(f)) removed.push(f)
  return { added, removed, changed, same: !added.length && !removed.length && !changed.length }
}
// 把源包按 files 清单装到 dst：先拷进旁边的暂存目录、核对过再换上，失败不留半截
function installPackage(src, dst, label, keep = []) {
  const files = packFiles(src)
  if (DRY) { info(`[干跑] 将安装 ${label}（${files.length} 个文件）→ ${dst}`); return }
  const stage = dst + `.stage-${TS}`
  fs.rmSync(stage, { recursive: true, force: true })
  for (const f of files) { const t = path.join(stage, ...f.split('/')); fs.mkdirSync(path.dirname(t), { recursive: true }); fs.copyFileSync(path.join(src, ...f.split('/')), t) }
  const want = hashFiles(src, files), got = hashDir(stage)
  if (!diffMaps(want, got).same) { fs.rmSync(stage, { recursive: true, force: true }); die(`${label} 拷贝不完整`) }
  if (exists(dst)) {
    for (const k of keep) { const from = path.join(dst, k); if (exists(from)) { fs.mkdirSync(path.dirname(path.join(stage, k)), { recursive: true }); fs.copyFileSync(from, path.join(stage, k)) } }
    fs.rmSync(dst, { recursive: true, force: true })
  }
  fs.renameSync(stage, dst)
  ok(`${label}：已安装（${files.length} 个文件）`)
}

// ── 下载 ──────────────────────────────────────────────────────────────
const resolveProxy = () => systemProxy(PROXY_OPT)
// 打印代理地址时把账号密码遮掉（日志会存盘）
const showProxy = (u) => String(u).replace(/\/\/[^/@]*@/, '//***@')
let CURL = null
function curlBin() {
  if (CURL !== null) return CURL
  for (const c of process.platform === 'win32' ? ['curl.exe', 'curl'] : ['curl']) { const r = spawnSync(c, ['--version'], { encoding: 'utf8', windowsHide: true }); if (r.status === 0) return (CURL = c) }
  return (CURL = '')
}
async function download(url, file) {
  const proxy = resolveProxy()
  const errs = []
  if (curlBin()) {
    const a = ['-fsSL', '--retry', '2', '--connect-timeout', '20', '--max-time', '600', '-o', file]
    if (proxy) a.push('-x', proxy)
    a.push(url)
    const r = spawnSync(curlBin(), a, { encoding: 'utf8', windowsHide: true })
    if (r.status === 0 && exists(file) && fs.statSync(file).size > 0) return { ok: true, via: 'curl' + (proxy ? `，代理 ${showProxy(proxy)}` : '') }
    errs.push(`curl${proxy ? `（代理 ${showProxy(proxy)}）` : ''}：${String(r.stderr || (r.error && r.error.message) || '退出码 ' + r.status).trim()}`)
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(600000) })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
    return { ok: true, via: 'node 直连' }
  } catch (e) { errs.push('node 直连：' + (e.cause && e.cause.message ? e.cause.message : e.message)) }
  return { ok: false, errs, proxy }
}
// 解 GitHub 的 .tar.gz（含 pax 头；全局头里的 comment 就是提交号）
function extractTarGz(file, outDir) {
  const buf = zlib.gunzipSync(fs.readFileSync(file))
  // pax 记录的长度按字节算（中文路径是多字节），所以要在 Buffer 上切，不能在字符串上切
  const pax = (data) => { const r = {}; let off = 0; while (off < data.length) { const sp = data.indexOf(0x20, off); if (sp < 0) break; const n = parseInt(data.subarray(off, sp).toString('ascii'), 10); if (!n) break; const rec = data.subarray(sp + 1, off + n - 1).toString('utf8'); const eq = rec.indexOf('='); r[rec.slice(0, eq)] = rec.slice(eq + 1); off += n } return r }
  let off = 0, comment = null, nextPath = null, root = null
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512)
    if (h.every((b) => b === 0)) break
    const str = (a, b) => h.subarray(a, b).toString('utf8').replace(/\0[\s\S]*$/, '')
    const size = parseInt(str(124, 136).trim() || '0', 8)
    const mtime = parseInt(str(136, 148).trim() || '0', 8)
    const type = h[156] === 0 ? '0' : String.fromCharCode(h[156])
    const data = buf.subarray(off + 512, off + 512 + size)
    off += 512 + Math.ceil(size / 512) * 512
    if (type === 'g') { const r = pax(data); if (r.comment) comment = r.comment; continue }
    if (type === 'x') { const r = pax(data); if (r.path) nextPath = r.path; continue }
    if (type === 'L') { nextPath = data.toString('utf8').replace(/\0[\s\S]*$/, ''); continue }
    const prefix = str(345, 500)
    const rel = (nextPath || (prefix ? prefix + '/' + str(0, 100) : str(0, 100))).replace(/^\.\//, '')
    nextPath = null
    if (!rel || rel.startsWith('/') || rel.split('/').includes('..')) continue
    if (!root) root = rel.split('/')[0]
    if (SKIP_RE.test(rel)) continue
    const dest = path.join(outDir, ...rel.split('/'))
    if (type === '5') fs.mkdirSync(dest, { recursive: true })
    else if (type === '0' || type === '7') {
      fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, data)
      // 修改时间也要还原：体检挑「最近几份日志」、索引判「之后新增」都看它
      if (mtime > 0) try { fs.utimesSync(dest, mtime, mtime) } catch {}
    }
  }
  if (!root) throw new Error('压缩包是空的')
  return { dir: path.join(outDir, root), sha: /^[0-9a-f]{40}$/.test(comment || '') ? comment : null }
}
// ── 备份包：tar.gz（pax 头存中文长路径；目录也单独记，空目录才不会丢）────────
function walkAll(root, rel = '', acc = { dirs: [], files: [] }, skip = () => false) {
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name
    if (SKIP_RE.test(r) || skip(r, e)) continue
    if (e.isDirectory()) { acc.dirs.push(r); walkAll(root, r, acc, skip) }
    else if (e.isFile()) acc.files.push(r)
  }
  return acc
}
function tarHeader(name, size, type, mtimeMs) {
  const h = Buffer.alloc(512)
  const put = (str, off, len) => Buffer.from(str, 'utf8').copy(h, off, 0, len)
  put(name, 0, 100)
  put(type === '5' ? '0000755\0' : '0000644\0', 100, 8)
  put('0000000\0', 108, 8); put('0000000\0', 116, 8)
  put(size.toString(8).padStart(11, '0') + '\0', 124, 12)
  put(Math.floor(mtimeMs / 1000).toString(8).padStart(11, '0') + '\0', 136, 12)
  h.fill(0x20, 148, 156)
  h[156] = type.charCodeAt(0)
  put('ustar\0', 257, 6); put('00', 263, 2)
  let sum = 0; for (const b of h) sum += b
  put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8)
  return h
}
function paxRecord(k, v) {
  const body = ` ${k}=${v}\n`, bl = Buffer.byteLength(body)
  let d = String(bl).length
  while (String(bl + d).length !== d) d++
  return `${bl + d}${body}`
}
async function writeTarGz(outFile, entries) {
  const gz = zlib.createGzip({ level: 6 })
  const ws = fs.createWriteStream(outFile)
  gz.pipe(ws)
  const put = async (buf) => { if (!gz.write(buf)) await once(gz, 'drain') }
  for (const e of entries) {
    const data = e.dir ? Buffer.alloc(0) : (e.data !== undefined ? Buffer.from(e.data) : fs.readFileSync(e.path))
    const name = e.dir ? e.name + '/' : e.name
    const mtime = e.path && exists(e.path) ? fs.statSync(e.path).mtimeMs : Date.now()
    let hdrName = name
    if (Buffer.byteLength(name) > 99 || /[^\x20-\x7e]/.test(name)) {
      const rec = Buffer.from(paxRecord('path', name), 'utf8')
      await put(tarHeader('PaxHeader/entry', rec.length, 'x', mtime)); await put(rec); await put(Buffer.alloc((512 - (rec.length % 512)) % 512))
      hdrName = name.replace(/[^\x20-\x7e]/g, '_').slice(-99)
    }
    await put(tarHeader(hdrName, data.length, e.dir ? '5' : '0', mtime))
    if (data.length) { await put(data); await put(Buffer.alloc((512 - (data.length % 512)) % 512)) }
  }
  await put(Buffer.alloc(1024))
  gz.end()
  await once(ws, 'finish')
}
const BK_ROOT = 'dsh-soul-backup' // 备份包里的顶层目录
// 本架构插件在 profile cordis.patch.yml 里的条目：按各包 bundle patch 顶层插入的 id 认（不碰 dsh-mnemon 等别的插件）
function soulEntryIds(nm, pkgDirs, parse) {
  const ids = new Set()
  for (const d of pkgDirs) {
    const f = path.join(nm, d, 'cordis.patch.yml')
    if (!exists(f)) continue
    try { for (const blk of parse(readText(f)) || []) for (const r of (blk && blk.insert) || []) if (r && r.id) ids.add(r.id) } catch { /* 解析不了就跳过 */ }
  }
  return ids
}
function cordisBlocks(text) {
  // 顶层「- id: X」到下一个顶层「- 」之间算一块（也认 - { id: X, ... } 这种单行写法）
  const lines = text.replace(/\r\n/g, '\n').split('\n'), out = []
  let cur = null
  for (const l of lines) {
    const m = l.match(/^- (?:\{\s*)?id: ['"]?([^'",}\s]+)['"]?/)
    if (m) { if (cur) out.push(cur); cur = { id: m[1], lines: [l] }; continue }
    if (/^-/.test(l) || /^\S/.test(l)) { if (cur) out.push(cur); cur = null; continue }
    if (cur) cur.lines.push(l)
  }
  if (cur) out.push(cur)
  return out.map((b) => ({ id: b.id, text: b.lines.join('\n').replace(/\n+$/, '') }))
}
function newestBackup() {
  const dir = path.join(KIT, 'backups')
  if (!exists(dir)) return null
  const f = fs.readdirSync(dir).filter((x) => /^dsh-soul-backup-.*\.tar\.gz$/.test(x)).sort().pop()
  return f ? path.join(dir, f) : null
}
// 恢复时把源电脑的路径换成本机路径（正斜杠、反斜杠、JSON 里转义的反斜杠三种写法都认）
function pathPairs(from, to) {
  const pairs = []
  for (const k of ['hub', 'memory', 'soul', 'sessions', 'runtime', 'dshHome']) {
    if (!from[k] || !to[k] || from[k] === to[k]) continue
    const a = from[k], b = to[k]
    pairs.push([a, b], [a.replace(/\//g, '\\'), b], [a.replace(/\//g, '\\\\'), b]) // 新路径一律用正斜杠，Windows 上 node 也认
  }
  return pairs.sort((x, y) => y[0].length - x[0].length)
}
function rewritePaths(t, pairs) {
  if (!pairs.length) return t
  const map = new Map(pairs)
  const re = new RegExp(pairs.map(([a]) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g') // 一遍换完，换过的不会再被换
  return t.replace(re, (m) => map.get(m))
}

async function getSource({ ref = REF, source = SOURCE, soft = false } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-soul-src-'))
  TMP_DIRS.push(tmp)
  if (source) {
    const s = path.resolve(source)
    if (!exists(s)) die(`--source 指的地方不存在：${s}`)
    if (fs.statSync(s).isDirectory()) {
      let dir = s
      if (!exists(path.join(dir, 'package.json'))) {
        const subs = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && exists(path.join(dir, e.name, 'package.json')))
        if (subs.length === 1) dir = path.join(dir, subs[0].name)
      }
      let sha = null
      if (exists(path.join(dir, '.git'))) { const r = spawnSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }); if (r.status === 0) sha = r.stdout.trim() }
      return { dir, sha, local: true, from: '本地目录 ' + posix(dir) }
    }
    if (/\.(tar\.gz|tgz)$/i.test(s)) { const r = extractTarGz(s, tmp); return { ...r, from: '本地压缩包 ' + posix(s) } }
    die('--source 只认文件夹或 .tar.gz。下载的是 .zip 的话，先解压，再把解压出的文件夹传给 --source')
  }
  const url = `https://codeload.github.com/${REPO}/tar.gz/${ref.split('/').map(encodeURIComponent).join('/')}`
  const file = path.join(tmp, 'upstream.tar.gz')
  info(`下载 ${url}`)
  const d = await download(url, file)
  if (!d.ok && soft) { info(`没下载到（${d.errs.join('；')}），这一份先不用`); return null }
  if (!d.ok) {
    const tip1 = d.proxy ? `① 代理 ${showProxy(d.proxy)} 这次没连上 GitHub：过一会儿重跑，或者换个代理地址加 --proxy <地址> 重跑` : '① 加 --proxy http://127.0.0.1:<端口> 走代理重跑'
    die(`下载失败：\n      ${d.errs.join('\n      ')}\n    办法任选一个：\n      ${tip1}\n      ② 浏览器打开 https://github.com/${REPO}/archive/${ref}.tar.gz 下载，再加 --source <下载的文件> 重跑（基线用 --base-source；也可以是 git clone 下来的文件夹）`)
  }
  let r
  try { r = extractTarGz(file, tmp) } catch (e) { if (soft) { info(`解压失败（${e.message}），这一份先不用`); return null } die(`解压失败：${e.message}`) }
  return { ...r, from: `GitHub ${REPO}@${ref}（${d.via}）` }
}

// ── 源码体检 ──────────────────────────────────────────────────────────
const REQUIRED_SOURCE_FILES = ['package.json', 'index.js', 'cordis.patch.yml', 'kit/echo/install-kit.mjs', 'kit/echo/scaffold.mjs', 'kit/templates/SELF.src.md', 'tools/init.mjs', 'tools/verify-client-ids.mjs']
function checkSource(dir) {
  const missing = REQUIRED_SOURCE_FILES.filter((f) => !exists(path.join(dir, f)))
  if (missing.length) die(`上游源码里缺这些文件：${missing.join('、')}。可能是仓库结构改了，这份安装包还没跟上。\n    先用 --ref ${VERIFIED.sha.slice(0, 7)} 装安装包对照过的版本，并告诉用户。`)
  const names = {}, absent = []
  for (const p of PARTS) {
    const pj = readJson(path.join(dir, 'plugins', p, 'package.json'))
    if (!pj || !pj.name) {
      if (OPTIONAL_SRC.includes(p)) { absent.push(p); continue }
      die(FIX_MODE ? `已装那一版的上游里没有 plugins/${p}（安装包 3.0 及以前从零件仓 organs 取它）：--fix 只能对照已装那一版，请先跑 --update 升到安装包 4.0 的装法。`
        : `上游源码里找不到零件 plugins/${p}。可能是零件改名或删掉了，这份安装包还没跟上。\n    先用 --ref ${VERIFIED.sha.slice(0, 7)} 装安装包对照过的版本，并告诉用户。`)
    }
    if (!PART_NAMES[p].includes(pj.name)) die(`上游把零件 ${p} 的包名改成了 ${pj.name}，这份安装包还不认识这个名字（认得的：${PART_NAMES[p].join('、')}）。包名牵连 bundles、dependencies、锁文件和 Soul preset，要先更新安装包，先停下告诉用户。\n    想先装回验证过的版本：--ref ${VERIFIED.sha.slice(0, 7)}`)
    names[p] = pj.name
  }
  const extra = fs.readdirSync(path.join(dir, 'plugins'), { withFileTypes: true }).filter((e) => e.isDirectory() && !PARTS.includes(e.name) && exists(path.join(dir, 'plugins', e.name, 'package.json'))).map((e) => e.name)
  return { names, extra, absent }
}

// ── 修复清单（3.0，lib/fixes.mjs）────────────────────────────────────────
// kit 对上游插件的每一处修改都登记在 lib/fixes.mjs：文件补丁、配置、preset 在装完后的「修复」一步对照作者原文逐条判定：
// 问题还在才修，作者修好了就换回作者原文。
// 路径类修复不写死任何一台电脑的路径：运行时自己找 DSH 家目录（DSH_HOME → 插件所在位置 → ~/.dsh，见 lib/home-paths.mjs）。
const reEsc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// kit 迭代（lib/kit-iterate.mjs）和安装共用同一份文件补丁定义
function patchList(runtime, names, dshHome) { return fileFixes({ runtime, names, dshHome, partNames: PART_NAMES }) }
// 每个包的 cordis.patch.yml 里要加载的 name，都必须真能在 node_modules 里找到（@deepseek-ai/*、cordis:* 是 DSH 自带的）
// 找不到 = DSH 启动时 import 失败。这次上游改名漏改的就是这一类
function patchNamesMissing(nm, pkgDirs, parse) {
  const bad = []
  for (const d of pkgDirs) {
    const f = path.join(nm, d, 'cordis.patch.yml')
    if (!exists(f)) continue
    let doc
    try { doc = parse(readText(f)) } catch (e) { bad.push(`${d}/cordis.patch.yml 解析失败：${e.message}`); continue }
    const names = []
    const visit = (node, inArray) => {
      if (Array.isArray(node)) { for (const x of node) visit(x, true); return }
      if (!node || typeof node !== 'object') return
      if (inArray && typeof node.name === 'string') names.push(node.name)
      for (const v of Object.values(node)) visit(v, false)
    }
    visit(doc, false)
    for (const n of names) {
      if (n.startsWith('@deepseek-ai/') || n.startsWith('cordis:')) continue
      if (!exists(path.join(nm, ...n.split('/'), 'package.json'))) bad.push(`${d} 要加载 ${n}，node_modules 里没有`)
    }
  }
  return bad
}

// ── Soul preset ───────────────────────────────────────────────────────
function yamlParser(prof) {
  const req = createRequire(path.resolve(path.join(prof, 'package.json')))
  try {
    const y = req('js-yaml')
    const JS = new y.Type('tag:yaml.org,2002:js', { kind: 'scalar', construct: (s) => ({ js: s }) })
    const schema = y.DEFAULT_SCHEMA.extend([JS])
    return (s) => y.load(s, { schema })
  } catch { return null }
}
function presetSummary(text) {
  // 每个 preset：id → 插件 id 列表（含组内），用于更新时比对
  const r = {}
  for (const blk of text.split(/\n(?=    - id: preset-)/)) {
    const m = blk.match(/^ {8}id: ([\w-]+)$/m); if (!m) continue
    r[m[1]] = [...blk.matchAll(/^\s+- id: ([\w-]+)$/gm)].map((x) => x[1]).filter((x) => !x.startsWith('preset-'))
  }
  return r
}

// ── profile 配置 ─────────────────────────────────────────────────────
function planPackageJson(text, pkgNames, renames = {}) {
  const j = JSON.parse(text)
  j.dsh = j.dsh || {}; j.dsh.profile = j.dsh.profile || {}
  const before = Array.isArray(j.dsh.profile.bundles) ? j.dsh.profile.bundles.slice() : []
  // 改名：bundles 里原位换名，dependencies 去掉旧名（下面会补新名）
  let b = before.map((x) => renames[x] || x).filter((x, i, a) => a.indexOf(x) === i).filter((x) => !PRESET_ONLY.includes(x))
  if (j.dependencies) for (const o of Object.keys(renames)) delete j.dependencies[o]
  for (const n of ['dsh-agent-soul', ...pkgNames.filter((n) => !PRESET_ONLY.includes(n)), PRESET_PKG]) if (!b.includes(n)) b.push(n)
  j.dsh.profile.bundles = b
  j.dependencies = j.dependencies || {}
  for (const n of ['dsh-agent-soul', ...pkgNames, PRESET_PKG]) j.dependencies[n] = `file:node_modules/${n}`
  const outText = JSON.stringify(j, null, 2) + (text.endsWith('\n') ? '\n' : '')
  const removed = before.filter((x) => PRESET_ONLY.includes(x))
  return { text: outText, bundles: b, removed, changed: outText !== text }
}
// 锁文件里的旧包名一起换掉：pnpm 每次装卸都按锁文件核对，留着旧名会对不上（dsh-img-block 那次就是锁文件卡住）
function renameInLocks(locks, renames) {
  const done = []
  for (const [k, f] of Object.entries(locks)) {
    if (!exists(f) || !Object.keys(renames).length) continue
    let t = readText(f)
    const t0 = t
    for (const [from, to] of Object.entries(renames)) t = t.replace(new RegExp(`(?<![\\w@.-])${reEsc(from)}(?![\\w-])`, 'g'), to)
    if (t !== t0) { write(f, t, k); done.push(k) }
  }
  return done
}
function planCordis(text, { hub, defaultPreset, dshHome, memRelative }) {
  let y = text.replace(/\r\n/g, '\n')
  const notes = []
  // 旧版安装包写的根层禁用：只对根层生效，会话用的 preset 里照旧是内置的，留着反而有风险 → 去掉
  const before = y
  y = y.replace(/^- id: ['"]?(compaction-basic|tool-result-pruner)['"]?\n  disabled: true\n/gm, '')
       .replace(/^- \{ ?id: ['"]?(compaction-basic|tool-result-pruner)['"]?, ?disabled: true ?\}\n/gm, '')
  if (y !== before) notes.push('去掉旧版安装包写在根层的 compaction-basic / tool-result-pruner 禁用（对会话不起作用）')
  // memory 插件：自我层路径和上限。能用相对写法（记忆中枢在 DSH 家目录下、memory 补丁打得上）就写
  // dsh-soul/memory/hub/SELF.md 这样不带用户名的路径；已有的设置核对一遍，别的电脑带过来的路径改成这台的
  const mem = planMemoryConfig(y, { hub, dshHome, relative: memRelative, exists })
  y = mem.text
  notes.push(...mem.notes)
  let memoryNote = mem.warns.length ? mem.warns.join('；') : null
  if (!mem.paths.relative && memRelative !== undefined) notes.push(memRelative ? `记忆中枢不在 DSH 家目录下，memory 只能写绝对路径：${mem.paths.selfPath}` : `memory 的相对路径补丁没打上，这次仍写绝对路径：${mem.paths.selfPath}（换电脑后重跑安装或 --update 会改成这台的）`)
  // 默认 preset
  let current = null
  const reg = y.match(/^- id: ['"]?agent-preset-registry['"]?\n(?: {2}.*(?:\n|$))*/m)
  if (reg) { const m = reg[0].match(/^ {4}selectedDefault: ['"]?([\w-]+)['"]?\s*$/m); current = m ? m[1] : null }
  let want = defaultPreset === 'keep' ? current : defaultPreset
  if (want && RETIRED_PRESETS[want]) want = RETIRED_PRESETS[want]
  if (want && OLD_PRESET_IDS[want]) { notes.push(`默认 preset 的旧 id ${want} 换成 ${OLD_PRESET_IDS[want]}`); want = OLD_PRESET_IDS[want] }
  if (want && want !== current) {
    if (reg) {
      const blk = reg[0]
      const nb = /^ {4}selectedDefault:/m.test(blk) ? blk.replace(/^( {4}selectedDefault: ).*$/m, `$1${want}`) : blk.replace(/^( {2}config:\n)/m, `$1    selectedDefault: ${want}\n`)
      if (nb === blk) memoryNote = (memoryNote ? memoryNote + '；' : '') + 'agent-preset-registry 的写法认不出来，默认 preset 没改，请在 DSH 里手动选'
      else y = y.replace(blk, nb)
    } else {
      if (y.length && !y.endsWith('\n')) y += '\n'
      y += ['- id: agent-preset-registry', '  name: "@deepseek-ai/dsh-agent-preset-registry"', '  config:', '    default: standard', `    selectedDefault: ${want}`].join('\n') + '\n'
    }
    notes.push(`新会话默认 preset：${current || '（未设）'} → ${want}`)
  }
  // 换气配置的字符串布尔（'true'）3.0 起归修复清单 huanqi-config-bool，在「修复」一步里改，这里不再管
  return { text: y, notes, memoryNote, defaultPreset: want || current, changed: y !== text.replace(/\r\n/g, '\n') }
}

// ─── mnemon 热记忆目录解析 ────────────────────────────────────────────────
// 背景：dsh-mnemon 的 storageDirectory() 有四种 storageScope，每个 scope 落到
// 完全不同的目录；而它的 expandDirectory() 只认 "~" 和 "~/x"，其余一律
// path.resolve(v)（即相对当前工作目录，不是 DSH 家目录）。安装器以前只会找
// ~/.mnemon/runtime，所以改了 dataDir 或换了 scope 的机器会被判成“没装”。
// 这里的展开规则必须和 dsh-mnemon 完全一致，否则 custom/dataDir 会指错地方。
//
// 本块只做解析，不创建目录、不改任何设置。解析不出来时返回 dir: null，
// 由调用方打印候选表让用户选，绝不默认往 ~/.mnemon 里写东西。

function expandDir(v) {
  if (!v || typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  if (s === '~') return os.homedir()
  if (s.startsWith('~/')) return path.join(os.homedir(), s.slice(2))
  if (s.startsWith('~')) return null // "~user" 这种形式不猜，交给调用方兜底
  return path.resolve(s)
}

const MNEMON_FILES = ['memories.json', 'MEMORY.md', 'USER.md']

// 指纹分级，用来区分“这是我该用的目录”和“这是别人留下的空壳”：
//   hard = memories.json 能解析 且 至少一份 md 在 → 真初始化过
//   soft = 目录在、里面至少有一个 mnemon 文件 → 可能是刚建的空目录
//   none = 目录不存在或什么都没有
function probeRuntimeDir(dir) {
  if (!dir) return { dir: null, level: 'none', files: [], hasJson: false }
  let files = []
  try {
    files = fs.readdirSync(dir).filter((f) => MNEMON_FILES.includes(f))
  } catch {
    return { dir, level: 'none', files: [], hasJson: false }
  }
  let hasJson = false
  if (files.includes('memories.json')) {
    try {
      JSON.parse(fs.readFileSync(path.join(dir, 'memories.json'), 'utf8'))
      hasJson = true
    } catch {
      hasJson = false
    }
  }
  const hasMd = files.includes('MEMORY.md') || files.includes('USER.md')
  const level = hasJson && hasMd ? 'hard' : files.length > 0 ? 'soft' : 'none'
  return { dir, level, files, hasJson }
}

// 从 cordis.patch.yml 里读 mnemon 的 config 段。装一个安装器不该为读五行配置
// 引入 yaml 依赖，所以按缩进硬解析；规则对着本机真实文件核过：
//   1. 找到 `- id: mnemon` 那行，记它的缩进 b；
//   2. 区块内（遇到非空且缩进 <= b 的行即结束）找缩进恰为 b+2 的 `config:`；
//   3. 只收缩进恰为 b+4 的 `k: v`；更深的是 embedding/memoryView 之类的嵌套，
//      跳过（注意：b+2 那一层还有 `name:`，绝不能当成配置收进来）；
//   4. 值去掉行尾注释和成对引号。
function readMnemonConfig(file) {
  let text = ''
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
  const lines = text.split(/\r?\n/)
  const head = lines.findIndex((l) => /^\s*-\s*id:\s*['"]?mnemon['"]?\s*(#.*)?$/.test(l))
  if (head < 0) return null
  const b = lines[head].match(/^\s*/)[0].length
  const out = {}
  let inConfig = false
  for (let i = head + 1; i < lines.length; i++) {
    const raw = lines[i]
    if (!raw.trim()) continue
    const indent = raw.match(/^\s*/)[0].length
    if (indent <= b) break
    if (!inConfig) {
      if (indent === b + 2 && /^config:\s*(#.*)?$/.test(raw.trim())) inConfig = true
      continue
    }
    if (indent <= b + 2) break
    if (indent !== b + 4) continue
    const m = raw.trim().match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!m) continue
    let v = m[2].replace(/\s+#.*$/, '').trim()
    if (!v) continue
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[m[1]] = v
  }
  return Object.keys(out).length ? out : null
}

// storageScope=workspaces 时，各工作区的运行时在 <root>/workspaces/<hash>/runtime。
// 目录名是工作区绝对路径的哈希，重算不现实（那是 dsh-mnemon 的内部实现），
// 所以只能枚举；枚举到的每一个都当候选，指纹分高的胜出。
function scanWorkspaceRuntimes(root) {
  if (!root) return []
  const base = path.join(root, 'workspaces')
  let names = []
  try {
    names = fs.readdirSync(base)
  } catch {
    return []
  }
  const out = []
  for (const n of names) {
    const rt = path.join(base, n, 'runtime')
    if (exists(rt)) out.push(rt)
  }
  return out
}

// 优先级：显式指定 > 环境变量 > 配置里的 scope > 历史兜底。
// 返回第一个 hard；没有 hard 就把第一个 soft 顶上；都没有则 dir: null。
// ok 只表示“找到真初始化过的目录”，soft 命中时 ok 为 false —— 调用方据此
// 决定是直接用，还是提示用户“这个目录像空的，确认一下”。
function resolveMnemon(o) {
  const opt = o || {}
  const cfgFile = path.join(DSH_HOME, 'profiles', PROFILE, 'cordis.patch.yml')
  const cfg = readMnemonConfig(cfgFile) || {}
  const scope = cfg.storageScope || null
  const cData = expandDir(cfg.dataDir)
  const eData = expandDir(process.env.MNEMON_DATA_DIR)
  const eRt = expandDir(process.env.MNEMON_RUNTIME)
  const gRoot = eData || expandDir('~/.mnemon') // global 的默认根
  const wRoot = cData || gRoot // workspaces 的默认根

  const cands = []
  const add = (dir, source) => {
    if (dir) cands.push({ dir, source })
  }
  const addRoot = (root, source) => {
    if (root) add(path.join(root, 'runtime'), source)
  }

  add(expandDir(opt.runtime), '--runtime')
  add(eRt, 'MNEMON_RUNTIME')
  addRoot(expandDir(opt.dataDir), '--data-dir')
  addRoot(eData, 'MNEMON_DATA_DIR')

  if (scope === 'global') addRoot(gRoot, 'storageScope=global')
  else if (scope === 'custom') addRoot(cData, 'storageScope=custom')
  else if (scope === 'workspace') addRoot(path.join(process.cwd(), '.mnemon'), 'storageScope=workspace')
  else if (scope === 'workspaces') {
    for (const d of scanWorkspaceRuntimes(wRoot)) add(d, 'storageScope=workspaces')
  }

  // 兜底：这些位置“历史上可能对”，但都不构成硬证据，一律排在 scope 之后。
  add(expandDir(opt.installedRuntime), '已装配置')
  add(expandDir(opt.stateRuntime), '.install-state.json')
  add(expandDir('~/.mnemon/runtime'), '默认 ~/.mnemon')
  add(path.join(DSH_HOME, '.mnemon', 'runtime'), '默认 $DSH_HOME/.mnemon')
  add(path.join(DSH_HOME, 'profiles', PROFILE, '.mnemon', 'runtime'), '默认 <profile>/.mnemon')

  const tried = []
  const seen = new Set()
  let hard = null
  let soft = null
  let hi = -1
  let si = -1
  for (const c of cands) {
    const key = path.resolve(c.dir)
    if (seen.has(key)) continue
    seen.add(key)
    const p = probeRuntimeDir(c.dir)
    tried.push({ dir: posix(c.dir), source: c.source, level: p.level, files: p.files })
    if (p.level === 'hard' && !hard) { hard = { ...c, probe: p }; hi = tried.length - 1 }
    if (p.level === 'soft' && !soft) { soft = { ...c, probe: p }; si = tried.length - 1 }
  }
  // 配置指到的目录就算只是个空壳，也比历史遗留的 ~/.mnemon 可信：
  // 空壳排得更靠前时用它，让上层去提示「确认一下」，而不是悄悄换成别的目录
  const useSoft = Boolean(soft) && (!hard || si < hi)
  const hit = useSoft ? soft : hard
  return {
    dir: hit ? hit.dir : null,
    source: hit ? hit.source : null,
    probe: hit ? hit.probe : { dir: null, level: 'none', files: [], hasJson: false },
    scope,
    dataDir: cData ? posix(cData) : null,
    tried,
    ok: Boolean(hard) && !useSoft,
    soft: useSoft,
  }
}

// kit 迭代只操作当前工具包与报告，在读取 DSH profile、检查宿主进程之前分流。
if (KIT_ITERATE || KIT_ACCEPT || KIT_UPDATE) {
  try {
    let kitUpdate = null
    if (KIT_ITERATE || KIT_UPDATE) {
      if (KIT_ITERATE && SOURCE && !opt('--base-source')) {
        throw new Error('使用 --source 离线迭代时，请同时提供 --base-source，避免隐式联网获取基线')
      }
      const offline = Boolean(SOURCE || opt('--base-source')) && !opt('--kit-source')
      if (flag('--skip-kit-update') || offline) {
        kitUpdate = { status: 'skipped', reason: offline ? '离线上游检查未提供 --kit-source' : '显式使用 --skip-kit-update' }
        console.log(`kit 自身检查已跳过：${kitUpdate.reason}；不代表本地 kit 已是最新。`)
      } else {
        const { updateKit } = await import('./lib/kit-update.mjs')
        kitUpdate = updateKit({
          kit: KIT, repo: opt('--kit-repo') || undefined, ref: opt('--kit-ref'), source: opt('--kit-source'),
          dryRun: DRY, output: opt('--out'), proxy: resolveProxy()
        })
        console.log(kitUpdate.message)
        if (KIT_UPDATE || !kitUpdate.ready) {
          process.exit(0)
        }
      }
    }
    const { prepareIteration, acceptIteration } = await import('./lib/kit-iterate.mjs')
    if (KIT_ITERATE) {
      const result = await prepareIteration({
        kit: KIT, repo: REPO, version: KIT_VERSION, verified: VERIFIED,
        ref: REF, source: SOURCE, baseRef: opt('--base-ref'), baseSource: opt('--base-source'),
        output: opt('--out'), dryRun: DRY, kitUpdate,
        contract: { requiredFiles: REQUIRED_SOURCE_FILES, partNames: PART_NAMES, optionalSource: OPTIONAL_SRC },
        helpers: { getSource, hashDir, diffMaps, patchList, packFiles }
      })
      console.log(result.message)
    } else {
      const result = acceptIteration({ kit: KIT, repo: REPO, directory: opt('--kit-accept'), dryRun: DRY, hashDir })
      console.log(result.message)
    }
  } catch (error) {
    console.error(`kit 迭代失败：${error.message}`)
    process.exit(1)
  }
  process.exit(0)
}

// ═══ 0. 预检 ═══════════════════════════════════════════════════════════
const explicitDshHome = opt('--dsh-home') && path.resolve(opt('--dsh-home'))
const homeCands = dshHomeCandidates(explicitDshHome)
// ═══ 问题清单（--questions）：给 agent 用，只输出 JSON ═════════════════════
if (QUESTIONS_MODE) {
  const home = homeCands.find((h) => exists(path.join(h, 'profiles', PROFILE, 'package.json')))
  const pj = home ? readJson(path.join(home, 'profiles', PROFILE, 'package.json')) : null
  const b = (pj && pj.dsh && pj.dsh.profile && pj.dsh.profile.bundles) || []
  // 这个分支在 DSH_HOME 定下来之前就跑，只能就地探一次 node_modules：
  // 「装了但没启用」也算有，否则会错误地把 mnemon-probe 标成不可选
  const mnemon = pj ? (b.includes('dsh-mnemon') || exists(path.join(home, 'profiles', PROFILE, 'node_modules', 'dsh-mnemon', 'package.json'))) : null
  console.log(JSON.stringify(questionSheet({ kitVersion: KIT_VERSION, profile: home ? `<DSH 家目录>/profiles/${PROFILE}` : null, mnemon }), null, 2))
  process.exit(0)
}
out(`dsh-agent-soul 安装包 · ${{ install: '安装', update: '更新', fix: '修复', backup: '备份', restore: '迁移恢复', uninstall: '卸载' }[MODE]}（${KIT_VERSION}）${DRY ? '（干跑：只报计划，不改任何文件）' : ''}`)
out(`参数：${argv.length ? argv.join(' ').replace(/\/\/[^/@\s]*@/g, '//***@') : '（无）'}`)
step('预检')
// 当前 node 不够版本：找一个够的，用它把自己重新跑一遍（同一套参数，不丢任何状态）
let NODE_FOR_CONFIG = process.execPath
// --node：明确指定用哪个（自动找错了、或者想固定到某个版本时用）
const nodeOpt = opt('--node')
if (nodeOpt && path.resolve(nodeOpt) !== path.resolve(process.execPath)) {
  const nb = path.resolve(nodeOpt)
  const nv = nodeVersionOf(nb)
  if (!nv) die(`--node 指的 ${nodeOpt} 跑不起来（没有 -v 输出）。`)
  if (nv.major < NODE_MIN_MAJOR) die(`--node 指的 node 是 ${nv.version}，需要 ${NODE_MIN_MAJOR} 以上。`)
  warn(`按 --node 改用 ${posix(nb)}（${nv.version}）继续`)
  const r = spawnSync(nb, [process.argv[1], ...process.argv.slice(2)], { stdio: 'inherit', windowsHide: true })
  process.exit(r.status === null ? 1 : r.status)
}
const selfMajor = Number(process.versions.node.split('.')[0])
if (selfMajor < NODE_MIN_MAJOR) {
  if (process.env.DSH_SOUL_NODE_REEXEC === '1') die(`当前 node ${process.versions.node} 低于 ${NODE_MIN_MAJOR}，换过之后仍然不够。请装一个 ${NODE_MIN_MAJOR} 以上的 node，或用 --node <路径> 指定。`)
  const better = detectNode()
  if (!better) die(`当前 node ${process.versions.node} 低于 ${NODE_MIN_MAJOR}，也没在本机找到合格的 node。\n    装一个 ${NODE_MIN_MAJOR} 以上的 node（macOS: brew install node；Windows: https://nodejs.org ；Linux: apt install nodejs），\n    或者直接打开 DSH，用 DSH 自带的 node 跑这个脚本。\n    找过的位置：\n      ${detectNode({ dshOnly: true }) || nodesOnPath().length ? '见上面' : 'DSH 安装目录、当前进程、PATH、常见安装位置'}`)
  warn(`当前 node ${process.versions.node} 低于 ${NODE_MIN_MAJOR}，改用 ${posix(better.bin)}（${better.version}，来源：${better.from}）继续`)
  const r = spawnSync(better.bin, [process.argv[1], ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, DSH_SOUL_NODE_REEXEC: '1' }, windowsHide: true })
  process.exit(r.status === null ? 1 : r.status)
}
ok(`node ${process.versions.node}：${posix(process.execPath)}（来源：当前进程）`)
// 写进持久配置的那一个单独挑：优先 DSH 自带的 node —— 它不依赖用户的 PATH 和 shell 环境
const dshNode = detectNode({ dshOnly: true })
if (dshNode) {
  NODE_FOR_CONFIG = dshNode.bin
  const same = path.resolve(dshNode.bin) === path.resolve(process.execPath)
  ok(same ? 'DSH 自带的 node 就是当前进程，写进配置用它' : `DSH 自带的 node ${dshNode.version}：${posix(dshNode.bin)}（写进配置用它）`)
} else if (!UNINSTALL) {
  warn('没找到 DSH 自带的 node，写进配置用当前进程的 node（DSH 升级后可能要重跑一次安装）')
}
for (const f of ['templates/00-authority.md.tpl', 'templates/SELF.src.md.tpl', 'templates/heartbeat.mjs.tpl', 'presets/ptc.patch.yml']) if (!exists(path.join(ASSETS, f))) die(`安装包不完整：assets/${f} 不存在`)
ok('安装包素材齐全')

// 显式给了 --dsh-home：那里没有 profile 就停下，不管别处有没有（以前要等别处找到了才报，这台电脑上没有 ~/.dsh 时报的是另一句）
if (explicitDshHome && !exists(path.join(explicitDshHome, 'profiles', PROFILE, 'package.json'))) {
  const other = homeCands.slice(1).find((h) => exists(path.join(h, 'profiles', PROFILE, 'package.json')))
  die(`--dsh-home 指的是 ${posix(explicitDshHome)}，那里没有 profiles/${PROFILE}/package.json。${other ? `为免把东西写进另一份 DSH 家目录（${posix(other)}），` : ''}这次不回落，直接停下。\n    确认路径；目录是新建的，先打开一次 DSH 让它生成 profile，再用 --dsh-home 指向它。`)
}
const DSH_HOME = homeCands.find((h) => exists(path.join(h, 'profiles', PROFILE, 'package.json')))
if (!DSH_HOME) die(`找不到 DSH 的 ${PROFILE} profile。试过：\n      ${homeCands.map((h) => path.join(h, 'profiles', PROFILE)).join('\n      ')}\n    先把 DSH 打开一次让它生成 profile，或用 --dsh-home 指定 DSH 家目录。`)
if (explicitDshHome && path.resolve(DSH_HOME) !== path.resolve(explicitDshHome)) die(`--dsh-home 指的是 ${posix(path.resolve(explicitDshHome))}，那里没有 profiles/${PROFILE}/package.json。为免把东西写进另一份 DSH 家目录（${posix(DSH_HOME)}），这次不回落，直接停下。\n    确认路径；目录是新建的，先打开一次 DSH 让它生成 profile，再用 --dsh-home 指向它。`)
const PROF = path.join(DSH_HOME, 'profiles', PROFILE)
const NM = path.join(PROF, 'node_modules')
ok(`profile：${PROF}`)

const arPath = path.join(DSH_HOME, 'logs', 'active-run.json')
const readRunning = () => { try { const ar = JSON.parse(readText(arPath)); return Boolean(ar.started && !ar.ended) } catch { return null } } // 文件不存在或格式不认识 → null
let running = readRunning()
// Mac 上在真终端里跑：问一句就帮用户退出（agent 的终端不是真终端，不会走到这里 —— 退出 DSH 会把 agent 自己也关掉）
if (running === true && !DRY && IS_MAC && TTY && parseBool(await askLine('\nDSH 还开着，真跑前要完全退出。要我帮你退出它吗？（和按 Cmd+Q 一样）(Y/n) '), true)) {
  if (quitDshMac(readRunning)) { running = false; ok('已让 DSH 退出') }
  else die('DSH 没在 30 秒内退出。请手动按 Cmd+Q 完全退出，再重跑。')
}
if (running === true) { if (DRY) warn(MODE === 'install' || MODE === 'restore' ? 'DSH 正在运行：干跑没关系，真跑前必须完全退出 DSH，在终端里跑（命令见最后）。如果这次是 DSH 里的 agent 在跑：重开 DSH 后，验收和后面几步要在新建的会话里做，装之前开的会话不会换成 Soul preset' : MODE === 'uninstall' ? 'DSH 正在运行：干跑没关系，真跑前必须完全退出 DSH，在终端里跑（命令见最后）；DSH 里的 agent 自己卸不了自己' : 'DSH 正在运行：干跑没关系，真跑前必须完全退出'); else die('DSH 正在运行。请先完全退出（macOS 按 Cmd+Q；Windows 连托盘图标也要退出），再重跑。') }
else if (running === false) ok('DSH 已退出')
else if (flag('--confirm-quit')) ok('DSH 已退出（由使用者确认）')
else if (!DRY && TTY) {
  if (parseBool(await askLine('\n无法自动判断 DSH 是否已退出。它已经完全退出了吗？（macOS 要按 Cmd+Q；Windows 连托盘图标也要退出）(y/N) '), false)) ok('DSH 已退出（由使用者确认）')
  else die('请先完全退出 DSH，再重跑。')
}
else if (!DRY) die('无法自动判断 DSH 是否已退出。确认它已完全退出后，加 --confirm-quit 重跑。')
else warn('无法自动判断 DSH 是否已退出；真跑时需要加 --confirm-quit')

const pkgPath = path.join(PROF, 'package.json')
const cfgPath = path.join(PROF, 'cordis.patch.yml')
const pkg0 = readJson(pkgPath)
if (!pkg0) die('profile 的 package.json 解析失败')
const bundles0 = (pkg0.dsh && pkg0.dsh.profile && pkg0.dsh.profile.bundles) || []

// 已有安装的位置（更新时以本机现有配置为准）
const BODY = path.join(NM, 'dsh-agent-soul')
const installedCfg = readJson(path.join(BODY, 'kit', 'echo.config.json'))
const SOUL_ROOT = path.join(DSH_HOME, 'dsh-soul')
const SOUL = installedCfg && installedCfg.soul ? path.resolve(installedCfg.soul) : path.join(SOUL_ROOT, 'soul')
const MEM = installedCfg && installedCfg.memory ? path.resolve(installedCfg.memory) : path.join(SOUL_ROOT, 'memory')
const HUB = path.join(MEM, 'hub')
const SESSIONS = path.join(DSH_HOME, 'sessions')
const STATE_PATH = path.join(SOUL_ROOT, '.install-state.json')
const state0 = readJson(STATE_PATH)
// mnemon 热记忆目录：按 dsh-mnemon 自己的 storageScope 解析（global/custom/workspace/workspaces）；
// 解析不出来就留 null —— 绝不默认往 ~/.mnemon 里写东西，那里可能是别的机器留下来的空壳。
const MNE = resolveMnemon({ runtime: RUNTIME_OPT, dataDir: DATA_DIR_OPT, installedRuntime: installedCfg && installedCfg.runtime, stateRuntime: state0 && state0.runtime })
const RUNTIME = MNE.dir
const RX = RUNTIME ? posix(RUNTIME) : null // 拼配置一律走它；null 时绝不落进任何文件（宁可缺键，也不写错路径）
if (RUNTIME) {
  ok(`mnemon 热记忆目录 ${RX}（来源：${MNE.source}）`)
  if (MNE.soft) warn('这个目录里没有 memories.json + MEMORY.md，像还没初始化：先按它配，确认一下是不是你要的那个')
}
if (!RUNTIME && !UPDATE && !UNINSTALL) {
  warn('没找到 mnemon 热记忆目录：这一层先空着，不往任何默认路径写东西')
  const tried = MNE.tried.slice(0, 10)
  if (tried.length) console.log(`    试过的位置：\n${tried.map((x) => `      ${x.level === 'none' ? '—' : '·'} ${x.dir}  [${x.source}]${x.level === 'none' ? '' : ` (${x.level})`}`).join('\n')}`)
  console.log('    三种办法：① 先在 DSH 里用一次 mnemon，让它自己建目录　② --runtime <热记忆目录>　③ MNEMON_DATA_DIR=<数据根目录>')
}
const installed = exists(path.join(BODY, 'package.json'))
// dsh-mnemon 三态：装了（node_modules）/ 启用了（bundles）/ 热记忆初始化过（MNE.ok）。
// 前两个决定 mnemon-probe 有没有东西可测，第三个只决定读到的是不是真数据，别混成一个布尔。
const MNEMON_INSTALLED = exists(path.join(NM, 'dsh-mnemon', 'package.json'))
const MNEMON_ENABLED = bundles0.includes('dsh-mnemon')

if (UPDATE) {
  if (!installed) die('这台电脑上还没装 dsh-agent-soul（profile 的 node_modules 里没有）。全新安装请去掉 --update。')
  ok(`已装：${state0 && state0.upstream ? `提交 ${short(state0.upstream.sha)}（${state0.updatedAt || state0.installedAt}）` : '没有安装记录（旧版安装包或手工装的），按 node_modules 里现有文件比对'}`)
} else if (!UNINSTALL) {
  if (!MNEMON_INSTALLED && !MNEMON_ENABLED) warn('还没装 dsh-mnemon：建议先在 DSH 插件市场装上它，否则「可复用结论」那一层是空的')
  else if (MNEMON_INSTALLED && !MNEMON_ENABLED) warn('dsh-mnemon 装了但没启用（profile 的 bundles 里没有它）：它不会跑，「可复用结论」那一层仍然是空的')
  for (const p of PREDECESSORS) if (bundles0.includes(p)) warn(`检测到 ${p}：它是换气（huanqi）的前身，两套一起跑会让一轮被续成两轮，建议先卸掉`)
}
ok(`书房 ${SOUL}`)
ok(`记忆中枢 ${MEM}`)

// ═══ 备份（--backup）：只带 dsh-agent-soul 自己的东西 ═══════════════════
const SOUL_IDS_FALLBACK = ['dsh-agent-soul', 'dsh-agent-compaction', 'dsh-agent-pruner', 'dsh-agent-memory', 'dsh-agent-mnemon-probe', 'dsh-agent-echo', 'dsh-agent-clock', 'huanqi', 'dsh-agent-huanqi-panel', 'dsh-mcp-hub', 'preset-ptc-soul', 'preset-ptc-soul-flash', 'preset-standard-soul', 'preset-minimal-soul', 'preset-cordis-soul']
// 换气的账本，连同它自己留的备份和日志（state/ 下的 dsh-huanqi.json*、huanqi-*）
const STATE_RE = /^(dsh-huanqi\.json.*|huanqi-.+)$/
// 打备份包：--backup 和 --uninstall 共用。干跑只清点、不写；suffix 加在文件名最后（例如 pre-uninstall）
async function makeBackup({ suffix = '', soul = SOUL, mem = MEM } = {}) {
  if (!exists(soul) || !exists(mem)) die(`找不到书房或记忆中枢：${posix(soul)}、${posix(mem)}`)
  step('清点要备份的东西')
  const parse = yamlParser(PROF)
  const entries = [], files = {}, counts = {}
  let bytes = 0
  const addFile = (key, full, data) => {
    const buf = data !== undefined ? Buffer.from(data) : fs.readFileSync(full)
    files[key] = { size: buf.length, sha1: sha1(buf) }; bytes += buf.length
    entries.push(data !== undefined ? { name: `${BK_ROOT}/${key}`, data: buf } : { name: `${BK_ROOT}/${key}`, path: full })
  }
  const addTree = (root, prefix, skip) => {
    if (!exists(root)) return 0
    const t = walkAll(root, '', undefined, skip)
    entries.push({ name: `${BK_ROOT}/${prefix}`, dir: true })
    for (const d of t.dirs) entries.push({ name: `${BK_ROOT}/${prefix}/${d}`, dir: true })
    for (const f of t.files) addFile(`${prefix}/${f}`, path.join(root, ...f.split('/')))
    return (counts[prefix] = t.files.length)
  }
  addTree(soul, 'soul')
  addTree(mem, 'memory', (r) => r === 'hub/index') // 索引是衍生品，恢复时重建
  addTree(SESSIONS, 'sessions', (r) => /(^|\/)session\.lock$/.test(r))
  counts.state = 0
  const stateDir = path.join(DSH_HOME, 'state')
  for (const f of exists(stateDir) ? fs.readdirSync(stateDir).filter((x) => STATE_RE.test(x)).sort() : []) { const full = path.join(stateDir, f); if (fs.statSync(full).isFile()) { addFile(`state/${f}`, full); counts.state++ } }
  // 本架构插件的设置
  const pkgDirs = ['dsh-agent-soul', PRESET_PKG, ...Object.values(PART_NAMES).flat()].filter((d) => exists(path.join(NM, d, 'package.json')))
  const ids = parse ? soulEntryIds(NM, pkgDirs, parse) : new Set(SOUL_IDS_FALLBACK)
  const cfgText = exists(cfgPath) ? readText(cfgPath) : ''
  const allBlocks = cordisBlocks(cfgText)
  const cordisEntries = allBlocks.filter((b) => ids.has(b.id))
  const regBlock = allBlocks.find((b) => b.id === 'agent-preset-registry')
  const selM = regBlock && regBlock.text.match(/^ {4}selectedDefault: ['"]?([\w-]+)['"]?\s*$/m)
  const serversFile = path.join(DSH_HOME, 'mcp-hub', 'servers.json')
  const settings = { _说明: '本架构插件在 cordis.patch.yml 里的设置原文（恢复时路径会换成新电脑的）、默认 preset、mcp-hub 的服务器清单。不含 dsh-mnemon 等别的插件。', cordisEntries, selectedDefault: selM ? selM[1] : null, mcpServers: readJson(serversFile) }
  addFile('config/soul-settings.json', null, JSON.stringify(settings, null, 2))
  if (exists(STATE_PATH)) addFile('install-state.json', STATE_PATH)
  const manifest = {
    kind: 'dsh-agent-soul-backup', format: 1, kitVersion: KIT_VERSION, createdAt: new Date().toISOString(),
    host: os.hostname(), platform: process.platform,
    upstream: state0 && state0.upstream ? state0.upstream : null,
    parts: (state0 && state0.parts) || Object.values(PART_NAMES).flat().filter((d) => exists(path.join(NM, d, 'package.json'))),
    paths: { dshHome: posix(DSH_HOME), soul: posix(soul), memory: posix(mem), hub: posix(path.join(mem, 'hub')), sessions: posix(SESSIONS), runtime: RX },
    counts, bytes, files,
  }
  entries.unshift({ name: `${BK_ROOT}`, dir: true }, { name: `${BK_ROOT}/manifest.json`, data: JSON.stringify(manifest, null, 2) })
  const mb = (n) => (n / 1048576).toFixed(1) + 'MB'
  ok(`书房 ${counts.soul} 个文件`)
  ok(`记忆中枢 ${counts.memory} 个文件（不带索引，恢复时重建）`)
  ok(`会话原文 ${counts.sessions || 0} 个文件（门牌指向它们）`)
  ok(`换气账本 ${counts.state} 个文件`)
  ok(`本架构插件的设置：${cordisEntries.length ? cordisEntries.map((b) => b.id).join('、') : '（cordis.patch.yml 里没有）'}；默认 preset ${settings.selectedDefault || '（未设）'}；mcp-hub 清单${settings.mcpServers ? '有' : '没有'}`)
  info(`不带：dsh-mnemon 的数据和设置、其他插件、skills、表情包、附件、DSH 本身的设置（按约定）`)
  ok(`合计 ${Object.keys(files).length} 个文件，${mb(bytes)}（压缩前）`)
  const outDir = opt('--out') ? path.resolve(opt('--out')) : path.join(KIT, 'backups')
  const outFile = path.join(outDir, `dsh-soul-backup-${os.hostname().replace(/[^\w.-]+/g, '_')}-${TS}${suffix ? '-' + suffix : ''}.tar.gz`)
  step('打包并核对')
  if (DRY) { info(`[干跑] 将写入 ${posix(outFile)}`); return { outFile, dry: true, n: Object.keys(files).length } }
  fs.mkdirSync(outDir, { recursive: true })
  await writeTarGz(outFile, entries)
  const tmpV = path.join(os.tmpdir(), `dsh-soul-verify-${TS}`); TMP_DIRS.push(tmpV)
  const v = extractTarGz(outFile, tmpV)
  let bad = 0
  for (const [k, m] of Object.entries(files)) { const f = path.join(v.dir, ...k.split('/')); if (!exists(f) || sha1(fs.readFileSync(f)) !== m.sha1) bad++ }
  if (bad) die(`备份包核对没过：${bad} 个文件对不上。包留在 ${posix(outFile)}，别用它。`)
  ok(`已写入 ${posix(outFile)}（${mb(fs.statSync(outFile).size)}），${Object.keys(files).length} 个文件逐个核对过`)
  return { outFile, n: Object.keys(files).length }
}
if (BACKUP) {
  if (!installed) die('这台电脑上还没装 dsh-agent-soul，没什么可备份的。')
  const r = await makeBackup()
  if (r.dry) { out('\n干跑结束：以上是计划，没有写任何文件。'); process.exit(0) }
  out(`
${'─'.repeat(60)}
备份完成。迁移到新电脑：
  1. 把整个安装包文件夹（含 backups/）拷过去；新电脑上装好 DSH、打开过一次
  2. 退出 DSH，在安装包文件夹里跑：node install.mjs --restore --dry-run，看过计划再去掉 --dry-run
  3. 详见 AGENT-INSTALL.md「迁移」一节`)
  process.exit(0)
}

// ═══ 卸载（--uninstall）：先用 kit 打备份包，再把安装碰过的东西收回来 ═══════════════
// 顺序按「出错时损失最小」排：备份 → 停心跳 → 旧会话 → profile 配置和锁文件 → 本体和零件 → 家目录里的东西 → 书房。
// 每改一个配置文件都在原地留一份 .bak-<时间>-pre-uninstall；书房、中枢、会话、换气账本、插件设置都在备份包里。
if (UNINSTALL) {
  const parse = yamlParser(PROF)
  const OUR_PKGS = ['dsh-agent-soul', ...new Set(Object.values(PART_NAMES).flat()), PRESET_PKG]
  const deps0 = Object.keys({ ...(pkg0.dependencies || {}), ...(pkg0.devDependencies || {}), ...(pkg0.optionalDependencies || {}) })
  const deselected0 = (pkg0.dsh && pkg0.dsh.desktopNextDeselectedBundles) || []
  const present = OUR_PKGS.filter((n) => exists(path.join(NM, n)) || deps0.includes(n) || bundles0.includes(n) || deselected0.includes(n))
  const presetPj = readJson(path.join(NM, PRESET_PKG, 'package.json'))
  const wasShell = Boolean(presetPj && presetPj.dshSoulShell)
  // 更新、重新生成 preset 时在 node_modules 里留下的整份拷贝（<包>.bak-…）
  const bakDirs = exists(NM) ? fs.readdirSync(NM).filter((d) => OUR_PKGS.some((n) => d.startsWith(n + '.bak-'))) : []
  const LOCK_FILES = [
    ['pnpm-lock.yaml', path.join(PROF, 'pnpm-lock.yaml'), removeLockEntries],
    ['node_modules/.pnpm/lock.yaml', path.join(NM, '.pnpm', 'lock.yaml'), removeLockEntries],
    ['node_modules/.modules.yaml', path.join(NM, '.modules.yaml'), removeModulesEntries],
    ['node_modules/.package-map.json', path.join(NM, '.package-map.json'), removePackageMapEntries],
  ].filter(([, f]) => exists(f))
  const PTR = path.join(DSH_HOME, 'hub', 'echo.config.json')
  const ptrOurs = (() => {
    try {
      const st = fs.lstatSync(PTR)
      if (st.isSymbolicLink()) return true
      const j = readJson(PTR)
      return Boolean(j && (j.memory || j.soul))
    } catch { return false }
  })()
  const SERVERS = path.join(DSH_HOME, 'mcp-hub', 'servers.json')
  const stateDir = path.join(DSH_HOME, 'state')
  const stateFiles = exists(stateDir) ? fs.readdirSync(stateDir).filter((f) => STATE_RE.test(f)) : []
  const inHome = (p) => { const r = path.relative(DSH_HOME, p); return r && !r.startsWith('..') && !path.isAbsolute(r) }
  // 书房、中枢一般都在 dsh-soul/ 里面：只列最外面那层（删它就连里面一起删了）
  const under = (d, o) => { const r = path.relative(o, d); return r && !r.startsWith('..') && !path.isAbsolute(r) }
  const dataDirs = [...new Set([SOUL_ROOT, SOUL, MEM].filter((d) => exists(d)))].filter((d, _, all) => !all.some((o) => o !== d && under(d, o)))
  const missingBefore = bundles0.filter((b) => !b.startsWith('@deepseek-ai/') && !exists(path.join(NM, ...b.split('/'), 'package.json')))

  // 心跳：macOS 的 launchd、Windows 的计划任务；Linux 只能提醒（cron 是用户自己加的）
  const HB_LABEL = 'com.dsh-soul.heartbeat'
  const heartbeats = []
  if (process.platform === 'darwin') {
    const dir = path.join(os.homedir(), 'Library', 'LaunchAgents')
    for (const f of exists(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.plist')) : []) {
      const full = path.join(dir, f)
      let t = ''; try { t = readText(full) } catch { continue }
      if (isSoulHeartbeatPlist(t, { label: HB_LABEL, soulRoot: posix(SOUL_ROOT) })) heartbeats.push({ kind: 'launchd', file: full, label: (t.match(/<key>Label<\/key>\s*<string>([^<]+)<\/string>/) || [])[1] || HB_LABEL })
    }
  } else if (process.platform === 'win32') {
    const r = spawnSync('schtasks', ['/Query', '/TN', 'dsh-soul-heartbeat'], { encoding: 'utf8', windowsHide: true })
    if (r.status === 0) heartbeats.push({ kind: 'schtasks', name: 'dsh-soul-heartbeat' })
  }

  // 旧会话：会话文件第一行记着建会话时的 preset。数一数有多少用的是 Soul preset
  const zstdOk = typeof zlib.zstdDecompressSync === 'function' && typeof zlib.zstdCompressSync === 'function'
  const sessionFiles = []
  const walkSessions = (d, depth) => {
    if (depth > 4 || !exists(d)) return
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name)
      if (e.isDirectory()) walkSessions(full, depth + 1)
      else if (/^session\.v\d+\.jsonl(\.zstd)?$/.test(e.name)) sessionFiles.push(full)
    }
  }
  walkSessions(SESSIONS, 0)
  const needZstd = sessionFiles.some((f) => f.endsWith('.zstd'))
  if (needZstd && !zstdOk && process.env.DSH_SOUL_ZSTD_REEXEC !== '1') {
    // 会话是 zstd 压缩的，这个 node 解不开：换一个能解的（DSH 自带的 node 一般可以）把自己重跑一遍
    const cands = [detectNode({ dshOnly: true }), detectNode()].filter(Boolean)
    const good = cands.find((c) => spawnSync(c.bin, ['-e', "process.exit(typeof require('zlib').zstdDecompressSync === 'function' ? 0 : 1)"], { windowsHide: true }).status === 0)
    if (good && path.resolve(good.bin) !== path.resolve(process.execPath)) {
      warn(`当前 node ${process.versions.node} 解不开 zstd 压缩的会话文件，改用 ${posix(good.bin)}（${good.version}）继续`)
      const r = spawnSync(good.bin, [process.argv[1], ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, DSH_SOUL_ZSTD_REEXEC: '1', DSH_SOUL_NODE_REEXEC: '1' }, windowsHide: true })
      process.exit(r.status === null ? 1 : r.status)
    }
  }
  const readSession = (f) => { const b = fs.readFileSync(f); return f.endsWith('.zstd') ? (zstdOk ? zlib.zstdDecompressSync(b).toString('utf8') : null) : b.toString('utf8') }
  const sessions = sessionFiles.map((f) => { let t = null; try { t = readSession(f) } catch { t = null } return { file: f, text: t, preset: t === null ? undefined : sessionPreset(t) } })
  const unreadable = sessions.filter((x) => x.text === null)
  const soulSessions = sessions.filter((x) => x.preset && SOUL_PRESET_IDS.includes(x.preset))
  const byPreset = {}
  for (const x of soulSessions) byPreset[x.preset] = (byPreset[x.preset] || 0) + 1
  const PRESET_MAP = Object.fromEntries(SOUL_PRESET_IDS.map((id) => [id, officialPresetFor(id)]))
  if (!present.length && !heartbeats.length && !dataDirs.length && !ptrOurs && !stateFiles.length) {
    out('\n这台电脑上没有 dsh-agent-soul 的东西，不用卸。')
    if (soulSessions.length) out(`还有 ${soulSessions.length} 个会话记着已经删掉的 Soul preset（${Object.keys(byPreset).join('、')}），多半打不开。想救它们：先用备份包 --restore 装回来，再 --uninstall --old-sessions rewrite。`)
    process.exit(0)
  }

  step('清点要卸的东西')
  ok(`本体和零件 ${present.length} 个：${present.join('、') || '（没有）'}${wasShell ? `（${PRESET_PKG} 已经是上次卸载留下的空壳）` : ''}`)
  if (bakDirs.length) ok(`node_modules 里的旧拷贝 ${bakDirs.length} 个：${bakDirs.join('、')}`)
  ok(`心跳：${heartbeats.length ? heartbeats.map((h) => (h.kind === 'launchd' ? `launchd ${h.label}（${posix(h.file)}）` : `计划任务 ${h.name}`)).join('、') : process.platform === 'linux' ? '这个系统上脚本没注册过定时任务；自己加过 cron 的话，卸完手动删掉那一行' : '没找到'}`)
  ok(`书房和记忆中枢：${dataDirs.length ? dataDirs.map(posix).join('、') + (KEEP_DATA ? '——按 --keep-data 保留' : '——备份后删除') : '（没有）'}`)
  if (stateFiles.length) ok(`换气账本和它的备份、日志 ${stateFiles.length} 个（state/）`)
  if (ptrOurs) ok(`指针 ${posix(PTR)}`)
  if (!sessions.length) ok('会话：没有')
  else {
    ok(`会话 ${sessions.length} 个，其中用 Soul preset 建的 ${soulSessions.length} 个${soulSessions.length ? `：${Object.entries(byPreset).map(([k, n]) => `${PRESET_LABEL[k] || k} ${n} 个`).join('、')}` : ''}`)
    if (unreadable.length) warn(`有 ${unreadable.length} 个会话文件读不出来（${zstdOk ? '可能损坏了' : '这个 node 解不开 zstd'}），没算进去`)
  }

  // 旧会话怎么处理：没有受影响的会话就不用选；空壳要从已装的 Soul preset 反推，没装就做不了
  const shellPossible = exists(path.join(NM, PRESET_PKG, 'cordis.patch.yml'))
  const MODES = Object.fromEntries(Object.entries(OLD_SESSION_MODES).filter(([k]) => k !== 'shell' || shellPossible))
  if (OLD_SESSIONS === 'shell' && !shellPossible) die(`node_modules 里没有 ${PRESET_PKG}，做不出空壳 preset；换成 --old-sessions rewrite 或 keep`)
  let OLD = OLD_SESSIONS
  if (!soulSessions.length && !unreadable.length) { OLD = OLD || 'keep'; info('没有用 Soul preset 建的会话，Soul preset 直接删掉') }
  else if (!OLD && TTY) {
    out(`\n用 Soul preset 建的 ${soulSessions.length} 个旧会话，开头记着 preset 的 id；preset 删了，这些会话多半打不开。怎么处理？`)
    const keys = Object.keys(MODES)
    keys.forEach((k, i) => out(`  ${i + 1}. ${MODES[k]}${i === 0 ? '（默认）' : ''}`))
    const v = await askLine('> 编号（回车用 1）：')
    OLD = keys[(Number(v) || 1) - 1]
    if (!OLD) die('没有这个编号。')
  }
  if (OLD === 'rewrite' && soulSessions.length && unreadable.length && !zstdOk) die('这个 node 解不开 zstd 压缩的会话文件，改写不了旧会话。用 DSH 自带的 node（24 以上）跑，或者加 --node <路径> 指定一个。')

  if (OLD === 'shell' && (soulSessions.some((item) => RETIRED_PRESETS[item.preset]) || /(?:ptc-soul-flash|flash-lean-ptc-v3-soul)/.test(readText(path.join(NM, PRESET_PKG, 'cordis.patch.yml'))))) {
    if (unreadable.length) die('有会话无法读取，不能安全移除退役 preset；请修复会话文件或使用支持 zstd 的 Node 后重试')
    OLD = 'rewrite'
    info('旧安装含已退役 preset：改写会话入口到对应官方 preset，不再留下 Flash 空壳')
  }
  step('打算怎么做')
  const remove = OLD === 'shell' ? present.filter((n) => n !== PRESET_PKG) : present
  const pjPlan = planPackageJsonRemoval(readText(pkgPath), remove)
  ok(`package.json：bundles 去掉 ${pjPlan.removed.bundles.length} 个、dependencies 去掉 ${pjPlan.removed.dependencies.length} 个${pjPlan.removed.deselected.length ? `、desktopNextDeselectedBundles 去掉 ${pjPlan.removed.deselected.length} 个` : ''}${OLD === 'shell' ? `；${PRESET_PKG} 留着（空壳）` : ''}`)
  const pkgDirsForIds = present.filter((d) => exists(path.join(NM, d, 'package.json')))
  const ids = [...new Set([...(parse ? soulEntryIds(NM, pkgDirsForIds, parse) : []), ...SOUL_IDS_FALLBACK, 'huanqi'])]
  const cfgText0 = exists(cfgPath) ? readText(cfgPath) : ''
  const cfgPlan = planCordisRemoval(cfgText0, { ids })
  ok(`cordis.patch.yml：${cfgPlan.removed.length ? `去掉 ${cfgPlan.removed.join('、')} 的配置` : '没有本架构插件的配置'}${cfgPlan.defaultTo ? `；新会话默认 preset ${cfgPlan.defaultFrom} → ${cfgPlan.defaultTo}` : ''}`)
  const lockPlans = LOCK_FILES.map(([label, f, fn]) => { try { return { label, f, ...fn(readText(f), remove) } } catch (e) { return { label, f, error: e.message } } })
  for (const lp of lockPlans) {
    if (lp.error) warn(`${lp.label} 解析不了（${lp.error}），没动它；下次在插件市场装东西前，最好在 DSH 里重装一次插件让 pnpm 重写它`)
    else ok(`${lp.label}：${lp.removed.length ? `去掉 ${lp.removed.length} 条` : '不用改'}`)
  }
  let shell = null, rewrites = []
  if (OLD === 'shell') {
    const curYml = exists(path.join(NM, PRESET_PKG, 'cordis.patch.yml')) ? readText(path.join(NM, PRESET_PKG, 'cordis.patch.yml')) : ''
    try { shell = buildShellBundle(curYml, { pkgName: PRESET_PKG }) } catch (e) { die(`做不出空壳 preset：${e.message}。换成 --old-sessions rewrite 或 keep 再跑`) }
    const miss = Object.keys(byPreset).filter((k) => !shell.ids.includes(k))
    ok(`${PRESET_PKG} 换成空壳：${shell.ids.join('、')} 的 id 不变、名字后面标「（已卸载）」，压缩和裁剪换回官方原版`)
    if (miss.length) warn(`有旧会话用的 preset 不在已装的 Soul preset 里（${miss.join('、')}），空壳救不了它们；想救就改用 --old-sessions rewrite`)
  } else if (OLD === 'rewrite') {
    rewrites = soulSessions.map((x) => ({ ...x, r: rewriteSessionHeader(x.text, PRESET_MAP) }))
    const bad = rewrites.filter((x) => !x.r)
    if (bad.length) die(`有 ${bad.length} 个会话的开头认不出来，改写不了（例如 ${posix(bad[0].file)}）；换成 --old-sessions shell 或 keep 再跑`)
    ok(`改写 ${rewrites.length} 个旧会话开头的 preset：${Object.keys(byPreset).map((k) => `${k} → ${PRESET_MAP[k]}`).join('、')}`)
  }
  else if (OLD === 'keep' && soulSessions.length) warn(`用 Soul preset 建的 ${soulSessions.length} 个旧会话不处理，preset 删掉后它们可能打不开；要看时用 --restore 把 dsh-agent-soul 装回来`)
  else if (!OLD) {
    info(`用 Soul preset 建的 ${soulSessions.length} 个旧会话还没定怎么处理，真跑要加 --old-sessions：`)
    for (const [k, v] of Object.entries(MODES)) info(`  ${k}：${v}`)
  }
  let srvPlan = null
  if (exists(SERVERS)) {
    const doc = readJson(SERVERS)
    if (!doc) warn(`${posix(SERVERS)} 解析失败，没动它；里面要是有指向记忆中枢的 echo，在 mcp-hub 面板里删掉`)
    else {
      srvPlan = planServersRemoval(doc)
      const hubGone = remove.includes('dsh-mcp-hub')
      srvPlan.dropDir = hubGone && !srvPlan.others.length
      ok(`mcp-hub 清单：${srvPlan.removed ? '去掉 echo' : '没有 echo'}${srvPlan.others.length ? `；留着 ${srvPlan.others.join('、')}` : ''}${srvPlan.dropDir ? '；清单空了，mcp-hub/ 目录一起删' : ''}`)
    }
  }
  const outside = dataDirs.filter((d) => !inHome(d))
  if (!KEEP_DATA && outside.length) warn(`书房 / 记忆中枢不在 DSH 家目录里，不删它们，只提醒：${outside.map(posix).join('、')}（备份包里有一份）`)
  info('不碰：dsh-mnemon（含热记忆）、其他插件、skills、表情包、附件、DSH 本身的设置、sessions/ 会话记录、安装包文件夹')

  // 备份用的书房 / 中枢：以本体配置里写的为准；那里不存在（比如 profile 是别的电脑带过来的）就看 dsh-soul/ 下面默认的位置
  const bkSoul = exists(SOUL) ? SOUL : path.join(SOUL_ROOT, 'soul'), bkMem = exists(MEM) ? MEM : path.join(SOUL_ROOT, 'memory')
  const canBackup = exists(bkSoul) && exists(bkMem)
  if (!canBackup && (exists(bkSoul) || exists(bkMem)) && !KEEP_DATA) die(`书房和记忆中枢只剩一个（${[bkSoul, bkMem].filter(exists).map(posix).join('')}），备份包打不了。先自己备份一份，或者加 --keep-data 只卸代码和配置。`)
  if (!DRY && TTY) {
    if (!parseBool(await askLine('\n先打备份包，再按上面卸载？(y/N) '), false)) die('没确认，什么都没动。')
  }
  if (!DRY && !OLD) die(`用 Soul preset 建的 ${soulSessions.length} 个旧会话还没定怎么处理。加 --old-sessions 重跑：\n${Object.entries(MODES).map(([k, v]) => `      ${k}：${v}`).join('\n')}`)

  // ── 1. 备份 ──
  let BK = null
  if (canBackup) BK = await makeBackup({ suffix: 'pre-uninstall', soul: bkSoul, mem: bkMem })
  else {
    warn('没有书房和记忆中枢（多半是上次卸载时删了），这次打不了完整备份包；改的配置文件都在原地留 .bak')
    if (rewrites.length) {
      // 要改写的会话至少单独打一个包，改坏了能放回去
      step('备份要改写的会话')
      const outDir = opt('--out') ? path.resolve(opt('--out')) : path.join(KIT, 'backups')
      const outFile = path.join(outDir, `dsh-soul-sessions-${os.hostname().replace(/[^\w.-]+/g, '_')}-${TS}-pre-rewrite.tar.gz`)
      if (DRY) info(`[干跑] 将把要改写的 ${rewrites.length} 个会话打包到 ${posix(outFile)}`)
      else {
        fs.mkdirSync(outDir, { recursive: true })
        const rel = (f) => posix(path.relative(SESSIONS, f))
        const dirs = [...new Set(rewrites.flatMap((x) => { const parts = rel(x.file).split('/').slice(0, -1); return parts.map((_, i) => parts.slice(0, i + 1).join('/')) }))]
        await writeTarGz(outFile, [{ name: 'sessions', dir: true }, ...dirs.map((d) => ({ name: `sessions/${d}`, dir: true })), ...rewrites.map((x) => ({ name: `sessions/${rel(x.file)}`, path: x.file }))])
        const tmpV = path.join(os.tmpdir(), `dsh-soul-verify-${TS}`); TMP_DIRS.push(tmpV)
        const v = extractTarGz(outFile, tmpV)
        const badN = rewrites.filter((x) => { const f = path.join(v.dir, ...rel(x.file).split('/')); return !exists(f) || sha1(fs.readFileSync(f)) !== sha1(fs.readFileSync(x.file)) }).length
        if (badN) die(`会话备份包核对没过：${badN} 个文件对不上，什么都没改。包留在 ${posix(outFile)}`)
        ok(`要改写的 ${rewrites.length} 个会话已打包：${posix(outFile)}（逐个核对过；放回去就是把里面的 sessions/ 解到 ${posix(SESSIONS)} 覆盖）`)
      }
    }
  }
  if (!DRY) TOUCHED = true
  const bak = (f) => backup(f, 'pre-uninstall')
  const rm = (p, label) => { if (DRY) { info(`[干跑] 将删除 ${label || posix(p)}`); return } fs.rmSync(p, { recursive: true, force: true }) }

  // ── 2. 心跳 ──
  step('停掉心跳')
  if (!heartbeats.length) ok('没有要停的')
  for (const h of heartbeats) {
    if (h.kind === 'launchd') {
      if (DRY) { info(`[干跑] 将停掉 launchd ${h.label} 并删除 ${posix(h.file)}`); continue }
      spawnSync('launchctl', ['bootout', `gui/${os.userInfo().uid}/${h.label}`], { encoding: 'utf8' })
      fs.rmSync(h.file, { force: true })
      ok(`launchd ${h.label} 已停掉，plist 已删`)
    } else {
      if (DRY) { info(`[干跑] 将注销计划任务 ${h.name}`); continue }
      const r = spawnSync('schtasks', ['/Delete', '/TN', h.name, '/F'], { encoding: 'utf8', windowsHide: true })
      if (r.status === 0) ok(`计划任务 ${h.name} 已注销`)
      else warn(`计划任务 ${h.name} 注销失败：${String(r.stderr || r.stdout || '').trim().slice(0, 200)}；可以在 PowerShell 里跑 Unregister-ScheduledTask -TaskName ${h.name} -Confirm:$false`)
    }
  }

  // ── 3. 旧会话 ──
  if (rewrites.length) {
    step('改写旧会话开头的 preset')
    let n = 0
    for (const x of rewrites) {
      const r = x.r
      if (DRY) { n++; continue }
      const st = fs.statSync(x.file)
      const buf = x.file.endsWith('.zstd') ? zlib.zstdCompressSync(Buffer.from(r.text, 'utf8')) : Buffer.from(r.text, 'utf8')
      const tmp = x.file + '.tmp-uninstall'
      fs.writeFileSync(tmp, buf)
      const back = x.file.endsWith('.zstd') ? zlib.zstdDecompressSync(fs.readFileSync(tmp)).toString('utf8') : readText(tmp)
      if (back !== r.text) { fs.rmSync(tmp, { force: true }); die(`改写 ${posix(x.file)} 后读回来对不上，停下了；已改的会话原样在备份包里`) }
      fs.renameSync(tmp, x.file)
      try { fs.utimesSync(x.file, st.atime, st.mtime) } catch { /* 改不了时间不影响内容 */ }
      n++
    }
    ;(DRY ? info : ok)(`${DRY ? '[干跑] 将改写' : '已改写'} ${n} 个会话（原样都在备份包里）`)
  }

  // ── 4. profile 配置和锁文件 ──
  step('profile 配置和锁文件')
  if (pjPlan.changed) { JSON.parse(pjPlan.text); bak(pkgPath); write(pkgPath, pjPlan.text, 'package.json'); if (!DRY) ok('package.json 已改（原文件留了 .bak）') } else ok('package.json 不用改')
  if (cfgPlan.changed) { bak(cfgPath); write(cfgPath, cfgPlan.text, 'cordis.patch.yml'); if (!DRY) ok('cordis.patch.yml 已改（原文件留了 .bak）') } else ok('cordis.patch.yml 不用改')
  for (const lp of lockPlans) {
    if (lp.error || !lp.changed) continue
    bak(lp.f); write(lp.f, lp.text, lp.label)
    if (!DRY) ok(`${lp.label} 已改`)
    if (lp.leftover && lp.leftover.length) warn(`${lp.label} 里还有 ${lp.leftover.length} 行提到这些包（可能是别的包依赖它们），没硬删：${lp.leftover.slice(0, 3).map((l) => l.trim()).join(' / ')}`)
  }

  // ── 5. 本体和零件 ──
  step(OLD === 'shell' ? `本体和零件（${PRESET_PKG} 换成空壳）` : '本体和零件')
  for (const n of remove) if (exists(path.join(NM, n))) { rm(path.join(NM, n), `node_modules/${n}`); if (!DRY) ok(`node_modules/${n} 已删`) }
  for (const d of bakDirs) { rm(path.join(NM, d), `node_modules/${d}`); if (!DRY) ok(`node_modules/${d} 已删`) }
  if (shell) {
    const dir = path.join(NM, PRESET_PKG)
    if (!wasShell || Object.entries(shell.files).some(([f, t]) => !exists(path.join(NM, PRESET_PKG, f)) || readText(path.join(NM, PRESET_PKG, f)) !== t)) {
      if (!DRY && exists(dir)) { for (const f of fs.readdirSync(dir)) if (!shell.files[f]) fs.rmSync(path.join(dir, f), { recursive: true, force: true }) }
      for (const [f, t] of Object.entries(shell.files)) write(path.join(dir, f), t, `${PRESET_PKG}/${f}（空壳）`)
      if (!DRY) ok(`${PRESET_PKG} 已换成空壳：${shell.ids.map((id) => `${PRESET_LABEL[id] || id}（已卸载）`).join('、')}`)
    } else ok(`${PRESET_PKG} 已经是空壳，不用改`)
  }

  // ── 6. DSH 家目录里的东西 ──
  step('DSH 家目录里本架构的东西')
  if (srvPlan && (srvPlan.removed || srvPlan.dropDir)) {
    if (srvPlan.dropDir) { rm(path.dirname(SERVERS), 'mcp-hub/（清单里只有 echo，mcp-hub 也卸了）'); if (!DRY) ok('mcp-hub/ 已删（清单原文在备份包里）') }
    else { bak(SERVERS); write(SERVERS, JSON.stringify(srvPlan.doc, null, 2), 'mcp-hub/servers.json（去掉 echo）'); if (!DRY) ok(`mcp-hub 清单去掉了 echo，留着 ${srvPlan.others.join('、')}`) }
  }
  if (ptrOurs) {
    rm(PTR, 'hub/echo.config.json（指针）')
    const hubDir = path.dirname(PTR)
    if (!DRY) { ok('指针 hub/echo.config.json 已删'); try { if (!fs.readdirSync(hubDir).filter((x) => x !== '.DS_Store').length) { fs.rmSync(hubDir, { recursive: true, force: true }); ok('hub/ 空了，一起删') } } catch { /* 删不了就留着 */ } }
  }
  for (const f of stateFiles) rm(path.join(stateDir, f), `state/${f}`)
  if (stateFiles.length && !DRY) ok(`换气账本等 ${stateFiles.length} 个文件已删（state/）`)

  // ── 7. 书房和记忆中枢 ──
  step('书房和记忆中枢')
  if (KEEP_DATA) {
    if (exists(STATE_PATH)) {
      const st = { ...(readJson(STATE_PATH) || {}), uninstalledAt: new Date().toISOString(), uninstallBackup: BK && !BK.dry ? posix(BK.outFile) : null, oldSessions: OLD }
      write(STATE_PATH, JSON.stringify(st, null, 2), '.install-state.json（记下已卸载）')
    }
    ok(`按 --keep-data 保留：${dataDirs.map(posix).join('、') || '（没有）'}`)
  } else {
    for (const d of dataDirs.filter(inHome).sort((a, b) => b.length - a.length)) { if (exists(d) || DRY) { rm(d, posix(d)); if (!DRY) ok(`${posix(d)} 已删`) } }
  }

  // ── 8. 校验 ──
  step('校验')
  if (DRY) info('[干跑] 真跑时会校验：package.json、cordis.patch.yml、锁文件都能解析，里面没有残留的包名，剩下的包要加载的插件都找得到，默认 preset 存在')
  else {
    const pj = readJson(pkgPath)
    if (!pj) die('package.json 改完解析不了，用同目录的 .bak-…-pre-uninstall 还原')
    ok('package.json 是合法 JSON')
    if (parse) { try { parse(readText(cfgPath)); ok('cordis.patch.yml 解析通过') } catch (e) { die(`cordis.patch.yml 改完解析不了：${e.message}；用同目录的 .bak-…-pre-uninstall 还原`) } }
    for (const lp of lockPlans) {
      if (lp.error || !lp.changed) continue
      try { lp.f.endsWith('.json') ? JSON.parse(readText(lp.f)) : parse && parse(readText(lp.f)) } catch (e) { die(`${lp.label} 改完解析不了：${e.message}；用同目录的 .bak-…-pre-uninstall 还原`) }
    }
    ok('锁文件都能解析')
    const pjText = readText(pkgPath)
    const left = remove.filter((n) => new RegExp(`"${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(pjText))
    if (left.length) warn(`package.json 里还提到 ${left.join('、')}`)
    const bl = (pj.dsh && pj.dsh.profile && pj.dsh.profile.bundles) || []
    const missing = bl.filter((b) => !b.startsWith('@deepseek-ai/') && !exists(path.join(NM, ...b.split('/'), 'package.json')))
    const newly = missing.filter((b) => !missingBefore.includes(b))
    if (newly.length) warn(`bundles 里这些包在 node_modules 里找不到：${newly.join('、')}；DSH 启动时会加载失败，用 package.json 旁边的 .bak-…-pre-uninstall 还原后再查`)
    if (missing.length > newly.length) info(`bundles 里 ${missing.filter((b) => missingBefore.includes(b)).join('、')} 在 node_modules 里找不到，卸载前就这样，不是本架构的包，没动`)
    if (!missing.length) ok(`bundles 剩 ${bl.length} 项，都找得到`)
    const bad = parse ? patchNamesMissing(NM, bl.filter((b) => exists(path.join(NM, ...b.split('/'), 'package.json'))), parse) : []
    if (bad.length) warn(`有包要加载的插件找不到：${bad.slice(0, 5).join('；')}`)
    else if (parse) ok('剩下的每个包要加载的插件都找得到')
    const sel = (readText(cfgPath).match(/^ {4}selectedDefault: ['"]?([\w-]+)['"]?\s*$/m) || [])[1]
    if (sel && SOUL_PRESET_IDS.includes(sel) && OLD !== 'shell') warn(`新会话默认 preset 还是 ${sel}，它已经删了；在 DSH 里选一个官方 preset`)
    else ok(`新会话默认 preset：${sel || '（没设，用 DSH 默认的）'}`)
  }

  out('\n' + '─'.repeat(60))
  if (DRY) {
    out('干跑结束：以上是计划，没有改任何文件。确认无误后去掉 --dry-run 再跑。')
    if (running === true) {
      printTerminalHint(!OLD_SESSIONS && OLD && soulSessions.length ? ['--old-sessions', OLD] : [])
      if (!OLD) out(`（命令里还要加上 --old-sessions ${Object.keys(MODES).join('、')} 里的一个，见上面「打算怎么做」）`)
    }
  } else out('卸载完成。')
  if (WARNS.length) { out('\n需要留意：'); for (const w of WARNS) out('  ! ' + w) }
  if (!DRY) out(`
接下来：
  1. 启动 DSH。插件市场里不会再有 dsh-agent-soul 的本体和零件${OLD === 'shell' ? `；preset 列表里的 Soul preset 名字后面带「（已卸载）」，压缩和裁剪已是官方原版` : ''}。
  2. 新建会话，顶部选官方 preset${cfgPlan.defaultTo ? `（默认已改成 ${cfgPlan.defaultTo}）` : ''}。${OLD === 'rewrite' && soulSessions.length ? `\n  3. 以前用 Soul preset 建的 ${soulSessions.length} 个会话已改成对应的官方 preset，照常打开。` : OLD === 'keep' && soulSessions.length ? `\n  3. 以前用 Soul preset 建的 ${soulSessions.length} 个会话可能打不开；要看它们，用备份包装回来。` : ''}
备份包：${BK && !BK.dry ? posix(BK.outFile) : '（没打）'}
想装回来（先退出 DSH）：node install.mjs --restore${BK && !BK.dry ? ` "${posix(BK.outFile)}"` : ' <备份包>'}
没删的：dsh-mnemon、其他插件、会话记录、安装包文件夹${KEEP_DATA ? '、书房和记忆中枢' : ''}；profile 里改过的文件旁边各有一份 .bak-${TS}-pre-uninstall。`)
  process.exit(0)
}

// ═══ 恢复（--restore）：先读备份包，决定装哪一版 ═════════════════════════
let RB = null
if (RESTORE) {
  step('读取备份包')
  const f = RESTORE_FILE ? path.resolve(RESTORE_FILE) : newestBackup()
  if (!f || !exists(f)) die(RESTORE_FILE ? `备份包不存在：${RESTORE_FILE}` : '没指定备份包，安装包的 backups/ 里也没有。用法：--restore <备份包路径>')
  const tmp = path.join(os.tmpdir(), `dsh-soul-restore-${TS}`); TMP_DIRS.push(tmp)
  let x
  try { x = extractTarGz(f, tmp) } catch (e) { die(`备份包解不开：${e.message}`) }
  const man = readJson(path.join(x.dir, 'manifest.json'))
  if (!man || man.kind !== 'dsh-agent-soul-backup') die('这不是 dsh-agent-soul 的备份包（里面没有 manifest.json）')
  let bad = 0
  for (const [k, m] of Object.entries(man.files || {})) { const p = path.join(x.dir, ...k.split('/')); if (!exists(p) || sha1(fs.readFileSync(p)) !== m.sha1) bad++ }
  if (bad) die(`备份包里有 ${bad} 个文件对不上校验值，包可能损坏了，别用它。`)
  ok(`备份包：${posix(f)}`)
  ok(`来自 ${man.host}（${man.platform}），${man.createdAt}；书房 ${man.counts.soul || 0} / 记忆中枢 ${man.counts.memory || 0} / 会话 ${man.counts.sessions || 0} 个文件，校验全部通过`)
  RB = { root: x.dir, man, settings: readJson(path.join(x.dir, 'config', 'soul-settings.json')) || {} }
  if (!opt('--ref') && !SOURCE && man.upstream && man.upstream.sha) { REF = man.upstream.sha; ok(`按备份时的版本装：提交 ${short(REF)}${man.upstream.version ? `（v${man.upstream.version}）` : ''}；装好后想升到最新再跑 --update`) }
  if (!opt('--default-preset') && RB.settings.selectedDefault) DEFAULT_PRESET = RB.settings.selectedDefault
  if (!opt('--skip-part') && Array.isArray(man.parts) && man.parts.length) SKIP_PARTS = PARTS.filter((pt) => !PART_NAMES[pt].some((n) => man.parts.includes(n)))
  const ledger = path.join(SOUL, '02-墨.jsonl')
  const hasLead = exists(ledger) && /"type"\s*:\s*"lead"/.test(readText(ledger))
  const selfFilled = exists(path.join(HUB, 'SELF.src.md')) && !readText(path.join(HUB, 'SELF.src.md')).includes('<你的名字>')
  RB.conflict = hasLead || selfFilled
  if (RB.conflict && !FORCE) die(`这台电脑上已经有灵魂数据（${[hasLead && '账本里有主导记录', selfFilled && 'SELF.src.md 已填过'].filter(Boolean).join('、')}）。恢复会覆盖书房和记忆中枢。\n    确认要覆盖就加 --force：原有的会先整份备份到 ${posix(path.join(SOUL_ROOT, '_backup'))}/<时间>-pre-restore。`)
  if (RB.conflict) warn('这台电脑上已经有灵魂数据，按 --force 覆盖；原有的会先整份备份')
  RB.state = readJson(path.join(x.dir, 'install-state.json')) || {}
  RB.selfTitle = selfTitle(path.join(x.dir, 'memory', 'hub'))
}

// ═══ 方案：装成什么样（安装时选；更新、恢复按原来的）═══════════════════════
const MNEMON = MNEMON_ENABLED
function selfTitle(hubDir) { try { const m = readText(path.join(hubDir, 'SELF.src.md')).match(/^# SELF · (.+)$/m); return m && !m[1].includes('<') ? m[1].trim() : null } catch { return null } }
// 安装记录里没写方案的（安装包 2.1 及以前装的）：按自我层的标题认
function knownSetup(st, title) {
  if (st && st.setup && st.setup.name) return st.setup
  const hit = title && listSetups().find((x) => x.s.name === title)
  return hit ? { name: hit.dir, agent: hit.s.name, user: hit.s.user, kind: hit.s.kind } : null
}
let SETUP = null, SETUP_DIR = null, SETUP_NAME = null, SETUP_NEW = null, SETUP_INFO = null
let SETUP_WARNS = [] // 方案里选了这台系统上有限制的零件（lib/parts.mjs 的平台说明）
const useSetup = (name, why) => {
  const L = loadSetup(name)
  if (L.errors.length) die(`方案「${name}」有问题：\n      ${L.errors.join('\n      ')}`)
  SETUP = L.setup; SETUP_DIR = L.dir; SETUP_NAME = L.dirName; SETUP_WARNS = L.warnings
  if (why) ok(why)
}
if (MODE === 'install') {
  step('选方案')
  let pick = SETUP_OPT ? 'setup' : FRESH ? 'fresh' : null, name = SETUP_OPT
  const prev = installed ? knownSetup(state0, selfTitle(HUB)) : null
  if (!pick && prev && exists(path.join(SETUPS, prev.name, 'setup.json'))) { pick = 'setup'; name = prev.name; ok(`这台电脑装过，按当时的方案「${name}」补全`) }
  if (!pick) {
    const all = listSetups()
    if (!TTY) die(`要先选怎么装：\n      用现成方案：--setup <方案名>（现有：${all.map((x) => x.dir).join('、') || '没有'}）\n      全新安装：先跑 --questions 拿问题清单，问完用户写成回答文件，再加 --fresh --answers <文件>\n    在终端里直接跑 node install.mjs，会一步步问。`)
    console.log('\n怎么装？')
    all.forEach((x, i) => console.log(`  ${i + 1}. 用现成方案「${x.dir}」—— agent 叫 ${x.s.name}，称呼用户 ${x.s.user}`))
    console.log(`  ${all.length + 1}. 全新安装 —— 一步步填设定，填完存成新方案再装`)
    for (;;) {
      const v = Number(await askLine('> 编号：'))
      if (Number.isInteger(v) && v >= 1 && v <= all.length) { pick = 'setup'; name = all[v - 1].dir; break }
      if (v === all.length + 1) { pick = 'fresh'; break }
      console.log(`  只能填 1 到 ${all.length + 1}。`)
    }
  }
  let draft = null
  if (pick === 'setup') useSetup(name)
  else {
    let raw
    if (ANSWERS_FILE) { raw = readJson(path.resolve(ANSWERS_FILE)); if (!raw || typeof raw !== 'object') die(`回答文件读不了，或者不是合法的 JSON：${ANSWERS_FILE}`) }
    else if (TTY) {
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      try { raw = await askTerminal(rl, { mnemon: MNEMON, platform: process.platform }) } finally { rl.close() }
      draft = path.join(KIT, 'logs', `answers-${TS}.json`)
      fs.mkdirSync(path.dirname(draft), { recursive: true })
      fs.writeFileSync(draft, JSON.stringify(raw, null, 2), 'utf8')
    } else die('全新安装需要回答：先跑 node install.mjs --questions 拿问题清单，问完用户把回答写成 JSON 文件，再加 --answers <文件>。')
    const n = normalizeAnswers(raw, { mnemon: MNEMON, platform: process.platform })
    if (n.errors.length) die(`回答里有 ${n.errors.length} 处要补或要改：\n      ${n.errors.join('\n      ')}`)
    SETUP_WARNS = n.warnings
    SETUP_NEW = buildSetupFiles(n.setup, KIT_VERSION)
    SETUP = SETUP_NEW.json; SETUP_NAME = n.setup.setupName; SETUP_DIR = path.join(SETUPS, SETUP_NAME)
    ok(ANSWERS_FILE ? `回答文件：${posix(path.resolve(ANSWERS_FILE))}，校验通过` : '回答收齐了，校验通过')
  }
  for (const l of describeSetup(SETUP, SETUP_NAME)) out('  ' + l)
  if (!MNEMON && SETUP.parts.includes('mnemon-probe')) warn('方案要装 mnemon-probe，但这台电脑还没装 dsh-mnemon：它会每轮报「读盘失败」，建议先在插件市场装 dsh-mnemon 再装这个方案')
  for (const w of SETUP_WARNS) warn(`方案选了这台系统上有限制的零件 ${w}${/不可用/.test(w) ? `；不想装就加 --skip-part ${w.split('：')[0]}` : ''}`)
  if (TTY && !DRY) {
    if (!parseBool(await askLine('\n按这个方案装？(Y/n) '), true)) {
      out('\n没动任何文件。' + (draft ? `这次的回答存在 ${posix(draft)}，下次加 --fresh --answers "${posix(draft)}" 就不用再答一遍。` : ''))
      process.exit(0)
    }
  }
  if (SETUP_NEW) {
    if (DRY) info(`[干跑] 真跑时会把这套设定存成方案 ${posix(SETUP_DIR)}/` + (draft ? `；这次的回答存在 ${posix(draft)}，真跑加 --fresh --answers "${posix(draft)}" 就不用再答一遍` : ''))
    else {
      fs.mkdirSync(SETUP_DIR, { recursive: true })
      for (const [f, t] of Object.entries(SETUP_NEW.files)) fs.writeFileSync(path.join(SETUP_DIR, f), t, 'utf8')
      if (draft) fs.rmSync(draft, { force: true }) // 方案存好了，草稿就不用留
      ok(`设定存成了方案 ${posix(SETUP_DIR)}/（中途出错的话，改用 --setup ${SETUP_NAME} 重跑，不用再答）`)
    }
  }
  SETUP_INFO = { name: SETUP_NAME, agent: SETUP.name, user: SETUP.user, kind: SETUP.kind }
} else if (MODE === 'restore') {
  SETUP_INFO = knownSetup(RB.state, RB.selfTitle)
  if (SETUP_INFO && exists(path.join(SETUPS, SETUP_INFO.name, 'setup.json'))) useSetup(SETUP_INFO.name, `备份是按方案「${SETUP_INFO.name}」装的；书房、自我层用备份里的，方案只在缺文件时补`)
} else if (MODE === 'update' || MODE === 'fix') SETUP_INFO = knownSetup(state0, selfTitle(HUB))
const AGENT = (SETUP && SETUP.name) || (SETUP_INFO && SETUP_INFO.agent) || selfTitle(HUB) || 'agent'
const USERN = (SETUP && SETUP.user) || (SETUP_INFO && SETUP_INFO.user) || '用户'
// 方案里的文件：刚生成、还没存盘的从内存取
const setupText = (key) => (SETUP_NEW ? SETUP_NEW.files[SETUP.files[key]] : readText(path.join(SETUP_DIR, SETUP.files[key])))

// 要生成的 Soul preset、默认 preset、心跳
const presetsOnDisk = (() => { try { return [...new Set(Object.keys(presetSummary(readText(path.join(NM, PRESET_PKG, 'cordis.patch.yml')))).map((id) => RETIRED_PRESETS[id] || OLD_PRESET_IDS[id] || id).filter((id) => PRESET_IDS.includes(id)))] } catch { return [] } })()
// 更新/恢复读的是旧安装记录，里面的 id 可能已经改名（ptc-soul → 砚青 PTC 之类）：先映射再过滤，认不出的丢掉
const mapOldPresetIds = (list) => {
  const out = []
  for (const x of Array.isArray(list) ? list : []) {
    const id = RETIRED_PRESETS[x] || OLD_PRESET_IDS[x] || x
    if (PRESET_IDS.includes(id) && !out.includes(id)) out.push(id)
  }
  return out
}
const PRESET_CHOICE = MODE === 'install' ? SETUP.presets
  : MODE === 'restore' ? (mapOldPresetIds(RB.state.presetIds).length ? mapOldPresetIds(RB.state.presetIds) : PRESET_IDS)
  : (mapOldPresetIds(state0 && state0.presetIds).length ? mapOldPresetIds(state0 && state0.presetIds) : presetsOnDisk.length ? presetsOnDisk : PRESET_IDS)
// 局部 --fix-only 保持范围；完整安装、更新、恢复、修复都清理退役 preset。
const MIGRATE_PRESETS = !FIX_MODE || !FIX_ONLY.length
let PRESET_SESSION_PLANS = []
const configBeforeMigration = exists(cfgPath) ? readText(cfgPath) : ''
const migratedConfig = MIGRATE_PRESETS ? migratePresetDefault(configBeforeMigration) : configBeforeMigration
const installedPresetText = exists(path.join(NM, PRESET_PKG, 'cordis.patch.yml')) ? readText(path.join(NM, PRESET_PKG, 'cordis.patch.yml')) : ''
const retiredBlocks = presetBlocks(installedPresetText).some((block) => RETIRED_PRESETS[block.id])
if (MIGRATE_PRESETS) {
  try { PRESET_SESSION_PLANS = planPresetSessions(SESSIONS, RESTORE ? path.join(RB.root, 'sessions') : null) }
  catch (error) { die(error.message) }
  if ((retiredBlocks || PRESET_SESSION_PLANS.length || migratedConfig !== configBeforeMigration) && !PRESET_CHOICE.includes('yanqing-ptc')) PRESET_CHOICE.push('yanqing-ptc')
  if (retiredBlocks || PRESET_SESSION_PLANS.length || migratedConfig !== configBeforeMigration) info(`退役 preset 清理：移除旧 Flash，${PRESET_SESSION_PLANS.length} 个会话迁到砚青 PTC；默认入口同步迁移，原文件纳入事务备份`)
}
const presetMigrationPending = PRESET_SESSION_PLANS.length > 0 || migratedConfig !== configBeforeMigration
if (MIGRATE_PRESETS && RETIRED_PRESETS[DEFAULT_PRESET]) {
  DEFAULT_PRESET = RETIRED_PRESETS[DEFAULT_PRESET]
  if (!PRESET_CHOICE.includes(DEFAULT_PRESET)) PRESET_CHOICE.push(DEFAULT_PRESET)
}
if (DEFAULT_PRESET === null) DEFAULT_PRESET = MODE === 'install' ? SETUP.defaultPreset : PRESET_CHOICE.includes('yanqing') ? 'yanqing' : PRESET_CHOICE[0]
if (PRESET_IDS.includes(DEFAULT_PRESET) && !PRESET_CHOICE.includes(DEFAULT_PRESET)) die(`默认 preset ${DEFAULT_PRESET} 不在要生成的 Soul preset 里（${PRESET_CHOICE.join('、')}）`)
if (MODE === 'install' || MODE === 'restore') {
  const hb = MODE === 'install' ? SETUP.heartbeat : RB.state.heartbeat
  if (hb && hb.enabled === false && !opt('--heartbeat-time')) NO_HB = true
  HB_TIME = HB_TIME || (hb && hb.time) || '12:00'
}
HB_TIME = HB_TIME || '12:00'

// 要装的零件：必装的不许跳；可选的按方案；更新时以前拒掉的不再补
if (MODE === 'install') {
  const bad = SKIP_PARTS.filter((p) => MUST_HAVE(p))
  if (bad.length) die(`必装零件不能跳过：${bad.join('、')}`)
  for (const p of OPTIONAL_PARTS) if (!SETUP.parts.includes(p) && !SKIP_PARTS.includes(p)) SKIP_PARTS.push(p)
}
const DECLINED0 = (state0 && Array.isArray(state0.declined) && state0.declined) || []
if (UPDATE) for (const p of DECLINED0) if (!SKIP_PARTS.includes(p)) SKIP_PARTS.push(p)
const isInstalledPart = (p) => PART_NAMES[p].some((n) => exists(path.join(NM, n, 'package.json')))
// 不能跳过的零件：恢复旧备份（那时还没有这个零件）、以前拒掉过、或者命令行 --skip-part 了都一样
{
  const must = SKIP_PARTS.filter((p) => MUST_HAVE(p))
  if (must.length && opt('--skip-part') && must.some((p) => String(opt('--skip-part')).split(',').map((x) => x.trim()).includes(p))) die(`这些零件不能跳过：${must.join('、')}（必装零件，或者 Soul preset 要调用它，缺了 DSH 起不来）`)
  if (must.length) { SKIP_PARTS = SKIP_PARTS.filter((p) => !MUST_HAVE(p)); info(`${must.join('、')} 不能不装（必装零件，或者 Soul preset 要调用它），照装`) }
}
if (UPDATE && !FIX_MODE && TTY && !DRY) {
  // 安装包后来才加的零件：终端里问一句；agent 那条路在下面的变化报告里提示
  const kit0 = state0 && state0.kitVersion ? state0.kitVersion : '2.0'
  for (const p of PARTS.filter((x) => ADDED_PARTS[x] && verLess(kit0, ADDED_PARTS[x]) && !MUST_HAVE(x) && !SKIP_PARTS.includes(x) && !isInstalledPart(x))) {
    const i = PART_INFO[p] || {}, note = platformText(p), def = !/不可用/.test(note || '')
    if (!parseBool(await askLine(`\n安装包新加了零件 ${p}：${i.what || ''}；不装：${i.without || ''}。${note ? note + '。' : ''}装吗？(${def ? 'Y/n' : 'y/N'}) `), def)) { SKIP_PARTS.push(p); info(`不装 ${p}，记下来，以后更新也不再问`) }
  }
}

// ═══ 称呼替换（lib/name-map.mjs）：--rename 优先；不给就安装按方案、更新按安装记录、恢复按备份里的安装记录 ═══
const NAME_FROM = RENAME_OPT !== undefined ? '--rename' : MODE === 'install' ? '方案' : UPDATE ? '安装记录' : '备份里的安装记录'
const NAME_PARSED = parseNameMap(RENAME_OPT !== undefined ? RENAME_OPT : MODE === 'install' ? SETUP && SETUP.nameMap : UPDATE ? state0 && state0.nameMap : RB && RB.state && RB.state.nameMap)
if (NAME_PARSED.errors.length) die(`称呼替换（来自${NAME_FROM}）有问题：\n      ${NAME_PARSED.errors.join('\n      ')}`)
const NAME_MAP = NAME_PARSED.map
const NAME_DIFF_RB = MODE === 'restore' && RB && RB.state && !sameNameMap(RB.state.nameMap, NAME_MAP)
if (RENAME_OPT !== undefined && (!hasNames(NAME_MAP) || NAME_DIFF_RB)) ok(`称呼替换按 --rename：${hasNames(NAME_MAP) ? `上游代码里的${nameMapLabel(NAME_MAP)}` : '不换'}${NAME_DIFF_RB ? '（和备份里记的不一样，以这次为准）' : ''}`)
// 在上游源码的临时副本上做称呼替换；后面比对、安装、中枢同步都用这份，替换就不会被当成上游改动，也不会被下次更新冲掉
function withNames(s) {
  if (!s || !hasNames(NAME_MAP)) return s
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-soul-names-')); TMP_DIRS.push(dir)
  const out = path.join(dir, 'src')
  const renamed = renameTree(s.dir, out, NAME_MAP, SKIP_RE)
  return { ...s, dir: out, raw: s.dir, renamed }
}
if (MODE === 'install' && installed && state0 && !sameNameMap(state0.nameMap, NAME_MAP)) die(`这台电脑已经装过，${NAME_FROM === '--rename' ? '--rename 指定' : NAME_FROM + '里'}的称呼替换（${nameMapLabel(NAME_MAP) || '不换'}）和安装记录里的（${nameMapLabel(state0.nameMap) || '不换'}）不一样。重跑安装只补缺的步骤、不重装已有的零件，换不全；要改称呼替换请用 --update --rename ${hasNames(NAME_MAP) ? Object.entries(NAME_MAP).map(([a, b]) => `${a}=${b}`).join(',') : 'none'}。`)

// ═══ 修复清单的设置（lib/fixes.mjs）：跳过哪些。--fix-skip 改整张单子，--fix-revert 追加；记进安装记录，以后照做 ═══
if (FIX_MODE && !installed) die('这台电脑还没装 dsh-agent-soul，--fix 没东西可修；先安装')
const FIX_SHA = FIX_MODE && state0 && state0.upstream && /^[0-9a-f]{40}$/.test(state0.upstream.sha || '') ? state0.upstream.sha : null
if (FIX_MODE && !FIX_SHA && !SOURCE) die('安装记录里没有已装那一版的上游提交号，--fix 没法对照作者原文：先跑一次 --update，或者加 --source <已装那一版的源码>')
const FIX_SAVED = MODE === 'install' ? SETUP && SETUP.fixSkip : RESTORE ? RB && RB.state && RB.state.fixSkip : state0 && state0.fixSkip
// 2.17 的压缩摘要设置（summaryModel: author）就是跳过 preset-summary-model，换成清单的写法
const SUMMARY_SAVED = MODE === 'install' ? SETUP && SETUP.summaryModel : RESTORE ? RB && RB.state && RB.state.summaryModel : state0 && state0.summaryModel
let FIX_SKIP = Array.isArray(FIX_SAVED) ? FIX_SAVED.filter((id) => FIX_IDS.includes(id)) : (SUMMARY_SAVED === 'author' ? ['preset-summary-model'] : [])
if (FIX_SKIP_OPT !== undefined) FIX_SKIP = FIX_SKIP_OPT === 'none' ? [] : idsOpt('--fix-skip')
if (SUMMARY_OPT === 'author') FIX_SKIP.push('preset-summary-model')
if (SUMMARY_OPT === 'session') FIX_SKIP = FIX_SKIP.filter((id) => id !== 'preset-summary-model')
FIX_SKIP = [...new Set([...FIX_SKIP, ...FIX_REVERT])]
const fixSelected = (id) => !FIX_ONLY.length || FIX_ONLY.includes(id)
const FIX_RECORDS = structuredClone((RESTORE ? RB?.state : state0)?.fixRecords || { files: {}, config: [], presets: {} })
FIX_RECORDS.files ||= {}
FIX_RECORDS.presets ||= {}
FIX_RECORDS.config ||= []
if (FIX_SKIP.length) info(`修复清单里跳过：${FIX_SKIP.map((id) => `${id}（${fixInfo(id).title}）`).join('、')}${FIX_SKIP_OPT === undefined && !FIX_REVERT.length ? '（按' + (MODE === 'install' ? '方案' : UPDATE ? '安装记录' : '备份里的安装记录') + '）' : ''}`)

// --fix 把上游钉在已装的那一版：对照的是「装进来的那份作者原文」，作者新改的东西要等 --update 才进来
const SRC0 = await getSource(FIX_SHA && !SOURCE ? { ref: FIX_SHA } : {})
if (FIX_MODE && FIX_SHA && SRC0.sha && FIX_SHA !== SRC0.sha) die('--source 的提交和安装记录不一致，换版本请用 --update')
ok(`上游源码：${SRC0.from}${FIX_SHA && !SOURCE ? '（--fix：就是已装的那一版）' : ''}`)
const SRC = withNames(SRC0)
const FIX_ROWS = [] // 本次每条修复的结论：{ id, status, action, note }
if (SRC !== SRC0) { const shipped = new Set(packFiles(SRC.dir)); ok(`称呼替换（按${NAME_FROM === '--rename' ? ' --rename' : NAME_FROM}）：上游代码里的${nameMapLabel(NAME_MAP)}，会装进 DSH 的有 ${SRC.renamed.filter((f) => shipped.has(f)).length} 个文件；后面比对、安装、中枢同步都按替换后的来`) }
const srcVer = (readJson(path.join(SRC.dir, 'package.json')) || {}).version
ok(`版本：提交 ${short(SRC.sha)}${srcVer ? `（v${srcVer}）` : ''}${SRC.sha === VERIFIED.sha ? '，就是安装包对照过的版本' : `，安装包对照过的是 ${VERIFIED.sha.slice(0, 7)}（${VERIFIED.date}）`}`)
const src = checkSource(SRC.dir)
if (src.extra.length) warn(`上游又有安装包不认识的零件：${src.extra.join('、')}。这份安装包该更新了；想先稳住就加 --ref ${VERIFIED.sha.slice(0, 7)} 装对照过的版本`)
if (src.absent.length) info(`这个版本的上游还没有 ${src.absent.join('、')}，跳过`)
if (SKIP_PARTS.length) info(`${UPDATE ? '按之前的选择不装' : '这次不装'}的零件：${SKIP_PARTS.join('、')}`)
// AP：这次要处理的零件（目录名）；PKGS：它们的包名（上游原样）；INST：本机已装的目录名（可能是旧名）
const AP = PARTS.filter((p) => src.names[p] && !SKIP_PARTS.includes(p))
const PKGS = AP.map((p) => src.names[p])
const INST = AP.map((p) => PART_NAMES[p].find((n) => exists(path.join(NM, n, 'package.json'))) || null)
const RENAMES = AP.map((p, i) => (INST[i] && INST[i] !== PKGS[i] ? { part: p, from: INST[i], to: PKGS[i] } : null)).filter(Boolean)
// 包名迁移（例如 3.0 装的 dsh-yanqing-* → 上游现在的 dsh-agent-*）要重装零件，那是 --update 的事；--fix 不动包名
if (FIX_MODE && RENAMES.length) die(`这台装的是旧包名（${RENAMES.map((r) => `${r.from} → ${r.to}`).join('；')}），包名迁移要重装零件：请用 --update，--fix 只修文件不改包名。`)
const RENAME_MAP = Object.fromEntries(RENAMES.map((r) => [r.from, r.to]))
const stateKit = state0 && state0.kitVersion ? state0.kitVersion : '2.0'
// 更新时本机没有也必须补上的：必装零件、Soul preset 要调用的零件（压缩三件套，缺一个 preset 就加载失败、DSH 起不来）
// --fix 不补装零件（那是更新的事）
const TO_ADD = FIX_MODE ? new Set() : new Set(AP.filter((p, i) => !INST[i] && (!UPDATE || MUST_HAVE(p) || (ADDED_PARTS[p] && verLess(stateKit, ADDED_PARTS[p])))))
// package.json 里只写这次之后真的在 node_modules 里的零件：写了不存在的 file: 依赖，插件市场一跑 pnpm 就报 ENOENT
const PKGS_LIVE = PKGS.filter((n, i) => !UPDATE || INST[i] || TO_ADD.has(AP[i]))
// 这次会装上 / 留着的零件里，这台系统上有已知限制的（安装时在「选方案」那一步已经说过）
if (MODE !== 'install') for (const [i, p] of AP.entries()) { const t = platformText(p); if (t && PKGS_LIVE.includes(PKGS[i])) warn(`${p}：${t}`) }
// 发布清单自洽（lib/package-contract.mjs）：本体和这次要装的零件，入口 import 到的文件都得在 files 里，
// 否则按清单拷完就缺文件、零件加载失败 → 在动手前停下。用到的 @deepseek-ai/* 没在 peerDependencies 里声明的只提示：
// 宿主拦不拦随 DSH 版本，上游 v2.0.0 的 compaction、huanqi 都漏过，桌面实测仍能加载。
// 只查这次真的会装上的（更新时本机没装、也不补装的零件，打包有问题也不该挡住更新）
const PKG_ISSUES = [['本体 dsh-agent-soul', SRC.dir, null], ...AP.map((p, i) => [PKGS[i], partSrc(p), p]).filter(([name]) => PKGS_LIVE.includes(name))]
  .flatMap(([label, dir, part]) => inspectPackage(dir, packFiles(dir)).map((issue) => ({ label, part, issue })))
const PKG_BROKEN = PKG_ISSUES.filter((x) => x.issue.kind !== 'peer')
if (PKG_BROKEN.length) {
  const optional = [...new Set(PKG_BROKEN.map((x) => x.part).filter((p) => p && OPTIONAL_PARTS.includes(p)))]
  die(`上游包的发布清单不自洽，照清单装上后会缺文件、加载失败：\n      ${PKG_BROKEN.map((x) => describeIssue(x.label, x.issue)).join('\n      ')}\n    这是上游打包的问题，安装包不替它补文件。${SRC.sha === VERIFIED.sha ? '' : `可以先用 --ref ${VERIFIED.sha.slice(0, 7)} 装安装包对照过的版本；`}${optional.length ? `加 --skip-part ${optional.join(',')} 先跳过${optional.length > 1 ? '这几个' : '这个'}可选零件（已装的那份保留原样）；` : ''}并告诉用户。`)
}
for (const x of PKG_ISSUES.filter((x) => x.issue.kind === 'peer')) info(`${describeIssue(x.label, x.issue)}；装完在新会话里确认它确实加载了，没加载再报给上游`)
if (!UPDATE && RENAMES.length) die(`这台电脑装的是旧包名（${RENAMES.map((r) => r.from).join('、')}），请用 --update 迁移。`)
const bodyKeep = ['kit/echo.config.json']

if (!UPDATE && installed) {
  const same = diffMaps(hashInstalled(BODY, bodyKeep), hashFiles(SRC.dir, packFiles(SRC.dir))).same
  if (!same && !(state0 && state0.upstream && SRC.sha && state0.upstream.sha === SRC.sha)) die(`这台电脑已经装过 dsh-agent-soul，而且和要装的版本不一样。要升级请用 --update；要按已装的版本补全，加 --ref <已装的提交>。`)
  ok('检测到已经装过同一版本：按「补全」处理，做过的步骤会跳过')
}

// 已装那一版的上游（同样做过称呼替换）：分清哪些是本机改过的，中枢三方比对也拿它当基准。
// 以前拿 profile 里的本体当「旧版上游」，本体自己被改过（例如手工改名、中枢跟着一起改）就认不出来，会把本机改动当成「没改过」换掉
let BASE = null
if (UPDATE && installed) {
  const oldSha = state0 && state0.upstream && state0.upstream.sha
  if (FIX_MODE && SOURCE && !SRC0.sha) BASE = SRC
  else if (oldSha && oldSha === SRC0.sha) BASE = SRC
  else if (opt('--base-source')) BASE = withNames(await getSource({ ref: oldSha || REF, source: opt('--base-source') }))
  else if (oldSha && /^[0-9a-f]{40}$/.test(oldSha) && !SOURCE) BASE = withNames(await getSource({ ref: oldSha, source: null, soft: true }))
  if (BASE) ok(`已装那一版的上游：${short(oldSha)}（${BASE === SRC ? '和要装的是同一版' : BASE.from}），用来分清哪些是本机改过的`)
  else warn(`取不到已装那一版的上游源码（${!oldSha ? '安装记录里没有提交号' : SOURCE ? '离线更新没给 --base-source' : '下载失败'}）：中枢脚本是不是本机改过，只能按 profile 里的本体判断；本体自己也被改过的话认不出来，会当成没改过换掉`)
}
// 「和新版不一样」拆成上游改的、本机改过的：有已装那一版的上游才拆得开
const baseMap = (...rel) => { if (!BASE) return null; const d = path.join(BASE.dir, ...rel); return exists(path.join(d, 'package.json')) ? hashFiles(d, packFiles(d)) : new Map() }
function splitDiff(d, base) {
  if (!d || !base) return null
  const up = { changed: [], added: [], removed: [] }, local = [], extra = [], missing = [], both = []
  for (const f of d.changed) {
    if (base.get(f) === d.next.get(f)) local.push(f) // 上游这一版没动它 → 是本机改的
    else { up.changed.push(f); if (base.has(f) && d.inst.get(f) !== base.get(f)) both.push(f) }
  }
  for (const f of d.removed) (base.has(f) ? up.removed : extra).push(f) // 旧版上游也没有 → 本机多出来的
  for (const f of d.added) (base.has(f) && base.get(f) === d.next.get(f) ? missing : up.added).push(f) // 旧版上游就有 → 本机删掉的
  return { up, local, extra, missing, both, localCount: local.length + extra.length + missing.length + both.length }
}

const SRC_PRESETS = presetSources(NM, { upstreamDir: SRC.dir })
// ═══ 修复清单 · preset：压缩摘要跟会话模型走（preset-summary-model）════════════════
// 作者砚青四套写死 summarizationProvider: deepseek-official（要 API key）。本机默认模型就走这条路由（有 key）时不用去掉；
// 作者哪天不写死了，判定为「作者已修」，照原样装
/** 仅读取最近会话的末尾，查无 key 错误；不输出会话正文。 */
function recentMissingApiKey() {
  if (!exists(SESSIONS)) return false
  const files = walk(SESSIONS).filter((file) => /session\.v\d+\.jsonl$/.test(file))
    .map((file) => ({ file: path.join(SESSIONS, file), time: fs.statSync(path.join(SESSIONS, file)).mtimeMs }))
    .sort((a, b) => b.time - a.time).slice(0, 8)
  for (const { file } of files) {
    const fd = fs.openSync(file, 'r')
    try {
      const size = fs.fstatSync(fd).size
      const buffer = Buffer.alloc(Math.min(size, 65536))
      fs.readSync(fd, buffer, 0, buffer.length, Math.max(0, size - buffer.length))
      if (hasMissingApiKey(buffer.toString('utf8'))) return true
    } finally { fs.closeSync(fd) }
  }
  return false
}
let SUMMARY_MODEL = 'author'
{
  const det = detectSummaryRoute(PRESET_CHOICE.map((id) => SRC_PRESETS[PRESET_SOURCE[id]] && SRC_PRESETS[PRESET_SOURCE[id]].text))
  const prov = defaultProvider(exists(cfgPath) ? readText(cfgPath) : '')
  const skipped = FIX_SKIP.includes('preset-summary-model')
  const missingKey = prov === 'deepseek-official' && recentMissingApiKey()
  const status = !fixSelected('preset-summary-model') ? 'frozen' : skipped ? 'skipped' : prov === 'deepseek-official' && !missingKey ? 'n/a' : det === 'present' ? 'kit' : det === 'absent' ? 'author' : 'manual'
  if (status === 'kit') SUMMARY_MODEL = 'session'
  const instYml = path.join(NM, PRESET_PKG, 'cordis.patch.yml')
  const had = det === 'present' && exists(instYml) && /- id: preset-yanqing/.test(readText(instYml)) && !/^\s*summarizationProvider:\s*['"]?deepseek-official/m.test(readText(instYml))
  FIX_ROWS.push({ id: 'preset-summary-model', status, action: status === 'kit' ? (had ? 'keep' : 'apply') : had ? 'revert' : 'none', note: status === 'n/a' ? '本机默认模型走的就是 deepseek-official（有 API key）' : null })
}
// 旧会话用的别名：会话开头记着建会话时的 preset id（例如 2.10 以前的 standard-soul、cordis-soul），id 没了会话就打不开。
// 还有会话在用的旧 id、已装的 preset 里已经有的别名，都留一个和对应新 preset 一样的别名；会话读不了时按安装记录里的旧 id 全留
function sessionPresetCounts(dirs) {
  const counts = {}
  let unreadable = 0
  const zstdOk = typeof zlib.zstdDecompressSync === 'function'
  const walk = (d, depth) => {
    let ents = []
    try { ents = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const e of ents) {
      const full = path.join(d, e.name)
      if (e.isDirectory()) { if (depth < 4) walk(full, depth + 1); continue }
      if (!/^session\.v\d+\.jsonl(\.zstd)?$/.test(e.name)) continue
      if (full.endsWith('.zstd') && !zstdOk) { unreadable++; continue }
      try { const b = fs.readFileSync(full); const id = sessionPreset(full.endsWith('.zstd') ? zlib.zstdDecompressSync(b).toString('utf8') : b.toString('utf8')); if (id) counts[id] = (counts[id] || 0) + 1 } catch { unreadable++ }
    }
  }
  for (const d of dirs) if (exists(d)) walk(d, 0)
  return { counts, unreadable }
}
const PRESET_ALIASES = {}
let SESS = null // 会话在用的 preset id → 个数
{
  const cands = Object.entries(OLD_PRESET_IDS).filter(([o, n]) => !PRESET_IDS.includes(o) && PRESET_CHOICE.includes(n))
  if (cands.length) {
    const sess = SESS = sessionPresetCounts([SESSIONS, ...(RESTORE ? [path.join(RB.root, 'sessions')] : [])])
    let onDisk = []
    try { onDisk = Object.keys(presetSummary(readText(path.join(NM, PRESET_PKG, 'cordis.patch.yml')))) } catch { /* 还没装 */ }
    const recorded = [...((state0 && state0.presetIds) || []), ...((RESTORE && RB.state && RB.state.presetIds) || []), ...Object.keys((state0 && state0.presetAliases) || {})]
    for (const [o, n] of cands) if (sess.counts[o] || onDisk.includes(o) || (sess.unreadable && recorded.includes(o))) PRESET_ALIASES[o] = n
    const kept = Object.keys(PRESET_ALIASES)
    if (kept.length) ok(`旧会话用的 preset 别名：${kept.map((o) => `${OLD_PRESET_LABEL[o] || o}（${o}${sess.counts[o] ? `，${sess.counts[o]} 个会话在用` : ''}）→ 同「${PRESET_LABEL[PRESET_ALIASES[o]]}」`).join('；')}。以前用它们建的会话照常能打开，新会话别选`)
    if (sess.unreadable) warn(`有 ${sess.unreadable} 个会话文件读不了（node 不支持 zstd 或文件损坏），按安装记录里的旧 preset 全留了别名`)
  }
}
let BUNDLE
try { BUNDLE = buildPresetBundle(SRC_PRESETS, PRESET_CHOICE, { pkgName: PRESET_PKG, aliases: PRESET_ALIASES, summary: SUMMARY_MODEL }) } catch (e) { die('生成 Soul preset 失败：' + e.message + '。源 preset 的结构变了，要人工看一下，先停下告诉用户。') }
const AUTHOR_BUNDLE = buildPresetBundle(SRC_PRESETS, PRESET_CHOICE, { pkgName: PRESET_PKG, aliases: PRESET_ALIASES, summary: 'author' })
const LEGACY_BUNDLE = buildPresetBundle(SRC_PRESETS, PRESET_CHOICE, { pkgName: PRESET_PKG, aliases: PRESET_ALIASES, summary: 'session' })
const PRESET_PLANS = {}
for (const [file, target] of Object.entries(BUNDLE.files)) {
  const dest = path.join(NM, PRESET_PKG, file)
  const text = exists(dest) ? readText(dest) : null
  const plan = planManagedText({ upstream: AUTHOR_BUNDLE.files[file], target, installed: text, record: FIX_RECORDS.presets[file],
    freeze: FIX_MODE && !fixSelected('preset-summary-model'), legacy: [LEGACY_BUNDLE.files[file]] })
  PRESET_PLANS[file] = plan
  if (plan.target !== null) BUNDLE.files[file] = plan.target
  if (file === 'cordis.patch.yml') {
    const row = FIX_ROWS.find((r) => r.id === 'preset-summary-model')
    row.action = plan.action
    if (plan.action === 'local') row.note = 'preset 本机改过，保留；请确认后手动合并或还原已知原文'
  }
}
if (Object.values(PRESET_PLANS).some((plan) => plan.action === 'local')) {
  for (const file of Object.keys(BUNDLE.files)) {
    const installedFile = path.join(NM, PRESET_PKG, file)
    if (exists(installedFile)) BUNDLE.files[file] = readText(installedFile)
    delete PRESET_PLANS[file].record
  }
}
if (MIGRATE_PRESETS && (retiredBlocks || /^#.*PTC.*Flash/m.test(installedPresetText))) {
  const targetBundle = buildPresetBundle(SRC_PRESETS, PRESET_CHOICE, { pkgName: PRESET_PKG, aliases: PRESET_ALIASES, summary: SUMMARY_MODEL })
  const migrated = migratePresetBundle(installedPresetText, targetBundle.files['cordis.patch.yml'], [
    AUTHOR_BUNDLE.files['cordis.patch.yml'], LEGACY_BUNDLE.files['cordis.patch.yml'],
    FIX_RECORDS.presets['cordis.patch.yml']?.upstream, FIX_RECORDS.presets['cordis.patch.yml']?.applied
  ])
  BUNDLE.files = { ...targetBundle.files, 'cordis.patch.yml': migrated }
  // 正文可能包含本机定制；不能把定制内容记成作者原文，后续仍走三方核对。
  for (const file of Object.keys(PRESET_PLANS)) {
    delete PRESET_PLANS[file].record
    delete FIX_RECORDS.presets[file]
    if (BUNDLE.files[file] === targetBundle.files[file]) PRESET_PLANS[file].record = { upstream: AUTHOR_BUNDLE.files[file], applied: BUNDLE.files[file] }
  }
}
const parseYaml = yamlParser(PROF)
if (parseYaml && (MIGRATE_PRESETS || BUNDLE.files['cordis.patch.yml'] !== installedPresetText)) {
  try {
    const d = parseYaml(BUNDLE.files['cordis.patch.yml'])
    const ids = d[0].insert.map((r) => r.config.id)
    if (ids.join() !== [...PRESET_IDS.filter((x) => PRESET_CHOICE.includes(x)), ...Object.keys(BUNDLE.aliases)].join()) throw new Error('preset id 不对：' + ids.join())
    for (const r of d[0].insert) {
      const comp = r.config.plugins.find((p) => p.id === 'compaction')
      const names = comp && Array.isArray(comp.config) ? comp.config.map((x) => x.name) : []
      const srcText = SRC_PRESETS[PRESET_SOURCE[BUNDLE.aliases[r.config.id] || r.config.id]].text
      const needPruner = srcText.indexOf('dsh-compaction-tool-result-pruner') >= 0
      const needRegion = srcText.indexOf('command-compact-region') >= 0
      if (!PART_NAMES.compaction.some((name) => names.includes(name)) || (needPruner && !PART_NAMES.pruner.some((name) => names.includes(name))) || (needRegion && !PART_NAMES['compact-region'].some((name) => names.includes(name)))) throw new Error(r.config.id + ' 的 compaction 组没换成功')
    }
  } catch (e) { die(`生成的 Soul preset 校验没过：${e.message}`) }
}
ok('Soul preset 的源：' + PRESET_CHOICE.map((id) => PRESET_LABEL[id] + ' ← ' + SRC_PRESETS[PRESET_SOURCE[id]].from).join('；'))
const snapIds = PRESET_CHOICE.filter((id) => SRC_PRESETS[PRESET_SOURCE[id]].snapshot)
if (snapIds.length) warn('没找到 DSH 的 app.asar，这些 preset 按安装包里的快照生成，可能和本机 DSH 版本对不上：' + snapIds.map((id) => PRESET_LABEL[id]).join('、') + '；可以用 --app-asar 指定')
for (const n of BUNDLE.notes) warn('Soul preset 简介：' + n)

// 文件补丁（修复清单 file 阶段）：比对时先还原、装完后对照作者原文重算（planFile）
const FILE_FIXES = patchList(RUNTIME, Object.fromEntries(AP.map((p, i) => [p, PKGS[i]])), DSH_HOME)
const FIX_GROUPS = [] // 同一个文件上的修复归成一组：{ part, pkg, file, fixes }
for (const f of FILE_FIXES) {
  let g = FIX_GROUPS.find((x) => x.pkg === f.pkg && x.file === f.file)
  if (!g) FIX_GROUPS.push(g = { part: f.part, pkg: f.pkg, file: f.file, fixes: [] })
  g.fixes.push(f)
}
const PREVIOUS_KIT_IDS = new Set()
for (const group of FIX_GROUPS) {
  const installedFile = path.join(NM, group.pkg, group.file)
  if (!exists(installedFile)) continue
  const text = readText(installedFile)
  for (const fix of group.fixes) if (text.includes(fix.new) || fix.any.test(text)) PREVIOUS_KIT_IDS.add(fix.id)
}
/**
 * 文件补丁 + 配置两类修复：逐个文件对照作者原文算出应有的样子，apply 时写回。
 * @param fresh (pkg) => 这个零件这次会换成上游原样（干跑时还没换，按原样算）
 * @returns 每条修复的结论行
 */
function runFixes({ fresh, apply, record = apply }) {
  const rows = []
  for (const g of FIX_GROUPS) {
    const i = PKGS.indexOf(g.pkg)
    if (!PKGS_LIVE.includes(g.pkg)) { for (const f of g.fixes) rows.push({ id: f.id, status: 'not-installed', action: 'none' }); continue }
    const srcFile = path.join(partSrc(g.part), g.file), instFile = path.join(NM, g.pkg, g.file)
    if (!exists(srcFile)) { for (const f of g.fixes) rows.push({ id: f.id, status: 'manual', action: 'manual', note: `上游这一版没有 ${g.file}` }); continue }
    const upstream = readText(srcFile)
    if (!fresh(g.pkg) && exists(path.join(NM, g.pkg)) && !exists(instFile)) {
      for (const fix of g.fixes) rows.push({ id: fix.id, status: 'manual', action: 'local', note: `${g.pkg}/${g.file} 在本机缺失，未擅自补回` })
      continue
    }
    const installedText = fresh(g.pkg) ? upstream : exists(instFile) ? readText(instFile) : null
    const freeze = FIX_ONLY.length ? g.fixes.filter((f) => !FIX_ONLY.includes(f.id)).map((f) => f.id) : []
    const key = `${g.part}/${g.file}`
    const baseFile = BASE && path.join(BASE.dir, 'plugins', g.part, g.file)
    const baseUpstream = baseFile && exists(baseFile) ? readText(baseFile) : null
    const plan = planFile({ upstream, installed: installedText, fixes: g.fixes, skip: FIX_SKIP, freeze, record: FIX_RECORDS.files[key], baseUpstream })
    if (record && plan.state !== 'local' && !plan.rows.some((r) => r.status === 'manual')) {
      FIX_RECORDS.files[key] = { upstream, applied: plan.target }
    }
    const localNote = `${g.pkg}/${g.file} 本机手改过（既不是作者原文，也不是 kit 修复版），整个文件没动；要按清单修，请确认后合并改动或手动换回作者原文`
    for (const r of plan.rows) rows.push({ ...r, note: plan.state === 'local' ? localNote : r.status === 'author' && PREVIOUS_KIT_IDS.has(r.id) ? '改用作者修复' : null })
    if (apply && (plan.state === 'rewrite' || plan.state === 'missing')) {
      if (/\.(?:m?js|cjs)$/.test(g.file)) {
        const checked = spawnSync(process.execPath, ['--check', '--input-type=' + (g.file.endsWith('.cjs') ? 'commonjs' : 'module')], { input: plan.target, encoding: 'utf8' })
        if (checked.status !== 0) die(`${g.pkg}/${g.file} 修后语法检查失败`)
      } else if (/\.ya?ml$/.test(g.file) && parseYaml) {
        try { parseYaml(plan.target) } catch { die(`${g.pkg}/${g.file} 修后 YAML 校验失败`) }
      }
      write(instFile, plan.target, `${g.pkg}/${g.file}（修复）`)
    }
  }
  // mnemon-runtime：解析不出热记忆目录时清单里没有这一条，probe 保持上游默认
  for (const f of FIXES.filter((x) => x.phase === 'file' && !rows.some((r) => r.id === x.id))) {
    const live = AP.includes(f.part) && PKGS_LIVE.includes(PKGS[AP.indexOf(f.part)])
    rows.push({ id: f.id, status: live ? 'n/a' : 'not-installed', action: 'none', note: live && f.id === 'mnemon-runtime' ? '解析不出 mnemon 热记忆目录，保持上游默认' : null })
  }
  // 配置：换气配置的字符串布尔（huanqi-config-bool）
  const hq = AP.includes('huanqi') && PKGS_LIVE.includes(PKGS[AP.indexOf('huanqi')])
  const cfg = exists(cfgPath) ? readText(cfgPath) : ''
  const selected = fixSelected('huanqi-config-bool')
  let status = !hq ? 'not-installed' : !selected ? 'frozen' : FIX_SKIP.includes('huanqi-config-bool') ? 'skipped' : detectConfigBool(cfg) === 'present' ? 'kit' : 'clean'
  let action = 'keep'
  let target = cfg
  if (hq && selected && status === 'skipped') {
    const restored = revertConfigLines(cfg, FIX_RECORDS.config)
    target = restored.text
    action = restored.local ? 'local' : target !== cfg ? 'revert' : 'keep'
    if (record && !restored.local) FIX_RECORDS.config = []
  } else if (status === 'kit') {
    target = fixQuotedBooleans(cfg).text
    action = target === cfg ? 'keep' : 'apply'
    if (record) {
      const changes = changedLines(cfg, target)
      const keyOf = (line) => line.trim().split(':')[0]
      FIX_RECORDS.config = [...FIX_RECORDS.config.filter((old) => !changes.some((change) => keyOf(change.before) === keyOf(old.before))), ...changes]
    }
  }
  if (apply && target !== cfg) write(cfgPath, target, 'cordis.patch.yml（换气配置修复）')
  rows.push({ id: 'huanqi-config-bool', status, action })
  return rows
}
const FIX_CHANGE = ['apply', 'refresh', 'revert', 'reinstall']
// kit 迭代登记过的退役（kit-iteration.json）：报告里注明作者在哪个提交修好的
const FIX_RETIRED = ((readJson(path.join(KIT, 'kit-iteration.json')) || {}).fixes || {}).retired || {}
/** 修复报告：每条一行，问题在不在 / 由谁修 / 这次的动作 / 依据。 */
function showFixRows(rows) {
  const all = [...rows].sort((a, b) => FIX_IDS.indexOf(a.id) - FIX_IDS.indexOf(b.id))
  for (const r of all) {
    if (r.status === 'not-installed') continue
    const f = fixInfo(r.id), ret = r.status === 'author' && FIX_RETIRED[r.id]
    if (ret && !r.note) r.note = `kit 迭代已登记退役（作者在 ${ret.upstream ? ret.upstream.slice(0, 7) : '?'} 修好）`
    const line = `${r.id}（${f.title}）：${STATUS_TEXT[r.status] || r.status}${r.action && r.action !== 'none' ? ` → ${DRY && FIX_CHANGE.includes(r.action) ? '[干跑] 将' : ''}${ACTION_TEXT[r.action] || r.action}` : ''}${r.note ? `；${r.note}` : ''}；依据：${BASIS_TEXT[f.basis]}，${f.why}`
    if (r.status === 'manual' || r.action === 'local' || r.action === 'pending') warn(line)
    else if (FIX_CHANGE.includes(r.action)) info(line)
    else ok(line)
  }
  const n = (pred) => all.filter(pred).length
  info(`共 ${FIXES.length} 条：kit 修 ${n((r) => r.status === 'kit')}、作者已修 ${n((r) => r.status === 'author')}、没装 ${n((r) => r.status === 'not-installed')}、不需要 / 没有问题 ${n((r) => ['n/a', 'clean'].includes(r.status))}、跳过 ${n((r) => r.status === 'skipped')}${n((r) => r.status === 'manual') ? `、需人工核对 ${n((r) => r.status === 'manual')}` : ''}；这次要动的 ${n((r) => FIX_CHANGE.includes(r.action))} 条`)
}
// memory 的相对路径补丁打不打得上（打不上配置就得写绝对路径）：要装的那份源码、已装的那份都认得才算
function memRelativePredict() {
  const p = FILE_FIXES.find((x) => x.id === 'memory-home')
  if (!p) return false
  const ok = (f) => { const t = readText(f); return p.any.test(t) || t.includes(p.old) }
  const srcF = path.join(SRC.dir, 'plugins', 'memory', p.file), instF = path.join(NM, p.pkg, p.file)
  return exists(srcF) && ok(srcF) && (!exists(instF) || ok(instF))
}
// 零件和上游比：本机补丁过的文件先「还原」再比，免得把自己的补丁当成上游变化
//   同一个文件可能有好几处补丁（言替 index.js 两处、memory lib/index.js 两处）：读一次，逐处还原，最后才算哈希
//   还原先认完整的新写法（有的补丁 any 只认得新写法的开头），认不出再按 any 还原（旧写法、写死路径的那种）；实现在 lib/organ-patches.mjs 的 unpatchText
function partDiff(i) {
  const s = partSrc(AP[i]), dst = path.join(NM, INST[i])
  const oldM = hashInstalled(dst)
  const byFile = new Map()
  for (const p of FILE_FIXES) {
    if (p.pkg !== PKGS[i] || !oldM.has(p.file)) continue
    if (!byFile.has(p.file)) byFile.set(p.file, [])
    byFile.get(p.file).push(p)
  }
  for (const [f, list] of byFile) {
    const t = readText(path.join(dst, f)), u = unpatchText(t, list)
    if (u !== t) oldM.set(f, sha1(Buffer.from(u, 'utf8')))
  }
  const newM = hashFiles(s, packFiles(s))
  return { ...diffMaps(oldM, newM), inst: oldM, next: newM }
}
const PART_DIFF = AP.map((p, i) => (INST[i] ? partDiff(i) : null))
// 3.0 及以前从零件仓 organs 装的（换气、compact-region）：已装那一版的主仓里没有对应原文，分不清哪些是本机改的，
// 这次换成主仓那份是换源，不算「本机改过」
const ORGANS_BEFORE = Boolean(state0 && state0.organs)
const LOCAL_PARTS = new Set()
for (const g of FIX_GROUPS) {
  const index = AP.indexOf(g.part)
  if (index < 0 || !INST[index] || (ORGANS_BEFORE && ['huanqi', 'compact-region'].includes(g.part))) continue
  const local = path.join(NM, INST[index], g.file)
  const author = path.join(partSrc(g.part), g.file)
  if (!exists(local) || !exists(author)) {
    LOCAL_PARTS.add(g.part)
    continue
  }
  const base = BASE && path.join(BASE.dir, 'plugins', g.part, g.file)
  const plan = planFile({ upstream: readText(author), installed: readText(local), fixes: g.fixes,
    record: FIX_RECORDS.files[`${g.part}/${g.file}`], baseUpstream: base && exists(base) ? readText(base) : null })
  if (plan.state === 'local' || plan.rows.some((row) => row.status === 'manual')) LOCAL_PARTS.add(g.part)
}

// 中枢脚本三方比对：中枢里的 = 旧版上游（本体 kit/echo 里那份）→ 没被本机改过，换新；不一样 → 本机改过，不动
const HUB_FULL = exists(path.join(HUB, 'memq.mjs'))
const OLD_KIT = path.join(BASE ? BASE.dir : BODY, 'kit', 'echo'), NEW_KIT = path.join(SRC.dir, 'kit', 'echo')
const fh = (f) => (exists(f) ? sha1(fs.readFileSync(f)) : null)
const HUB_PLAN = !installed ? [] : fs.readdirSync(NEW_KIT).filter((f) => /\.(mjs|json)$/.test(f) && !HUB_EXCLUDE.includes(f) && !KIT_SET.includes(f)).map((f) => {
  const h = fh(path.join(HUB, f)), nw = fh(path.join(NEW_KIT, f)), od = fh(path.join(OLD_KIT, f))
  const action = !h ? (HUB_FULL ? 'add' : null) : h === nw ? 'same' : h === od ? 'update' : 'local'
  return { f, action }
}).filter((x) => x.action)
const hubOf = (a) => HUB_PLAN.filter((x) => x.action === a).map((x) => x.f)
const bodyDiff = installed ? (() => { const inst = hashInstalled(BODY, bodyKeep), next = hashFiles(SRC.dir, packFiles(SRC.dir)); return { ...diffMaps(inst, next), inst, next } })() : null
const BODY_SPLIT = splitDiff(bodyDiff, baseMap())
const PART_SPLIT = AP.map((p, i) => (ORGANS_BEFORE && ['huanqi', 'compact-region'].includes(p) ? null : splitDiff(PART_DIFF[i], baseMap('plugins', p))))
// 本机手工改过称呼、安装记录里却没记：提醒加 --rename，别默默换回去
const TEXT_FILE = /\.(?:m?js|cjs|ts|md|json|ya?ml|txt)$/i
let NAME_GUESS = null
if (!hasNames(NAME_MAP)) {
  const pairs = []
  if (UPDATE && installed) for (const f of bodyDiff.changed.filter((x) => TEXT_FILE.test(x))) pairs.push({ local: readText(path.join(BODY, f)), raw: readText(path.join(SRC.dir, f)) })
  if (RESTORE) {
    const hubDir = path.join(RB.root, 'memory', 'hub'), kitDir = path.join(SRC.dir, 'kit', 'echo')
    if (exists(hubDir)) for (const f of fs.readdirSync(hubDir).filter((x) => x.endsWith('.mjs') && exists(path.join(kitDir, x)))) pairs.push({ local: readText(path.join(hubDir, f)), raw: readText(path.join(kitDir, f)) })
  }
  const users = [state0 && state0.setup && state0.setup.user, RB && RB.state && RB.state.setup && RB.state.setup.user, SETUP_INFO && SETUP_INFO.user, SETUP && SETUP.user]
  NAME_GUESS = pairs.length ? guessNameMap(pairs, users) : null
  if (NAME_GUESS) {
    const flagTxt = `--rename ${NAME_GUESS.from}=${NAME_GUESS.to}`
    warn(RESTORE
      ? `备份里的中枢脚本把上游作者的称呼「${NAME_GUESS.from}」换成了「${NAME_GUESS.to}」（${NAME_GUESS.count} 个文件），备份的安装记录里却没记：照现在恢复，本体和零件里会是上游原文「${NAME_GUESS.from}」。要一致就加 ${flagTxt} 重跑，会记进安装记录`
      : `本机代码看起来手工把上游作者的称呼「${NAME_GUESS.from}」换成了「${NAME_GUESS.to}」（本体里认出 ${NAME_GUESS.count} 个文件），安装记录里却没记。不加 --rename，本体和零件会换回上游原文「${NAME_GUESS.from}」${BASE ? '（中枢脚本按本机改过保留）' : ''}。要保留就加 ${flagTxt} 重跑，会记进安装记录，以后自动保留`)
  }
}

// ═══ 更新：变化报告 ═══════════════════════════════════════════════════
const presetDir = path.join(NM, PRESET_PKG)
const presetChanged = Object.entries(BUNDLE.files).some(([f, t]) => !exists(path.join(presetDir, f)) || readText(path.join(presetDir, f)) !== t)
if (UPDATE && !FIX_MODE) {
  step('上游改了什么')
  const oldSha = state0 && state0.upstream ? state0.upstream.sha : null
  if (oldSha && SRC.sha && oldSha !== SRC.sha) {
    const tmpJson = path.join(os.tmpdir(), `dsh-soul-compare-${TS}.json`)
    TMP_DIRS.push(tmpJson)
    const d = await download(`https://api.github.com/repos/${REPO}/compare/${oldSha}...${SRC.sha}`, tmpJson)
    const cmp = d.ok ? readJson(tmpJson) : null
    const gl = !cmp && exists(path.join(SRC0.dir, '.git')) ? spawnSync('git', ['-C', SRC0.dir, 'log', '--reverse', '--format=%h %s', `${oldSha}..${SRC.sha}`], { encoding: 'utf8', windowsHide: true }) : null
    if (cmp && Array.isArray(cmp.commits)) {
      out(`  ${short(oldSha)} → ${short(SRC.sha)}，共 ${cmp.commits.length} 个提交：`)
      for (const c of cmp.commits.slice(-40)) info(`${c.sha.slice(0, 7)} ${String(c.commit.message).split('\n')[0]}`)
    } else if (gl && gl.status === 0 && gl.stdout.trim()) {
      const ls = gl.stdout.trim().split('\n')
      out(`  ${short(oldSha)} → ${short(SRC.sha)}，共 ${ls.length} 个提交：`)
      for (const l of ls.slice(-40)) info(l)
    } else info('（取不到提交列表，下面按文件比对）')
  }
  const readme = exists(path.join(SRC0.dir, 'README.md')) ? readText(path.join(SRC0.dir, 'README.md')) : ''
  const sec = readme.split(/\n## /).find((s) => s.startsWith('更新记录'))
  const heads = sec ? sec.split('\n').filter((l) => l.startsWith('### ')) : []
  if (heads.length) {
    // 更新记录是上游作者的开发日志（新的在前），有的写的是作者本机或别的仓库的东西；这次实际换什么，以下面的文件变化为准
    out(`  上游 README「更新记录」最近 ${Math.min(heads.length, 8)} 条（共 ${heads.length} 条；这是上游的开发日志，不全是这次会装上的东西，实际换什么看下面的文件变化）：`)
    for (const h of heads.slice(0, 8)) info(h.slice(4))
  }

  const list = (d) => [...d.changed.map((f) => '改 ' + f), ...d.added.map((f) => '增 ' + f), ...d.removed.map((f) => '删 ' + f)]
  // 有已装那一版的上游时，分开报「上游改的」和「本机改过、这次需要核对的」，不再把本机改动算成上游改动
  const showDiff = (label, d, sp, max) => {
    if (d.same) { out(`  ${label}：没有变化`); return }
    if (!sp) {
      out(`  ${label}：${list(d).length} 处变化（取不到已装那一版的上游，分不清哪些是本机改的）`)
      for (const l of list(d).slice(0, max)) info(l)
      if (list(d).length > max) info(`……另有 ${list(d).length - max} 项`)
      return
    }
    const n = list(sp.up).length
    out(`  ${label}：${n ? `上游 ${sp.up.changed.length} 改 / ${sp.up.added.length} 增 / ${sp.up.removed.length} 删` : '上游没有变化'}${sp.localCount ? `；本机改过的 ${sp.localCount} 处需要核对` : ''}`)
    for (const l of list(sp.up).slice(0, max)) info(l)
    if (n > max) info(`……另有 ${n - max} 项`)
    for (const f of sp.local.slice(0, max)) info(`本机改过（上游这版没动）→ 核对后合并：${f}`)
    if (sp.local.length > max) info(`……另有 ${sp.local.length - max} 个本机改过的`)
    for (const f of sp.both) info(`上游改了、本机也改过 → 用上游新版：${f}`)
    for (const f of sp.extra) info(`本机多出来的文件 → 删掉：${f}`)
    for (const f of sp.missing) info(`本机删掉的 → 补回来：${f}`)
  }
  if (state0 && !sameNameMap(state0.nameMap, NAME_MAP)) out(`  称呼替换：${nameMapLabel(state0.nameMap) || '不换'} → ${nameMapLabel(NAME_MAP) || '不换'}（下面「本机改过」里换称呼的那些，就是这个原因）`)
  showDiff('本体', bodyDiff, BODY_SPLIT, 40)
  for (let i = 0; i < AP.length; i++) {
    const d = PART_DIFF[i]
    if (!d) { out(`  零件 ${PKGS[i]}：${!TO_ADD.has(AP[i]) ? '本机没装，跳过' : MUST_HAVE(AP[i]) ? '本机没有，会装上（必装零件，或者 Soul preset 要调用它，不能跳过）' : `本机没有，安装包新加的零件，会装上；不要就加 --skip-part ${AP[i]}（会记下来，以后更新不再补）`}`); continue }
    const rn = RENAMES.find((r) => r.part === AP[i])
    showDiff(`零件 ${PKGS[i]}${rn ? `（改名，本机是 ${rn.from}）` : ''}${ORGANS_BEFORE && ['huanqi', 'compact-region'].includes(AP[i]) ? '（以前从零件仓 organs 装的，这次换成主仓那份）' : ''}`, d, PART_SPLIT[i], 15)
  }
  const localTotal = [BODY_SPLIT, ...PART_SPLIT].reduce((n, x) => n + (x ? x.localCount : 0), 0)
  if (localTotal) warn(`本体和零件里有 ${localTotal} 处本机改动，这次需要核对（明细见「上游改了什么」）${NAME_GUESS ? '；改称呼的那部分可以用 --rename 保留' : ''}。要保留别的改动，先停下`)
  for (const r of RENAMES) out(`  零件改名 ${r.from} → ${r.to}：会迁移（装新目录、删旧目录、bundles / dependencies / 锁文件同步换名）`)
  for (const f of KIT_SET) {
    const a = path.join(HUB, f), b = path.join(SRC.dir, 'kit', 'echo', f)
    if (exists(b)) info(`中枢 ${f}：${exists(a) && sha1(fs.readFileSync(a)) === sha1(fs.readFileSync(b)) ? '和上游一致' : '会换成上游新版'}`)
  }
  if (hubOf('update').length) info(`中枢里没被本机改过、会换成新版：${hubOf('update').join('、')}`)
  if (hubOf('add').length) info(`中枢里会新增：${hubOf('add').join('、')}`)
  if (hubOf('local').length) info(`中枢里这些本机改过，不动（和上游新版不同，需要的话人工对照）：${hubOf('local').join('、')}`)
  if (presetChanged) {
    const oldText = exists(path.join(presetDir, 'cordis.patch.yml')) ? readText(path.join(presetDir, 'cordis.patch.yml')) : ''
    const so = presetSummary(oldText), sn = presetSummary(BUNDLE.files['cordis.patch.yml'])
    out('  Soul preset：会重新生成')
    // 按块比：只是多了别名、或者文件头注释变了的，不把别的 preset 说成「有变化」
    const blocks = (t) => Object.fromEntries(String(t).replace(/\r\n/g, '\n').split(/\n(?= {4}- id: preset-)/).map((b) => [(b.match(/^ {8}id: ([\w-]+)$/m) || [])[1], b.replace(/\s+$/, '')]).filter(([k]) => k))
    const ob = blocks(oldText), nb = blocks(BUNDLE.files['cordis.patch.yml'])
    // 2.16 起压缩段按作者算法展开、保留段内注释：只差注释的别报成「参数或提示词有变化」
    const noComments = (b) => b.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')
    // 2.17 起默认去掉压缩摘要那两行（--summary-model）：只差这两行的单独说清楚
    const ROUTE_RE = /^\s*summarization(?:Provider|Model):/m
    const noRoute = (b) => noComments(b).split('\n').filter((l) => !ROUTE_RE.test(l)).join('\n')
    for (const id of [...PRESET_CHOICE, ...Object.keys(BUNDLE.aliases)]) {
      const a = so[id] || [], b = sn[id] || []
      const add = b.filter((x) => !a.includes(x)), rem = a.filter((x) => !b.includes(x))
      const tag = BUNDLE.aliases[id] ? `（旧会话别名，同 ${BUNDLE.aliases[id]}${SESS && SESS.counts[id] ? `，${SESS.counts[id]} 个会话在用` : ''}）` : ''
      info(`${id}${tag}：${!ob[id] ? '新建' : ob[id] === nb[id] ? '没变' : add.length || rem.length ? `插件 +${add.join(',') || '无'} / -${rem.join(',') || '无'}` : noComments(ob[id]) === noComments(nb[id]) ? '只有注释不同' : noRoute(ob[id]) === noRoute(nb[id]) ? (ROUTE_RE.test(nb[id]) ? '压缩摘要模型加回作者写死的 deepseek-official / deepseek-flash' : '去掉作者写死的压缩摘要模型，改成跟会话模型走') : '插件没变，参数或提示词有变化'}`)
    }
    for (const id of Object.keys(ob).filter((x) => !nb[x])) {
      const n = SESS && SESS.counts[id]
      if (n) warn(`Soul preset ${id} 会被去掉，但还有 ${n} 个会话是用它建的，去掉后这些会话打不开。先停下`)
      else info(`${id}：去掉（没有会话在用）`)
    }
    const body = (t) => t.split('\n').filter((l) => !l.startsWith('#')).join('\n')
    if (body(oldText) === body(BUNDLE.files['cordis.patch.yml'])) info('（preset 正文完全一样，只有文件开头的注释变了）')
  } else out('  Soul preset：和源一致，不用重新生成')
  const cfgPlan = planCordis(readText(cfgPath), { hub: HUB, defaultPreset: DEFAULT_PRESET, dshHome: DSH_HOME, memRelative: memRelativePredict() })
  const pkgPlan = planPackageJson(readText(pkgPath), PKGS_LIVE, RENAME_MAP)
  const hubStale = KIT_SET.some((f) => exists(path.join(SRC.dir, 'kit', 'echo', f)) && (!exists(path.join(HUB, f)) || sha1(fs.readFileSync(path.join(HUB, f))) !== sha1(fs.readFileSync(path.join(SRC.dir, 'kit', 'echo', f)))))
  // 修复清单：零件不换的，按本机现在的文件预算一遍；有要动的就不算「已经是最新」
  const fixPreview = runFixes({ fresh: (pkg) => { const i = PKGS.indexOf(pkg); return !INST[i] || INST[i] !== PKGS[i] || Boolean(PART_DIFF[i] && !PART_DIFF[i].same) }, apply: false })
  const fixPending = [...FIX_ROWS, ...fixPreview].some((r) => FIX_CHANGE.includes(r.action))
  const skipMoved = JSON.stringify([...((state0 && state0.fixSkip) || [])].sort()) !== JSON.stringify([...FIX_SKIP].sort())
  if (state0 && bodyDiff.same && PART_DIFF.every((d) => !d || d.same) && !RENAMES.length && !TO_ADD.size && !hubOf('update').length && !hubOf('add').length && !hubStale && !fixPending && !presetChanged && !presetMigrationPending && !cfgPlan.changed && !pkgPlan.changed) {
    out('\n已经是最新，什么都不用改。')
    out(`  修复清单：没有要动的（kit 修 ${[...FIX_ROWS, ...fixPreview].filter((r) => r.status === 'kit').length} 条，都已经在）`)
    const newDecl = OPTIONAL_PARTS.filter((p) => SKIP_PARTS.includes(p) && !isInstalledPart(p) && !DECLINED0.includes(p))
    const shaMoved = state0.upstream && SRC.sha && state0.upstream.sha !== SRC.sha
    const namesMoved = !sameNameMap(state0.nameMap, NAME_MAP)
    if (namesMoved) out(`称呼替换记成：${nameMapLabel(NAME_MAP) || '不换'}${DRY ? '（干跑，不写）' : ''}`)
    if (skipMoved) out(`修复清单的跳过设置记成：${FIX_SKIP.join('、') || '无'}${DRY ? '（干跑，不写）' : ''}`)
    if (!DRY && (shaMoved || newDecl.length || namesMoved || skipMoved)) {
      if (namesMoved) state0.nameMap = NAME_MAP
      if (skipMoved) state0.fixSkip = FIX_SKIP
      if (shaMoved) state0.upstream.sha = SRC.sha
      if (newDecl.length) { state0.declined = [...DECLINED0, ...newDecl]; out(`记下了：${newDecl.join('、')} 不装，以后更新不再补。`) }
      fs.writeFileSync(STATE_PATH, JSON.stringify(state0, null, 2), 'utf8')
    }
    process.exit(0)
  }
}

// ═══ --fix：先看有没有要修的 ═══════════════════════════════════════════
if (FIX_MODE) {
  step('修复检查（对照已装那一版的作者原文）')
  const preview = [...FIX_ROWS, ...runFixes({ fresh: () => false, apply: false })]
  const skipMoved = JSON.stringify([...(state0?.fixSkip || [])].sort()) !== JSON.stringify([...FIX_SKIP].sort())
  if (!preview.some((r) => FIX_CHANGE.includes(r.action)) && !presetChanged && !presetMigrationPending) {
    showFixRows(preview)
    out('\n没有要修的。')
    if (skipMoved) {
      out(`修复清单的跳过设置记成：${FIX_SKIP.join('、') || '无'}${DRY ? '（干跑，不写）' : ''}`)
    }
    if (!DRY) {
      runFixes({ fresh: () => false, apply: false, record: true })
      for (const [file, plan] of Object.entries(PRESET_PLANS)) if (plan.record) FIX_RECORDS.presets[file] = plan.record
      const nextState = { ...(state0 || {}), kitVersion: KIT_VERSION, fixRecords: FIX_RECORDS, fixSkip: FIX_SKIP,
        fixes: Object.fromEntries(preview.map((row) => [row.id, { ...row, kitVersion: KIT_VERSION, upstream: SRC.sha }])) }
      const nextText = JSON.stringify(nextState, null, 2)
      if (!exists(STATE_PATH) || readText(STATE_PATH) !== nextText) {
        FIX_TRANSACTION = beginFixTransaction(path.join(SOUL_ROOT, '_backup', `${TS}-fix-state-${crypto.randomBytes(3).toString('hex')}`), [STATE_PATH])
        fs.writeFileSync(STATE_PATH, nextText, 'utf8')
        FIX_TRANSACTION.commit()
      }
    }
    process.exit(0)
  }
  info(`有要修的，明细见下面「修复」一步${DRY ? '（干跑：只报计划）' : ''}`)

}

// ═══ 备份 ═══════════════════════════════════════════════════════════════
const BK = path.join(SOUL_ROOT, '_backup', `${TS}-${FIX_MODE ? 'fix' : UPDATE ? 'update' : 'install'}-${crypto.randomBytes(3).toString('hex')}`)
const LOCKS = { 'pnpm-lock.yaml': path.join(PROF, 'pnpm-lock.yaml'), 'pnpm-current-lock.yaml': path.join(NM, '.pnpm', 'lock.yaml'), 'modules.yaml': path.join(NM, '.modules.yaml') }
if (!DRY) {
  FIX_TRANSACTION = beginFixTransaction(path.join(BK, 'transaction'), [
    pkgPath, cfgPath, STATE_PATH, ...Object.values(LOCKS), ...PRESET_SESSION_PLANS.map((plan) => plan.file),
    ...new Set(['dsh-agent-soul', ...PKGS, ...INST.filter(Boolean), PRESET_PKG].map((name) => path.join(NM, name)))
  ])
}
step(`备份`)
if (!exists(cfgPath)) { write(cfgPath, '', 'cordis.patch.yml（原本没有，新建空文件）'); ok('cordis.patch.yml 原本不存在，已新建') }
if (!DRY) TOUCHED = true
const b1 = backup(pkgPath, UPDATE ? 'pre-soul-update' : 'pre-soul-kit')
const b2 = backup(cfgPath, UPDATE ? 'pre-soul-update' : 'pre-soul-kit')
if (DRY) info('[干跑] 将备份 package.json 和 cordis.patch.yml' + (UPDATE ? '，以及本体、零件、Soul preset、要换的中枢脚本、锁文件的整份拷贝' : ''))
else {
  ok(`package.json → ${path.basename(b1)}`); if (b2) ok(`cordis.patch.yml → ${path.basename(b2)}`)
  if (UPDATE) {
    for (const n of new Set(['dsh-agent-soul', ...PKGS, ...INST.filter(Boolean), PRESET_PKG])) { const s = path.join(NM, n); if (exists(s)) fs.cpSync(s, path.join(BK, 'node_modules', n), { recursive: true, preserveTimestamps: true }) }
    for (const f of [...KIT_SET, '.kit-origin.json', ...hubOf('update')]) { const s = path.join(HUB, f); if (exists(s)) { fs.mkdirSync(path.join(BK, 'hub'), { recursive: true }); fs.copyFileSync(s, path.join(BK, 'hub', f)) } }
    for (const [k, f] of Object.entries(LOCKS)) if (exists(f)) { fs.mkdirSync(path.join(BK, 'locks'), { recursive: true }); fs.copyFileSync(f, path.join(BK, 'locks', k)) }
    fs.copyFileSync(b1, path.join(BK, 'package.json')); if (b2) fs.copyFileSync(b2, path.join(BK, 'cordis.patch.yml'))
    fs.writeFileSync(path.join(BK, '还原方法.txt'), [
      '先完全退出 DSH，再按下面做：',
      `1. 把这里的 package.json、cordis.patch.yml 拷回 ${PROF}`,
      `2. 把这里 node_modules/ 下的每个文件夹整个替换回 ${NM} 下的同名文件夹`,
      ...(RENAMES.length ? [`   （这次有改名：${RENAMES.map((r) => `${r.from} → ${r.to}`).join('；')}。还原时把 ${NM} 下的新名字文件夹删掉）`] : []),
      ...(TO_ADD.size ? [`   （这次新装了：${[...TO_ADD].map((p) => src.names[p]).join('、')}。不要的话把它们的文件夹删掉）`] : []),
      `3. 把这里 hub/ 下的文件拷回 ${HUB}${hubOf('add').length ? `；这次新增的 ${hubOf('add').join('、')} 可以删掉` : ''}`,
      `4. 把这里 locks/ 下的文件拷回：pnpm-lock.yaml → ${PROF}；pnpm-current-lock.yaml → ${path.join(NM, '.pnpm', 'lock.yaml')}；modules.yaml → ${path.join(NM, '.modules.yaml')}`,
      `5. 安装记录 ${STATE_PATH} 里 upstream.sha 改回旧值（或删掉这个文件）`,
    ].join('\n'), 'utf8')
    ok(`本体、零件、Soul preset、中枢脚本、锁文件 → ${posix(BK)}（附还原方法.txt）`)
  }
}

// ═══ 本体 + 零件 ═════════════════════════════════════════════════════════
step(FIX_MODE ? '零件（--fix 不重装零件）' : UPDATE ? '换上新版本体和零件' : '本体和零件拷进 node_modules')
if (FIX_MODE) ok('dsh-agent-soul（本体）：--fix 不动本体')
else if (bodyDiff && bodyDiff.same) ok('dsh-agent-soul（本体）：和上游一致，跳过')
else installPackage(SRC.dir, BODY, 'dsh-agent-soul（本体）', bodyKeep)
const partsDone = []
const replaced = new Set()
for (let i = 0; i < AP.length; i++) {
  const s = partSrc(AP[i]), dst = path.join(NM, PKGS[i])
  if (FIX_MODE) { if (INST[i]) partsDone.push(INST[i]); continue }
  if (UPDATE) {
    if (!INST[i]) {
      if (!TO_ADD.has(AP[i])) { info(`${PKGS[i]}：本机没装，跳过`); continue }
      partsDone.push(PKGS[i]); replaced.add(PKGS[i])
      installPackage(s, dst, `${PKGS[i]}（新装）`)
      continue
    }
    partsDone.push(PKGS[i])
    if (INST[i] !== PKGS[i]) {
      replaced.add(PKGS[i])
      installPackage(s, dst, `${PKGS[i]}（由 ${INST[i]} 改名）`)
      if (DRY) info(`[干跑] 将删掉旧目录 node_modules/${INST[i]}`)
      else { fs.rmSync(path.join(NM, INST[i]), { recursive: true, force: true }); ok(`旧目录 node_modules/${INST[i]} 已删（备份里有）`) }
      continue
    }
    if (LOCAL_PARTS.has(AP[i])) {
      warn(`${PKGS[i]}：本机改过或问题判断不了，保留整包；请核对后合并，未自动覆盖`)
      continue
    }
    if (PART_DIFF[i].same) { ok(`${PKGS[i]}：没有变化`); continue }
    replaced.add(PKGS[i])
    installPackage(s, dst, PKGS[i])
  } else {
    partsDone.push(PKGS[i])
    if (exists(dst)) { ok(`${PKGS[i]}：已存在，保留（修复在下一步核对）`); continue }
    installPackage(s, dst, PKGS[i])
  }
}

// ═══ 修复（kit 修复清单，lib/fixes.mjs）══════════════════════════════════════
step(FIX_MODE ? '修复（对照已装那一版的作者原文）' : '修复（kit 修复清单：问题还在才修，作者修好了就换回作者原文）')
FIX_ROWS.push(...runFixes({ fresh: (pkg) => DRY && (replaced.has(pkg) || !exists(path.join(NM, pkg))), apply: true }))
showFixRows(FIX_ROWS)

// ═══ 更新：中枢脚本 ═══════════════════════════════════════════════════════
if (UPDATE && !FIX_MODE) {
  step('中枢脚本和配置副本')
  const r = runNode(path.join(BODY, 'kit', 'echo', 'install-kit.mjs'), ['--hub', HUB], `install-kit（只换 ${KIT_SET.join('、')}）`)
  if (!r.ok) die('install-kit 失败：\n' + r.out)
  if (!DRY) ok(`install-kit：${KIT_SET.join('、')} 已和上游一致，.kit-origin.json 已更新`)
  const sync = HUB_PLAN.filter((x) => x.action === 'update' || x.action === 'add')
  for (const x of sync) write(path.join(HUB, x.f), fs.readFileSync(path.join(NEW_KIT, x.f), 'utf8'), `中枢 ${x.f}`)
  if (sync.length && !DRY) ok(`中枢：换新 ${hubOf('update').length} 个、新增 ${hubOf('add').length} 个（${sync.map((x) => x.f).join('、')}）`)
  if (hubOf('local').length) info(`中枢里本机改过的没动：${hubOf('local').join('、')}`)
  if (sync.some((x) => /^(memindex|memq|framestore)\.mjs$/.test(x.f))) {
    const r2 = runNode(path.join(HUB, 'memindex.mjs'), ['build'], 'memindex build（检索脚本换了，按新格式重建索引）')
    if (!DRY) { if (r2.ok) ok('memindex build：索引已按新版重建'); else warn(`memindex build 没成功，下次心跳会再建；也可以让 ${AGENT} 跑 node memindex.mjs build：\n` + r2.out.split('\n').slice(-5).join('\n')) }
  }
  const master = path.join(HUB, 'echo.config.json')
  if (exists(master)) { write(path.join(BODY, 'kit', 'echo.config.json'), readText(master), 'kit/echo.config.json（副本，照主配置）'); if (!DRY) ok('kit/echo.config.json：照主配置重写') }
  else warn(`主配置 ${posix(master)} 不在，kit 里的副本保留原样`)
}

// ═══ Soul preset ═════════════════════════════════════════════════════════
step(`Soul preset（${PRESET_CHOICE.map((x) => PRESET_LABEL[x]).join(' / ')}）`)
if (!presetChanged) ok(`${PRESET_PKG}：和源一致，跳过`)
else if (DRY) info(`[干跑] 将生成 node_modules/${PRESET_PKG}（${PRESET_CHOICE.length} 个 preset）`)
else {
  fs.mkdirSync(presetDir, { recursive: true })
  for (const [f, t] of Object.entries(BUNDLE.files)) fs.writeFileSync(path.join(presetDir, f), t, 'utf8')
  ok(`${PRESET_PKG}：已生成（${PRESET_CHOICE.join('、')}${Object.keys(BUNDLE.aliases).length ? `；旧会话别名 ${Object.entries(BUNDLE.aliases).map(([o, n]) => `${o} → ${n}`).join('、')}` : ''}）`)
}

// ═══ 恢复：放回备份里的数据 ═══════════════════════════════════════════
if (RESTORE) {
  step('放回备份里的数据')
  const from = RB.man.paths || {}
  const to = { dshHome: posix(DSH_HOME), soul: posix(SOUL), memory: posix(MEM), hub: posix(HUB), sessions: posix(SESSIONS), runtime: RX }
  const pairs = pathPairs(from, to)
  if (RB.conflict) {
    const keep = path.join(SOUL_ROOT, '_backup', `${TS}-pre-restore`)
    if (DRY) info(`[干跑] 将把本机原有的书房、记忆中枢整份备份到 ${posix(keep)}`)
    else { for (const [d, n] of [[SOUL, 'soul'], [MEM, 'memory']]) if (exists(d)) fs.cpSync(d, path.join(keep, n), { recursive: true, preserveTimestamps: true }); ok(`本机原有的书房、记忆中枢 → ${posix(keep)}`) }
  }
  const copyTree = (srcDir, dstDir, label, { overwrite = true, rewrite } = {}) => {
    if (!exists(srcDir)) return { n: 0, skipped: 0 }
    const t = walkAll(srcDir)
    if (DRY) { info(`[干跑] 将放回${label} ${t.files.length} 个文件 → ${posix(dstDir)}`); return { n: t.files.length, skipped: 0 } }
    let n = 0, skipped = 0
    fs.mkdirSync(dstDir, { recursive: true })
    for (const d of t.dirs) fs.mkdirSync(path.join(dstDir, ...d.split('/')), { recursive: true })
    for (const f of t.files) {
      const dst = path.join(dstDir, ...f.split('/')), srcF = path.join(srcDir, ...f.split('/'))
      if (!overwrite && exists(dst)) { skipped++; continue }
      if (rewrite && rewrite(f)) fs.writeFileSync(dst, rewritePaths(readText(srcF), pairs), 'utf8')
      else fs.copyFileSync(srcF, dst)
      try { const st = fs.statSync(srcF); fs.utimesSync(dst, st.atime, st.mtime) } catch {}
      n++
    }
    return { n, skipped }
  }
  // 记忆中枢里写着绝对路径的几个文件，路径换成本机的（账本只追加，不改）
  const REWRITE = (f) => /^hub\/(SELF\.src\.md|SELF\.md|state\.json|echo\.config\.json|heartbeat\.sh|[^/]+\.plist)$/.test(f)
  const a = copyTree(path.join(RB.root, 'soul'), SOUL, '书房')
  const b = copyTree(path.join(RB.root, 'memory'), MEM, '记忆中枢', { rewrite: REWRITE })
  const c = copyTree(path.join(RB.root, 'sessions'), SESSIONS, '会话原文', { overwrite: false })
  const d = copyTree(path.join(RB.root, 'state'), path.join(DSH_HOME, 'state'), '换气账本', { overwrite: false })
  if (!DRY) ok(`书房 ${a.n} 个、记忆中枢 ${b.n} 个、会话原文 ${c.n} 个${c.skipped ? `（本机已有同名的 ${c.skipped} 个，保留本机的）` : ''}、换气账本 ${d.n} 个`)
  if (pairs.length) (DRY ? info : ok)(`${DRY ? '[干跑] 将把' : '已把'}记忆中枢配置里的路径换成本机的：${from.dshHome} → ${to.dshHome}`)
  // 本架构插件的设置：本机 cordis.patch.yml 里没有的条目才加；默认 preset 交给下面「profile 配置」那步
  const ents = (RB.settings.cordisEntries || []).filter((e) => e.id !== 'agent-preset-registry')
  if (ents.length) {
    let y = exists(cfgPath) ? readText(cfgPath) : ''
    const have = new Set(cordisBlocks(y).map((x) => x.id))
    const add = ents.filter((e) => !have.has(e.id)), kept = ents.filter((e) => have.has(e.id))
    if (add.length) {
      if (y.length && !y.endsWith('\n')) y += '\n'
      y += add.map((e) => rewritePaths(e.text, pairs)).join('\n') + '\n'
      write(cfgPath, y, 'cordis.patch.yml（合并本架构插件的设置）')
      if (!DRY) ok(`合并插件设置：${add.map((e) => e.id).join('、')}`)
    }
    if (kept.length) info(`本机已有这些插件的设置，保留本机的：${kept.map((e) => e.id).join('、')}`)
  }
  // mcp-hub 清单：带回 echo 以外的服务器（echo 在下一步按本机路径重写）
  const srv = RB.settings.mcpServers
  const others = srv ? (Array.isArray(srv) ? srv : srv.servers || []).filter((x) => x && x.serverName && x.serverName !== 'echo') : []
  if (others.length && PKGS.includes('dsh-mcp-hub')) {
    const SERVERS = path.join(DSH_HOME, 'mcp-hub', 'servers.json')
    const doc = (exists(SERVERS) && readJson(SERVERS)) || { version: 1, servers: [] }
    const arr = Array.isArray(doc) ? doc : (doc.servers = Array.isArray(doc.servers) ? doc.servers : [])
    const add = others.filter((x) => !arr.some((y) => y && y.serverName === x.serverName))
    if (add.length) {
      arr.push(...add)
      write(SERVERS, JSON.stringify(doc, null, 2), 'mcp-hub/servers.json（带回其他服务器）')
      if (!DRY) ok(`mcp-hub 清单带回：${add.map((x) => x.serverName).join('、')}（命令和路径是源电脑的，用不了的话在 mcp-hub 面板里改）`)
    }
  }
  if (DRY) info('（干跑时备份里的数据还没放回，下面几步列出的模板文件、默认设置，真跑时会因为备份里已有而跳过）')
}

if (RESTORE) {
  const restoredRows = runFixes({ fresh: () => false, apply: true })
  for (const row of restoredRows) {
    const index = FIX_ROWS.findIndex((item) => item.id === row.id)
    if (index >= 0) FIX_ROWS[index] = row
  }
}

if (MIGRATE_PRESETS) {
  if (DRY && PRESET_SESSION_PLANS.length) info(`[干跑] 将迁移 ${PRESET_SESSION_PLANS.length} 个旧会话入口到砚青 PTC`)
  if (!DRY) applyPresetSessions(PRESET_SESSION_PLANS)
  const currentConfig = exists(cfgPath) ? readText(cfgPath) : ''
  const nextConfig = migratePresetDefault(currentConfig)
  if (nextConfig !== currentConfig) write(cfgPath, nextConfig, 'cordis.patch.yml（迁移退役默认 preset）')
}

// ═══ package.json / cordis.patch.yml ═════════════════════════════════════
step(`profile 配置（bundles、dependencies、默认 preset）`)
let finalDefault = null
if (FIX_MODE) {
  // --fix 只在同意重装、零件改了名时动 package.json 和锁文件；cordis.patch.yml 只有「修复」一步里换气配置的布尔
  if (RENAMES.length) {
    const plan = planPackageJson(readText(pkgPath), PKGS_LIVE, RENAME_MAP)
    if (plan.changed) { JSON.parse(plan.text); write(pkgPath, plan.text, 'package.json') }
    ok(`bundles、dependencies 里换名：${RENAMES.map((r) => `${r.from} → ${r.to}`).join('；')}`)
    const ls = renameInLocks(LOCKS, RENAME_MAP)
    if (ls.length && !DRY) ok(`锁文件同步换名：${ls.join('、')}`)
  } else ok('package.json：--fix 不用改')
  finalDefault = (MIGRATE_PRESETS && RETIRED_PRESETS[state0?.defaultPreset]) || (state0 && state0.defaultPreset) || null
  if (!DRY && parseYaml && exists(cfgPath)) { try { parseYaml(readText(cfgPath)); ok('cordis.patch.yml 解析通过') } catch (e) { die(`cordis.patch.yml 解析失败：${e.message}；用备份 ${path.basename(b2 || '')} 还原`) } }
} else {
  const plan = planPackageJson(readText(pkgPath), PKGS_LIVE, RENAME_MAP)
  if (plan.changed) { JSON.parse(plan.text); write(pkgPath, plan.text, 'package.json') } else ok('package.json 不用改')
  if (RENAMES.length) ok(`bundles、dependencies 里换名：${RENAMES.map((r) => `${r.from} → ${r.to}`).join('；')}`)
  if (plan.removed.length) ok(`bundles 去掉 ${plan.removed.join('、')}（它们由 Soul preset 调用；插件市场会显示「已停用」，属正常）`)
  ok(`bundles ${plan.bundles.length} 项；dependencies 里本体、${PKGS.length} 个零件、${PRESET_PKG} 都是 file:node_modules/<包名>`)
  if (RENAMES.length) {
    const ls = renameInLocks(LOCKS, RENAME_MAP)
    if (ls.length && !DRY) ok(`锁文件同步换名：${ls.join('、')}`)
    const cfgText = readText(cfgPath)
    const stale = RENAMES.filter((r) => new RegExp(`name: ['"]?${reEsc(r.from)}['"]?`).test(cfgText))
    if (stale.length) warn(`cordis.patch.yml 里还有用旧包名加载的条目（${stale.map((r) => r.from).join('、')}），没动它；请核对`)
  }
  const c = planCordis(exists(cfgPath) ? readText(cfgPath) : '', { hub: HUB, defaultPreset: DEFAULT_PRESET, dshHome: DSH_HOME, memRelative: FIX_ROWS.some((r) => r.id === 'memory-home' && r.status === 'kit') })
  for (const n of c.notes) ok(n)
  if (c.memoryNote) warn(c.memoryNote)
  if (c.changed) write(cfgPath, c.text, 'cordis.patch.yml')
  else ok('cordis.patch.yml 不用改')
  finalDefault = c.defaultPreset
  if (!DRY && parseYaml) { try { parseYaml(readText(cfgPath)); ok('cordis.patch.yml 解析通过') } catch (e) { die(`cordis.patch.yml 解析失败：${e.message}；用备份 ${path.basename(b2 || '')} 还原`) } }
}

// ═══ mcp-hub 接入 echo 检索 ═════════════════════════════════════════════
let MCP_STATUS = null
if (PKGS.includes('dsh-mcp-hub') && !FIX_MODE) {
  step('mcp-hub 接入 echo 检索（记忆召回走常驻服务）')
  const SERVERS = path.join(DSH_HOME, 'mcp-hub', 'servers.json')
  const echoMcp = path.join(HUB, 'echo-mcp.mjs')
  const entry = { serverName: 'echo', transport: 'stdio', enabled: true, command: posix(NODE_FOR_CONFIG), args: [posix(echoMcp)], cwd: posix(HUB), toolCallTimeoutMs: 60000 }
  const willHave = exists(echoMcp) || hubOf('add').includes('echo-mcp.mjs') || hubOf('update').includes('echo-mcp.mjs') || (!UPDATE && exists(path.join(SRC.dir, 'kit', 'echo', 'echo-mcp.mjs')))
  if (!willHave) { warn('中枢里没有 echo-mcp.mjs（上游这一版还没有，或本机中枢不是全套），没接入；mcp-hub 照样能用来接别的 MCP'); MCP_STATUS = '未接入 echo' }
  else {
    let doc = exists(SERVERS) ? readJson(SERVERS) : { version: 1, servers: [] }
    if (!doc) { warn(`${posix(SERVERS)} 解析失败，没动它；要用 echo 检索，在 mcp-hub 面板里手动添加一台 stdio 服务器：${entry.command} ${entry.args[0]}`); MCP_STATUS = '清单解析失败' }
    else {
      const arr = Array.isArray(doc) ? doc : (doc.servers = Array.isArray(doc.servers) ? doc.servers : [])
      const has = arr.find((x) => x && x.serverName === 'echo')
      if (has) { ok(`mcp-hub 清单里已经有 echo，保留原样（${posix(SERVERS)}）`); MCP_STATUS = '已有 echo' }
      else {
        if (exists(SERVERS)) backup(SERVERS, UPDATE ? 'pre-soul-update' : 'pre-soul-kit')
        arr.push(entry)
        write(SERVERS, JSON.stringify(doc, null, 2), `mcp-hub/servers.json（加一台 echo）`)
        if (!DRY) ok(`mcp-hub 清单加了 echo：${entry.command} ${entry.args[0]}（工具名会是 mcp__echo__echo_search 等）`)
        MCP_STATUS = '已接入 echo'
      }
    }
  }
}

// ═══ 安装：书房 + 中枢 + 自我层 + 心跳 ═══════════════════════════════════
// 方案文件里留到安装时才填的：路径（换电脑会变）、心跳时间、这台电脑有没有 dsh-mnemon
//   路径写成 $HOME/…：不带用户名，换电脑、换用户名不用改；zsh、bash 和 Windows 上 DSH 用的 PowerShell 都认。不在用户目录下的只能写原样
const IVARS = { HUB: homePath(HUB), SOUL: homePath(SOUL), MEM: homePath(MEM), SESSIONS: homePath(SESSIONS), DSH_HOME: homePath(DSH_HOME), PROFILE_DIR: homePath(PROF), RUNTIME: RUNTIME && homePath(RUNTIME), HB_TIME }
const ICONDS = { MNEMON, HEARTBEAT: !NO_HB }
let HB_STATUS = UPDATE ? '更新不动心跳' : '未注册'
if (!UPDATE) {
  step('第 0 步权威源 + 记忆中枢')
  mkdir(SOUL); mkdir(MEM)
  if (exists(path.join(SOUL, '00-authority.md'))) ok('soul/00-authority.md 已存在，保留')
  else if (!SETUP) warn('soul/00-authority.md 不在，备份里也没有，又找不到当初的方案：没放权威源册，装好后照 assets/templates/00-authority.md.tpl 补一份')
  else { write(path.join(SOUL, '00-authority.md'), render(setupText('authority'), IVARS, ICONDS), 'soul/00-authority.md'); if (!DRY) ok(`权威源册已放好（方案「${SETUP_NAME}」）`) }
  {
    const ans = path.join(os.tmpdir(), `dsh-soul-answers-${TS}.json`)
    TMP_DIRS.push(ans)
    fs.writeFileSync(ans, JSON.stringify(initAnswers(SETUP || { name: AGENT, user: USERN, hardLines: [], multiSession: true, windowSize: 1000000 }), null, 2), 'utf8')
    const r = runNode(path.join(BODY, 'tools', 'init.mjs'), ['--out', SOUL_ROOT, '--answers', ans], 'init.mjs 生成其余骨架')
    if (!r.ok) die('init.mjs 失败：\n' + r.out)
    if (!DRY) { const m = r.out.match(/生成 \d+ 份，跳过 \d+ 份/); ok('init.mjs：' + (m ? m[0] : '完成')) }
  }
  if (exists(path.join(HUB, '.kit-origin.json'))) ok('记忆中枢的脚本已装过，跳过')
  else {
    const r = runNode(path.join(BODY, 'kit', 'echo', 'install-kit.mjs'), ['--hub', HUB, '--all'], 'install-kit --all')
    if (!r.ok) die('install-kit 失败：\n' + r.out)
    if (!DRY) ok('install-kit：全套脚本已装进 hub')
  }
  for (const f of fs.readdirSync(NEW_KIT).filter((x) => x.endsWith('.json') && !x.startsWith('echo.config'))) {
    if (!exists(path.join(HUB, f))) { write(path.join(HUB, f), readText(path.join(NEW_KIT, f)), `中枢 ${f}`); if (!DRY) ok(`中枢 ${f}：已放好（install-kit 只拷 .mjs）`) }
  }
  {
    // 仓库自带的测试脚本里写死了日志文件名，会让体检的「版本漂移」报红 → 挪走
    const t = path.join(HUB, 'test-self-check.mjs')
    if (exists(t) && !DRY) {
      fs.mkdirSync(path.join(MEM, '_kit-unused'), { recursive: true })
      fs.renameSync(t, path.join(MEM, '_kit-unused', 'test-self-check.mjs'))
      const of = path.join(HUB, '.kit-origin.json'); const o = readJson(of)
      if (o) { if (o.files) delete o.files['test-self-check.mjs']; o.note = 'test-self-check.mjs 是仓库自带的测试脚本，内含写死的日志文件名会触发版本漂移扫描，已挪到 memory/_kit-unused/'; fs.writeFileSync(of, JSON.stringify(o, null, 2) + '\n', 'utf8') }
      ok('test-self-check.mjs 已挪到 memory/_kit-unused/（防止版本漂移误报）')
    } else if (DRY) info('[干跑] install-kit 之后会把 test-self-check.mjs 挪到 memory/_kit-unused/')
  }
  {
    // 配置：一主、一副本、一指针
    const cfg = { _说明: 'dsh-agent-soul / echo 的唯一配置（主）。副本：profile 的 node_modules/dsh-agent-soul/kit/echo.config.json（改主后复制过去）；指针：<DSH 家目录>/hub/echo.config.json。', soul: posix(SOUL), memory: posix(MEM), sessions: posix(SESSIONS) }
    if (RX) cfg.runtime = RX // 解析不出热记忆目录就不写这个键：留空是「没配」，写 null 会让下游把 null 当路径
    const text = JSON.stringify(cfg, null, 2)
    const master = path.join(HUB, 'echo.config.json')
    if (exists(master) && readText(master) !== text) backup(master, 'pre-soul-kit')
    write(master, text, 'hub/echo.config.json（主）')
    write(path.join(BODY, 'kit', 'echo.config.json'), text, 'kit/echo.config.json（副本）')
    if (!DRY) ok('echo.config.json：主 + kit 副本（副本在 kit/ 里，pnpm 重装时会保留）')
    const ptr = path.join(DSH_HOME, 'hub', 'echo.config.json')
    if (exists(ptr)) ok(`${posix(ptr)} 已存在，保留`)
    else if (DRY) info('[干跑] 将建立 <DSH 家目录>/hub/echo.config.json 指针')
    else {
      fs.mkdirSync(path.dirname(ptr), { recursive: true })
      try { fs.symlinkSync(master, ptr, 'file'); ok('指针：软链接 → hub/echo.config.json') }
      catch { fs.writeFileSync(ptr, JSON.stringify({ _说明: '只给 dsh-agent-echo 插件找 hub 用；真配置在 memory/hub/echo.config.json', memory: posix(MEM) }, null, 2), 'utf8'); ok('指针：建不了软链接，改写成只含 memory 的指针文件') }
    }
  }

  step('自我层、骨架、人设')
  {
    const selfSrc = path.join(HUB, 'SELF.src.md')
    if (exists(selfSrc) && !readText(selfSrc).includes('<你的名字>')) ok('SELF.src.md 已是填好的版本，保留')
    else if (!SETUP) warn('SELF.src.md 还是空模板，又找不到当初的方案：没写自我层，装好后照 assets/templates/SELF.src.md.tpl 填一份')
    else {
      if (exists(selfSrc) && !exists(selfSrc + '.template') && !DRY) fs.copyFileSync(selfSrc, selfSrc + '.template')
      write(selfSrc, render(setupText('self'), IVARS, ICONDS), 'hub/SELF.src.md')
      if (!DRY) ok(`SELF.src.md 已写入（${SETUP.name}的身份、${SETUP.hardLines.length} 条硬线、${SETUP.persona === 'none' ? '说话方式' : '人设'}、门）`)
    }
    const r = runNode(path.join(BODY, 'kit', 'echo', 'scaffold.mjs'), ['--soul', SOUL, '--memory', MEM, '--sessions', SESSIONS, '--apply'], 'scaffold --apply 搭骨架')
    if (!r.ok) die('scaffold 失败：\n' + r.out)
    if (!DRY) { const m = r.out.match(/建了 \d+ 项，跳过 \d+ 项/); ok('scaffold：' + (m ? m[0] : '完成')) }
    if (SETUP && SETUP.files.voice) {
      const vf = SETUP.files.voice, voice = path.join(SOUL, '65-声音', vf)
      if (exists(voice)) ok(`65-声音/${vf} 已存在，保留`)
      else { write(voice, setupText('voice'), `65-声音/${vf}`); if (!DRY) ok('人设完整版已放进 65-声音/') }
    }
  }

  step('心跳（每日定时：重建索引 → 装配 SELF.md → 体检）')
  const HB = path.join(SOUL, '60-工具', 'heartbeat.mjs')
  // 记忆中枢按相对心跳脚本自己的位置找（书房、中枢一起挪也不用改）
  write(HB, render(readText(path.join(TPL, 'heartbeat.mjs.tpl')), { NAME: AGENT }).replace('{{HUB_REL_JSON}}', JSON.stringify(posix(path.relative(path.dirname(HB), HUB)))), '60-工具/heartbeat.mjs')
  if (!DRY) ok('心跳脚本：soul/60-工具/heartbeat.mjs')
  if (NO_HB) { HB_STATUS = flag('--no-heartbeat') ? '按 --no-heartbeat 跳过' : '方案里没开心跳，没注册'; ok(`心跳：${HB_STATUS}（脚本留着，想自检时可以手动跑 node "${posix(HB)}"）`) }
  else {
    const [hh, mm] = HB_TIME.split(':').map((x) => Number(x))
    if (!(hh >= 0 && hh < 24 && mm >= 0 && mm < 60)) die(`心跳时间格式不对：${HB_TIME}`)
    if (process.platform === 'darwin') {
      const label = 'com.dsh-soul.heartbeat'
      const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${label}.plist`)
      const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${esc(NODE_FOR_CONFIG)}</string>
    <string>${esc(HB)}</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${hh}</integer>
    <key>Minute</key>
    <integer>${mm}</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${esc(path.join(HUB, 'heartbeat-launchd.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${esc(path.join(HUB, 'heartbeat-launchd.log'))}</string>
</dict>
</plist>
`
      if (exists(plistPath) && !readText(plistPath).includes(esc(HB))) HB_STATUS = `已有别的心跳（${plistPath}），没覆盖`
      else {
        write(plistPath, plist, `~/Library/LaunchAgents/${label}.plist`)
        if (!DRY) {
          const uid = os.userInfo().uid
          spawnSync('launchctl', ['bootout', `gui/${uid}/${label}`], { encoding: 'utf8' })
          const r1 = spawnSync('launchctl', ['bootstrap', `gui/${uid}`, plistPath], { encoding: 'utf8' })
          if (r1.status !== 0) warn(`launchctl bootstrap 失败：${(r1.error ? r1.error.message : String(r1.stderr || '')).trim()}；可以手动跑：launchctl bootstrap gui/$(id -u) "${plistPath}"`)
          else { spawnSync('launchctl', ['kickstart', `gui/${uid}/${label}`], { encoding: 'utf8' }); HB_STATUS = `launchd 已注册（每天 ${HB_TIME}），并已手动触发一次` }
        } else HB_STATUS = '将注册 launchd'
      }
      ok(`心跳：${HB_STATUS}`)
    } else if (process.platform === 'win32') {
      const q = (s) => "'" + s.replace(/'/g, "''") + "'"
      const ps1 = path.join(SOUL, '60-工具', 'register-heartbeat.ps1')
      const body = [
        "$ErrorActionPreference = 'Stop'",
        `$action = New-ScheduledTaskAction -Execute ${q(NODE_FOR_CONFIG)} -Argument ${q('"' + HB + '"')}`,
        `$trigger = New-ScheduledTaskTrigger -Daily -At ${q(HB_TIME)}`,
        '$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)',
        "Register-ScheduledTask -TaskName 'dsh-soul-heartbeat' -Action $action -Trigger $trigger -Settings $settings -Description 'dsh-agent-soul heartbeat' -Force | Out-Null",
        "Start-ScheduledTask -TaskName 'dsh-soul-heartbeat'",
        "Write-Output 'heartbeat-registered'",
      ].join('\r\n')
      // PowerShell 5.1 读没有 BOM 的脚本会按本地代码页解码，路径里有中文就坏 —— 必须带 BOM
      write(ps1, '\uFEFF' + body + '\r\n', '60-工具/register-heartbeat.ps1')
      if (!DRY) {
        const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1], { encoding: 'utf8', windowsHide: true })
        if (String(r.stdout).includes('heartbeat-registered')) HB_STATUS = `计划任务 dsh-soul-heartbeat 已注册（每天 ${HB_TIME}，用电池也照跑，错过会补跑），并已手动触发一次`
        else warn(`计划任务注册失败：${(r.error ? r.error.message : String(r.stderr || r.stdout || '')).trim().slice(0, 300)}；可以手动右键 ${ps1} →「使用 PowerShell 运行」`)
      } else HB_STATUS = '将注册 Windows 计划任务'
      if (HB_STATUS !== '未注册') ok(`心跳：${HB_STATUS}`)
    } else warn('这个系统不是 macOS / Windows，没注册定时任务；请用 cron 每天跑一次：node ' + HB)
  }
}

// ═══ 恢复收尾 ═══════════════════════════════════════════════════════════
if (RESTORE) {
  step('恢复收尾：中枢来源记录、索引、自我层')
  const jobs = [
    [path.join(BODY, 'kit', 'echo', 'install-kit.mjs'), ['--hub', HUB], 'install-kit（来源记录换成本机）'],
    [path.join(HUB, 'memindex.mjs'), ['build'], 'memindex build（按本机路径重建索引）'],
    [path.join(HUB, 'self.mjs'), [], 'self.mjs（装配自我层）'],
  ]
  for (const [script, args, label] of jobs) {
    if (!DRY && !exists(script)) { warn(`${label}：${posix(script)} 不在，跳过`); continue }
    const r = runNode(script, args, label)
    if (!DRY) { if (r.ok) ok(label); else warn(`${label} 没成功，可以之后让 ${AGENT} 重跑：\n${r.out.split('\n').slice(-4).join('\n')}`) }
  }
}

// ═══ 校验 + 安装记录 ═════════════════════════════════════════════════════
step(`校验和安装记录`)
if (!DRY) {
  JSON.parse(readText(pkgPath)); ok('package.json 是合法 JSON')
  for (const n of ['dsh-agent-soul', ...partsDone, PRESET_PKG]) if (!exists(path.join(NM, n, 'package.json'))) die(`node_modules/${n} 不见了`)
  ok(`${partsDone.length + 2} 个包都在 node_modules 里`)
  for (const r of RENAMES) if (exists(path.join(NM, r.from))) die(`旧目录 node_modules/${r.from} 还在，和新包 ${r.to} 会重复注册`)
  const r = runNode(path.join(BODY, 'tools', 'verify-client-ids.mjs'), [PROF], 'verify-client-ids')
  if (!r.ok) die('注册 id 有问题（撞车或面板 id ≠ 包名，会让 DSH 一启动就崩），先别启动 DSH：\n' + r.out)
  ok('注册 id 没有撞车，面板 id 都等于包名')
  if (parseYaml) {
    const bad = patchNamesMissing(NM, ['dsh-agent-soul', ...partsDone, PRESET_PKG], parseYaml)
    if (bad.length && FIX_SKIP.some((id) => id.startsWith('name-') || id.endsWith('load-name'))) warn('按跳过设置保留了作者原版，仍有加载名缺包，请核对：' + [...new Set(bad)].join('；'))
    else if (bad.length) die('有包要加载的插件在 node_modules 里找不到（DSH 启动时会 import 失败），先别启动 DSH：\n      ' + [...new Set(bad)].join('\n      '))
    if (!bad.length) ok('每个包要加载的插件都找得到')
  } else info('profile 里没有 YAML 解析器，跳过「要加载的插件找不找得到」这项校验')
  for (const [file, plan] of Object.entries(PRESET_PLANS)) if (plan.record) FIX_RECORDS.presets[file] = plan.record
  const now = new Date().toISOString()
  const st = {
    _说明: 'dsh-agent-soul 安装包的安装记录；install.mjs --update 靠它判断从哪一版更新、装了哪些零件、哪些是用户拒掉的。',
    kitVersion: KIT_VERSION,
    upstream: { repo: REPO, ref: SOURCE ? null : REF, sha: SRC.sha, version: srcVer || null, from: SRC.from },
    installedAt: (state0 && state0.installedAt) || (UPDATE ? null : now),
    updatedAt: now,
    dsh: SRC_PRESETS.ptc.dsh,
    setup: SETUP_INFO,
    nameMap: NAME_MAP,
    summaryModel: SUMMARY_MODEL, // 2.17 的写法，留着给旧版 kit 读；3.0 起以 fixSkip 为准
    presetIds: !MIGRATE_PRESETS && state0?.presetIds ? state0.presetIds : PRESET_CHOICE,
    presetAliases: !MIGRATE_PRESETS && state0?.presetAliases ? state0.presetAliases : BUNDLE.aliases,
    presets: !MIGRATE_PRESETS && state0?.presets ? state0.presets : Object.fromEntries(PRESET_CHOICE.map((x) => [x, SRC_PRESETS[PRESET_SOURCE[x]].version])),
    defaultPreset: finalDefault,
    parts: partsDone,
    declined: [...new Set([...DECLINED0, ...OPTIONAL_PARTS.filter((p) => SKIP_PARTS.includes(p) && !isInstalledPart(p))])].filter((p) => !isInstalledPart(p)),
    heartbeat: UPDATE ? (state0 && state0.heartbeat) || null : { enabled: !NO_HB, time: HB_TIME, status: HB_STATUS },
    // 热记忆目录是怎么找到的：出问题时不用再猜，直接看这一行
    runtime: { dir: RX, source: MNE.source, scope: MNE.scope, dataDir: MNE.dataDir, probe: MNE.probe.level },
    // 写进持久配置的那个 node（DSH 自带优先）；DSH 升级换了 app 路径时，这里会跟着变
    node: { bin: posix(NODE_FOR_CONFIG), version: process.versions.node, from: path.resolve(NODE_FOR_CONFIG) === path.resolve(process.execPath) ? '当前进程' : 'DSH 自带' },
    fixes: Object.fromEntries(FIX_ROWS.map((r) => [r.id, { status: r.status, action: r.action, kitVersion: KIT_VERSION, upstream: SRC.sha, evidence: r.note || fixInfo(r.id).why }])),
    fixRecords: FIX_RECORDS,
    fixSkip: FIX_SKIP,
    mcpHub: MCP_STATUS,
    history: [...((state0 && state0.history) || (RESTORE && (readJson(path.join(RB.root, 'install-state.json')) || {}).history) || []), { at: now, mode: MODE, sha: SRC.sha, ...(RESTORE ? { from: `${RB.man.host} ${RB.man.createdAt}` } : {}) }],
    ...(RESTORE ? { restoredFrom: { host: RB.man.host, platform: RB.man.platform, createdAt: RB.man.createdAt, upstream: RB.man.upstream } } : {}),
  }
  fs.mkdirSync(SOUL_ROOT, { recursive: true })
  fs.writeFileSync(STATE_PATH, JSON.stringify(st, null, 2), 'utf8')
  ok(`安装记录：${posix(STATE_PATH)}（提交 ${short(SRC.sha)}${srcVer ? `，v${srcVer}` : ''}）`)
} else info('[干跑] 真跑时会校验 package.json、各个包是否到位、注册 id 是否撞车，并写安装记录')

FIX_TRANSACTION?.commit()

// ═══ 完成 ════════════════════════════════════════════════════════════════
const presetName = () => PRESET_LABEL[finalDefault] || finalDefault
out('\n' + '─'.repeat(60))
out(DRY ? '干跑结束：以上是计划，没有改任何文件。确认无误后去掉 --dry-run 再跑。' : `${{ install: '文件层面的安装', update: '更新', restore: '迁移恢复', fix: '修复' }[MODE]}完成。`)
if (DRY && running === true && MODE !== 'backup') {
  printTerminalHint()
  if (MODE === 'install' || MODE === 'restore') out(`装完重开 DSH 后新建一个会话，顶部 preset 应该是「${presetName() || '方案默认的 Soul preset'}」（不是就手动选它），验收和后面几步都在这个新会话里做；真跑结束时会给出要贴进去的话。`)
}
if (WARNS.length) { out('\n需要留意：'); for (const w of WARNS) out('  ! ' + w) }
if (!DRY && FIX_MODE) {
  out(`
接下来（详见 AGENT-INSTALL.md「修复」一节）：
  1. 启动 DSH，看有没有崩溃恢复对话框；新建会话，确认 preset 还是「${presetName() || '原来那个'}」。
  2. 让 ${AGENT} 调用 agent_soul_check（memory 参数给 ${posix(MEM)}），期望 0 错。
备份：${posix(BK)}`)
}
if (!DRY && UPDATE && !FIX_MODE) {
  out(`
接下来（详见 AGENT-INSTALL.md「更新」一节）：
  1. 启动 DSH，看有没有崩溃恢复对话框；新建会话，确认 preset 还是「${presetName() || '原来那个'}」。${RENAMES.length ? `
     插件市场里 ${RENAMES.map((r) => r.from).join('、')} 会变成 ${RENAMES.map((r) => r.to).join('、')}。` : ''}${MCP_STATUS === '已接入 echo' ? `
     侧边栏会多一个 mcp-hub 面板；echo 那台服务器连上后，会话里会有 mcp__echo__echo_search 等工具（DSH 刚启动的一两秒还没连上）。` : ''}
  2. 让 ${AGENT} 调用 agent_soul_check（memory 参数给 ${posix(MEM)}），期望 0 错。
没改的：书房、账本、SELF.src.md、权威源册、人设、主配置、心跳。
备份：${posix(BK)}（附还原方法.txt）`)
}
// 装完以后的几步都要在「装完后新建的会话」里做：会话的 preset 是建会话时定的，装之前开的会话
// （包括在 DSH 里跑这次安装的那个）不会自己换成 Soul preset，在里面测门牌只会看到内置压缩、没有门牌
const newSessionNote = () => `  ★ 下面几步都在「装完后新建的会话」里做。会话的 preset 是建会话时定的：装之前开的会话（包括在 DSH 里跑这次安装的那个）
    不会自己换成 Soul preset，在里面测门牌只会看到没有门牌的内置压缩。`
const pasteBlock = (leadLine) => [
  '  ┌─ 贴进新会话的话（从下一行到 └ 之前）',
  `  你现在接任主导，这是我刚指定的。直接做，依次执行，把每条输出原样贴给我，不要改任何东西：`,
  `  1. cd "${homePath(HUB)}"; node mo.mjs add lead "${leadLine.text}" --ref "${leadLine.ref}"`,
  `  2. 先读 ${homePath(path.join(BODY, 'soul', '12-ledger.md'))}，再用 node mo.mjs add fact "……" --ref "……" 写下你自己的第一条账：写一件你此刻确实知道的、具体的事，别写总结；有感触就加 --feel，没有就不加。`,
  '  3. node memindex.mjs build',
  '  4. node self.mjs',
  '  5. 调用 agent_soul_check，贴汇总行和所有 ✗ 的项',
  `  6. 门牌实测：我们再聊两三句、你读一个文件以后，我会输入 /compact。压缩完你把摘要第一块原样贴出来（应以「⛬ 压缩索引（非原文） · log:…#seq=…」开头），再跑 node memq.mjs open <那个门牌>，贴出取回的原文。`,
  '  └─',
  `  （它的终端里没有 node 的话，把 node 换成 "${posix(process.execPath)}"）`,
].join('\n')
if (!DRY && RESTORE) {
  const gen = (() => { try { return (readText(path.join(SOUL, '02-墨.jsonl')).match(/"type"\s*:\s*"lead"/g) || []).length } catch { return 0 } })()
  out(`
接下来（详见 AGENT-INSTALL.md「迁移」一节）：
${newSessionNote()}
  1. 启动 DSH，新建会话，看顶部 preset 是「${presetName()}」，有 8 个 agent_soul_ 开头的工具${MCP_STATUS === '已接入 echo' ? '，过一两秒还会有 mcp__echo__ 开头的检索工具' : ''}。
  2. 账本里最后一位主导是源电脑上的会话，这台电脑上没有它。让这个新会话接班（第 ${gen + 1} 代），把下面这段贴进去：
${pasteBlock({ text: `第 ${gen + 1} 代 · 接手于 <今天日期> · 上一代：${gen ? `第 ${gen} 代（迁移前在 ${RB.man.host}）` : '无（首代）'}`, ref: `${USERN} <今天日期> 指定：迁移到新电脑后由本会话主导` })}
     贴之前把 <今天日期> 换成今天。期望：agent_soul_check 0 错，门牌能取回原文。
  3. 门牌（log:<会话>#seq=…）照样能回取；账本旧记录里写死的 file: 绝对路径会失效，这是只追加账本的代价。
  4. 想升到上游最新版：退出 DSH 后跑 node install.mjs --update。

备份：${path.basename(b1)}${b2 ? '、' + path.basename(b2) : ''}（都在 ${posix(PROF)}）`)
}
if (!DRY && MODE === 'install') {
  out(`
接下来（详见 AGENT-INSTALL.md 的阶段 C、D）：
${newSessionNote()}
  1. 启动 DSH，新建会话，看顶部 preset 是「${presetName()}」，有 8 个 agent_soul_ 开头的工具${MCP_STATUS === '已接入 echo' ? '，过一两秒还会有 mcp__echo__ 开头的检索工具' : ''}。
  2. 让这个新会话里的 ${AGENT} 当第 1 代主导、写第一条账、做门牌实测，把下面这段贴进去：
${pasteBlock({ text: '第 1 代 · 接手于 <今天日期> · 上一代：无（首代）', ref: `${USERN} <今天日期> 指定：本会话是主导` })}
     贴之前把 <今天日期> 换成今天。期望：agent_soul_check 0 错（警告只剩「门牌回取」「压缩机制」，压缩过一次后变绿），门牌能取回原文。

备份：${path.basename(b1)}${b2 ? '、' + path.basename(b2) : ''}（都在 ${posix(PROF)}）`)
}
