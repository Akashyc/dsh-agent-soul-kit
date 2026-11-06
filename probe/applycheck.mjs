#!/usr/bin/env node
// 校验一个 apply 目录是否符合契约。默认只做静态检查，不执行任何脚本。
//   node probe/applycheck.mjs --dir <data/<profile>/<instance>> [--run]
// 加 --run 才会真的执行 apply.mjs --dry，并把它的输出当计划校验。
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { emit, exists, parseArgs, readJson } from './lib/common.mjs'
import { validatePlan } from './lib/plan.mjs'

const opt = parseArgs(process.argv.slice(2))
const dir = opt['--dir'] ? path.resolve(opt['--dir']) : null
const doRun = Boolean(opt['--run'])
const notes = []

if (!dir) {
  emit({ dir, readable: false, notes: ['没有给 --dir：不知道该校验哪一份'] })
  process.exit(0)
}
if (!exists(dir)) {
  emit({ dir, readable: false, notes: ['目录不存在：' + dir] })
  process.exit(0)
}

const checks = []
const check = (name, ok, detail) => checks.push({ name, ok, detail: detail || null })

// 1. 入口脚本存在
const entry = path.join(dir, 'apply.mjs')
check('apply/entry', exists(entry), exists(entry) ? null : '没有 apply.mjs')

// 2. 入口能被解析——语法错的话，等到真跑才发现就太晚了
if (exists(entry)) {
  const syntax = spawnSync(process.execPath, ['--check', entry], { encoding: 'utf8' })
  check('apply/syntax', syntax.status === 0, syntax.status === 0 ? null : (syntax.stderr || '').trim().split(String.fromCharCode(10)).slice(0, 3).join(' / '))
}

// 3. answers.json——选项不能少，少了就是让人在执行时刻补决定
const answersPath = path.join(dir, 'answers.json')
const answers = readJson(answersPath)
check('answers/exists', answers.value !== null, answers.error || null)

// 4. meta.json 的四项指纹
const metaPath = path.join(dir, 'meta.json')
const meta = readJson(metaPath)
const FINGERPRINTS = ['upstream', 'local', 'kit', 'answers']
if (meta.value === null) {
  check('meta/exists', false, meta.error || '没有 meta.json')
} else {
  const missing = FINGERPRINTS.filter((key) => !(key in meta.value))
  check('meta/fingerprints', missing.length === 0, missing.length ? '缺指纹：' + missing.join(', ') : null)
}

// 5. 计划校验：只有显式 --run 才执行
let plan = null
if (!doRun) {
  notes.push('没有执行 apply.mjs：默认只做静态检查。要校验计划加 --run')
} else if (!exists(entry)) {
  notes.push('没有 apply.mjs，无法取计划')
} else {
  const result = spawnSync(process.execPath, [entry, '--dry'], { encoding: 'utf8', timeout: 30000 })
  if (result.error) {
    notes.push('执行 apply.mjs --dry 失败：' + result.error.message)
  } else if (result.status !== 0) {
    notes.push('apply.mjs --dry 退出码 ' + result.status + '：' + (result.stderr || '').trim().split(String.fromCharCode(10)).slice(0, 3).join(' / '))
  } else {
    const parsed = readJsonText(result.stdout)
    if (!parsed.ok) {
      notes.push('apply.mjs --dry 的输出不是 JSON：' + parsed.error)
    } else {
      plan = validatePlan(parsed.value)
    }
  }
}

/** 从字符串解析 JSON；失败留原因。 */
function readJsonText(text) {
  try {
    return { ok: true, value: JSON.parse(String(text).trim()), error: null }
  } catch (error) {
    return { ok: false, value: null, error: error.message }
  }
}

const failed = checks.filter((item) => !item.ok)
if (failed.length === 0 && plan && plan.ok) notes.push('契约符合：静态检查全过，计划合法')
if (failed.length) notes.push('有 ' + failed.length + ' 项静态检查不合格：先修这些，再谈执行')

emit({
  dir,
  readable: true,
  checks,
  plan,
  ok: failed.length === 0 && (plan === null || plan.ok),
  executed: doRun,
  notes,
})