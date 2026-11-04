// Soul preset 自带的技能（skills/）：灵魂 · 创造、灵魂 · 全能 用 customSkillDirs 挂「preset 自己旁边的 skills/」——
//   new URL('skills/', baseUrl)，baseUrl 是 preset 所在的配置文件。安装包把 preset 写进 profile 的 cordis.patch.yml，
//   所以要放到 <profile>/skills/。来源是上游 presets/skills/（上游没有就用安装包快照 assets/presets/skills/）。
// 跟作者走（5.4）：和上游不一样的一律换成上游原文（原样在 kit 的快照里）；安装包装过、上游这次没有的删掉；用户自己放的文件不碰。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex')
const SKIP = /(^|\/)(\.DS_Store|\.git|node_modules)(\/|$)/

/** 这一节 Soul preset 里有没有要挂 preset 自带 skills/ 的。 */
export const needsSkills = (presetText) => /new URL\(\s*['"]skills\/['"]/.test(String(presetText || ''))

function list(root, rel = '', acc = []) {
  for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name
    if (SKIP.test(r)) continue
    if (e.isDirectory()) list(root, r, acc)
    else if (e.isFile()) acc.push(r)
  }
  return acc
}

/**
 * @param src 上游 skills 目录（没有就 null）；dst <profile>/skills；want 这次的 Soul preset 用不用 skills；
 *        record 上次装上去的 { 相对路径: sha1 }（安装记录 presetSkills）
 * @returns { write, remove, record, changed }：write 要（重新）拷的、remove 要删的，record 装完要记的
 */
export function planPresetSkills({ src, dst, want, record = {} }) {
  const up = want && src && fs.existsSync(src) ? Object.fromEntries(list(src).map((f) => [f, sha1(fs.readFileSync(path.join(src, ...f.split('/'))))])) : {}
  const cur = (f) => { try { return sha1(fs.readFileSync(path.join(dst, ...f.split('/')))) } catch { return null } }
  const write = Object.keys(up).filter((f) => cur(f) !== up[f])
  const remove = Object.keys(record).filter((f) => !(f in up) && cur(f) !== null)
  return { write, remove, record: up, changed: write.length > 0 || remove.length > 0 || JSON.stringify(Object.entries(up).sort()) !== JSON.stringify(Object.entries(record).sort()) }
}

/** 删完 files（相对 root）以后，把它们上面空了的目录收掉，到 root 为止（root 空了也收）；只剩 .DS_Store 也算空。别的空目录不碰。 */
export function pruneEmptyDirs(root, files) {
  const top = path.resolve(root), dirs = new Set()
  for (const f of files) {
    for (let d = path.dirname(path.join(top, ...f.split('/'))); d.startsWith(top); d = path.dirname(d)) { dirs.add(d); if (d === top) break }
  }
  for (const d of [...dirs].sort((a, b) => b.length - a.length)) {
    try { if (!fs.readdirSync(d).filter((x) => x !== '.DS_Store').length) fs.rmSync(d, { recursive: true, force: true }) } catch { /* 删不了就留着 */ }
  }
}
