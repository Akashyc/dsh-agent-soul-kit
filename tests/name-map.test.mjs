// 称呼替换（lib/name-map.mjs）：只换上游作者的称呼、换进去的称呼不能弄坏代码、原目录不动、认得出手工改过的称呼。
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { AUTHOR_NAMES, parseNameMap, validateNameMap, applyNameMap, renameTree, guessNameMap, sameNameMap, nameMapLabel } from '../lib/name-map.mjs'

const A = AUTHOR_NAMES[0]

test('解析：命令行写法、对象写法、none 都认；只许换上游作者的称呼', () => {
  assert.deepEqual(parseNameMap(`${A}=Boss`), { map: { [A]: 'Boss' }, errors: [] })
  assert.deepEqual(parseNameMap({ [A]: '老板' }).errors, [])
  assert.deepEqual(parseNameMap('none').map, {})
  assert.deepEqual(parseNameMap(undefined).map, {})
  assert.match(parseNameMap('砚青=大肥鱼').errors.join(), /只认上游作者的称呼/)
  assert.match(parseNameMap('Boss').errors.join(), /上游称呼=你的称呼/)
  assert.match(parseNameMap(`${A}=`).errors.join(), /没写/)
})

test('换进代码的称呼不能带引号、反引号、反斜杠、$、换行和首尾空格', () => {
  for (const bad of ["Bo'ss", 'Bo"ss', 'Bo`ss', 'Bo\\ss', 'Bo$s', 'Bo\nss', ' Boss', 'x'.repeat(25), `我是${A}`]) {
    assert.ok(validateNameMap({ [A]: bad }).length, bad)
  }
  for (const good of ['Boss', '老板', '张 三', 'Mr.Wang']) assert.deepEqual(validateNameMap({ [A]: good }), [], good)
})

test('替换：所有出现处都换；sameNameMap 不管键顺序；标签可读', () => {
  assert.equal(applyNameMap(`告诉${A}「需要手动压缩」；'${A}说', '${A}问'`, { [A]: 'Boss' }), "告诉Boss「需要手动压缩」；'Boss说', 'Boss问'")
  assert.equal(applyNameMap('没有作者名', { [A]: 'Boss' }), '没有作者名')
  assert.ok(sameNameMap({}, undefined))
  assert.ok(!sameNameMap({ [A]: 'Boss' }, {}))
  assert.equal(nameMapLabel({ [A]: 'Boss' }), `「${A}」→「Boss」`)
})

test('renameTree：复制后只改文本文件，原目录、.git、视频不动', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'soul-kit-names-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const src = path.join(root, 'src')
  const put = (f, v) => { fs.mkdirSync(path.dirname(path.join(src, f)), { recursive: true }); fs.writeFileSync(path.join(src, f), v) }
  put('kit/echo/mo.mjs', `// ${A} 定的规矩\nconsole.log('由${A}指定')\n`)
  put('soul/11-self.md', `★ ${A} 的原话\n`)
  put('plugins/huanqi/lib/index.js', `'③ 落完就停，告诉${A}「需要手动压缩」。'\n`)
  put('README.md', '没有作者名\n')
  put('assets/logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  put('.git/HEAD', `ref: ${A}\n`)
  put('plugins/yantai/demo/intro.mp4', 'video')
  const out = path.join(root, 'out')
  const changed = renameTree(src, out, { [A]: 'Boss' }, /(^|\/)(\.DS_Store|\.git|node_modules)(\/|$)|\.(mp4|mov|webm)$/i)
  assert.deepEqual(changed, ['kit/echo/mo.mjs', 'plugins/huanqi/lib/index.js', 'soul/11-self.md'])
  assert.match(fs.readFileSync(path.join(out, 'plugins/huanqi/lib/index.js'), 'utf8'), /告诉Boss/)
  assert.match(fs.readFileSync(path.join(src, 'plugins/huanqi/lib/index.js'), 'utf8'), new RegExp(`告诉${A}`))
  assert.equal(fs.existsSync(path.join(out, '.git')), false)
  assert.equal(fs.existsSync(path.join(out, 'plugins/yantai/demo/intro.mp4')), false)
  assert.deepEqual([...fs.readFileSync(path.join(out, 'assets/logo.png'))], [0x89, 0x50, 0x4e, 0x47])
})

test('认得出手工改过的称呼：本机文本恰好等于上游原文换名后的样子才算', () => {
  const raw = `// ${A} 定的\nconst x = '${A}说'\n`
  const pairs = [
    { raw, local: raw.split(A).join('Boss') },
    { raw: `${A}问`, local: 'Boss问' },
    { raw: `${A} 和别的改动`, local: 'Boss 和别的改动，还加了一句' },
    { raw: '没有作者名', local: '没有作者名' },
  ]
  assert.deepEqual(guessNameMap(pairs, ['Boss', undefined, null]), { from: A, to: 'Boss', count: 2 })
  assert.equal(guessNameMap(pairs, ['老板']), null)
  assert.equal(guessNameMap(pairs, ["Bo'ss"]), null)
})
