// 换气（dsh-huanqi）和它的备用路径 compact-region 的本机补丁，以及补丁文本的打 / 还原两个纯函数。
// 修复清单只对准作者最新版（5.4 起）：作者修好的条目从清单删掉，id 留在 kit-iteration.json 的 retired 里不再复用。
//   huanqi-full-maint、cr-input 是 Boss 本机 2026-10-29 实测后修的；
//   huanqi-homedir、huanqi-paths-import 是上游 11-04 的两处加载失败（没导入的 homedir()、包外的 ../../../lib/paths.mjs）。
// lib/fixes.mjs 用这个文件登记补丁。

import { homePathExpr } from './home-paths.mjs'

// 上游 6531d30 起：只导入了 path 的 dirname / join，homedir 没导入（作者特意不引 node:os，文件里只有自己的 homeDir()）
export const HOMEDIR_OLD = "const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')"
export const HOMEDIR_NEW = "const DSH_HOME = process.env.DSH_HOME || join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh') // 本机修：上游用了没导入的 homedir()，DSH 不传 DSH_HOME 时换气一加载就报错"
const HOMEDIR_ANY = /^const DSH_HOME = process\.env\.DSH_HOME \|\| [^\n]*本机修[^\n]*/m
// 上游 0221d89 起：从包外的 ../../../lib/paths.mjs 取记忆库位置，装进 node_modules 后没有这个文件。
// 换成包内的同名函数，记忆库按 DSH 家目录定位（作者四级解析的第一候选就是这里）
export const PATHS_IMPORT_OLD = "import { resolveAll } from '../../../lib/paths.mjs'"
export function pathsImportNew() { return `const resolveAll = () => ({ memory: { path: ${homePathExpr('dsh-soul/memory')} } }) // 本机修：上游从包外的 ../../../lib/paths.mjs 导入，装进 node_modules 后找不到，换气一加载就报错` }
const PATHS_IMPORT_ANY = /^const resolveAll = [^\n]*本机修[^\n]*/m

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
    { key: 'huanqi-full-maint', pkg: hq, file: 'lib/index.js', needed: true, label: '换气熔断后的全量压缩去掉多套的一层 runMaintenance', old: MAINT_OLD, new: MAINT_NEW, any: MAINT_ANY },
    { key: 'huanqi-homedir', pkg: hq, file: 'lib/index.js', needed: true, strict: true, label: '换气找 DSH 家目录不再调用没导入的 homedir()', old: HOMEDIR_OLD, new: HOMEDIR_NEW, any: HOMEDIR_ANY },
    { key: 'huanqi-paths-import', pkg: hq, file: 'lib/index.js', needed: true, strict: true, label: '换气不再从包外导入 lib/paths.mjs', old: PATHS_IMPORT_OLD, new: pathsImportNew(), any: PATHS_IMPORT_ANY },
  )
  if (cr) list.push(
    { key: 'cr-input', pkg: cr, file: 'index.js', needed: true, label: 'compact-region 声明参数输入（输入框里带参数也能执行）', old: INPUT_OLD, new: INPUT_NEW, any: INPUT_ANY, fixed: INPUT_FIXED },
  )
  return list
}

/** 在文本上打一个补丁：不认 $& 之类的替换模式；all 时每一处都换。 */
export function patchText(text, p, old = p.old) {
  if (p.edits) return p.edits.reduce((t, edit) => patchText(t, edit), String(text))
  return p.all ? String(text).split(old).join(p.new) : String(text).replace(old, () => p.new)
}

/**
 * 把本机补丁还原回上游原文，用来和上游比「本机到底改没改过」。
 * 同一个文件可能有好几处补丁：读一次，逐处还原；先认完整的新写法，认不出再按 any 还原（旧写法、写死路径的那种）。
 */
export function unpatchText(t, list) {
  for (const p of list) {
    if (p.edits) { t = unpatchText(t, [...p.edits].reverse()); continue }
    if (p.new && t.includes(p.new)) t = t.split(p.new).join(p.old)
    else if (p.any?.test(t)) t = t.replace(p.any, () => p.old)
  }
  return t
}
