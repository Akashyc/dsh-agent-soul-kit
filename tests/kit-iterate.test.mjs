import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 写入测试素材，所有副作用限制在本用例的临时目录。
 * @param root 临时素材根目录
 * @param file 素材相对路径
 * @param value 文本或 JSON 对象
 */
function put(root, file, value) {
  const target = path.join(root, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value, null, 2))
}

/**
 * 创建两个上游快照和独立 kit，避免测试改动真实安装或仓库状态。
 * @param t Node 测试上下文，负责回收本用例临时目录
 * @returns 路径与命令执行、报告读取方法
 */
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'soul-kit-iterate-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const kit = path.join(root, 'kit 中文')
  const base = path.join(root, 'base')
  const target = path.join(root, 'target')
  const output = path.join(root, 'reports')
  const dsh = path.join(root, 'uninstalled-dsh')
  fs.mkdirSync(kit)
  fs.copyFileSync(path.join(ROOT, 'install.mjs'), path.join(kit, 'install.mjs'))
  fs.cpSync(path.join(ROOT, 'lib'), path.join(kit, 'lib'), { recursive: true })
  for (const source of [base, target]) {
    put(source, 'package.json', { name: 'dsh-agent-soul', version: '1.0.0', files: ['index.js', 'kit', 'tools'] })
    put(source, 'README.md', '# Fixture upstream\n')
    put(source, 'cordis.patch.yml', '- insert: []\n')
    put(source, 'index.js', 'throw new Error("上游代码不能在报告生成期间执行")\n')
    for (const file of ['kit/echo/install-kit.mjs', 'kit/echo/scaffold.mjs', 'tools/init.mjs', 'tools/verify-client-ids.mjs']) {
      put(source, file, 'throw new Error("报告只能读取源码")\n')
    }
    put(source, 'kit/templates/SELF.src.md', '# SELF\n')
    put(source, 'plugins/clock/package.json', { name: 'dsh-agent-clock', files: ['client.js'] })
    put(source, 'plugins/clock/client.js', 'open ? h("div", { style: panelStyle }, h(ClockPanel)) : null);\n')
  }
  const run = (args) => spawnSync(process.execPath, [path.join(kit, 'install.mjs'), ...args], {
    cwd: kit, encoding: 'utf8', timeout: 20000, maxBuffer: 4 * 1024 * 1024
  })
  const prepare = (extra = []) => {
    const result = run(['--kit-iterate', '--base-source', base, '--source', target, '--out', output, '--dsh-home', dsh, ...extra])
    assert.equal(result.status, 0, result.stderr || result.stdout)
    const names = fs.readdirSync(output).sort()
    const directory = path.join(output, names.at(-1))
    return { directory, report: JSON.parse(fs.readFileSync(path.join(directory, 'report.json'), 'utf8')), output: result.stdout }
  }
  return { root, kit, base, target, output, dsh, run, prepare }
}

/**
 * 给素材创建本地提交，让基线登记测试拥有真实且干净的提交身份。
 * @param directory 临时 Git 仓库
 * @returns 提交号
 */
