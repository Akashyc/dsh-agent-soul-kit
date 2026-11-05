import { allFailures } from './lib/diagnose/evidence.mjs'
import { dataPaths, saveContext, assertDataPath } from './lib/core/data-paths.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readContext } from './lib/diagnose/context.mjs'
import { resolveAuthor } from './lib/source/diagnose-source.mjs'
import { judge, hasLocalMarker } from './lib/diagnose/detect.mjs'
import { loadIssues, saveIssues, touchIssues, retireIssues, refreshCleanup, putIssue } from './lib/diagnose/issues.mjs'
import { renderProblems } from './lib/diagnose/report.mjs'
import { renderText } from './lib/diagnose/text.mjs'

const root = path.dirname(fileURLToPath(import.meta.url))
const help = `soul-fix：诊断 dsh-agent-soul 在本机运行中的报错（给 agent 用，输出 Markdown）

  node soul-fix.mjs                    只读诊断，打印 Markdown；--write 才保存状态
  node soul-fix.mjs --update           先把作者仓库更新到最新再诊断
  node soul-fix.mjs --source <目录>     指定作者仓库
  node soul-fix.mjs --no-write         只打印，不动本机清单
  node soul-fix.mjs --report [文件]     写一份给作者看的问题清单（Markdown）
  node soul-fix.mjs --add <id>=<json>  登记一条问题到本机清单
  node soul-fix.mjs --show             打印本机清单路径与全文
  通用：--dsh-home <目录> --profile <名字> --logs <日志目录> --ref <完整提交>

清单只在本机：<KIT>/data/<profile>/<instance>/fix/issues.json
工具自己不认识任何问题，全靠 agent 一条条诊断出来写进去。`

function parse(argv) {
  const values = new Set(['--source', '--dsh-home', '--profile', '--ref', '--logs', '--add'])
  const flags = new Set(['--update', '--write', '--no-write', '--report', '--show', '--help', '-h'])
  const options = {}
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (Object.hasOwn(options, key)) throw new Error('参数重复：' + key)
    if (key === '--report') {
      options[key] = argv[i + 1] && !argv[i + 1].startsWith('-') ? argv[++i] : true
    } else if (values.has(key)) {
      const value = argv[i + 1]
      if (!value || value.startsWith('-')) throw new Error(key + ' 缺少参数值')
      options[key] = value
      i++
    } else if (flags.has(key)) options[key] = true
    else throw new Error('不支持的参数：' + key + '；看 --help')
  }
  return options
}

/** --add 的写法：id={"title":…,"sig":…,"file":…} */
function parseAdd(raw) {
  const at = raw.indexOf('=')
  if (at < 0) throw new Error('--add 要写成 <id>={...}')
  const id = raw.slice(0, at).trim()
  let payload
  try { payload = JSON.parse(raw.slice(at + 1)) } catch { throw new Error('--add 的值不是合法 JSON') }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('--add 的值必须是对象')
  return { id, payload }
}

async function main() {
  const args = parse(process.argv.slice(2))
  if (args['--help'] || args['-h']) return console.log(help)
  if (process.stdout.isTTY) throw new Error('这是给 agent 的接口：输出是 Markdown，验证靠两次运行的状态差分；请在会话里让 agent 调用')
  const notes = []
  const context = readContext({
    home: args['--dsh-home'], profile: args['--profile'],
  })
  const data = dataPaths(root, context.home, context.profile)
  const file = data.issues
  const legacy = path.join(context.home, 'dsh-soul/fix', context.profile, 'issues.json')
  if (fs.existsSync(legacy)) throw new Error('发现旧问题清单，请先运行 scripts/migrate-data.mjs 清点；不自动忽略或覆盖旧清单')
  if (args['--logs']) context.logs = path.resolve(args['--logs'])
  assertDataPath(root, file)
  const store = loadIssues(file)
  if (args['--no-write'] && args['--write']) throw new Error('--write 与 --no-write 不能同时使用')
  const write = Boolean(args['--write'] || args['--add']) && !args['--no-write']
  if (write) saveContext(root, data)
  const at = new Date().toISOString()

  if (args['--show']) {
    return console.log('# ' + file + '\n\n' + JSON.stringify(store, null, 2))
  }

  if (args['--add']) {
    const { id, payload } = parseAdd(args['--add'])
    putIssue(store, id, payload, at)
    if (write) saveIssues(file, store)
    return console.log('已登记：' + id + (write ? '' : '（--no-write：没有落盘）'))
  }

  const author = resolveAuthor({
    explicit: args['--source'], kit: root, ref: args['--ref'],
    update: Boolean(args['--update']), log: (line) => notes.push(line),
  })

  try {
  // 每轮重算：清单条目逐条判定，状态写回条目里
  for (const entry of Object.values(store.issues)) {
    const verdict = judge(entry, context, author)
    entry.state = verdict.state
    entry.note = verdict.note || null
  }
  const retired = retireIssues(store, at, author.sha)
  const pending = refreshCleanup(store, (entry) => hasLocalMarker(entry, context))
  touchIssues(store, at)
  store.kit = context.install?.kitVersion || null
  if (write) saveIssues(file, store)

  for (const note of notes) console.error(note)

  console.log(renderText({ context, author, issues: store, install: context.install, at }))
  if (retired.length) console.error('本次退役：' + retired.map((row) => row.id).join('、'))
  if (pending.length) console.error('本地旧补丁还挂着：' + pending.map((row) => row.id).join('、'))

  if (args['--report']) {
    const evidence = allFailures(context.logs, context.home)
    const wanted = Object.values(store.issues).filter((entry) => entry.state === 'open' && entry.sig && (evidence.get(entry.pkg) || []).some((row) => new RegExp(entry.sig).test(row.detail)))
    const rendered = renderProblems({
      items: wanted.filter((entry) => entry.state === 'open').map((entry) => ({ ...entry, entry })),
      author, install: context.install, at, home: context.home, context,
    })
    const target = args['--report'] === true
      ? path.join(data.reports, '问题清单-' + author.sha.slice(0, 7) + '-' + at.slice(0, 10) + '.md')
      : path.resolve(args['--report'])
    if (args['--report'] === true) assertDataPath(root, target)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, rendered.markdown)
    const where = target.startsWith(root + path.sep) ? path.relative(root, target) : target
    console.log('\n反馈清单：' + where + '（' + rendered.issues.length + ' 条）')
  }
  } finally { author.cleanup() }
}

main().catch((error) => {
  console.error('出错：' + error.message)
  process.exitCode = 1
})