import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { acquireInstallLock } from '../lib/install-lock.mjs'
import { beginFileTransaction } from '../lib/file-transaction.mjs'
import { prepareIteration, acceptIteration } from '../lib/kit-iterate.mjs'
import { memoryConfigPaths, resolveConfigPath, samePath } from '../lib/home-paths.mjs'

const kit = fileURLToPath(new URL('../', import.meta.url))

test('通用路径配置保留 POSIX 和 Windows 路径规则', () => {
  assert.deepEqual(memoryConfigPaths('/tmp/.dsh/./dsh-soul/memory/hub', '/tmp/.dsh', true), {
    selfPath: 'dsh-soul/memory/hub/SELF.md', statePath: 'dsh-soul/memory/hub/state.json', relative: true
  })
  assert.equal(memoryConfigPaths(String.raw`C:\Users\User\.dsh\dsh-soul\memory\hub`, 'c:/users/user/.dsh', true).relative, true)
  assert.equal(resolveConfigPath('dsh-soul/memory/hub/SELF.md', 'C:/Users/User/.dsh'), 'C:/Users/User/.dsh/dsh-soul/memory/hub/SELF.md')
  assert.equal(samePath('C:/Users/User/.dsh', 'c:/users/user/.dsh'), true)
  assert.equal(samePath('/Users/User/.dsh', '/users/user/.dsh'), false)
})

test('旧修复参数明确退出，独立版本不混入安装问答', () => {
  for (const flag of ['--fix', '--fix-only', '--fix-skip', '--fix-revert', '--report', '--plan', '--summary-model']) {
    const result = spawnSync(process.execPath, [path.join(kit, 'install.mjs'), flag], { encoding: 'utf8' })
    assert.equal(result.status, 2, flag + result.stderr)
    assert.match(result.stdout + result.stderr, /dsh-agent-soul-fix/)
  }
  const result = spawnSync(process.execPath, [path.join(kit, 'install.mjs'), '--questions'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.ok(JSON.parse(result.stdout).questions.every((question) => !['fixSkip', 'summaryModel'].includes(question.id)))
})

test('kit 和 fix 协议的安装写锁拒绝并发，通用事务仍能回滚', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kit-lock-')))
  try {
    const release = acquireInstallLock(root)
    assert.throws(() => acquireInstallLock(root), /写锁/)
    release()
    const file = path.join(root, 'config.yml')
    fs.writeFileSync(file, 'before')
    const transaction = beginFileTransaction(path.join(root, 'archive'), [file])
    fs.writeFileSync(file, 'after')
    transaction.rollback()
    assert.equal(fs.readFileSync(file, 'utf8'), 'before')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('kit 迭代与完成登记无需修复清单或 fixChanges', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kit-iteration-')))
  try {
    const source = path.join(root, 'source')
    fs.mkdirSync(source)
    fs.writeFileSync(path.join(source, 'package.json'), '{"name":"fixture"}')
    fs.writeFileSync(path.join(root, 'install.mjs'), "const KIT_VERSION = '6.0'\n")
    const hashDir = (directory) => new Map(fs.readdirSync(directory, { recursive: true })
      .filter((file) => fs.statSync(path.join(directory, file)).isFile())
      .map((file) => [file, fs.readFileSync(path.join(directory, file), 'utf8')]))
    const { directory } = await prepareIteration({
      kit: root, repo: 'fixture/repo', version: '6.0', verified: { sha: '1'.repeat(40) }, ref: 'main',
      contract: { requiredFiles: [], partNames: {}, optionalSource: [] },
      helpers: {
        getSource: async () => ({ dir: source, sha: '1'.repeat(40), local: false, from: '模拟源码' }),
        hashDir, diffMaps: () => ({ added: [], changed: [], removed: [] }), packFiles: () => ['package.json']
      }
    })
    const report = JSON.parse(fs.readFileSync(path.join(directory, 'report.json'), 'utf8'))
    assert.equal(Object.hasOwn(report, 'fixes'), false)
    const resultFile = path.join(directory, 'result.json')
    const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'))
    assert.equal(Object.hasOwn(result, 'fixChanges'), false)
    result.summary = 'kit 生命周期迭代门禁模拟'
    result.flows = result.flows.map((flow) => ({ ...flow, decision: 'unchanged', reason: '模拟源码无变化', evidence: ['package.json'], checks: ['gate'] }))
    result.checks = [{ id: 'gate', scope: 'simulated', status: 'passed', command: 'node --test tests/lifecycle.test.mjs', evidence: '报告结构和快照断言通过' }]
    fs.writeFileSync(resultFile, JSON.stringify(result))
    acceptIteration({ kit: root, repo: 'fixture/repo', directory, hashDir })
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'kit-iteration.json'), 'utf8')).history.length, 1)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