function commitFixture(directory) {
  const args = ['-C', directory, '-c', 'user.name=Kit Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=disabled-hooks']
  for (const command of [['init', '-q'], ['add', '-A'], ['commit', '-qm', 'fixture']]) {
    const result = spawnSync('git', [...args, ...command], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
  }
  return spawnSync('git', ['-C', directory, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim()
}

/**
 * 填充模拟完成记录；仅测试登记契约，不表示真实四流程已经验收。
 * @param directory 本用例报告目录
 * @returns 模拟记录，供失败用例修改
 */
function completeResult(directory) {
  const result = JSON.parse(fs.readFileSync(path.join(directory, 'result.json'), 'utf8'))
  result.summary = '测试登记协议，非真实上游验收'
  result.checks = [{ id: 'fixture', scope: 'simulated', command: 'fixture acceptance', status: 'passed', evidence: '本用例的模拟检查通过' }]
  result.flows = result.flows.map((flow) => ({ ...flow, decision: 'unchanged', reason: '测试素材不改生产流程', evidence: ['target/index.js'], checks: ['fixture'] }))
  result.findings = result.findings.map((finding) => ({ ...finding, decision: 'not-applicable', reason: '这是只验证报告协议的缩减素材' }))
  result.limitations = ['没有验证真实 DSH 桌面']
  put(directory, 'result.json', result)
  return result
}

test('离线报告保留完整增删改证据，覆盖四流程且不操作 DSH', (t) => {
  const f = fixture(t)
  put(f.base, 'kit/echo/old-store.mjs', 'old')
  put(f.target, 'kit/echo/new-store.mjs', 'new')
  put(f.target, 'README.md', '# changed contract')
  put(f.target, 'unclassified-new-file.txt', 'unknown change')
  const { directory, report } = f.prepare()
  assert.ok(report.changes.some((item) => item.kind === 'removed' && item.file === 'kit/echo/old-store.mjs'))
  assert.ok(report.changes.some((item) => item.kind === 'added' && item.file === 'kit/echo/new-store.mjs'))
  assert.ok(report.changes.some((item) => item.kind === 'changed' && item.file === 'README.md'))
  assert.deepEqual(report.flows.map((flow) => flow.id), ['install', 'update', 'backup', 'restore'])
  assert.ok(report.flows.every((flow) => flow.files.includes('unclassified-new-file.txt')))
  assert.equal(fs.readFileSync(path.join(directory, 'base/kit/echo/old-store.mjs'), 'utf8'), 'old')
  assert.equal(fs.readFileSync(path.join(directory, 'target/kit/echo/new-store.mjs'), 'utf8'), 'new')
  assert.equal(fs.existsSync(f.dsh), false)
  assert.equal(fs.existsSync(path.join(f.kit, 'kit-iteration.json')), false)
  assert.equal(report.kitUpdate.status, 'skipped')
  assert.match(report.kitUpdate.reason, /离线上游检查/)
})

test('新零件、未知包名、包契约变化、失效补丁和缺失文件都进入报告', (t) => {
  const f = fixture(t)
  put(f.target, 'plugins/new-panel/package.json', { name: 'new-panel' })
  put(f.target, 'plugins/echo/package.json', { name: 'unrecognized-echo' })
  put(f.target, 'plugins/clock/client.js', 'changed implementation')
  put(f.target, 'package.json', { name: 'dsh-agent-soul', files: ['different-directory'] })
  fs.unlinkSync(path.join(f.target, 'tools/init.mjs'))
  const { report } = f.prepare()
  for (const kind of ['new-part', 'package-name', 'package-contract', 'patch-anchor', 'missing-file']) {
    assert.ok(report.findings.some((finding) => finding.kind === kind), kind)
  }
})

test('发布清单自洽：只把目标里新出现的漏列 files、漏声明 peerDependencies 列为契约提示', (t) => {
  const f = fixture(t)
  for (const source of [f.base, f.target]) {
    put(source, 'plugins/compaction/package.json', { name: 'dsh-agent-compaction', main: 'index.js', files: ['index.js'] })
    put(source, 'plugins/compaction/index.js', "import { toolPairingBalancedBefore } from '@deepseek-ai/dsh-compaction'\n")
  }
  put(f.target, 'plugins/memory/package.json', { name: 'dsh-agent-memory', main: 'lib/index.js', files: ['lib'] })
  put(f.target, 'plugins/memory/lib/index.js', "import { createUserMessage } from '@deepseek-ai/dsh-llm'\n")
  put(f.target, 'index.js', "import './lib/helper.js'\n")
  put(f.target, 'lib/helper.js', 'export {}\n')
  const { report } = f.prepare()
  const peer = report.findings.filter((finding) => finding.kind === 'package-peer')
  const integrity = report.findings.filter((finding) => finding.kind === 'package-integrity')
  assert.deepEqual(peer.map((finding) => finding.file), ['plugins/memory/package.json'])
  assert.match(peer[0].message, /@deepseek-ai\/dsh-llm/)
  assert.deepEqual(integrity.map((finding) => finding.file), ['package.json'])
  assert.match(integrity[0].message, /lib\/helper\.js/)
  assert.ok(!report.findings.some((finding) => /@deepseek-ai\/dsh-compaction\b/.test(finding.message)), '基线已有的漏声明不重复列出')
})

test('目标清单损坏会报告问题，不把迭代检查变成安装器的提前退出', (t) => {
  const f = fixture(t)
  put(f.target, 'plugins/clock/package.json', '{invalid')
  assert.ok(f.prepare().report.findings.some((finding) => finding.kind === 'invalid-package'))
  put(f.target, 'plugins/clock/package.json', 'null')
  assert.ok(f.prepare().report.findings.some((finding) => finding.kind === 'invalid-package'))
})

test('相同源码仍保留四流程待审记录，不自动宣布已经兼容', (t) => {
  const f = fixture(t)
  const { directory, report } = f.prepare()
  assert.equal(report.changes.length, 0)
  const result = JSON.parse(fs.readFileSync(path.join(directory, 'result.json'), 'utf8'))
  assert.ok(result.flows.every((flow) => flow.decision === 'pending'))
})

test('干跑不创建报告、安装日志或迭代基线', (t) => {
  const f = fixture(t)
  const result = f.run(['--kit-iterate', '--base-source', f.base, '--source', f.target, '--out', f.output, '--dry-run'])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(fs.existsSync(f.output), false)
  assert.equal(fs.existsSync(path.join(f.kit, 'logs')), false)
  assert.equal(fs.existsSync(path.join(f.kit, 'kit-iteration.json')), false)
})

test('互斥模式与缺失参数在执行前拒绝，离线检查不会偷偷下载基线', (t) => {
  const f = fixture(t)
  for (const args of [['--kit-iterate', '--update'], ['--kit-iterate', '--questions'], ['--kit-accept'], ['--base-ref', 'main']]) {
    assert.equal(f.run(args).status, 2, args.join(' '))
  }
  for (const option of ['--base-ref', '--base-source', '--source', '--ref', '--out']) {
    assert.equal(f.run(['--kit-iterate', option]).status, 2, option)
  }
  const result = f.run(['--kit-iterate', '--source', f.target])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /同时提供 --base-source/)
})

test('未完成记录不能登记；完成后推进审查基线，保留证据且不改 VERIFIED', (t) => {
  const f = fixture(t)
  const sha = commitFixture(f.target)
  const before = fs.readFileSync(path.join(f.kit, 'install.mjs'), 'utf8')
  const { directory } = f.prepare()
  assert.equal(f.run(['--kit-accept', directory]).status, 1)
  completeResult(directory)
  assert.equal(f.run(['--kit-accept', directory, '--dry-run']).status, 0)
  assert.equal(fs.existsSync(path.join(f.kit, 'kit-iteration.json')), false)
  const accepted = f.run(['--kit-accept', directory])
  assert.equal(accepted.status, 0, accepted.stderr)
  const state = JSON.parse(fs.readFileSync(path.join(f.kit, 'kit-iteration.json'), 'utf8'))
  assert.equal(state.baseline.sha, sha)
  assert.equal(state.history[0].flows.length, 4)
  assert.equal(state.history[0].checks[0].scope, 'simulated')
  assert.equal(fs.readFileSync(path.join(f.kit, 'install.mjs'), 'utf8'), before)
  assert.equal(f.prepare().report.base.ref, sha)
})

test('任一流程阻塞、验证失败或契约提示未处理，都不能推进基线', (t) => {
  const f = fixture(t)
  commitFixture(f.target)
  const { directory } = f.prepare()
  for (const mutation of [
    (result) => { result.flows[0].decision = 'blocked' },
    (result) => { result.checks[0].status = 'failed' },
    (result) => { result.findings[0].decision = 'pending' },
    (result) => { result.flows[2].checks = ['missing-check'] }
  ]) {
    const result = completeResult(directory)
    mutation(result)
    put(directory, 'result.json', result)
    assert.equal(f.run(['--kit-accept', directory]).status, 1)
    assert.equal(fs.existsSync(path.join(f.kit, 'kit-iteration.json')), false)
  }
})

test('完成登记不会执行结果记录中的命令', (t) => {
  const f = fixture(t)
  commitFixture(f.target)
  const { directory } = f.prepare()
  const result = completeResult(directory)
  result.checks[0].command = 'this-command-must-never-be-executed'
  put(directory, 'result.json', result)
  assert.equal(f.run(['--kit-accept', directory]).status, 0)
})

test('源码快照被修改后拒绝登记', (t) => {
  const f = fixture(t)
  commitFixture(f.target)
  const { directory } = f.prepare()
  completeResult(directory)
  put(directory, 'target/README.md', 'tampered')
  const result = f.run(['--kit-accept', directory])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /源码快照已变化/)
})

test('另一份报告推进基线后，旧报告不能覆盖新状态', (t) => {
  const f = fixture(t)
  commitFixture(f.target)
  const first = f.prepare()
  const second = f.prepare()
  completeResult(first.directory)
  completeResult(second.directory)
  assert.equal(f.run(['--kit-accept', first.directory]).status, 0)
  const result = f.run(['--kit-accept', second.directory])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /过期报告/)
})

