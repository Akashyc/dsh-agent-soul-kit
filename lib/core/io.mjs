import fs from 'node:fs'
import path from 'node:path'

export const exists = (file) => fs.existsSync(file)
export const readText = (file) => fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')

/** 读取 JSON；只有文件不存在时才返回空值，损坏文件必须报错。 */
export function readJson(file) {
  if (!exists(file)) return null
  try {
    return JSON.parse(readText(file))
  } catch (error) {
    throw new Error(`无法读取 JSON：${file}（${error.message}）`)
  }
}