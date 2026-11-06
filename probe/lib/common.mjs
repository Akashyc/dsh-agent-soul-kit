import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

/** 换行符常量：避免在源码里写转义，跨平台也只看 LF（JSONL 规范如此）。 */
export const NL = String.fromCharCode(10)
/** 反斜杠常量：Windows 路径归一化用，避免正则转义踩坑。 */
export const BS = String.fromCharCode(92)

/** 工具包根目录。 */
export function kitRoot() {
  return path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
}

/** 读 package.json 里的版本号；读不到就返回 null，不编造。 */
export function kitVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(kitRoot(), 'package.json'), 'utf8')).version || null
  } catch {
    return null
  }
}

/** 极简参数解析：--key value / --key。不需要第三方库。 */
export function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const item = argv[i]
    if (item.startsWith('--')) {
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        out[item] = next
        i++
      } else {
        out[item] = true
      }
    } else {
      out._.push(item)
    }
  }
  return out
}

/** 默认 DSH 家目录：--dsh-home > DSH_HOME > ~/.dsh。 */
export function resolveHome(opt) {
  const explicit = opt['--dsh-home'] || process.env.DSH_HOME
  return path.resolve(explicit || path.join(os.homedir(), '.dsh'))
}

export function exists(target) {
  try {
    fs.accessSync(target)
    return true
  } catch {
    return false
  }
}

export function readText(file) {
  return fs.readFileSync(file, 'utf8')
}

/** 读 JSON；失败返回 null 并留下原因，绝不猜。 */
export function readJson(file) {
  try {
    return { value: JSON.parse(readText(file).replace(/^\uFEFF/, '')), error: null }
  } catch (error) {
    return { value: null, error: error.message }
  }
}

export function listDir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }
}

/** 只读输出：JSON 打到 stdout。 */
export function emit(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + NL)
}