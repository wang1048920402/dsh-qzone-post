/**
 * cdp.mjs —— 一个**不依赖任何第三方库**的极简 CDP 客户端
 * ============================================================================
 * 为什么要自己写：这台机器上没有 playwright / puppeteer，但装了 Edge；
 *   Node 22+ 自带 `WebSocket` 和 `fetch`，所以「起 Edge + 走 CDP」这几百行就够用了，
 *   不额外下载 150MB 的浏览器内核，也不用担心跟系统的 Edge 版本对不上。
 *
 * 用法：
 *   const b = await 起浏览器({ 端口: 9223, 用户目录: '…', 有界面: true })
 *   const p = await b.新页面('https://example.com')
 *   await p.打开('https://…')
 *   await p.执行((s) => document.title)          // 在页面里跑函数，返回值带回 Node
 *   await p.点('button.submit')                    // 选择器找不到就抛错
 *   await p.打字('要发的文字')                     // 往当前焦点里输入（走输入法通道，比 setValue 更像人）
 *   await p.截图('a.png')
 *   await b.关掉()
 * ============================================================================
 */
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

/** 等一个条件成立（默认最多 20 秒），超时就抛错 */
export async function 等到(说明, 检查, { 超时 = 20000, 间隔 = 200 } = {}) {
  const 到 = Date.now() + 超时
  let 末次
  while (Date.now() < 到) {
    try {
      const v = await 检查()
      if (v) return v
    } catch (error) { 末次 = error }
    await new Promise((r) => setTimeout(r, 间隔))
  }
  throw new Error('等超时：' + 说明 + (末次 ? '（最后一次错误：' + 末次.message + '）' : ''))
}

/** 极简 CDP 连接：一句 send(method, params, sessionId) + 事件回调 */
class 连接 {
  constructor(ws) {
    this.ws = ws
    this.号 = 0
    this.等着的 = new Map()
    this.监听 = new Map()
    ws.addEventListener('message', (ev) => {
      let msg
      try { msg = JSON.parse(ev.data) } catch (error) { return }
      if (msg.id && this.等着的.has(msg.id)) {
        const { 解, 拒 } = this.等着的.get(msg.id)
        this.等着的.delete(msg.id)
        if (msg.error) 拒(new Error(msg.error.message || JSON.stringify(msg.error)))
        else 解(msg.result || {})
        return
      }
      if (msg.method && this.监听.has(msg.method)) for (const fn of this.监听.get(msg.method)) {
        try { fn(msg.params, msg.sessionId) } catch (error) {}
      }
    })
  }
  send(method, params = {}, sessionId) {
    const id = ++this.号
    return new Promise((解, 拒) => {
      this.等着的.set(id, { 解, 拒 })
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
      setTimeout(() => {
        if (!this.等着的.has(id)) return
        this.等着的.delete(id)
        拒(new Error('CDP 超时：' + method))
      }, 30000)
    })
  }
  on(method, fn) {
    const 组 = this.监听.get(method) || []
    组.push(fn)
    this.监听.set(method, 组)
  }
}

export const 默认Edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

/**
 * 起一个可以让我们遥控的 Edge。
 * ⚠️ 用的是**独立的用户目录**（不是你的日常 profile）：第一次要在这里扫码登录一次，
 *    之后 cookie 就留在这个目录里，不用再登。
 */
export async function 起浏览器({ 端口 = 9223, 用户目录, 有界面 = true, 额外参数 = [] } = {}) {
  if (!用户目录) throw new Error('起浏览器：必须给 用户目录')
  mkdirSync(用户目录, { recursive: true })
  const 参数 = [
    '--remote-debugging-port=' + 端口,
    '--user-data-dir=' + 用户目录,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate,MediaRouter',
    '--remote-allow-origins=*',
    ...(有界面 ? [] : ['--headless=new', '--window-size=1280,900']),
    ...额外参数,
    'about:blank',
  ]
  const 子 = spawn(默认Edge, 参数, { stdio: 'ignore', windowsHide: false })
  子.on('error', (error) => { throw error })
  let 版本
  try {
    版本 = await 等到('Edge 的调试端口', async () => {
      const r = await fetch(`http://127.0.0.1:${端口}/json/version`)
      return r.ok ? await r.json() : null
    })
  } catch (error) {
    子.kill()
    throw new Error('Edge 没起来（端口 ' + 端口 + '）：' + error.message)
  }
  const ws = new WebSocket(版本.webSocketDebuggerUrl)
  await new Promise((解, 拒) => {
    ws.addEventListener('open', 解, { once: true })
    ws.addEventListener('error', () => 拒(new Error('连不上 Edge 的调试 WebSocket')), { once: true })
  })
  const 连 = new 连接(ws)
  return {
    连,
    版本,
    async 新页面(url = 'about:blank') {
      const { targetId } = await 连.send('Target.createTarget', { url })
      const { sessionId } = await 连.send('Target.attachToTarget', { targetId, flatten: true })
      await 连.send('Page.enable', {}, sessionId)
      await 连.send('Runtime.enable', {}, sessionId)
      return new 页面(连, sessionId, targetId)
    },
    async 关掉() {
      try { await 连.send('Browser.close') } catch (error) {}
      try { ws.close() } catch (error) {}
      try { 子.kill() } catch (error) {}
    },
  }
}

