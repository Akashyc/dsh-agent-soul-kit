// 发布清单自洽检查（lib/package-contract.mjs）：入口沿相对导入走到的文件必须在 files 里；用到的 @deepseek-ai/* 要声明 peerDependencies。
// 素材照上游 2026-10-28 记录的两种真实漏法：compaction 漏声明 @deepseek-ai/dsh-compaction、某包 files 漏列 lib。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { entryFiles, inspectPackage, describeIssue } from '../lib/package-contract.mjs'

/**
 * 在临时目录里搭一个包，所有副作用留在本用例里。
 * @param t 测试上下文，负责清理
 * @param files 相对路径到内容（对象按 JSON 写）
 * @returns 包目录
 */
function pkg(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'soul-kit-contract-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  for (const [file, value] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    fs.writeFileSync(path.join(dir, file), typeof value === 'string' ? value : JSON.stringify(value, null, 2))
  }
  return dir
}

test('入口：exports 里的 JS（含条件导出）和 main，跳过通配、类型声明和 package.json', (t) => {
  const dir = pkg(t, { 'lib/index.js': '' })
  const pj = { main: 'lib/index.js', exports: { '.': { types: './lib/types/index.d.ts', default: './lib/index.js' }, './client': './client.js', './tools/*': './tools/*', './package.json': './package.json' } }
  assert.deepEqual(entryFiles(pj, dir), ['client.js', 'lib/index.js'])
  assert.deepEqual(entryFiles({}, pkg(t, { 'index.js': '' })), ['index.js'])
  assert.deepEqual(entryFiles({}, pkg(t, { 'client.js': '' })), [])
})

test('files 漏列入口导入的目录：报 unshipped；源码里也没有的报 missing；沿导入链往下查', (t) => {
  const dir = pkg(t, {
    'package.json': { name: 'dsh-agent-memory', main: 'index.js', files: ['index.js', 'lib/a.js'] },
    'index.js': "import { a } from './lib/a.js'\nimport './gone.js'\nexport { a }\n",
    'lib/a.js': "export * from './b.js'\nexport const a = 1\n",
    'lib/b.js': 'export const b = 2\n',
  })
  const issues = inspectPackage(dir, ['index.js', 'lib/a.js', 'package.json'])
  assert.deepEqual(issues.map((x) => [x.kind, x.file, x.target]).sort(), [['missing', 'index.js', 'gone.js'], ['unshipped', 'lib/a.js', 'lib/b.js']])
  assert.match(describeIssue('dsh-agent-memory', issues.find((x) => x.kind === 'unshipped')), /不在 package\.json 的 files 里/)
})

test('入口文件本身没进发布清单也会报出来', (t) => {
  const dir = pkg(t, { 'package.json': { name: 'p', main: 'lib/index.js', files: ['README.md'] }, 'lib/index.js': '' })
  assert.deepEqual(inspectPackage(dir, ['package.json']).map((x) => [x.kind, x.file, x.target]), [['unshipped', 'package.json', 'lib/index.js']])
})

test('用到 @deepseek-ai/* 却没声明：报 peer；声明在 peer 或 dependencies 里、子路径导入、注释里的写法都不误报', (t) => {
  const source = [
    '/**',
    " * 说明里写的 import X from '@deepseek-ai/only-in-comment' 不算",
    ' */',
    "import BasicCompactionEngine from '@deepseek-ai/dsh-compaction-basic'",
    "import { toolPairingBalancedBefore } from '@deepseek-ai/dsh-compaction'",
    "import z from '@deepseek-ai/schemastery'",
    "import { list } from '@deepseek-ai/dsh-tool-subagent-control/list-agents'",
    "const lazy = () => import('@deepseek-ai/dsh-lazy')",
    'export default BasicCompactionEngine',
  ].join('\n')
  const base = { name: 'dsh-agent-compaction', main: 'index.js', files: ['index.js'], dependencies: { '@deepseek-ai/schemastery': '^3' }, peerDependencies: { '@deepseek-ai/dsh-compaction-basic': '*', '@deepseek-ai/dsh-tool-subagent-control': '*' } }
  const before = inspectPackage(pkg(t, { 'package.json': base, 'index.js': source }), ['index.js', 'package.json'])
  assert.deepEqual(before.map((x) => [x.kind, x.spec]).sort(), [['peer', '@deepseek-ai/dsh-compaction'], ['peer', '@deepseek-ai/dsh-lazy']])
  const fixed = { ...base, peerDependencies: { ...base.peerDependencies, '@deepseek-ai/dsh-compaction': '*', '@deepseek-ai/dsh-lazy': '*' } }
  assert.deepEqual(inspectPackage(pkg(t, { 'package.json': fixed, 'index.js': source }), ['index.js', 'package.json']), [])
})

test('不在入口导入链上的文件（测试、作者工具）不参与检查，指向包外的导入不判定', (t) => {
  const dir = pkg(t, {
    'package.json': { name: 'dsh-agent-soul', main: 'index.js', files: ['index.js', 'plugins/'] },
    'index.js': "import '../outside.js'\nexport default 1\n",
    'plugins/compaction/index.js': "import { x } from '@deepseek-ai/dsh-compaction'\n",
  })
  assert.deepEqual(inspectPackage(dir, ['index.js', 'package.json', 'plugins/compaction/index.js']), [])
})
