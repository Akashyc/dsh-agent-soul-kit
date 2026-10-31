// 换气、compact-region 的本机补丁 + 砚青 preset 展开的回归。
//
// 素材是就地造的小模块（照上游 4606555 里的原样写法，含作者写死的 D:\AI\memory\hub）和 assets/presets/（主仓原样）：
//   1. 每个补丁的锚点都找得到；打完不再有写死作者电脑路径的字符串，语法照样能过；
//      还原回去逐字节相同（更新时比「本机改没改过」靠的就是这一步）
//   2. 路径补丁换上的表达式真能算出「DSH 家目录/dsh-soul/memory/hub/<文件>」
//   3. 砚青四套按作者 build 的算法展开：段内注释不删
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { huanqiPatches, patchText, unpatchText, hubPrefix, AUTHOR_HUB, MAINT_OLD, IDLE_OLD, INPUT_OLD } from '../lib/huanqi-patches.mjs'
import { expandIncludes } from '../lib/soul-presets.mjs'

const KIT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const LIST = huanqiPatches({ huanqi: 'dsh-huanqi', 'compact-region': 'dsh-agent-compact-region' })
const HQ_SRC = [
  "import { appendFileSync } from 'node:fs'",
  'export async function run(agent, svc, manualCtx, target, compactOnce, targetSid, diag) {',
  "        const TRIGGER = 'D:\\\\AI\\\\memory\\\\hub\\\\_huanqi-trigger.json';",
  "                appendFileSync('D:\\\\AI\\\\memory\\\\hub\\\\_plugin-diag.log', 'x');",
  MAINT_OLD,
  IDLE_OLD,
  '                    } catch (e) { diag(e) }',
  '                };',
  '                return [TRIGGER, tryOnce];',
  '}',
  '',
].join('\n')
const CR_SRC = [
  "const LOG = 'D:\\\\AI\\\\memory\\\\hub\\\\_plugin-diag.log'",
  'export function apply(commands, handler) {',
  '      commands.register({',
  "        name: 'compact-region',",
  INPUT_OLD,
  '      })',
  '  return LOG',
  '}',
  '',
].join('\n')
// 去掉 hub-path 后只剩 trigger-idle：作者 10-31 改成不等 idle，那一条在新版上不打（见 tests/fixes.test.mjs）
const FILES = [
  { pkg: 'dsh-huanqi', file: 'lib/index.js', raw: HQ_SRC, hub: 2 },
  { pkg: 'dsh-agent-compact-region', file: 'index.js', raw: CR_SRC, hub: 1 },
]
const QUOTED_AUTHOR_PATH = /['"`]D:[\\/]+AI[\\/]+memory[\\/]+hub/
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'soul-kit-huanqi-'))

for (const f of FILES) {
  test(`${f.pkg}：锚点都在、打完能过语法、还原逐字节相同`, () => {
    const raw = f.raw
    const ps = LIST.filter((p) => p.pkg === f.pkg && p.file === f.file)
    assert.ok(ps.length >= 2)
    assert.equal(raw.split(AUTHOR_HUB).length - 1, f.hub)
    let t = raw
    for (const p of ps) {
      assert.ok(t.includes(p.old), `${p.key} 的锚点不在原文里`)
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
    assert.equal(v, fs.realpathSync(home).replace(/\\/g, '/') + '/dsh-soul/memory/hub/_plugin-diag.log')
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

test('展开时只跳过共享文件开头的说明行，段内注释保留', () => {
  const dir = path.join(KIT, 'assets', 'presets')
  const t = expandIncludes(fs.readFileSync(path.join(dir, 'preset-yanqing.yml'), 'utf8'), dir)
  assert.doesNotMatch(t, /@include/)
  assert.doesNotMatch(t, /唯一的源/)
  assert.match(t, /^ {14}# ★★ compaction: true 是 preset 的硬约束，删不得。$/m)
  assert.match(t, /^ {18}thresholdRatio: 0\.88$/m)
  // 4.0：快照跟上游 4606555，压缩三件套按 dsh-agent-* 引用
  assert.match(t, /name: 'dsh-agent-compaction'/)
  assert.doesNotMatch(t, /dsh-yanqing-/)
})
