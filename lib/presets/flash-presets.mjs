// Flash 预设按上游目录发现；只适配身份和门牌压缩，其余规则、参数保留原文。
import fs from 'node:fs'
import path from 'node:path'
import { PART_NAMES } from '../install/parts.mjs'

export const FLASH_REPO = 'LarryE135/dsh-flash-presets'
// 保留旧选择值兼容已有方案；现在代表整组，不再是生成的 preset id。
export const FLASH_PRESET_ID = 'soul-ptc-flash'
export const FLASH_LABEL = '灵魂 · Flash（上游全部预设）'
export const FLASH_ADAPTATION = '灵魂适配：压缩、裁剪换成带门牌的版本，补上范围压缩；其余规则和参数保留上游原文。'
export const LEGACY_FLASH_SOURCE_ID = 'flash-lean-ptc-v3'

/** 识别整组选择值和动态生成的 Flash id。 */
export const isFlashPresetId = (id) => id === FLASH_PRESET_ID || /^soul-flash-[\w-]+$/.test(id || '')

// shortcut: 没有宿主 YAML 解析器时只接受明确单行标量；复杂元数据须提供 js-yaml。
function scalar(block, key, required = true) {
  const match = block.match(new RegExp(`^ {8}${key}: ([^\\n]*)$`, 'm'))
  if (!match) {
    if (!required) return ''
    throw new Error(`Flash preset 缺少 config.${key}`)
  }
  const value = match[1].trim()
  if (value.startsWith('"')) return JSON.parse(value)
  if (/^'.*'$/.test(value)) return value.slice(1, -1).replace(/''/g, "'")
  if (!value || /^[>|[{&*!]/.test(value) || /\s#/.test(value)) throw new Error(`Flash config.${key} 需要宿主的 js-yaml 解析器`)
  return value
}

/**
 * 发现 presets/ 下所有实际声明的 agent preset，不依赖文件名、显示名或数量。
 * @param directory 已下载的作者仓库目录
 * @param parse 宿主 YAML 解析器；无解析器时仅接受明确的单行元数据
 * @returns 含上游身份、原始简介、源文件及块文本的目录
 */
export function readFlashPresets(directory, { parse = null } = {}) {
  const root = path.resolve(directory, 'presets')
  if (!fs.existsSync(root) || !fs.lstatSync(root).isDirectory()) throw new Error('Flash 源码缺少真实的 presets/ 目录，不接受目录符号链接')
  const presets = []
  const seen = new Set()
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`Flash presets/ 不接受符号链接：${entry.name}`)
      if (entry.isDirectory()) {
        walk(file)
        continue
      }
      if (!entry.isFile() || !/\.ya?ml$/i.test(entry.name)) continue
      const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
      const document = parse ? parse(text) : null
      const expected = parse
        ? (Array.isArray(document) ? document : []).flatMap((row) => row?.insert || [row]).filter((row) => row?.name === '@deepseek-ai/dsh-agent-preset').length
        : [...text.matchAll(/^\s*name: ['"]?@deepseek-ai\/dsh-agent-preset['"]?\s*$/gm)].length
      const countBefore = presets.length
      for (const part of text.split(/(?=^ {4}- id: )/m).slice(1)) {
        const lines = part.split('\n')
        const end = lines.findIndex((line, index) => index > 0 && /^\S/.test(line))
        const block = (end < 0 ? lines : lines.slice(0, end)).join('\n').trimEnd() + '\n'
        if (!/^ {6}name: ['"]?@deepseek-ai\/dsh-agent-preset['"]?\s*$/m.test(block)) continue
        const config = parse ? parse('- insert:\n' + block)?.[0]?.insert?.[0]?.config : {
          id: scalar(block, 'id'), name: scalar(block, 'name'), description: scalar(block, 'description', false)
        }
        if (!config || typeof config.id !== 'string' || !/^[\w-]+$/.test(config.id) || typeof config.name !== 'string' || !config.name.trim()) throw new Error(`Flash preset 身份无效：${file}`)
        if (config.description !== undefined && typeof config.description !== 'string') throw new Error(`Flash preset 简介必须是文本：${config.id}`)
        if (seen.has(config.id)) throw new Error(`Flash preset id 重复：${config.id}`)
        seen.add(config.id)
        presets.push({
          sourceId: config.id,
          id: 'soul-' + (config.id.startsWith('flash-') ? config.id : 'flash-' + config.id),
          label: '灵魂 · ' + config.name,
          sourceDescription: config.description || '',
          description: [config.description, FLASH_ADAPTATION].filter(Boolean).join('\n\n'),
          file: path.relative(directory, file).split(path.sep).join('/'),
          text: block
        })
      }
      if (presets.length - countBefore !== expected) throw new Error(`Flash preset 结构无法完整识别：${file}；不会跳过部分预设继续安装`)
    }
  }
  walk(root)
  if (!presets.length) throw new Error('Flash presets/ 里没有可迁移的 agent preset')
  if (new Set(presets.map((preset) => preset.id)).size !== presets.length) throw new Error('Flash 适配后的 preset id 冲突')
  return presets
}

/**
 * 按目录元数据适配单个 preset，压缩零件使用本次 Soul 源码中的实际包名。
 * @param preset readFlashPresets 返回的条目
 * @param names 本次源代码的零件包名，直接调用时默认当前已知包名
 * @returns 与 Soul preset 相同缩进的配置块
 */
export function adaptFlash(preset, names = Object.fromEntries(Object.entries(PART_NAMES).map(([part, list]) => [part, list[0]]))) {
  let body = preset.text
  const once = (re, to, what) => {
    const count = [...body.matchAll(new RegExp(re.source, re.flags.replace('g', '') + 'g'))].length
    if (count !== 1) throw new Error(`Flash ${preset.sourceId} 结构变了：${what}应该正好 1 处，实际 ${count} 处`)
    body = body.replace(re, typeof to === 'function' ? to : () => to)
  }
  for (const part of ['compaction', 'pruner', 'compact-region']) if (!PART_NAMES[part].includes(names[part])) throw new Error(`Flash 压缩零件包名未核实：${part}=${names[part]}`)
  once(/^ {4}- id: preset-[\w-]+$/m, '    - id: preset-' + preset.id, '声明行')
  once(/^ {8}id: .*$/m, '        id: ' + preset.id, 'preset id')
  once(/^ {8}name: .*$/m, '        name: ' + JSON.stringify(preset.label), '显示名')
  if (/^ {8}description:/m.test(body)) {
    once(/^ {8}description:[^\n]*(?:\n(?: {10,}[^\n]*|[ \t]*(?=\n|$)))*/m, '        description: ' + JSON.stringify(preset.description), '简介')
  } else {
    body = body.replace(/^ {8}name: .*$/m, (line) => line + '\n        description: ' + JSON.stringify(preset.description))
  }
  once(/name: ['"]@deepseek-ai\/dsh-compaction-basic['"]/, 'name: ' + JSON.stringify(names.compaction), '压缩零件')
  once(/name: ['"]@deepseek-ai\/dsh-compaction-tool-result-pruner['"]/, 'name: ' + JSON.stringify(names.pruner), '裁剪零件')
  if (/^ *- id: command-compact-region$/m.test(body)) {
    once(/(- id: command-compact-region\n *name: )['"][^'"]*['"]/, (_, prefix) => prefix + JSON.stringify(names['compact-region']), '范围压缩')
  } else {
    once(/^( *)- id: command-compact\n\1  name: ['"]@deepseek-ai\/dsh-command-compact['"]\n/m, (line, pad) => `${line}${pad}- id: command-compact-region\n${pad}  name: ${JSON.stringify(names['compact-region'])}\n`, '手动压缩')
  }
  return body
}
