/**
 * qzone.mjs —— 「往 QQ 空间发说说」这件事本身，跟 DSH 无关的那部分。
 * ============================================================================
 * 关键坑（都是实测踩出来的，别再踩第二遍）：
 *   ① 编辑器在 iframe#app_canvas_frame 里，它自己的 getBoundingClientRect() 是相对 iframe 的 ——
 *      直接拿去点会点在外层页面空白处，表现是「点了、打字没反应」。所以要逐层加上 iframe 的偏移。
 *   ② el.click() 这种合成事件不够：空间提交那一下不认，必须真鼠标（mousePressed/mouseReleased）。
 *   ③ 打字要走输入法通道（Input.insertText）；改 innerHTML 看着有字，提交却是空的。
 *   ④ 列表是异步渲染的，验证要轮询等它出现，别拍一张就走。
 * ============================================================================
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { 起浏览器, 连上已有的, 等到 } from './cdp.mjs'

export const 默认端口 = Number(process.env.QZONE_CDP_PORT) || 9223

/** 拿自己的 QQ 号：页面地址 / cookie / g_iUin 三条路 */
export async function 取QQ号(页面) {
  const 合法 = (v) => /^\d{5,12}$/.test(String(v || '').replace(/^o/, ''))
  try {
    const href = String(await 页面.执行(() => location.href) || '')
    // ⚠️ 只认「真的站在空间里」的地址：被踢回 i.qq.com 登录页时，
    //    它的 s_url 参数里也写着 user.qzone.qq.com/<号>/main —— 直接正则会把「没登录」当成「登录了」（踩过）。
    try {
      const u = new URL(href)
      if (u.hostname === 'user.qzone.qq.com') {
        const m = /^\/(\d{5,12})/.exec(u.pathname)
        if (m) return m[1]
      }
    } catch (error) {}
  } catch (error) {}
  try {
    for (const c of await 页面.cookies(['https://user.qzone.qq.com', 'https://qzone.qq.com'])) {
      if (c.name === 'uin' || c.name === 'p_uin') {
        const 号 = String(c.value || '').replace(/^o/, '').trim()
        if (合法(号)) return 号
      }
    }
  } catch (error) {}
  try {
    const 号 = await 页面.执行(() => String(window.g_iUin || ''))
    if (合法(号)) return String(号)
  } catch (error) {}
  return ''
}

/** 打开一个受控的浏览器：有现成的就复用，没有才起一个（插件会被反复调用，不能每次都新起） */
export async function 起会话({ 端口 = 默认端口, 用户目录, 有界面 = true } = {}) {
  const 已有 = await 连上已有的(端口)
  if (已有) return 已有
  return 起浏览器({ 端口, 用户目录, 有界面 })
}

/** 看看现在登录的是谁（不弹窗） */
export async function 查登录({ 端口 = 默认端口, 用户目录 } = {}) {
  const b = await 起会话({ 端口, 用户目录, 有界面: false })
  try {
    const p = await b.新页面('https://user.qzone.qq.com/')
    await p.等('页面就绪', () => document.readyState === 'complete', null, { 超时: 20000 }).catch(() => {})
    await new Promise((r) => setTimeout(r, 1500))
    const 站内 = await p.执行(() => location.hostname === 'user.qzone.qq.com').catch(() => false)
    const 号 = await 取QQ号(p)
    // cookie 里可能还留着 uin，但会话已经过期（会被踢到 i.qq.com）—— 那种不算登录
    return { 登录: Boolean(站内 && 号), 号, 需要重新扫码: !站内, 复用浏览器: Boolean(b.复用) }
  } finally {
    await b.关掉()
  }
}