/** 一个页面（tab）。所有方法都是「找不到就抛错」，不静默吞。 */
class 页面 {
  constructor(连, sessionId, targetId) {
    this.连 = 连
    this.sessionId = sessionId
    this.targetId = targetId
  }
  async 打开(url) {
    await this.连.send('Page.navigate', { url }, this.sessionId)
  }
  async 网址() {
    const { result } = await this.连.send('Runtime.evaluate', { expression: 'location.href', returnByValue: true }, this.sessionId)
    return result.value
  }
  /** 在页面里跑一段函数：函数必须自包含（参数只能走 参），返回值要能 JSON 化 */
  async 执行(函数, 参, { 等承诺 = true } = {}) {
    const 表达式 = '(' + 函数.toString() + ')(' + JSON.stringify(参 === undefined ? null : 参) + ')'
    const { result, exceptionDetails } = await this.连.send('Runtime.evaluate', {
      expression: 表达式, awaitPromise: 等承诺, returnByValue: true, userGesture: true,
    }, this.sessionId)
    if (exceptionDetails) throw new Error('页面里报错：' + (exceptionDetails.exception?.description || exceptionDetails.text))
    return result.value
  }
  async 等(说明, 函数, 参, 选项) {
    return 等到(说明, () => this.执行(函数, 参), 选项)
  }
  /**
   * 真点：先量出元素的屏幕坐标，再用 Input.dispatchMouseEvent 按下/抬起。
   * ⚠️ 为什么不用 el.click()：Qzone 的编辑器/按钮挂的是「真实事件」那一套，
   *    合成 click 有时不触发它们的提交逻辑（实测：点了「发表」页面没反应）。
   *    Selenium 那批老脚本能成，也是因为它是真鼠标。
   */
  async 真点(选择器, 文字) {
    const 位置 = await this.执行(function (a) {
      let els = [...document.querySelectorAll(a.s)].filter((x) => x.getClientRects().length > 0)
      if (a.t) {
        const 字 = (x) => String(x.innerText || x.value || '').trim()
        // ⚠️ 先按「完全一样」找，再退到「短文本里包含」——
        //    只用 includes 会点到整个页面的外层容器（实测点了下，编辑器根本没出来）
        const 完全相同 = els.filter((x) => 字(x) === a.t)
        els = 完全相同.length ? 完全相同 : els.filter((x) => 字(x).length <= 8 && 字(x).includes(a.t))
      }
      const el = els[0]
      if (!el) return null
      el.scrollIntoView({ block: 'center' })
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), 文字: (el.innerText || '').trim().slice(0, 20) }
    }, { s: 选择器, t: 文字 || '' })
    if (!位置) throw new Error('找不到要点的元素：' + 选择器 + (文字 ? '（文字 ' + 文字 + '）' : ''))
    await this.真点坐标(位置.x, 位置.y)
    return 位置
  }
  /** 在给定坐标上做一次「按下 → 抬起」 */
  async 真点坐标(x, y) {
    await this.连.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', pointerType: 'mouse' }, this.sessionId)
    await this.连.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, pointerType: 'mouse' }, this.sessionId)
    await new Promise((r) => setTimeout(r, 40))
    await this.连.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, pointerType: 'mouse' }, this.sessionId)
    await new Promise((r) => setTimeout(r, 80))
  }
  /** 元素中心的坐标（找不到就 null），给「先点再打字」用 */
  async 坐标(选择器) {
    return this.执行(function (s) {
      const els = [...document.querySelectorAll(s)].filter((x) => x.getClientRects().length > 0)
      const el = els[0]
      if (!el) return null
      el.scrollIntoView({ block: 'center' })
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    }, 选择器)
  }
  /** 这个页面能看到哪些 cookie
   *  ⚠️ 必须在**页面会话**里问：在浏览器会话上问 Network.getCookies 会返回空（踩过）。 */
  async cookies(urls) {
    await this.连.send('Network.enable', {}, this.sessionId).catch(() => {})
    const { cookies } = await this.连.send('Network.getCookies', { urls }, this.sessionId)
    return cookies || []
  }
  /** 按选择器点；点之前先滚到可视区域（Qzone 很多东西在懒加载） */
  async 点(选择器) {
    const 成 = await this.执行(function (s) {
      const el = document.querySelector(s)
      if (!el) return false
      el.scrollIntoView({ block: 'center' })
      el.click()
      return true
    }, 选择器)
    if (!成) throw new Error('点不到：' + 选择器)
  }
  /** 按文字找按钮再点（Qzone 的按钮 class 常换，文字更稳） */
  async 点文字(文字, 标签 = '*') {
    const 成 = await this.执行(function (a) {
      const 们 = [...document.querySelectorAll(a.标签)]
      const el = 们.find((x) => (x.innerText || x.textContent || '').trim() === a.文字 && x.offsetParent !== null)
        || 们.find((x) => (x.innerText || x.textContent || '').trim().includes(a.文字) && x.offsetParent !== null)
      if (!el) return false
      el.scrollIntoView({ block: 'center' })
      el.click()
      return true
    }, { 文字, 标签 })
    if (!成) throw new Error('点不到文字：' + 文字)
  }
  /** 把焦点放到某个可编辑区（contenteditable / textarea / iframe 里的 body） */
  async 聚焦(选择器) {
    const 成 = await this.执行(function (s) {
      const el = document.querySelector(s)
      if (!el) return false
      el.focus()
      if (el.tagName === 'IFRAME') {
        const d = el.contentDocument
        if (!d) return false
        d.body.focus()
      }
      return true
    }, 选择器)
    if (!成) throw new Error('聚焦不到：' + 选择器)
  }
  /** 走真实输入通道打字（比直接改 innerHTML 更像人） */
  async 打字(文字) {
    await this.连.send('Input.insertText', { text: 文字 }, this.sessionId)
  }
  /**
   * 截图。⚠️ 截图**不该影响主流程**：发说说那一步已经点了「发表」，这时候要是 captureScreenshot
   * 超时（页面正忙时偶发），整条命令就会失败、看着像没发出去。所以这里失败只提示，不抛。
   */
  async 截图(路径) {
    let data
    try {
      ({ data } = await this.连.send('Page.captureScreenshot', { format: 'png' }, this.sessionId))
    } catch (error) {
      console.log('（截图失败，不影响刚才的操作：' + String((error && error.message) || error) + '）')
      return ''
    }
    mkdirSync(dirname(路径), { recursive: true })
    writeFileSync(路径, Buffer.from(data, 'base64'))
    return 路径
  }
  async 关掉() {
    try { await this.连.send('Target.closeTarget', { targetId: this.targetId }) } catch (error) {}
  }
}

