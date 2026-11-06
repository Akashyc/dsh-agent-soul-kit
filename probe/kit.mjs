#!/usr/bin/env node
// kit 自己的指纹。只回答一个问题：**这份 kit 的代码变过没有。**
//
// 为什么不看 package.json 的 version：
//   版本号是**发布动作**，只在发版时由仓库主人改。改代码不发版是常态，
//   拿版本号当指纹会得出「kit 没变」，于是更新时照着旧结论走。
//
//   node probe/kit.mjs            # { version, fingerprint, files }
//   node probe/kit.mjs --files    # 连每个文件的哈希一起给
import { emit, kitRoot, kitVersion, parseArgs } from './lib/common.mjs'
import { kitFingerprint } from './lib/kitfp.mjs'

const opt = parseArgs(process.argv.slice(2))
const info = kitFingerprint(kitRoot())

const out = {
  version: kitVersion(),
  fingerprint: info.fingerprint,
  fileCount: info.fileCount,
  note: '指纹只算 kit/ 与 probe/ 的源码（不含 selftest、data、upstream）：它回答「代码变过没有」，不回答「发版没有」',
}
if (opt['--files']) out.files = info.files
emit(out)