export const 页面内 = {
  /** 找可见的编辑器 → 换算到最外层页面坐标 */
  找编辑器: function () {
    const 出 = []
    const 走 = (doc, 链) => {
      let 们 = []
      try { 们 = [...doc.querySelectorAll('[contenteditable="true"], textarea')] } catch (e) { return }
      for (const el of 们) 出.push({ el, 链 })
      for (const fr of [...doc.querySelectorAll('iframe')]) {
        let d = null
        try { d = fr.contentDocument } catch (e) { d = null }
        if (d) 走(d, 链.concat([fr]))
      }
    }
    走(document, [])
    let 最好 = null
    for (const 项 of 出) {
      const r = 项.el.getBoundingClientRect()
      if (r.width < 120 || r.height < 20) continue
      let x = r.left
      let y = r.top
      for (const fr of 项.链) { const f = fr.getBoundingClientRect(); x += f.left; y += f.top }
      const 面积 = r.width * r.height
      if (!最好 || 面积 > 最好.面积) 最好 = { 面积, x: Math.round(x + r.width / 2), y: Math.round(y + r.height / 2), 谁: String(项.el.id || 项.el.className).slice(0, 40) }
    }
    return 最好
  },
  /** 读回编辑器里的字（取最长的那个可见编辑框） */
  读编辑器: function () {
    let 最长 = ''
    const 走 = (doc) => {
      let 们 = []
      try { 们 = [...doc.querySelectorAll('[contenteditable="true"], textarea')] } catch (e) { return }
      for (const el of 们) {
        const r = el.getBoundingClientRect()
        if (r.width < 120 || r.height < 20) continue
        const 字 = String(el.value || el.innerText || '').trim()
        if (字.length > 最长.length) 最长 = 字
      }
      for (const fr of [...doc.querySelectorAll('iframe')]) {
        let d = null
        try { d = fr.contentDocument } catch (e) { d = null }
        if (d) 走(d)
      }
    }
    走(document)
    return 最长
  },
  /** 找「发表」按钮坐标（文字完全等于「发表/发布」，取最靠下的） */
  找发表: function () {
    const 出 = []
    const 走 = (doc, 链) => {
      let 们 = []
      try { 们 = [...doc.querySelectorAll('a,button,div,span')] } catch (e) { return }
      for (const el of 们) {
        const t = String(el.innerText || el.value || '').trim()
        if (t !== '发表' && t !== '发布') continue
        const r = el.getBoundingClientRect()
        if (r.width < 20 || r.height < 12) continue
        let x = r.left
        let y = r.top
        for (const fr of 链) { const f = fr.getBoundingClientRect(); x += f.left; y += f.top }
        出.push({ x: Math.round(x + r.width / 2), y: Math.round(y + r.height / 2), top: y, 谁: String(el.className).slice(0, 40) })
      }
      for (const fr of [...doc.querySelectorAll('iframe')]) {
        let d = null
        try { d = fr.contentDocument } catch (e) { d = null }
        if (d) 走(d, 链.concat([fr]))
      }
    }
    走(document, [])
    出.sort((a, b) => b.top - a.top)
    return 出[0] || null
  },
}

/** 打开空间首页并点「说说」标签，把发表框叫出来 */
export async function 打开发表框(页面, 号) {
  await 页面.打开('https://user.qzone.qq.com/' + 号 + '/main')
  await 页面.等('页面就绪', () => document.readyState === 'complete', null, { 超时: 40000 })
  await new Promise((r) => setTimeout(r, 2500))
  const 点标签 = await 页面.真点('a,span,li,div', '说说').catch(() => null)
  await new Promise((r) => setTimeout(r, 3500))
  return 点标签
}

