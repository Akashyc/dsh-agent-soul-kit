#!/usr/bin/env node
// 跑检测层 P0 检查，把发现打成人读的列表。只读，不写任何东西。
//   node scripts/scan-report.mjs [--dsh-home <目录>] [--profile desktop]
import fs from 'node:fs'
import path from 'node:path'
import { scanStatic } from '../lib/diagnose/scan.mjs'

const argv = process.argv.slice(2)
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d }
const home = opt('--dsh-home', process.env.DSH_HOME || path.join(process.env.HOME || '', '.dsh'))
const profile = opt('--profile', 'desktop')

const stateFile = path.join(home, 'dsh-soul', '.install-state.json')
let install = {}
try { install = JSON.parse(fs.readFileSync(stateFile, 'utf8')) } catch {
  console.error('读不到安装记录：' + stateFile + '（检测层需要它来定范围）')
  process.exit(2)
}

const { findings, coverage } = scanStatic({ home, profile, install, logs: path.join(home, 'logs') })
console.log('零件 ' + coverage.packages + ' 个 · preset skills ' + coverage.skills + ' 个 · 平台 ' + coverage.platform + ' · 发现 ' + findings.length + ' 条')
for (const f of findings) {
  console.log([f.checkId, f.pkg, f.file + (f.line ? ':' + f.line : ''), f.snippet].join(' | '))
}
if (!findings.length) console.log('（本架构范围内没有命中）')
