import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { cachedSource, localSource } from './source-cache.mjs'
import { extractTarGz } from './tar.mjs'
import { git, githubRepo } from '../iterate/kit-update.mjs'

export function resolveAuthor({ kit, explicit, update, ref, log = () => {} }) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-diagnose-source-'))
  try {
    const directory = explicit ? path.resolve(explicit) : path.join(path.dirname(kit), 'dsh-agent-soul')
    if (!explicit && !update) {
      const hooks = path.join(temp, 'check-hooks')
      fs.mkdirSync(hooks)
      if (githubRepo(git(directory, ['config', '--get', 'remote.origin.url'], { hooks }).text) !== 'cyanwell/dsh-agent-soul'
        || git(directory, ['symbolic-ref', '--short', 'HEAD'], { hooks }).text !== 'main') {
        throw new Error('默认作者来源的 origin 或 main 分支不匹配；保留目录，停止诊断')
      }
    }
    const source = explicit || !update
      ? localSource(directory, temp, ref || 'HEAD', /(^|\/)(\.git|node_modules)(\/|$)/)
      : cachedSource({ kit, repo: 'cyanwell/dsh-agent-soul', ref: ref || 'main', temp, log })
    if (!source.sha) throw new Error('诊断需要可验证提交的干净 Git 来源，不把普通目录当作者版本')
    const snapshot = source.archive ? extractTarGz(source.archive, temp) : source
    return { dir: snapshot.dir, sha: source.sha, cleanup: () => fs.rmSync(temp, { recursive: true, force: true }) }
  } catch (error) {
    fs.rmSync(temp, { recursive: true, force: true })
    throw error
  }
}