test('未知提交和有未提交改动的本地源码只能分析，不能登记为基线', (t) => {
  const f = fixture(t)
  const unknown = f.prepare()
  completeResult(unknown.directory)
  assert.equal(f.run(['--kit-accept', unknown.directory]).status, 1)
  commitFixture(f.target)
  put(f.target, 'README.md', '# uncommitted')
  const dirty = f.prepare()
  assert.equal(dirty.report.target.clean, false)
  completeResult(dirty.directory)
  assert.equal(f.run(['--kit-accept', dirty.directory]).status, 1)
})

test('损坏的历史基线明确报错，不静默回退', (t) => {
  const f = fixture(t)
  put(f.kit, 'kit-iteration.json', { format: 1, repo: 'another/repo', baseline: { sha: 'a'.repeat(40) }, history: [] })
  const result = f.run(['--kit-iterate', '--base-source', f.base, '--source', f.target])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /格式或上游仓库不匹配/)
})

test('两个归档独立解压并保留各自提交号，避免基线被目标覆盖', (t) => {
  const f = fixture(t)
  const baseSha = commitFixture(f.base)
  put(f.target, 'README.md', '# archive target')
  const targetSha = commitFixture(f.target)
  const archives = []
  for (const [name, source] of [['base', f.base], ['target', f.target]]) {
    const archive = path.join(f.root, `${name}.tar.gz`)
    const result = spawnSync('git', ['-C', source, 'archive', '--format=tar.gz', '--prefix=upstream/', '-o', archive, 'HEAD'], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    archives.push(archive)
  }
  const prepared = f.run(['--kit-iterate', '--base-source', archives[0], '--source', archives[1], '--out', f.output])
  assert.equal(prepared.status, 0, prepared.stderr)
  const directory = path.join(f.output, fs.readdirSync(f.output)[0])
  const report = JSON.parse(fs.readFileSync(path.join(directory, 'report.json'), 'utf8'))
  assert.equal(report.base.sha, baseSha)
  assert.equal(report.target.sha, targetSha)
  assert.ok(report.changes.some((item) => item.file === 'README.md'))
  assert.equal(fs.readFileSync(path.join(directory, 'base/README.md'), 'utf8'), '# Fixture upstream\n')
  completeResult(directory)
  assert.equal(f.run(['--kit-accept', directory]).status, 0)
})

test('原有 help 和 questions 入口仍可用', (t) => {
  const f = fixture(t)
  const help = f.run(['--help'])
  assert.equal(help.status, 0)
  assert.match(help.stdout, /--kit-iterate/)
  const questions = f.run(['--questions', '--dsh-home', f.dsh])
  assert.equal(questions.status, 0, questions.stderr)
  assert.ok(Array.isArray(JSON.parse(questions.stdout).questions))
})
