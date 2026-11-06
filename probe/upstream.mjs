#!/usr/bin/env node
// 只读取证：作者上游这一版长什么样。不写任何文件，不执行上游脚本。
//   node probe/upstream.mjs --source <作者仓库目录> [--sha <提交号>]
import path from 'node:path'
import { emit, exists, parseArgs } from './lib/common.mjs'
import { gitInfo, scanHeadings, scanParts, walkRel } from './lib/tree.mjs'

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
  parts: found.list,
  presets,
  templates,
  installDocHeadings,
  requiredFiles,
  fileCount: all.length,
  notes,
})