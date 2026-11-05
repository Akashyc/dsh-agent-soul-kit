import fs from 'node:fs'
import path from 'node:path'
import { dshHomeCandidates } from '../core/platform.mjs'
import { exists, readJson } from '../core/io.mjs'
import { validateProfile } from '../core/data-paths.mjs'
export { validateProfile } from '../core/data-paths.mjs'

/**
 * 读这台机器的安装现状：装了哪些零件、装在哪、作者是哪个提交、配置在哪。
 * 只读，不改任何东西。
 * @param options home/profile/runtime/dataDir 覆盖默认位置
 */
export function readContext(options) {
  const profile = options.profile || 'desktop'
  validateProfile(profile)
  const candidates = dshHomeCandidates(options.home && path.resolve(options.home))
  const home = (options.home ? candidates.slice(0, 1) : candidates)
    .find((candidate) => exists(path.join(candidate, 'profiles', profile, 'package.json')))
  if (!home) throw new Error('找不到指定 DSH profile；请先用 kit 安装并核对 --dsh-home')
  const normalizedHome = fs.realpathSync(home)
  const prof = path.join(normalizedHome, 'profiles', profile)
  const nm = path.join(prof, 'node_modules')
  const installFile = path.join(normalizedHome, 'dsh-soul/.install-state.json')
  const install = readJson(installFile)
  if (!install || install.uninstalledAt || !exists(path.join(nm, 'dsh-agent-soul/package.json'))) {
    throw new Error('缺少有效 kit 安装记录或本体，请先使用 kit 安装/更新')
  }
  if (!/^[a-f0-9]{40}$/.test(install.upstream?.sha || '') || install.upstream?.repo !== 'cyanwell/dsh-agent-soul') {
    throw new Error('安装记录缺少可信上游提交或仓库，请先用 kit 更新安装记录')
  }
  if (install.profile && install.profile !== profile) throw new Error('安装记录属于其他 profile，未猜测安装上下文')
  return { home: normalizedHome, profile, prof, nm, install, installFile, logs: path.join(normalizedHome, 'logs') }
}
