/**
 * 对生成物做三方核对，只有作者原文、已知 kit 结果才允许覆盖。
 * @param options upstream 作者版；target 本次期望结果；installed 本机全文；record 上次原文与结果；freeze 是否保持
 * @returns 目标、动作和可持久化的还原记录
 */
export function planManagedText({ upstream, target, installed, record, freeze = false, legacy = [] }) {
  if (freeze) return { target: installed, action: 'keep', record }
  const known = installed == null || installed === upstream || installed === target
    || installed === record?.applied || installed === record?.upstream || legacy.includes(installed)
  if (!known) return { target: installed, action: 'local', record }
  const action = installed === target ? 'keep' : target === upstream ? 'revert' : 'apply'
  return { target, action, record: { upstream, applied: target } }
}

/**
 * 配置修复只记录发生变化的行，不复制 profile 中的其他设置。
 * @param before 修复前全文
 * @param after 修复后全文，行数必须相同
 * @returns 原行和修后行组成的还原证据
 */
export function changedLines(before, after) {
  const a = before.split('\n')
  const b = after.split('\n')
  if (a.length !== b.length) throw new Error('配置修复不能改变行数')
  return a.flatMap((line, index) => line === b[index] ? [] : [{ before: line, after: b[index] }])
}

/**
 * 只撤回换气节中仍等于 kit 写入值的行，用户修改过的行保留。
 * @param text profile 全文
 * @param changes 先前保存的行级证据
 * @returns 还原文本及是否发现本机改动
 */
export function revertConfigLines(text, changes = []) {
  const lines = text.split('\n')
  const start = lines.findIndex((line) => /^- id: ['"]?huanqi['"]?\s*$/.test(line))
  if (start < 0) return { text, local: changes.length > 0 }
  let end = lines.findIndex((line, index) => index > start && /^- /.test(line))
  if (end < 0) end = lines.length
  const block = lines.slice(start, end)
  for (const change of changes) {
    if (block.includes(change.before)) continue
    const matches = block.flatMap((line, index) => line === change.after ? [index] : [])
    if (matches.length !== 1) return { text, local: true }
    block[matches[0]] = change.before
  }
  return { text: [...lines.slice(0, start), ...block, ...lines.slice(end)].join('\n'), local: false }
}

/**
 * 摘要路由缺 key 时，即使默认 provider 相同也需要跟会话模型走。
 * @param text 已读取的会话日志文本；不返回或记录日志内容
 * @returns 是否存在明确的无 API key 错误
 */
export function hasMissingApiKey(text) {
  return /no API key\b|missing API key\b|API key (?:is )?(?:not configured|missing)/i.test(text)
}
