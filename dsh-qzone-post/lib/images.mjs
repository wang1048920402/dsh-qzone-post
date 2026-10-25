/**
 * images.mjs —— 把「用户给的图片」变成协议端能吃的引用。
 * ============================================================================
 * 三种写法都收（前后端一样）：
 *   ① https://…  公开链接（最省事）
 *   ② file:///…  已经是文件地址
 *   ③ C:\a.png / D:/a.png / ~/a.png  本机路径
 * 本机图片会先检查：存在、格式（png/jpg/gif/webp）、大小（≤6MB），然后转成 file:// URL。
 * ⚠️ 保留原始文件，不重编码 —— GIF 才不会变静态、表情才不会糊。
 * ============================================================================
 */
import { existsSync, statSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, isAbsolute, extname } from 'node:path'
import { pathToFileURL } from 'node:url'

export const 图上限 = 9
export const 单图上限字节 = 6 * 1024 * 1024
const 允许格式 = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])

/** 把一个引用解析成「协议端能用的地址」；不合法就抛 */
export function 解析一张(原, { 允许本地 = true } = {}) {
  const 值 = String(原 == null ? '' : 原).trim()
  if (!值) throw new Error('图片引用是空的')
  if (值.length > 4096) throw new Error('图片引用太长了')
  if (/^https?:\/\//i.test(值)) {
    const u = new URL(值)
    if (u.username || u.password) throw new Error('图片链接里不要带账号密码')
    return { 类型: 'url', 地址: u.toString() }
  }
  if (!允许本地) throw new Error('只收公开的 http(s) 图片链接')
  let 路径 = ''
  if (/^file:\/\//i.test(值)) {
    try { 路径 = decodeURIComponent(new URL(值).pathname).replace(/^\/([a-zA-Z]:)/, '$1') } catch (error) { throw new Error('file:// 地址看不懂') }
  } else if (值.startsWith('~')) {
    路径 = join(homedir(), 值.slice(1))
  } else if (isAbsolute(值)) {
    路径 = 值
  } else {
    throw new Error('图片要么给公开链接，要么给绝对路径（相对路径我不猜）')
  }
  if (!existsSync(路径)) throw new Error('本机没找到这张图：' + 路径)
  const st = statSync(路径)
  if (!st.isFile()) throw new Error('这不是一个文件：' + 路径)
  if (st.size > 单图上限字节) throw new Error('这张图太大了（' + Math.round(st.size / 1048576) + 'MB，上限 6MB）')
  const 后缀 = extname(路径).toLowerCase()
  if (!允许格式.has(后缀)) throw new Error('只收 png / jpg / gif / webp，这个是 ' + (后缀 || '没有后缀'))
  // 至少确认能读出来（不然协议端会拿到一个空文件）
  readFileSync(路径, { flag: 'r' })
  return { 类型: 'file', 地址: pathToFileURL(路径).href, 路径, 字节: st.size }
}

/** 一次解析一批：去重、限 9 张 */
export function 解析一批(列表, 选项) {
  const 数组 = Array.isArray(列表) ? 列表 : (列表 ? [列表] : [])
  if (数组.length > 图上限) throw new Error('最多 ' + 图上限 + ' 张图')
  const 见过 = new Set()
  const 出 = []
  for (const 项 of 数组) {
    const r = 解析一张(项, 选项)
    if (见过.has(r.地址)) continue
    见过.add(r.地址)
    出.push(r)
  }
  if (出.length > 图上限) throw new Error('最多 ' + 图上限 + ' 张图')
  return 出
}
