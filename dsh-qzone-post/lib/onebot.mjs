/**
 * onebot.mjs —— 跟 OneBot（SnowLuma / NapCat）说话的那一层。
 * ============================================================================
 * ⚠️ 照着 skills-qq-self 的源码改的：它用的是协议端自带的空间接口，
 *    不碰浏览器、不点坐标、不需要 cookie。比之前那套「开 Edge 点 DOM」稳得多。
 * 用到的动作：
 *   send_qzone_msg / get_qzone_msg_list / get_stranger_info / set_qq_profile / set_qq_avatar
 * ============================================================================
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export const 家 = () => process.env.DSH_HOME || join(homedir(), '.dsh')
const 桥配置 = () => join(家(), 'qq-bridge-config.json')

const 自家配置 = () => join(家(), 'qzone-self-config.json')

/**
 * 连哪个协议端。三条路，先自己、再蹭「通到 QQ」、最后默认：
 *   ① 本插件配置里的 `napcat` / `token`（独立用的时候填这里）
 *   ② `qq-bridge-config.json` 的 `NapCat` / `令牌`（装了通到 QQ 就不用填第二遍）
 *   ③ http://127.0.0.1:3000
 */
export function 读协议端() {
  let 地址 = ''
  let 令牌 = ''
  try {
    const 自 = JSON.parse(readFileSync(自家配置(), 'utf8'))
    地址 = String(自.napcat || 自.NapCat || '').trim()
    令牌 = String(自.token || 自.令牌 || '').trim()
  } catch (error) {}
  if (!地址) {
    try {
      const j = JSON.parse(readFileSync(桥配置(), 'utf8'))
      地址 = String(j.NapCat || '').trim()
      令牌 = 令牌 || String(j.令牌 || '').trim()
    } catch (error) {}
  }
  return { 地址: (地址 || 'http://127.0.0.1:3000').replace(/\/+$/, ''), 令牌 }
}

/** 一次 OneBot 调用；不 ok 就抛，别把失败当成功 */
export async function 调(action, params = {}, { 超时 = 30000 } = {}) {
  const { 地址, 令牌 } = 读协议端()
  const 控 = new AbortController()
  const 计时 = setTimeout(() => 控.abort(), 超时)
  try {
    const 头 = { 'content-type': 'application/json' }
    if (令牌) 头.authorization = 'Bearer ' + 令牌
    const r = await fetch(地址 + '/' + action, {
      method: 'POST', headers: 头, body: JSON.stringify(params || {}), signal: 控.signal,
    })
    const 文 = await r.text()
    let j = null
    try { j = JSON.parse(文) } catch (error) { j = null }
    if (!r.ok) throw new Error('HTTP ' + r.status + '：' + 文.slice(0, 160))
    if (!j) throw new Error('协议端没回 JSON：' + 文.slice(0, 160))
    if (j.status === 'failed') throw new Error('协议端拒绝：' + (j.message || j.wording || ('retcode ' + j.retcode)))
    const 数据 = j.data !== undefined ? j.data : j
    if (数据 && typeof 数据 === 'object') {
      const 码 = 数据.result != null ? Number(数据.result) : (数据.retcode != null ? Number(数据.retcode) : 0)
      if (码 !== 0) throw new Error('协议端返回业务错误（' + 码 + '）')
    }
    return 数据
  } finally {
    clearTimeout(计时)
  }
}

/** 自己的资料（昵称 / 签名 / 性别） */
export async function 读资料(号) {
  const p = await 调('get_stranger_info', { user_id: Number(号), no_cache: true })
  return { 昵称: p?.nickname || '', 签名: p?.long_nick ?? p?.longNick ?? '', 性别: p?.sex ?? 'unknown' }
}

/** 最近的空间动态 */
export async function 读动态(条数 = 10) {
  const p = await 调('get_qzone_msg_list', { pos: 0, num: Math.max(1, Math.min(条数, 30)) })
  return {
    总数: p?.total ?? 0,
    动态: (p?.msglist || []).map((m) => ({
      tid: String(m.tid || ''),
      正文: String(m.content || '').slice(0, 1500),
      时间: m.time,
      图: m.images || [],
    })),
  }
}

/** 自己的 QQ 号（协议端登录号） */
export async function 读登录号() {
  const j = await 调('get_login_info', {})
  return String(j?.user_id || '')
}
