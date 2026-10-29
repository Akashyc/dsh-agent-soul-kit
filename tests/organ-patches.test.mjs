// organs 零件（换气、compact-region）的本机补丁 + 砚青 preset 展开与作者哈希的回归。
//
// 断言的都是安装包快照 assets/parts/（organs 原样）和 assets/presets/（主仓原样）：
//   1. 每个补丁的锚点在快照里都找得到、次数对；打完不再有写死作者电脑路径的字符串，语法照样能过；
//      还原回去和快照逐字节相同（更新时比「本机改没改过」靠的就是这一步）
//   2. 路径补丁换上的表达式真能算出「DSH 家目录/dsh-soul/memory/hub/<文件>」
//   3. 砚青四套按作者 build 的算法展开后，哈希和作者 soul-version.json 逐套对上；段内注释没被删
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { organPatches, patchText, unpatchText, hubPrefix, AUTHOR_HUB } from '../lib/organ-patches.mjs'
import { expandIncludes, readSoulVersion, checkPresetDigests } from '../lib/soul-presets.mjs'

const KIT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PARTS = path.join(KIT, 'assets', 'parts')
const NAMES = { huanqi: 'dsh-huanqi', 'compact-region': 'dsh-yanqing-compact-region' }
const LIST = organPatches(NAMES)
const FILES = [
  { pkg: 'dsh-huanqi', file: 'lib/index.js', src: path.join(PARTS, 'huanqi', 'lib', 'index.js'), hub: 7 },
  { pkg: 'dsh-yanqing-compact-region', file: 'index.js', src: path.join(PARTS, 'compact-region', 'index.js'), hub: 1 },
]
const QUOTED_AUTHOR_PATH = /['"`]D:[\\/]+AI[\\/]+memory[\\/]+hub/
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'soul-kit-organ-'))

test('快照记着 organs 的提交号，零件齐', () => {
  const src = JSON.parse(fs.readFileSync(path.join(PARTS, 'SOURCE.json'), 'utf8'))
  assert.equal(src.repo, 'cyanwell/dsh-agent-organs')
  assert.match(src.sha, /^[0-9a-f]{40}$/)
  for (const p of src.parts) assert.ok(fs.existsSync(path.join(PARTS, p, 'package.json')), p)
})

test('换气按 dsh-huanqi 落地：organs 包名是 dsh-agent-huanqi，安装时改名', () => {
  const pj = JSON.parse(fs.readFileSync(path.join(PARTS, 'huanqi', 'package.json'), 'utf8'))
  assert.equal(pj.name, 'dsh-agent-huanqi')
  assert.match(fs.readFileSync(path.join(PARTS, 'huanqi', 'lib', 'index.js'), 'utf8'), /\/compact-region/)
})

for (const f of FILES) {
  test(`${f.pkg}：锚点都在、打完能过语法、还原逐字节相同`, () => {
    const raw = fs.readFileSync(f.src, 'utf8')
    const ps = LIST.filter((p) => p.pkg === f.pkg && p.file === f.file)
    assert.ok(ps.length >= 2)
    assert.equal(raw.split(AUTHOR_HUB).length - 1, f.hub, '作者写死路径的处数变了')
    let t = raw
    for (const p of ps) {
      assert.ok(t.includes(p.old), `${p.key} 的锚点不在快照里`)
      assert.equal(p.any.test(t), false, `${p.key} 打之前就被认成已打`)
      if (p.fixed) assert.equal(p.fixed.test(t), false, `${p.key} 打之前就被认成上游已修`)
      t = patchText(t, p)
      assert.ok(p.any.test(t), `${p.key} 打完认不出来`)
    }
    assert.doesNotMatch(t, QUOTED_AUTHOR_PATH)
    const dir = tmp(), out = path.join(dir, 'patched.mjs')
    fs.writeFileSync(out, t)
    const r = spawnSync(process.execPath, ['--check', out], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    assert.equal(unpatchText(t, ps), raw)
    fs.rmSync(dir, { recursive: true, force: true })
  })
}

test('路径补丁算出来的是 DSH 家目录下的记忆中枢', async () => {
  const home = tmp()
  const modDir = path.join(home, 'profiles', 'desktop', 'node_modules', 'dsh-huanqi', 'lib')
  fs.mkdirSync(modDir, { recursive: true })
  const f = path.join(modDir, 'probe.mjs')
  fs.writeFileSync(f, `export const v = ${hubPrefix()}_plugin-diag.log'\n`)
  const saved = process.env.DSH_HOME
  delete process.env.DSH_HOME
  try {
    const { v } = await import(pathToFileURL(f).href)
    assert.equal(v, home.replace(/\\/g, '/') + '/dsh-soul/memory/hub/_plugin-diag.log')
  } finally {
    if (saved !== undefined) process.env.DSH_HOME = saved
    fs.rmSync(home, { recursive: true, force: true })
  }
})

test('patchText 不把 $& 当替换模式；all 时每处都换', () => {
  const p = { old: 'X', new: '$&-$1', all: true }
  assert.equal(patchText('aXbX', p), 'a$&-$1b$&-$1')
  assert.equal(patchText('aXbX', { ...p, all: false }), 'a$&-$1bX')
})

test('砚青四套按作者算法展开，哈希和 soul-version.json 逐套对上', () => {
  const v = readSoulVersion(null)
  assert.ok(v && v.presets.length === 4)
  assert.deepEqual(v.contracts, { doorplate: 1, recall: 1, record: 1 })
  const r = checkPresetDigests(path.join(KIT, 'assets', 'presets'), v)
  assert.deepEqual(r.mismatch, [])
  assert.deepEqual(r.missing, [])
  assert.equal(r.match.length, 4)
})

test('展开时只跳过共享文件开头的说明行，段内注释保留', () => {
  const dir = path.join(KIT, 'assets', 'presets')
  const t = expandIncludes(fs.readFileSync(path.join(dir, 'preset-yanqing.yml'), 'utf8'), dir)
  assert.doesNotMatch(t, /@include/)
  assert.doesNotMatch(t, /唯一的源/)
  assert.match(t, /^ {14}# ★★ compaction: true 是 preset 的硬约束，删不得。$/m)
  assert.match(t, /^ {18}thresholdRatio: 0\.88$/m)
})