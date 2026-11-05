import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrationPlan, applyMigration } from '../lib/core/migrate-data.mjs'

const kit = fileURLToPath(new URL('../', import.meta.url))
try {
  const values = {}, assignments = []
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i], value = process.argv[i + 1]
    if (!['--dsh-home', '--profile', '--assign', '--apply'].includes(key) || !value || value.startsWith('--')) throw new Error('用法：--dsh-home <目录> [--profile desktop] [--assign <旧归档项>]；执行审阅后的计划：--apply <计划.json>')
    if (key === '--assign') assignments.push(path.resolve(value))
    else { if (values[key]) throw new Error('参数重复：' + key); values[key] = value }
  }
  if (values['--apply']) {
    if (Object.keys(values).length !== 1 || assignments.length) throw new Error('--apply 不与其它选项混用')
    const plan = JSON.parse(fs.readFileSync(values['--apply'], 'utf8'))
    if (path.resolve(plan.kit) !== path.resolve(kit)) throw new Error('计划属于另一个 kit 目录')
    console.log(JSON.stringify(applyMigration(plan), null, 2))
  } else {
    if (!values['--dsh-home']) throw new Error('请明确指定 --dsh-home；默认清点不写文件')
    console.log(JSON.stringify(migrationPlan(kit, values['--dsh-home'], values['--profile'] || 'desktop', assignments), null, 2))
  }
} catch (error) { console.error(error.message); process.exitCode = 1 }
