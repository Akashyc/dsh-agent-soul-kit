// 换气面板（dsh-yanqing-huanqi-panel）本机补丁：profile 里没有 `- id: huanqi` 节时，自动补一节。
//
// 背景（2026-10-26 实机）：
//   换气本体是 bundle 层用 `- insert: - id: huanqi` 装进来的，profile 的 cordis.patch.yml
//   本来就没有这一节 —— 它只是「要调参数时才写」的覆盖层。面板的 applyValues() 却只在
//   【已有的节】上做字节级编辑，locate() 找不到就抛「没有 `- id: huanqi` 这一节」，
//   于是新装的机器第一次点保存必然失败；界面上还完全看不出来（GET 拿到 found:false 也照样渲染表单）。
//
// 修法：locate 为空时按同样的格式补一节（空 config + 一个等价默认值 ledgerPath: ''），
//   再走原来的字节级编辑。不重新序列化、不动其它行，文件末尾不留空行。
//   上游若已自行修好，install.mjs 按 FIXED 认出来，跳过。
//
// 这个文件同时被 install.mjs（patchList）和 tests/huanqi-panel-patch.test.mjs 使用，
// 保证「安装时打的补丁」和「测试断言的补丁」是同一份文本。

export const OLD = [
  'function applyValues(text, values) {',
  '  const loc = locate(text)',
  "  if (!loc) throw new Error('这份 cordis.patch.yml 里没有 `- id: huanqi` 这一节，不敢动它')",
].join('\n')

export const NEW = [
  'function applyValues(text, values) {',
  '  let loc = locate(text)',
  '  if (!loc) {',
  '    // ★ 本机修（2026-10-26）：换气是 bundle 层 `- insert: - id: huanqi` 装进来的，profile 层本来就没有这一节。',
  '    //   面板只会在【已有的节】上改值，于是第一次保存必然报错。没有就补一节：空 config + 一个等价的默认值，',
  '    //   之后照常走字节级编辑，不重新序列化。',
  "    const nl = text.includes('\\r\\n') ? '\\r\\n' : '\\n'",
  '    const body = text.replace(/\\s*$/, \'\')',
  "    text = (body ? body + nl : '') + '- id: huanqi' + nl + '  config:' + nl + \"    ledgerPath: ''\"",
  '    loc = locate(text)',
  "    if (!loc) throw new Error('这份 cordis.patch.yml 里写不进 `- id: huanqi` 这一节（文件结构异常），不敢动它')",
  '  }',
].join('\n')

// 已打过：applyValues 开头已经是「let loc + if (!loc) {」并且带建节的字符串
export const ANY = /let loc = locate\(text\)\s*\n\s*if \(!loc\) \{[\s\S]{0,600}?- id: huanqi/

// 上游自己修了：出现了拼节用的那行字符串
export const FIXED = /['"]- id: huanqi['"]\s*\+\s*nl/

/** 纯文本进出：给出打过补丁的新文本。不碰磁盘。 */
export function apply(text) {
  if (ANY.test(text)) return { text, changed: false, reason: 'already' }
  if (!text.includes(OLD)) return { text, changed: false, reason: 'anchor-missing' }
  return { text: text.replace(OLD, NEW), changed: true, reason: 'applied' }
}
