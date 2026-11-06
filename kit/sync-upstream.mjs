#!/usr/bin/env node
// 同步作者上游到 upstream/ 下面。任何操作之前先跑这个。
//   node kit/sync-upstream.mjs [--repo <url>] [--dir upstream/dsh-agent-soul] [--branch main]
// 只做三件事：没有就 clone、有就 fetch、能快进就快进。
// 不 force、不 reset、不 stash：本地有改动就停下来报。
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { NL, emit, exists, kitRoot, parseArgs } from '../probe/lib/common.mjs'

const DEFAULT_REPO = 'https://github.com/cyanwell/dsh-agent-soul'
const opt = parseArgs(process.argv.slice(2))
const repo = opt['--repo'] || DEFAULT_REPO
const branch = opt['--branch'] || 'main'
const dir = path.resolve(opt['--dir'] || path.join(kitRoot(), 'upstream', 'dsh-agent-soul'))

function git(args, cwd) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' })
}

function shortSha(text) {
  const value = String(text || '').trim()
  return value ? value.slice(0, 7) : null
}

const notes = []

// 一、没有就 clone
if (!exists(dir)) {
  const parent = path.dirname(dir)
  // 父目录可能不存在（upstream/ 被清过）：先建，否则 git 会报一个看不出原因的错。
  fs.mkdirSync(parent, { recursive: true })
  const result = git(['clone', '--branch', branch, repo, dir], parent)
  if (result.status !== 0) {
    emit({
      ok: false,
      action: 'clone',
      repo,
      dir,
      notes: ['clone 失败：' + (result.stderr || '').trim().split(NL).slice(0, 2).join(' / ')],
    })
    process.exit(0)
  }
  const head = git(['rev-parse', 'HEAD'], dir)
  emit({
    ok: true,
    action: 'clone',
    repo,
    dir,
    branch,
    after: shortSha(head.stdout),
    notes: ['上游已取到本机，后续用 --source ' + dir + ' 读它'],
  })
  process.exit(0)
}

// 二、是 git 仓库吗；不是就别装懂
const probe = git(['rev-parse', '--is-inside-work-tree'], dir)
if (probe.status !== 0 || probe.stdout.trim() !== 'true') {
  emit({ ok: false, action: 'skip', dir, notes: ['目录存在但不是 git 仓库：不覆盖、不删，请人工确认'] })
  process.exit(0)
}

// 三、本地有改动就停——不 stash、不 reset
const dirty = git(['status', '--porcelain'], dir)
if (dirty.status === 0 && dirty.stdout.trim() !== '') {
  emit({
    ok: false,
    action: 'blocked',
    dir,
    notes: ['上游目录有本地改动：先处理，不覆盖'],
    changed: dirty.stdout.trim().split(NL).slice(0, 10),
  })
  process.exit(0)
}

const before = shortSha(git(['rev-parse', 'HEAD'], dir).stdout)
const fetch = git(['fetch', '--prune', 'origin', branch], dir)
if (fetch.status !== 0) {
  emit({ ok: false, action: 'fetch', dir, before, notes: ['fetch 失败：' + (fetch.stderr || '').trim().split(NL).slice(0, 2).join(' / ')] })
  process.exit(0)
}

const remoteRef = 'origin/' + branch
const behind = git(['rev-list', '--count', 'HEAD..' + remoteRef], dir)
const ahead = git(['rev-list', '--count', remoteRef + '..HEAD'], dir)
const behindCount = Number(behind.stdout.trim() || 0)
const aheadCount = Number(ahead.stdout.trim() || 0)

if (aheadCount > 0) {
  emit({
    ok: false,
    action: 'diverged',
    dir,
    before,
    ahead: aheadCount,
    behind: behindCount,
    notes: ['本地有 ' + aheadCount + ' 个提交不在上游：不合并、不动它'],
  })
  process.exit(0)
}

if (behindCount === 0) {
  emit({ ok: true, action: 'up-to-date', dir, branch, before, behind: 0, notes: ['上游没有新提交'] })
  process.exit(0)
}

// 四、能快进就快进；不能就报，不硬来
const pull = git(['merge', '--ff-only', remoteRef], dir)
if (pull.status !== 0) {
  emit({
    ok: false,
    action: 'pull-failed',
    dir,
    before,
    behind: behindCount,
    notes: ['快进失败：' + (pull.stderr || '').trim().split(NL).slice(0, 2).join(' / ')],
  })
  process.exit(0)
}

const after = shortSha(git(['rev-parse', 'HEAD'], dir).stdout)
const range = git(['log', '--oneline', before + '..' + after], dir)
const commits = range.status === 0 ? range.stdout.trim().split(NL).filter(Boolean) : []

emit({
  ok: true,
  action: 'fast-forward',
  dir,
  branch,
  before,
  after,
  commits: commits.slice(0, 20),
  commitCount: commits.length,
  notes: commits.length > 20 ? ['提交较多，只列前 20 条'] : [],
})