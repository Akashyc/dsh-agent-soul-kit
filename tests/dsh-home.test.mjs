// --dsh-home 回归：显式指定的家目录没有 profile 时必须停下，不能静默回落到 ~/.dsh。
// 旧行为会跳过这个候选、继续找下一个，真跑时把文件写进真实 DSH 家目录。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const KIT = path.resolve(import.meta.dirname, '..')
const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'soul-kit-home-')))

const run = (home) => spawnSync(process.execPath, [path.join(KIT, 'install.mjs'), '--setup', '大肥鱼', '--dry-run', '--dsh-home', home], {
  cwd: KIT,
  encoding: 'utf8',
  env: { ...process.env, DSH_HOME: '', HTTP_PROXY: '', HTTPS_PROXY: '' },
})

test('--dsh-home 指向空目录：明确失败，不回落真实家目录', () => {
  const dir = tmp()
  try {
    const r = run(dir)
    const out = (r.stdout || '') + (r.stderr || '')
    assert.notEqual(r.status, 0, '应当非零退出')
    assert.match(out, /--dsh-home 指的是/, '应当指出是 --dsh-home 指定的目录')
    assert.match(out, /profiles[\\/]desktop/, '应当给出缺的是哪个 profile')
    assert.match(out, /不回落/, '应当说明没有回落到别的家目录')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('--dsh-home 指向不存在的路径：同样明确失败', () => {
  const missing = path.join(tmp(), 'not-created')
  try {
    const r = run(missing)
    const out = (r.stdout || '') + (r.stderr || '')
    assert.notEqual(r.status, 0)
    assert.match(out, /--dsh-home 指的是/)
  } finally {
    fs.rmSync(path.dirname(missing), { recursive: true, force: true })
  }
})