/**
 * answers.json 的形状。题面结构见 docs/架构-交互与建议值.md §七。
 * 只校验外壳：该定的定了没有、谁定的说清楚没有。不校验选得对不对。
 */

const BOOLS = ['register', 'skills', 'writeConfig']
const SOURCES = ['user', 'probe', 'suggestion']

/**

 * @returns { ok, failures, notes }
 */
export function validateAnswers(value) {
  const failures = []
  const notes = []
  const fail = (code, message) => failures.push({ code, message })

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('answers/type', 'answers.json 不是对象：拿不到选项就无从生成脚本')
    return { ok: false, failures, notes }
  }

  if (value.version !== 2) {
    fail('answers/version', 'version 必须是 2（v1 没有身份/硬线/人设与默认 preset），实际是 ' + JSON.stringify(value.version))
  }
  if (typeof value.profile !== 'string' || value.profile.trim() === '') {
    fail('answers/profile', 'profile 不能为空：装错 profile 等于没装')
  }

  // 身份 / 硬线 / 人设 / 运行：这四组是「装成什么样的 agent」，不是安装参数
  const setup = value.setup
  if (!setup || typeof setup !== 'object' || Array.isArray(setup)) {
    fail('answers/setup', 'setup 必须是对象：名字、称呼、硬线、人设都在这里')
  } else {
    for (const key of ['name', 'user']) {
      if (typeof setup[key] !== 'string' || setup[key].trim() === '') fail('answers/setup/' + key, 'setup.' + key + ' 不能为空')
    }
    if (!Array.isArray(setup.hardLines) || setup.hardLines.length === 0) {
      fail('answers/setup/hardLines', 'hardLines 至少要一条：没有硬线等于没有「必须先问你」的规矩')
    }
    if (typeof setup.multiSession !== 'boolean') fail('answers/setup/multiSession', 'multiSession 必须是布尔')
    if (!(setup.windowSize === null || typeof setup.windowSize === 'number')) fail('answers/setup/windowSize', 'windowSize 必须是数字或 null（不知道就 null，不编）')
    if (typeof setup.hasIndex !== 'boolean') fail('answers/setup/hasIndex', 'hasIndex 必须是布尔：init.mjs 会按它决定权威源册里要不要写索引那一行')
    if (typeof setup.persona !== 'string') fail('answers/setup/persona', 'persona 必须是字符串（可空）')
    if (typeof setup.setupName !== 'string' || setup.setupName.trim() === '') fail('answers/setup/setupName', 'setupName 不能为空：这份答案要能被下次更新读回来')
  }

  // 两个根只能由人给：上游 echo-config 明说不猜，缺了就装到错的地方且不报错
  const paths = value.paths
  if (!paths || typeof paths !== 'object' || Array.isArray(paths)) {
    fail('answers/paths', 'paths 必须是 { soul, memory } 对象：两个根上游不猜，必须由答案给')
  } else {
    for (const key of ['soul', 'memory']) {
      if (typeof paths[key] !== 'string' || paths[key].trim() === '') {
        fail('answers/paths/' + key, 'paths.' + key + ' 不能为空：猜错路径比不猜更坏（会把记忆读到错的地方，还不报错）')
      }
    }
  }

  const parts = value.parts
  if (!parts || typeof parts !== 'object' || Array.isArray(parts)) {
    fail('answers/parts', 'parts 必须是 { install, declined } 对象')
  } else {
    for (const key of ['install', 'declined']) {
      if (!Array.isArray(parts[key])) fail('answers/parts/' + key, 'parts.' + key + ' 必须是数组：没有就是 []，不能省')
    }
  }

  if (!Array.isArray(value.presets)) {
    fail('answers/presets', 'presets 必须是数组：一个都不装也要写 []，那是决定不是遗漏')
  } else if (value.presets.length > 0) {
    if (typeof value.defaultPreset !== 'string' || !value.presets.includes(value.defaultPreset)) {
      fail(
        'answers/defaultPreset',
        'defaultPreset 必须是 presets 里的一个（现在：' + JSON.stringify(value.defaultPreset) + '）。' +
        '不指默认 preset，picker 里就不会出现它',
      )
    }
  } else {
    notes.push('presets 为空：三个验收判据里「命令能被识别」那条要显式标「未装」')
  }

  for (const key of BOOLS) {
    if (typeof value[key] !== 'boolean') fail('answers/' + key, key + ' 必须是布尔：要不要写配置、写 bundles，不能到执行时刻再定')
  }

  if (value.asked !== undefined) {
    if (!Array.isArray(value.asked)) {
      fail('answers/asked', 'asked 必须是数组')
    } else {
      value.asked.forEach((item, index) => {
        const at = 'asked[' + index + ']'
        if (!item || typeof item !== 'object') { fail('answers/asked/type', at + ' 不是对象'); return }
        if (typeof item.id !== 'string' || item.id === '') fail('answers/asked/id', at + ' 没有 id：答了哪一题都对不上')
        if (item.answer === undefined) fail('answers/asked/answer', at + ' 没有 answer')
        if (!SOURCES.includes(item.source)) {
          fail('answers/asked/source', at + ' 的 source 必须是 user / probe / suggestion：分不清「人定的」和「我猜的」，下次就会拿猜的当依据')
        }
      })
    }
  } else {
    notes.push('没有 asked：分不清哪些是用户定的、哪些是探出来的（题面记录见 docs/架构-交互与建议值.md §七）')
  }

  if (parts && Array.isArray(parts.install) && Array.isArray(parts.declined) && parts.install.length === 0 && parts.declined.length === 0) {
    notes.push('parts.install 与 parts.declined 都是空的：把 optional 当成「都不装」是猜，不是决定')
  }

  return { ok: failures.length === 0, failures, notes }
}

export default { validateAnswers }
