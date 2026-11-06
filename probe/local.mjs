#!/usr/bin/env node
// 只读取证：本机现在装成什么样。不写任何文件。
//   node probe/local.mjs [--dsh-home <目录>] [--profile desktop] [--state <安装记录>]
import fs from 'node:fs'
import path from 'node:path'
import { BS, NL, emit, exists, kitVersion, listDir, parseArgs, readJson, resolveHome } from './lib/common.mjs'
import { scanModules } from './lib/modules.mjs'

const opt = parseArgs(process.argv.slice(2))
const home = resolveHome(opt)
const profile = opt['--profile'] || 'desktop'
const profileDir = path.join(home, 'profiles', profile)
const notes = []

/** 已装插件：和 prereqs 共用一份扫描（scoped 包也要认到）。 */
function installedPackages(dir) {
  const list = scanModules(dir)
  if (list === null) return []
  return list
    .map((item) => ({ dir: item.dir, name: item.name || null }))
    .sort((a, b) => a.dir.localeCompare(b.dir))
}

function patchFiles(dir) {
  const entries = listDir(dir)
  if (!entries) return []
  return entries
    .filter((entry) => entry.isFile() && (entry.name === 'cordis.patch.yml' || entry.name.endsWith('.cordis.patch.json')))
    .map((entry) => entry.name)
    .sort()
}

function walkSkills(dir, prefix, out) {
  const entries = listDir(dir)
  if (!entries) return
  for (const entry of entries) {
    const rel = prefix ? prefix + '/' + entry.name : entry.name
    if (entry.isDirectory()) walkSkills(path.join(dir, entry.name), rel, out)
    else if (entry.name === 'SKILL.md') out.push(rel)
  }
}

function logsSummary(dir) {
  const entries = listDir(dir)
  if (!entries) return { dir, readable: false, files: 0, latestAt: null }
  let files = 0
  let latest = 0
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
    files++
    try {
      const at = fs.statSync(path.join(dir, entry.name)).mtimeMs
      if (at > latest) latest = at
    } catch {
      // 读不到时间不算错，继续数文件
    }
  }
  return { dir, readable: true, files, latestAt: latest ? new Date(latest).toISOString() : null }
}

function packageManager(dir) {
  if (exists(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm'
  if (exists(path.join(dir, 'yarn.lock'))) return 'yarn'
  if (exists(path.join(dir, 'package-lock.json'))) return 'npm'
  return null
}

const statePath = opt['--state']
  ? path.resolve(opt['--state'])
  : path.join(home, 'dsh-soul', '.install-state.json')
const state = readJson(statePath)
if (!exists(statePath)) notes.push('没有安装记录：' + statePath + '（范围不可知，不能用零代替未检查）')
else if (state.error) notes.push('安装记录读不出来：' + state.error)

const skills = []
walkSkills(path.join(profileDir, 'skills'), '', skills)

emit({
  kitVersion: kitVersion(),
  dshHome: home,
  profile,
  platform: process.platform,
  arch: process.arch,
  nodeVersion: process.versions.node,
  packageManager: packageManager(profileDir),
  profileDirExists: exists(profileDir),
  installState: {
    path: statePath,
    exists: exists(statePath),
    upstream: state.value && state.value.upstream ? state.value.upstream : null,
    parts: state.value && Array.isArray(state.value.parts) ? state.value.parts : null,
    declined: state.value && Array.isArray(state.value.declined) ? state.value.declined : null,
  },
  installedPackages: installedPackages(path.join(profileDir, 'node_modules')),
  patchFiles: patchFiles(profileDir),
  presetSkills: skills.sort(),
  soulData: {
    exists: exists(path.join(home, 'dsh-soul')),
    memoryHub: exists(path.join(home, 'dsh-soul', 'memory', 'hub')),
  },
  logs: logsSummary(path.join(home, 'logs')),
  notes,
})