#!/usr/bin/env node
/**
 * cli.mjs —— 不进 DSH 也能用的几个小命令（调试/首次登录用）。
 *   node lib/cli.mjs --login      起可见浏览器扫码（扫完自己关窗口）
 *   node lib/cli.mjs --whoami     看登录的是谁
 *   node lib/cli.mjs --post 文字   发一条
 *   node lib/cli.mjs --post 文字 --dry
 *   node lib/cli.mjs --selftest   只验证 CDP 通道通不通（不碰 QQ）
 */
import { join } from 'node:path'
import { 发说说, 查登录, 起会话, 默认端口 } from './qzone.mjs'
import { 起浏览器 } from './cdp.mjs'

const 家 = process.env.DSH_HOME || join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh')
const 用户目录 = join(家, 'qzone', 'profile')
const 截图目录 = join(家, 'qzone', 'shots')
const 参 = process.argv.slice(2)

const 有 = (名) => 参.includes(名)
const 取 = (名, 缺省 = '') => { const i = 参.indexOf(名); return i >= 0 ? String(参[i + 1] || 缺省) : 缺省 }

if (有('--selftest')) {
  const b = await 起浏览器({ 端口: 默认端口, 用户目录: join(家, 'qzone', 'selftest'), 有界面: false })
  try {
    const p = await b.新页面('https://example.com')
    const 标题 = await p.等('标题', () => document.title, null, { 超时: 15000 })
    console.log('自检通过 ✅ 页面标题 =', JSON.stringify(标题))
  } finally { await b.关掉() }
} else if (有('--login')) {
  const b = await 起会话({ 端口: 默认端口, 用户目录, 有界面: true })
  const p = await b.新页面('https://qzone.qq.com/')
  console.log('浏览器已打开，扫码登录；登完把窗口关掉就行（cookie 留在 ' + 用户目录 + '）')
  await p.等('页面就绪', () => document.readyState === 'complete', null, { 超时: 20000 }).catch(() => {})
} else if (有('--whoami')) {
  console.log(JSON.stringify(await 查登录({ 用户目录 }), null, 1))
} else if (有('--post')) {
  const 文字 = 取('--post')
  const 结果 = await 发说说({ 文字, dry: 有('--dry'), 用户目录, 截图目录 })
  console.log(JSON.stringify(结果, null, 1))
  if (!结果.ok) process.exitCode = 1
} else {
  console.log('用法：node lib/cli.mjs --login | --whoami | --post "文字" [--dry] | --selftest')
}
