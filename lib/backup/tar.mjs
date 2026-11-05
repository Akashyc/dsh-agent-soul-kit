import { exists } from '../core/io.mjs'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { once } from 'node:events'
const SKIP_RE = /(^|\/)(\.DS_Store|\.git|node_modules)(\/|$)|\.(mp4|mov|webm)$/i

export function walkAll(root, rel = '', acc = { dirs: [], files: [] }, skip = () => false) {
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
export async function writeTarGz(outFile, entries) {
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
export const BK_ROOT = 'dsh-soul-backup' // 备份包里的顶层目录
// 本架构插件在 profile cordis.patch.yml 里的条目：按各包 bundle patch 顶层插入的 id 认（不碰 dsh-mnemon 等别的插件）
