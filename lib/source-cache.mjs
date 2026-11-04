import fs from 'node:fs'
import path from 'node:path'
import { git, githubRepo } from './kit-update.mjs'

const refreshed = new Set()
const SHA = /^[0-9a-f]{40}$/

/**
 * 核对作者仓库身份与工作区，拒绝覆盖本地改动或误用其它仓库。
 * @param directory 作者仓库目录
 * @param options Git 调用选项，包含临时空钩子目录和代理
 * @param repo 指定时核对 GitHub owner/repo；离线源码不限制来源
 * @returns 当前提交号
 */
function checkRepository(directory, options, repo) {
  if (fs.lstatSync(directory).isSymbolicLink()) {
    throw new Error('作者仓库目录不能是符号链接')
  }
  const top = git(directory, ['rev-parse', '--show-toplevel'], options).text
  if (fs.realpathSync(top) !== fs.realpathSync(directory)) {
    throw new Error('源码目录必须是独立 Git 仓库根目录')
  }
  if (repo && githubRepo(git(directory, ['config', '--get', 'remote.origin.url'], options).text) !== repo.toLowerCase()) {
    throw new Error('同级作者仓库的 origin 不匹配；保留目录，请先核对来源')
  }
  if (git(directory, ['status', '--porcelain', '--untracked-files=all'], options).text) {
    throw new Error('作者仓库有本地改动或未跟踪文件；已停止，不覆盖、不 stash、不重置。请勿在作者源码中做 kit 适配')
  }
  return git(directory, ['rev-parse', 'HEAD'], options).text
}

/**
 * 从固定提交导出临时归档；安装、改称呼和预设适配均不能写回作者工作区。
 * @param directory 只读 Git 来源
 * @param ref 要导出的提交或引用
 * @param temp 本轮临时目录
 * @param options Git 调用选项
 * @returns 归档路径和完整提交号
 */
function archiveCommit(directory, ref, temp, options) {
  const sha = git(directory, ['rev-parse', '--verify', `${ref}^{commit}`], options).text
  if (!SHA.test(sha)) {
    throw new Error('无法取得作者源码的完整提交号')
  }
  const archive = path.join(temp, 'source.tar.gz')
  git(directory, ['archive', '--format=tar.gz', '--prefix=source/', `--output=${archive}`, sha], options)
  return { archive, sha, local: false, clean: true }
}

/**
 * 更新 kit 同级作者仓库并导出固定提交；只允许干净 main 快进，绝不应用本地适配。
 * @param context kit/repo/ref 指定安装来源，temp 为临时目录，proxy 为代理，log 为进度回调
 * @returns 临时归档及来源元信息
 */
export function cachedSource({ kit, repo, ref, temp, proxy, log = () => {} }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^[\w./-]+$/.test(ref) || ref.includes('..') || ref.startsWith('-')) {
    throw new Error('无效的作者仓库或版本')
  }
  const directory = path.join(path.dirname(kit), repo.split('/')[1])
  const hooks = path.join(temp, 'empty-hooks')
  fs.mkdirSync(hooks)
  const options = { hooks, proxy }
  if (!fs.existsSync(directory)) {
    log(`首次克隆作者仓库 → ${directory}`)
    git(path.dirname(kit), ['clone', '--depth=1', '--single-branch', '--branch', 'main', `https://github.com/${repo}.git`, directory], options)
  }
  checkRepository(directory, options, repo)
  if (git(directory, ['symbolic-ref', '--short', 'HEAD'], options).text !== 'main') {
    throw new Error('同级作者仓库不在 main；保留当前分支，请先核对，不自动切换')
  }
  if (!refreshed.has(directory)) {
    log(`更新作者仓库 ${repo}（fetch + 仅快进 main）`)
    git(directory, ['fetch', '--prune', 'origin', 'refs/heads/main:refs/remotes/origin/main'], options)
    checkRepository(directory, options, repo)
    if (git(directory, ['merge-base', '--is-ancestor', 'HEAD', 'refs/remotes/origin/main'], { ...options, allowFailure: true }).status !== 0) {
      throw new Error('作者仓库 main 含本地提交或历史分叉；已停止，不覆盖或合入非作者版本')
    }
    git(directory, ['merge', '--ff-only', 'refs/remotes/origin/main'], options)
    refreshed.add(directory)
  }
  let target = 'HEAD'
  if (ref !== 'main') {
    const present = SHA.test(ref) && git(directory, ['cat-file', '-e', `${ref}^{commit}`], { ...options, allowFailure: true }).status === 0
    if (!present) {
      log(`获取固定来源 ${repo}@${ref}`)
      git(directory, ['fetch', 'origin', ref], options)
    }
    target = present ? ref : 'FETCH_HEAD'
  }
  return { ...archiveCommit(directory, target, temp, options), repository: directory, from: `本地作者仓库 ${directory}（${repo}@${ref}）` }
}

/**
 * 离线目录也先复制到临时区，避免 Agent 或作者脚本就地改写来源。
 * @param directory 显式传入的源码目录
 * @param temp 本轮临时目录
 * @param ref 显式完整提交号时核对或读取该提交；其它情况下读取当前 HEAD
 * @param skip 排除 Git 元数据、依赖和演示视频的规则
 * @returns 临时目录或 Git 归档，以及可验证的源码身份
 */
export function localSource(directory, temp, ref, skip) {
  const options = { hooks: path.join(temp, 'empty-hooks') }
  fs.mkdirSync(options.hooks)
  if (fs.existsSync(path.join(directory, '.git'))) {
    checkRepository(directory, options)
    return { ...archiveCommit(directory, SHA.test(ref) ? ref : 'HEAD', temp, options), repository: directory, from: `离线 Git 源码 ${directory}` }
  }
  const out = path.join(temp, 'source')
  fs.cpSync(directory, out, {
    recursive: true,
    preserveTimestamps: true,
    filter: (file) => {
      const relative = path.relative(directory, file).split(path.sep).join('/')
      if (relative && skip.test(relative)) return false
      if (fs.lstatSync(file).isSymbolicLink()) throw new Error('离线源码中有符号链接；已停止，避免读取目录外文件')
      return true
    }
  })
  return { dir: out, sha: null, local: true, clean: false, from: `离线源码临时副本（原目录只读）：${directory}` }
}
