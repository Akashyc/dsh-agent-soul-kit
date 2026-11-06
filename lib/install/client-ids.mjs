// 上游把自己的包改过名，却漏改 client.js 里的注册 id —— 部署上去 DSH 一启动就弹「应用无法启动」
// （client-modules 拿 package.json 的 name 当 key，id 对不上就是 loaded without registering）。
// 作者源码只读，所以对齐做在临时副本上：装之前把每个零件的 id 改成它自己的包名。
// 只有「id 和包名同属我们自己的件」才改；第三方件的短 id 不动。
import fs from 'node:fs'
import path from 'node:path'

const OURS = /^(dsh-agent-|dsh-yanqing-|dsh-huanqi-|dsh-mcp-hub$)/
const ID_LINE = /^([ \t]*id[ \t]*:[ \t]*)(["'])([^"']+)\2/m

/** @returns 改过的 [{ part, file, from, to }]（原地改 srcDir，调用方保证那是临时副本） */
export function alignClientIds(srcDir, parts) {
  const fixed = []
  for (const part of parts) {
    const dir = path.join(srcDir, 'plugins', part)
    const client = path.join(dir, 'client.js')
    if (!fs.existsSync(client)) continue
    let pkg
    try { pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name } catch { continue }
    if (!pkg || !OURS.test(pkg)) continue
    const text = fs.readFileSync(client, 'utf8')
    const m = ID_LINE.exec(text)
    if (!m || m[3] === pkg) continue
    if (!OURS.test(m[3])) continue
    fs.writeFileSync(client, text.slice(0, m.index) + m[1] + '"' + pkg + '"' + text.slice(m.index + m[0].length), 'utf8')
    fixed.push({ part, file: 'plugins/' + part + '/client.js', from: m[3], to: pkg })
  }
  return fixed
}