/** 发一条说说 */
export async function 发说说({ 文字, dry = false, 端口 = 默认端口, 用户目录, 截图目录 } = {}) {
  const 句 = String(文字 || '').trim()
  if (!句) return { ok: false, 号: '', 说: '内容不能为空' }
  const 图 = (名) => {
    if (!截图目录) return ''
    try { mkdirSync(截图目录, { recursive: true }) } catch (error) {}
    return join(截图目录, 名 + '.png')
  }
  const b = await 起会话({ 端口, 用户目录, 有界面: true })
  try {
    const p = await b.新页面('https://user.qzone.qq.com/')
    await new Promise((r) => setTimeout(r, 1500))
    const 站内 = await p.执行(() => location.hostname === 'user.qzone.qq.com').catch(() => false)
    if (!站内) return { ok: false, 号: '', 说: '登录过期了（被踢回登录页）—— 去设置页点「登录空间」重新扫码' }
    const 号 = await 取QQ号(p)
    if (!号) return { ok: false, 号: '', 说: '还没登录 —— 先点「登录空间」扫码' }
    await 打开发表框(p, 号)
    const 位置 = await 等到('可见的编辑器', () => p.执行(页面内.找编辑器), { 超时: 15000 })
    await p.真点坐标(位置.x, 位置.y)
    await new Promise((r) => setTimeout(r, 400))
    await p.连.send('Input.insertText', { text: 句 }, p.sessionId)
    await new Promise((r) => setTimeout(r, 700))
    let 现在 = await p.执行(页面内.读编辑器)
    if (!现在) {
      await p.执行(function (w) {
        const 焦点 = document.activeElement && (document.activeElement.isContentEditable || document.activeElement.tagName === 'TEXTAREA')
        const 目标 = 焦点 ? document.activeElement : [...document.querySelectorAll('[contenteditable="true"], textarea')].find((el) => { const r = el.getBoundingClientRect(); return r.width > 120 && r.height > 20 })
        if (!目标) return false
        目标.focus()
        if (目标.tagName === 'TEXTAREA') { 目标.value = w; 目标.dispatchEvent(new Event('input', { bubbles: true })) }
        else { 目标.textContent = w; 目标.dispatchEvent(new InputEvent('input', { bubbles: true, data: w, inputType: 'insertText' })) }
        return true
      }, 句)
      await new Promise((r) => setTimeout(r, 500))
      现在 = await p.执行(页面内.读编辑器)
    }
    if (!现在) {
      await p.截图(图('fail'))
      return { ok: false, 号, 步: '写不进去', 截图: 图('fail'), 说: '编辑器里写不进字（截图已存）' }
    }
    if (dry) {
      await p.截图(图('dry'))
      return { ok: true, 号, 步: '只填没发', 截图: 图('dry'), 说: '已经填好，没点发表（dry）' }
    }
    const 钮 = await 等到('「发表」按钮', () => p.执行(页面内.找发表), { 超时: 8000 })
    await p.真点坐标(钮.x, 钮.y)
    await new Promise((r) => setTimeout(r, 4000))
    await p.截图(图('posted'))
    await p.打开('https://user.qzone.qq.com/' + 号 + '/main')
    await p.等('页面就绪', () => document.readyState === 'complete', null, { 超时: 30000 }).catch(() => {})
    const 关键字 = 句.slice(0, 12)
    let 查到 = false
    const 到 = Date.now() + 15000
    while (Date.now() < 到) {
      查到 = await p.执行(function (字) {
        let 有 = false
        const 走 = (doc) => {
          if (!有) { try { 有 = String(doc.body ? doc.body.innerText : '').includes(字) } catch (e) {} }
          for (const fr of [...doc.querySelectorAll('iframe')]) { let d = null; try { d = fr.contentDocument } catch (e) { d = null } if (d) 走(d) }
        }
        走(document)
        return 有
      }, 关键字).catch(() => false)
      if (查到) break
      await new Promise((r) => setTimeout(r, 800))
    }
    await p.截图(图('verify'))
    return { ok: 查到, 号, 步: 查到 ? '已发出' : '点了发表但列表里没有', 截图: 图('verify'), 说: 查到 ? '发出去了，说说列表里能看到' : '点了发表，但列表里没看到 —— 可能还在审核，或没真发出去' }
  } finally {
    await b.关掉()
  }
}

/** 读最近的说说行（状态页用） */
export async function 读说说({ 端口 = 默认端口, 用户目录 } = {}) {
  const b = await 起会话({ 端口, 用户目录, 有界面: false })
  try {
    const p = await b.新页面('https://user.qzone.qq.com/')
    const 号 = await 取QQ号(p)
    if (!号) return { ok: false, 说: '还没登录' }
    await 打开发表框(p, 号)
    const 行 = await p.执行(function () {
      let 最长 = ''
      const 走 = (doc) => {
        try { const t = String(doc.body ? doc.body.innerText : ''); if (t.length > 最长.length) 最长 = t } catch (e) {}
        for (const fr of [...doc.querySelectorAll('iframe')]) { let d = null; try { d = fr.contentDocument } catch (e) { d = null } if (d) 走(d) }
      }
      走(document)
      return 最长.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 40)
    })
    return { ok: true, 号, 行 }
  } finally {
    await b.关掉()
  }
}
