import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
const exists = (file) => fs.existsSync(file)

/** 检查本次安装的 heartbeat 任务或迁移记录，防止运行中撤回配套脚本。 */
export function heartbeatInUse(home, hub) {
  if (process.platform !== 'darwin') return false
  const label = 'com.dsh-soul.heartbeat.mac.' + crypto.createHash('sha256').update(path.resolve(home)).digest('hex').slice(0, 12)
  return exists(path.join(os.homedir(), 'Library/LaunchAgents', label + '.plist'))
    || exists(path.join(process.env.YQ_HB_DIR || path.join(hub, 'heartbeat/runtime'), 'kit-migration.json'))
}
