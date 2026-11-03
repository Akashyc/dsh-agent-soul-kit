// 换气（dsh-huanqi）和它的备用路径 compact-region 的本机补丁，以及补丁文本的打 / 还原两个纯函数。
//
// 背景：这两个零件把诊断日志、测试触发口写死成作者电脑的 D:\AI\memory\hub（作者自己在更新记录里点过名：
//   「装到别人机器就静默失效」），这里换成运行时找 DSH 家目录下的记忆中枢。另外两处行为修复不是作者给的，
//   是 Boss 本机 2026-10-29 实测后修的，注释里写明来源。
//   2.16–3.0 这两个零件从零件仓 organs 取；4.0 起作者把它们都收回主仓 plugins/（10-31 弃用 organs），补丁对着主仓那份打。
//   作者 10-31 已经自己修了 compact-region 的日志路径（改成 DSH_PLUGIN_DIAG 或系统临时目录），
//   测试触发口先等 agent 静下来再压，作者 11-01 v1.2.2 也自己改好了：cr-hub-path、huanqi-trigger-idle 两条 4.3 从清单删掉。
//   作者 11-04（6531d30）去掉了写死的 D:\AI\memory\hub，改成从 DSH 家目录往上推两级拼 memory/hub，又引入两个新毛病：
//   用了没导入的 homedir()（DSH 不传 DSH_HOME 时换气一加载就报错）、推出来的位置只对作者那台的目录布局成立。
//   huanqi-hub-path 由此退役，新加 huanqi-homedir、huanqi-hub-home 两条（5.2）。
//
// lib/fixes.mjs 用这个文件登记补丁。

import { homePathExpr } from './home-paths.mjs'

