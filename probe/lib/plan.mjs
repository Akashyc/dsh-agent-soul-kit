/**
 * 执行计划的契约。apply.mjs 输出的就是它。
 * 这里只做校验，不做生成——生成是本机的事，校验是契约的事。
 */

/** 四类步骤。判不出来的步骤不该出现在计划里，所以这里是闭集，不是开关。 */
export const STEP_KINDS = ['copy', 'install', 'write-config', 'skip']

/**
 * 校验一份计划。返回 { ok, failures, notes }。
 * failures 是「不合格」，notes 是「不合格之外该说的事」。
 * 每条规则都对应一个真实的坑，不是想象出来的规范。
 */
export function validatePlan(plan) {
  const failures = []
  const notes = []
  const fail = (code, message) => failures.push({ code, message })

  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    fail('plan/type', '计划不是对象：拿不到结构就无从校验')
    return { ok: false, failures, notes }
  }

  if (plan.version !== 1) {
    fail('plan/version', 'version 必须是 1，实际是 ' + JSON.stringify(plan.version) + '：不知道按哪版契约写的计划不能执行')
  }

  if (plan.action !== 'install' && plan.action !== 'update') {
    fail('plan/action', 'action 必须是 install 或 update，实际是 ' + JSON.stringify(plan.action))
  }

  if (!Array.isArray(plan.steps)) {
    fail('plan/steps', 'steps 必须是数组')
  } else if (plan.steps.length === 0) {
    fail('plan/empty', '计划里一步都没有：空计划等于「什么都没做」，不能当执行过')
  } else {
    plan.steps.forEach((step, index) => {
      const at = 'steps[' + index + ']'
      if (!step || typeof step !== 'object') {
        fail('step/type', at + ' 不是对象')
        return
      }
      if (!STEP_KINDS.includes(step.kind)) {
        fail('step/kind', at + ' 的 kind 不在闭集里：' + JSON.stringify(step.kind))
        return
      }
      if (step.kind === 'copy') {
        if (!step.from) fail('step/from', at + ' 是 copy 但没写 from')
        if (!step.to) fail('step/to', at + ' 是 copy 但没写 to')
      }
      if (step.kind === 'install') {
        if (!step.pkg) fail('step/pkg', at + ' 是 install 但没写 pkg')
        if (!step.from) fail('step/from', at + ' 是 install 但没写 from：不知道从哪个提交装的')
      }
      if (step.kind === 'write-config') {
        if (!step.file) fail('step/file', at + ' 是 write-config 但没写 file')
        if (!step.backup) fail('step/backup', at + ' 写配置却没有 backup：作者 §6① 是硬规矩，不是建议')
      }
      if (step.kind === 'skip' && !step.why) {
        fail('step/why', at + ' 是 skip 却没写 why：不写原因的跳过等于静默')
      }
    })
  }

  if (!Array.isArray(plan.risks)) {
    fail('plan/risks', 'risks 必须是数组：没有风险也要给空数组，不能缺')
  }

  if (typeof plan.rollback !== 'string' || plan.rollback.trim() === '') {
    fail('plan/rollback', 'rollback 不能为空：没有回滚点的执行不许开始')
  }

  if (typeof plan.needsRestart !== 'boolean') {
    fail('plan/needsRestart', 'needsRestart 必须是布尔：装完要不要重启，必须说清楚')
  } else if (plan.needsRestart) {
    notes.push('这份计划需要重启 DSH 才生效：报告里写「等待重启后验收」，不写「完成」')
  }

  const skips = Array.isArray(plan.steps) ? plan.steps.filter((step) => step && step.kind === 'skip') : []
  if (skips.length && plan.risks && plan.risks.length === 0) {
    notes.push('有 ' + skips.length + ' 步被跳过却没有列出任何风险：跳过本身就是一种风险')
  }

  return { ok: failures.length === 0, failures, notes }
}

export default { STEP_KINDS, validatePlan }