/**
 * 已经有浏览器在监听这个端口就复用它（插件里每次发布都新起一个 Edge 太重）。
 * @returns 连上的浏览器对象，或者 null
 */
export async function 连上已有的(端口 = 9223) {
  let 版本
  try {
    const r = await fetch('http://127.0.0.1:' + 端口 + '/json/version')
    if (!r.ok) return null
    版本 = await r.json()
  } catch (error) { return null }
  if (!版本 || !版本.webSocketDebuggerUrl) return null
  const ws = new WebSocket(版本.webSocketDebuggerUrl)
  await new Promise((解, 拒) => {
    ws.addEventListener('open', 解, { once: true })
    ws.addEventListener('error', () => 拒(new Error('连不上已有的浏览器')), { once: true })
  })
  const 连 = new 连接(ws)
  return {
    连,
    版本,
    复用: true,
    async 新页面(url = 'about:blank') {
      const { targetId } = await 连.send('Target.createTarget', { url })
      const { sessionId } = await 连.send('Target.attachToTarget', { targetId, flatten: true })
      await 连.send('Page.enable', {}, sessionId)
      await 连.send('Runtime.enable', {}, sessionId)
      return new 页面(连, sessionId, targetId)
    },
    /** 复用的浏览器**不要关**（可能是别人开着的） */
    async 关掉() {
      try { ws.close() } catch (error) {}
    },
  }
}