// 作者写死的记忆中枢：文件里是 JS 字符串字面量 'D:\\AI\\memory\\hub\\<文件名>'，这里只认到开头的引号 + 目录部分
export const AUTHOR_HUB = "'D:\\\\AI\\\\memory\\\\hub\\\\"
export const HUB_REL = 'dsh-soul/memory/hub'
// 换成「(DSH 家目录 + '/dsh-soul/memory/hub') + '/<文件名>'」，原字面量剩下的「<文件名>'」原样接上
export function hubPrefix() { return homePathExpr(HUB_REL) + " + '/" }
export const HUB_ANY = /\(\/\* soul-kit:auto-home v\d+ \*\/[^\n]*?"\/dsh-soul\/memory\/hub"\) \+ '\//
// 上游代码里不再有写死作者电脑路径的字符串（任何斜杠写法都算；注释里提到的不算），就当已经改好
export const HUB_FIXED = /^(?![\s\S]*['"`]D:[\\/]+AI[\\/]+memory[\\/]+hub)/

// 上游 6531d30：只导入了 path 的 dirname / join，homedir 没导入（作者特意不引 node:os，文件里只有自己的 homeDir()）
export const HOMEDIR_OLD = "const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')"
export const HOMEDIR_NEW = "const DSH_HOME = process.env.DSH_HOME || join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh') // 本机修：上游用了没导入的 homedir()，DSH 不传 DSH_HOME 时换气一加载就报错"
const HOMEDIR_ANY = /^const DSH_HOME = process\.env\.DSH_HOME \|\| [^\n]*本机修[^\n]*/m
// 上游 6531d30：记忆中枢 = DSH 家目录往上两级 + memory/hub（作者那台是 D:\AI\dsh\home → D:\AI\memory\hub）
export const HUB_ROOT_OLD = "const HUB = process.env.YQ_HUB || join(AI_ROOT, 'memory', 'hub')"
export function hubRootNew() { return `const HUB = process.env.YQ_HUB || ${homePathExpr(HUB_REL)} // 本机修：上游从 DSH 家目录往上推两级拼 memory/hub，只对作者那台的目录布局成立；改成 DSH 家目录下的记忆中枢` }
const HUB_ROOT_ANY = /^const HUB = process\.env\.YQ_HUB \|\| [^\n]*本机修[^\n]*/m

export const MAINT_OLD = [
  '                await agent.runMaintenance(async (signal) => {',
  '                    await svc.compactNow(manualCtx, signal);',
  '                });',
].join('\n')
export const MAINT_NEW = [
  '                // 本机修：compactNow 自己就会经 manualCtx.runMaintenance 排队等空闲（作者在上面「官方 /compact 走 compactNow」那段注释里写过），',
  '                //   外面再套一层 runMaintenance，内层进来时 agent 已在维护中，被改写成 ManualCompactionError: requires an idle agent，',
  '                //   熔断后的全量压缩一次都成不了。Boss 本机 2026-10-29 实测：套两层时测试触发口连续失败，去掉外层后成功。',
  '                await svc.compactNow(manualCtx, new AbortController().signal);',
].join('\n')
const MAINT_ANY = /^ {16}\/\/ 本机修：compactNow[^\n]*\n(?: {16}\/\/[^\n]*\n)*^ {16}await svc\.compactNow\(manualCtx, new AbortController\(\)\.signal\);/m

export const INPUT_OLD = [
  "        description: 'Compact one seq range of older history (used by dsh-huanqi)',",
  '        handler,',
].join('\n')
export const INPUT_NEW = [
  "        description: 'Compact one seq range of older history (used by dsh-huanqi)',",
  "        input: { hint: '<startSeq> <endSeq>' }, // 本机修：不声明 input，输入框里带参数的 /compact-region 会被前端当成普通消息，命令根本不执行",
  '        handler,',
].join('\n')
const INPUT_ANY = /^ {8}input: \{ hint: '<startSeq> <endSeq>' \}, \/\/ 本机修[^\n]*/m
const INPUT_FIXED = /^\s*input:\s*\{/m

/**
 * 换气、compact-region 的补丁清单；字段和 install.mjs 的 patchList 一致。
 * all：同一处原文出现几次就换几次（换气里作者的路径写了 7 处）。
 * @param names 零件目录名 → 这次落地的包名（checkSource 的 names）
 */
export function huanqiPatches(names) {
  const hq = names.huanqi, cr = names['compact-region']
  const list = []
  if (hq) list.push(
    {
      key: 'huanqi-hub-path', pkg: hq, file: 'lib/index.js', needed: true, all: true,
      label: '换气的诊断日志和测试触发口改到 DSH 家目录的记忆中枢（上游写死 D:\\AI\\memory\\hub）',
      old: AUTHOR_HUB, new: hubPrefix(), any: HUB_ANY, fixed: HUB_FIXED,
    },
    { key: 'huanqi-full-maint', pkg: hq, file: 'lib/index.js', needed: true, label: '换气熔断后的全量压缩去掉多套的一层 runMaintenance', old: MAINT_OLD, new: MAINT_NEW, any: MAINT_ANY },
    { key: 'huanqi-homedir', pkg: hq, file: 'lib/index.js', needed: true, strict: true, label: '换气找 DSH 家目录不再调用没导入的 homedir()', old: HOMEDIR_OLD, new: HOMEDIR_NEW, any: HOMEDIR_ANY },
    { key: 'huanqi-hub-home', pkg: hq, file: 'lib/index.js', needed: true, label: '换气的记忆中枢按 DSH 家目录定位（上游从家目录往上推两级）', old: HUB_ROOT_OLD, new: hubRootNew(), any: HUB_ROOT_ANY },
  )
  if (cr) list.push(
    { key: 'cr-input', pkg: cr, file: 'index.js', needed: true, label: 'compact-region 声明参数输入（输入框里带参数也能执行）', old: INPUT_OLD, new: INPUT_NEW, any: INPUT_ANY, fixed: INPUT_FIXED },
  )
  return list
}

/** 在文本上打一个补丁：不认 $& 之类的替换模式；all 时每一处都换。 */
export function patchText(text, p, old = p.old) {
  return p.all ? String(text).split(old).join(p.new) : String(text).replace(old, () => p.new)
}

/**
 * 把本机补丁还原回上游原文，用来和上游比「本机到底改没改过」。
 * 同一个文件可能有好几处补丁：读一次，逐处还原；先认完整的新写法，认不出再按 any 还原（旧写法、写死路径的那种）。
 */
export function unpatchText(t, list) {
  for (const p of list) {
    if (p.new && t.includes(p.new)) t = t.split(p.new).join(p.old)
    else if (p.any.test(t)) t = t.replace(p.any, () => p.old)
  }
  return t
}