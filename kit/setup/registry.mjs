// 改 agent-preset-registry 的 default / selectedDefault。
// 为什么单独一个文件：apply.mjs 里内联正则要经过两层字符串转义，出错只会得到「改了但没生效」。
//
//   node kit/setup/registry.mjs <cordis.patch.yml> <presetId>
//   例：node kit/setup/registry.mjs ~/.dsh/profiles/desktop/cordis.patch.yml soul-all
//
// 规矩：只改那两行的值，不动缩进、注释、顺序；找不到就报错退出 —— 不瞎插。
import fs from 'node:fs'

const [file, presetId] = process.argv.slice(2)
if (!file || !presetId) {
  console.error(JSON.stringify({ ok: false, error: '用法：registry.mjs <cordis.patch.yml> <presetId>' }))
  process.exit(2)
}

const text = fs.readFileSync(file, 'utf8')
const lines = text.split('\n')
let inBlock = false
let blockIndent = -1
let changed = 0

for (let i = 0; i < lines.length; i++) {
  const line = lines[i]
  const idm = line.match(/^(\s*)-\s*id:\s*(\S+)\s*$/) || line.match(/^(\s*)-?\s*id:\s*(\S+)\s*$/)
  if (idm) {
    if (inBlock) inBlock = false
    if (idm[2] === 'agent-preset-registry') {
      inBlock = true
      blockIndent = idm[1].length
      continue
    }
  }
  if (!inBlock) continue
  if (line.trim() && /^\s*-\s/.test(line) && (line.match(/^(\s*)/) || [''])[0].length <= blockIndent) {
    inBlock = false
    continue
  }
  const m = line.match(/^(\s*)(default|selectedDefault):\s*\S+\s*$/)
  if (m) {
    lines[i] = m[1] + m[2] + ': ' + presetId
    changed++
  }
}

if (changed === 0) {
  console.error(JSON.stringify({ ok: false, error: 'registry 里没有 default / selectedDefault，不敢瞎插：' + file }))
  process.exit(1)
}

fs.writeFileSync(file, lines.join('\n'), 'utf8')
console.log(JSON.stringify({ ok: true, changed, presetId }))
