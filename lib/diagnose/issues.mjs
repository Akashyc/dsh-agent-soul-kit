import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { readJson } from '../core/io.mjs'

const EMPTY = { format: 2, kit: null, issues: {} }

/**
 * 本机清单：这台机器认识哪些问题（怎么认、怎么修、作者修好长什么样），
 * 以及见到过什么（第一次/最后一次见到、状态、退役时间）。
 * 全部在 <DSH 家目录>/dsh-soul/fix/<profile>/issues.json，不进仓库，每台机器各攒各的。
 * @param file 清单文件路径
 */
export function loadIssues(file) {
  const stored = readJson(file)
  if (stored && stored.format === 2 && stored.issues && typeof stored.issues === 'object' && !Array.isArray(stored.issues)) return stored
  if (stored) throw new Error('问题清单格式不支持；保留原文件，不自动重置')
  // format 1 是旧的 ledger.json，只有历史没有条目：丢掉不迁移
  return structuredClone(EMPTY)
}

export function saveIssues(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const body = { format: 2, kit: value.kit || null, issues: value.issues || {} }
  const stage = file + '.' + crypto.randomBytes(6).toString('hex') + '.tmp'
  try {
    fs.writeFileSync(stage, JSON.stringify(body, null, 2) + '\n', { flag: 'wx' })
    fs.renameSync(stage, file)
  } finally { fs.rmSync(stage, { force: true }) }
  return file
}

/**
 * 一条清单条目该有的样子。Agent 登记时只写左边这些，右边由工具每轮刷新。
 * 缺字段不报错 —— 缺什么就是「不知道」，判定时按 unknown 处理，绝不猜。
 */
export const ENTRY_FIELDS = ['title', 'sig', 'scope', 'upstreamFile', 'line', 'problem', 'solution', 'authorFixed', 'impact', 'when', 'verify', 'kind', 'file', 'pkg']

/** 登记或更新一条。Agent 用这个写清单，不手改 JSON。 */
export function putIssue(issues, id, entry, at) {
  if (!id || !/^[a-zA-Z0-9][\w-]*$/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id)) throw new Error('id 只能用字母数字横线：' + id)
  for (const key of ['file', 'upstreamFile']) {
    if (entry[key] !== undefined && (typeof entry[key] !== 'string' || path.isAbsolute(entry[key]) || entry[key].split(/[\\/]/).includes('..'))) throw new Error(key + ' 必须为根目录内的相对路径')
  }
  if (entry.sig) { try { new RegExp(entry.sig) } catch { throw new Error('sig 不是合法正则') } }
  const previous = issues.issues[id] || {}
  issues.issues[id] = {
    ...previous,
    ...Object.fromEntries(ENTRY_FIELDS.filter((key) => entry[key] !== undefined).map((key) => [key, entry[key]])),
    id,
    state: previous.state || 'open',
    firstSeen: previous.firstSeen || at,
    lastSeen: at,
  }
  return issues.issues[id]
}

/** 每轮把见到的时间刷一遍；退役的不再刷新。 */
export function touchIssues(issues, at) {
  for (const entry of Object.values(issues.issues)) {
    if (entry.state === 'retired') continue
    entry.lastSeen = at
  }
  return issues
}

/**
 * 状态迁移：调用方判定为 retired 的条目，由这里落章（时间、作者提交、cleanup）。
 * 已经落过章的不重复处理 —— 退役是单向的，不该在后续运行里被反复刷新。
 */
export function retireIssues(issues, at, authorSha) {
  const retired = []
  for (const [id, entry] of Object.entries(issues.issues)) {
    if (entry.state !== 'retired') {
      for (const key of ['retiredAt', 'retiredBy', 'authorSha', 'cleanup']) delete entry[key]
      continue
    }
    if (entry.retiredAt) continue
    entry.state = 'retired'
    entry.retiredAt = at
    entry.retiredBy = 'author'
    entry.authorSha = authorSha
    entry.cleanup = entry.solution ? 'pending' : 'none'
    retired.push({ id, ...entry })
  }
  return retired
}

/** 已退役但本地旧补丁还在的：清掉了才置 done。 */
export function refreshCleanup(issues, localMarker) {
  const pending = []
  for (const entry of Object.values(issues.issues)) {
    if (entry.state !== 'retired' || entry.cleanup !== 'pending') continue
    if (!localMarker(entry)) entry.cleanup = 'done'
    else pending.push(entry)
  }
  return pending
}
