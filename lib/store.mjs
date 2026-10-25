/**
 * store.mjs —— 操作记录 + 频率限制（照 skills-qq-self 的规矩来）。
 * ============================================================================
 * 为什么要记：空间接口**不是幂等的**。超时的时候你并不知道发没发出去，
 * 所以先把「打算干什么」落盘，结果回来再改状态；下次先核对最近动态，再决定要不要重发。
 * 记录只留最近 7 天、最多 200 条，只存正文摘要和哈希，不存任何凭证。
 * ============================================================================
 */
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { 家 } from './onebot.mjs'

export const 状态文件 = () => join(家(), 'qzone-self', 'state.json')

/** 北京时间的一天（按 UTC+8 切） */
export const 今天 = (ms = Date.now()) => new Date(ms + 8 * 3600000).toISOString().slice(0, 10)
export const 摘要 = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex')

export function 读记录() {
  const p = 状态文件()
  if (!existsSync(p)) return { version: 1, accounts: {} }
  const s = JSON.parse(readFileSync(p, 'utf8'))
  if (s.version !== 1 || !s.accounts || typeof s.accounts !== 'object') throw new Error('操作记录损坏 —— 暂停写操作')
  return s
}

export function 存记录(s) {
  const p = 状态文件()
  mkdirSync(dirname(p), { recursive: true })
  const 临时 = p + '.tmp'
  writeFileSync(临时, JSON.stringify(s, null, 2), 'utf8')
  renameSync(临时, p)
}

export function 账号记录(s, 号) {
  return (s.accounts[号] ||= { events: [] })
}

/** 只留 7 天、最多 200 条 */
export function 事件们(a, now = Date.now()) {
  a.events = (a.events || []).filter((e) => e.at > now - 7 * 86400000).slice(-200)
  return a.events
}

/**
 * 频率限制：动态之间 / 资料变更之间都要隔一会儿。
 * @throws 太密了的时候抛（调用方直接把它当成「不发」）
 */
export function 检查配额(a, 类型, 配置, now = Date.now()) {
  const 近期 = 事件们(a, now).filter((e) => e.kind === 类型 && e.status !== 'failed')
  const 最近 = 近期.at(-1)
  const 间隔分 = 类型 === 'post' ? 配置.postCooldownMinutes : 配置.profileCooldownMinutes
  if (最近 && 间隔分 > 0 && now - 最近.at < 间隔分 * 60000) {
    throw new Error('操作太密，约 ' + Math.ceil((间隔分 * 60000 - (now - 最近.at)) / 60000) + ' 分钟后可再用')
  }
  if (类型 === 'post' && 配置.postDailyLimit > 0) {
    const 今天条数 = 近期.filter((e) => 今天(e.at) === 今天(now)).length
    if (今天条数 >= 配置.postDailyLimit) throw new Error('今天已经发了 ' + 今天条数 + ' 条，到设置了上限')
  }
}
