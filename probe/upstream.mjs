#!/usr/bin/env node
// 只读取证：作者上游这一版长什么样。不写任何文件，不执行上游脚本。
//   node probe/upstream.mjs --source <作者仓库目录> [--sha <提交号>]
import path from 'node:path'
import { emit, exists, parseArgs } from './lib/common.mjs'
import { gitInfo, scanHeadings, scanParts, walkRel } from './lib/tree.mjs'
import { scanCatalog, scanMustInstall, scanPresets } from './lib/upstream-docs.mjs'

const opt = parseArgs(process.argv.slice(2))
const source = opt['--source'] ? path.resolve(opt['--source']) : null
const notes = []

if (!source) {
  emit({ source: null, readable: false, notes: ['没有给 --source：上游结构不可知，不能用空值代替未检查'] })
  process.exit(0)
}
if (!exists(source)) {
  emit({ source, readable: false, notes: ['来源目录不存在：' + source] })
  process.exit(0)
}

const all = walkRel(source)

const found = scanParts(source)
if (found.missing) notes.push('上游没有 plugins/ 目录，零件清单为空')

const presets = all.filter((file) => file.startsWith('presets/') && (file.endsWith('.yml') || file.endsWith('.yaml')))

// 必装 / 层 / 说明：全部从上游文档读，kit 不留常量清单。
// 读不出来就 null + note —— 拿常量顶替等于把作者的决定换成本机的猜测。
const must = scanMustInstall(path.join(source, 'README.md'), found.list)
const catalog = scanCatalog(path.join(source, 'plugins', '清单.md'))
const presetMeta = scanPresets(path.join(source, 'presets'))
if (!must.found) notes.push('「全局必装」读不出来：' + must.reason + '（必装集合未判定，不许当 0 条）')
if (!catalog.found) notes.push('零件说明读不出来：' + catalog.reason + '（未判定）')
if (!presetMeta.found) notes.push('preset 元数据读不出来：' + presetMeta.reason + '（只有文件名可用）')

const mustDirs = new Set(must.rows.flatMap((row) => row.parts))
const layerOf = (dir, name) => {
  for (const layer of catalog.layers) {
    if (layer.parts.includes(dir) || (name && layer.parts.includes(name))) return layer.id + ' ' + layer.name
  }
  return null
}
const enriched = found.list.map((part) => {
  const note = catalog.notes[part.dir] || (part.name && catalog.notes[part.name]) || null
  return {
    ...part,
    mustInstall: mustDirs.has(part.dir),
    layer: layerOf(part.dir, part.name),
    what: note ? note.what : null,
    without: note ? note.without : null,
    required: note ? note.required : null,
    prereq: note ? note.prereq : null,
    documented: Boolean(note),
  }
})
const undocumented = enriched.filter((part) => !part.documented).map((part) => part.dir)
if (undocumented.length) notes.push('清单.md 里没写到的零件：' + undocumented.join(', ') + '（说明留空，不编）')
const templates = all.filter((file) => file.startsWith('templates/'))

const installDoc = path.join(source, 'AGENT-INSTALL.md')
const installDocHeadings = scanHeadings(installDoc)
if (!installDocHeadings.length) notes.push('上游没有 AGENT-INSTALL.md：安装流程契约没有锚点')

const requiredFiles = ['package.json', 'install.js'].filter((file) => {
  if (exists(path.join(source, file))) return true
  notes.push('上游缺少 ' + file)
  return false
})

const git = gitInfo(source)
const sha = opt['--sha'] || git.sha
if (!sha) notes.push('取不到上游提交号：可以分析结构，但不能据此认定已核对某一版')
if (git.clean === false) notes.push('来源目录有未提交改动：结构可读，但不能当成作者发布的某一版')

emit({
  repo: path.basename(source),
  source,
  readable: true,
  sha,
  clean: git.clean,
  parts: enriched,
  mustInstall: must.found ? must : null,
  layers: catalog.found ? catalog.layers : null,
  presetMeta: presetMeta.found ? presetMeta.list : null,
  presets,
  templates,
  installDocHeadings,
  requiredFiles,
  fileCount: all.length,
  notes,
})