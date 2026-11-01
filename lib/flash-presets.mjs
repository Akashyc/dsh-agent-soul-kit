// 砚青 PTC Flash：从 LarryE135/dsh-flash-presets 的 v3（presets/flash-lean-ptc-v3.patch.yml）适配过来的 Soul preset。
//
// 源每次安装 / 更新时在线取（默认作者最新发布的版本，install.mjs 的 getFlashSource），这里只做纯文本的校验和改写：
//   换 id / 名字（旧的 ptc-soul-flash、flash-lean-ptc-v3-soul 已退役，用了会被当成退役 preset 删掉）、
//   压缩 / 裁剪换成带门牌的 dsh-agent-*、补上换气要用的范围压缩；其余（Flash 规则、25% 压缩阈值、workflow 关着）逐字照作者。
// 结构对不上就报错停下，不猜。

export const FLASH_REPO = 'LarryE135/dsh-flash-presets'
export const FLASH_FILE = 'presets/flash-lean-ptc-v3.patch.yml'
export const FLASH_PRESET_ID = 'yanqing-ptc-flash'
export const FLASH_LABEL = '砚青 PTC Flash'

/**
 * 把作者的 v3 改成砚青 PTC Flash 的 preset 块（从「    - id: preset-…」起，和砚青四套同一种缩进）。
 * @param srcText 作者 presets/flash-lean-ptc-v3.patch.yml 原文
 * @returns 块文本，结尾一个换行
 */
export function adaptFlash(srcText) {
  const t = String(srcText).replace(/\r\n/g, '\n')
  const at = t.search(/^- insert:\s*$/m)
  if (at < 0) throw new Error('Flash 源里找不到 - insert:')
  let body = t.slice(at).replace(/^- insert:\s*\n/, '').replace(/\s+$/, '') + '\n'
  // 每处改写都要正好命中一次，命中不了或多处就是作者改了结构
  const once = (re, to, what) => {
    const n = (body.match(new RegExp(re.source, re.flags.replace('g', '') + 'g')) || []).length
    if (n !== 1) throw new Error(`Flash 源的结构变了：${what}应该正好 1 处，实际 ${n} 处`)
    body = body.replace(re, to)
  }
  once(/^( {4}- id: )preset-[\w-]+$/m, `$1preset-${FLASH_PRESET_ID}`, '声明行（    - id: preset-…）')
  once(/^( {8}id: )[\w-]+$/m, `$1${FLASH_PRESET_ID}`, 'preset id')
  once(/^( {8}name: ).*$/m, `$1${JSON.stringify(FLASH_LABEL)}`, 'preset 名字')
  once(/^( {8}description: )"(.*)"$/m, (_, a, d) => `${a}${JSON.stringify(`${d.replace(/\\"/g, '"')}（砚青适配：压缩、裁剪换成带门牌的版本，补上范围压缩；其余照作者 dsh-flash-presets v3）`)}`, 'preset 说明')
  once(/name: '@deepseek-ai\/dsh-compaction-basic'/, "name: 'dsh-agent-compaction'", '压缩零件 dsh-compaction-basic ')
  once(/name: '@deepseek-ai\/dsh-compaction-tool-result-pruner'/, "name: 'dsh-agent-pruner'", '裁剪零件 dsh-compaction-tool-result-pruner ')
  // 范围压缩：作者有官方那条就换名，没有就接在 command-compact 后面补一条（换气靠它做范围压缩）
  if (/^ *- id: command-compact-region$/m.test(body)) once(/(- id: command-compact-region\n *name: )'[^']*'/, "$1'dsh-agent-compact-region'", '范围压缩 command-compact-region ')
  else once(/^( *)- id: command-compact\n\1  name: '@deepseek-ai\/dsh-command-compact'\n/m, (m, pad) => `${m}${pad}- id: command-compact-region\n${pad}  name: 'dsh-agent-compact-region'\n`, '手动压缩 command-compact ')
  return body
}
