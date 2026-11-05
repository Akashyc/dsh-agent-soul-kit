import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

export function extractTarGz(file, outDir, { skip = /(^|\/)(\.DS_Store|\.git|node_modules)(\/|$)|\.(mp4|mov|webm)$/i } = {}) {
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
    if (!rel || path.isAbsolute(rel) || /^[A-Za-z]:/.test(rel) || rel.includes('\\') || rel.split('/').includes('..')) throw new Error('压缩包路径不安全')
    if (!root) root = rel.split('/')[0]
    if (skip.test(rel)) continue
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
