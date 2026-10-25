/**
 * host.js —— dsh-qzone-post：经营自己这个 QQ 号的空间与资料。
 * ============================================================================
 * 两条通道，互相兜底：
 *   ① **协议端接口**（首选） send_qzone_msg / get_qzone_msg_list / set_qq_profile / set_qq_avatar
 *      —— 来自 skills-qq-self 的做法，登录态就是 OneBot 客户端自己的，最稳。
 *   ② **浏览器兜底**（协议端没这些接口时） 起 Edge 走 CDP 点网页版发布框（代码在 legacy/）。
 * 面板（设置页「QQ 空间」）：状态 / 发布 / 设置 / 高级 —— 见 lib/client.js。
 * ============================================================================
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { 家, 调, 读资料, 读动态, 读登录号, 读协议端 } from './onebot.mjs'
import { 读记录, 存记录, 账号记录, 事件们, 检查配额, 摘要, 今天 } from './store.mjs'
import { 解析一批, 解析一张, 图上限 } from './images.mjs'

export const name = 'qzone-post'
export const inject = ['tools', 'webServer']

// 版本从 package.json 读，别在代码里写死（以前写死过，打了新包还显示旧版本号）
const 版本 = (() => {
  try {
    const 根 = join(dirname(fileURLToPath(import.meta.url)), '..')
    return JSON.parse(readFileSync(join(根, 'package.json'), 'utf8')).version || '0.0.0'
  } catch (error) { return '0.0.0' }
})()
const 范围码 = { public: 1, friends: 4, self: 64 }
const 范围说 = { public: '所有人可见', friends: '好友可见', self: '仅自己可见' }

const 默认配置 = {
  allowPublish: true,
  allowProfile: true,
  allowAvatar: true,
  defaultVisibility: 'friends',
  postCooldownMinutes: 30,
  postDailyLimit: 6,
  profileCooldownMinutes: 60,
  maxChars: 600,
  dryRun: false,
  browserFallback: true,
  // 协议端：留空就自动用「通到 QQ」插件里那套（qq-bridge-config.json）
  napcat: '',
  token: '',
}

const 配置路径 = () => join(家(), 'qzone-self-config.json')
export function 读配置() {
  try { return { ...默认配置, ...JSON.parse(readFileSync(配置路径(), 'utf8')) } } catch (error) { return { ...默认配置 } }
}
export function 存配置(新) {
  try {
    mkdirSync(家(), { recursive: true })
    writeFileSync(配置路径(), JSON.stringify(新, null, 2), 'utf8')
    return true
  } catch (error) { return false }
}

/** 协议端是不是支持空间那套接口（只读探测，不写） */
export async function 探测协议端() {
  try {
    const 号 = await 读登录号()
    await 读动态(1)
    return { 能用: true, 号 }
  } catch (error) {
    return { 能用: false, 号: '', 错: String((error && error.message) || error) }
  }
}

export function apply(ctx) {
  const 日志 = []
  const 记 = (文本) => {
    const d = new Date()
    const 补 = (n) => String(n).padStart(2, '0')
    日志.push({ 时间: `${补(d.getMonth() + 1)}-${补(d.getDate())} ${补(d.getHours())}:${补(d.getMinutes())}:${补(d.getSeconds())}`, 文本 })
    if (日志.length > 60) 日志.shift()
    try { ctx.logger?.info('qzone: ' + 文本) } catch (error) {}
  }

  // ── 浏览器兜底：懒加载，用不到就不加载（它要 node:fs / WebSocket，宿主都有） ──
  let 浏览器模块
  const 载入浏览器 = async () => {
    if (浏览器模块 !== undefined) return 浏览器模块
    try { 浏览器模块 = await import('../legacy/qzone.mjs') } catch (error) { 浏览器模块 = null }
    return 浏览器模块
  }
  const 浏览器可用 = async () => Boolean(await 载入浏览器())
  const 用户目录 = () => join(家(), 'qzone', 'profile')
  const 截图目录 = () => join(家(), 'qzone', 'shots')

  const 输出 = {
    schema: { type: 'object', properties: {}, additionalProperties: true },
    render: (_a, v) => [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }],
  }

  const 当前号 = async () => {
    const 号 = await 读登录号()
    if (!/^\d+$/.test(号)) throw new Error('协议端还没登录 QQ')
    return 号
  }

  /**
   * 写一次。先落盘意图 → 调接口 → 回写结果。
   * 协议端「不认识这个动作」时，动态会退到浏览器通道（改动资料没有兜底）。
   */
  const 写一次 = async (类型, 动作, 参数, 配置, 动作超时 = 30000, 详情 = {}) => {
    const 号 = await 当前号()
    const s = 读记录()
    const a = 账号记录(s, 号)
    const 哈希 = 摘要(参数)
    const 近期 = 事件们(a).filter((e) => e.kind === 类型 && e.status !== 'failed')
    const 重复 = 类型 === 'post'
      ? 近期.findLast((e) => e.hash === 哈希)
      : (近期.at(-1)?.hash === 哈希 ? 近期.at(-1) : null)
    if (重复) { 存记录(s); return { 重复: true, 记录: 重复 } }
    if (配置.dryRun) return { 预览: true }
    检查配额(a, 类型, 配置)
    // ⚠️ 正文一定要存进事件里：超时之后要靠它去最近动态里认领，否则「核对」永远匹配不上
    const e = { kind: 类型, at: Date.now(), hash: 哈希, status: 'pending', 通道: 'onebot', ...详情 }
    a.events.push(e)
    存记录(s)
    try {
      const 结果 = await 调(动作, 参数, { 超时: 动作超时 })
      e.status = 'ok'
      if (结果?.tid) { e.tid = String(结果.tid); e.verified = true }
      存记录(s)
      return { 结果, 记录: e }
    } catch (error) {
      const 话 = String((error && error.message) || error)
      const 不认识 = /HTTP 404|not found|不支持|unknown action|没有这个|接口不存在/i.test(话)
      if (类型 === 'post' && 不认识 && 配置.browserFallback !== false) {
        const 浏览 = await 载入浏览器()
        if (浏览 && typeof 浏览.发说说 === 'function') {
          记('协议端没有空间接口，改走浏览器兜底')
          const 浏览器结果 = await 浏览.发说说({
            文字: 参数.content, dry: false, 用户目录: 用户目录(), 截图目录: 截图目录(),
          })
          e.通道 = '浏览器'
          e.status = 浏览器结果.ok ? 'ok' : 'failed'
          存记录(s)
          return { 结果: { tid: 浏览器结果.tid }, 记录: e, 浏览器: 浏览器结果 }
        }
      }
      e.status = /超时|abort|timeout|network|fetch failed|ECONN/i.test(话) ? 'unknown' : 'failed'
      存记录(s)
      throw new Error(话 + (e.status === 'unknown' ? '（结果未知：先去查最近动态再决定要不要重发）' : ''))
    }
  }

  const 核对 = async (a) => {
    const 悬着 = 事件们(a).filter((e) => e.kind === 'post' && ['pending', 'unknown'].includes(e.status))
    if (!悬着.length) return
    const 最近 = await 读动态(10)
    for (const e of 悬着) {
      const 头 = String(e.正文 || e.content || '').trim().slice(0, 40)
      if (!头) continue
      const 命中 = 最近.动态.find((p) => String(p.正文 || '').trim().startsWith(头) && p.tid && Number(p.时间) * 1000 >= e.at - 120000)
      if (命中) { e.status = 'ok'; e.tid = 命中.tid; e.verified = true }
    }
  }

  /** 面板/工具共用：看现状 */
  const 看现状 = async () => {
    const 配置 = 读配置()
    const 结果 = { ok: true, 版本, 配置, 协议端: 读协议端() }
    let 号 = ''
    try { 号 = await 当前号(); 结果.号 = 号 } catch (error) { 结果.号错 = String((error && error.message) || error) }
    if (号) {
      try { 结果.资料 = await 读资料(号) } catch (error) { 结果.资料错 = String((error && error.message) || error) }
      try {
        const s = 读记录()
        const a = 账号记录(s, 号)
        await 核对(a)
        结果.空间 = await 读动态(10)
        结果.最近操作 = 事件们(a).map(({ kind, at, status, tid, 通道 }) => ({ kind, at, status, tid, 通道 })).slice(-8)
        结果.今天发了几条 = 事件们(a).filter((e) => e.kind === 'post' && e.status !== 'failed' && 今天(e.at) === 今天()).length
        存记录(s)
      } catch (error) { 结果.空间错 = String((error && error.message) || error) }
    }
    return 结果
  }

  const 发一条 = async ({ content, visibility, imageUrls, images, dry }) => {
    const 配置 = 读配置()
    if (!配置.allowPublish) throw new Error('发布动态这个开关是关着的')
    const 正文 = String(content || '').trim()
    if (!正文) throw new Error('正文不能为空')
    if ([...正文].length > 配置.maxChars) throw new Error(`正文太长了（上限 ${配置.maxChars} 字）`)
    const 可见 = String(visibility || 配置.defaultVisibility)
    if (!范围码[可见]) throw new Error('可见范围只能是 friends / public / self')
    // 图片：公开链接 / file:// / 本机绝对路径都收（本机会查存在、格式、大小再转 file://）
    const 原始图 = [
      ...(Array.isArray(imageUrls) ? imageUrls : []),
      ...(Array.isArray(images) ? images : []),
    ].filter((x) => x != null && String(x).trim())
    const 解析 = 解析一批(原始图)
    const 参数 = { content: 正文, ugc_right: 范围码[可见], ...(解析.length ? { images: 解析.map((x) => x.地址) } : {}) }
    // dry 走参数覆盖，**别去临时改配置文件**（并发时会互相踩）
    const 本次配置 = dry === true ? { ...配置, dryRun: true } : 配置
    const r = await 写一次('post', 'send_qzone_msg', 参数, 本次配置, 90000, { 正文 })
    if (r.预览) return { ok: true, 预览: true, 说: '演练模式：没真发', 参数 }
    if (r.重复) {
      const e = r.记录
      return { ok: e.status === 'ok', 重复: true, tid: e.tid || null, 说: e.status === 'ok' ? '这条内容已经发过了，这次没重复发' : '上次结果未知，先去查空间状态，别盲目重发' }
    }
    记('发了一条动态（' + (r.记录.通道 || 'onebot') + '）：' + 正文.slice(0, 30))
    return {
      ok: true, tid: r.记录.tid || null, 可见: 范围说[可见], 通道: r.记录.通道 || 'onebot',
      说: r.记录.tid ? '接口确认发布成功（有 tid）' : '接口接受了，但没回 tid，去空间里看一眼再确认',
    }
  }

  const 工具 = (定义) => {
    try { ctx.tools.register(定义) } catch (error) {
      记('工具注册失败（' + 定义.name + '）：' + String((error && error.message) || error))
    }
  }

  工具({
    name: 'qzone_state',
    description: '看自己这个 QQ 号在空间里的现状：昵称、签名、最近动态、今天发了几条、最近操作。发之前先看一眼，免得重复。',
    parameters: { type: 'object', properties: {} },
    output: 输出,
    async execute() {
      try { return await 看现状() } catch (error) { return { ok: false, 说: String((error && error.message) || error) } }
    },
  })

  工具({
    name: 'qzone_publish',
    description: '往自己的 QQ 空间发一条说说。默认好友可见；可带公开图片链接。有频率和每日上限；内容一样不会重复发。',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: '动态正文（1~3 句就好）' },
        visibility: { type: 'string', enum: ['friends', 'public', 'self'], description: '可见范围，默认 friends' },
        images: {
          type: 'array', items: { type: 'string' },
          description: '图片：公开 http(s) 链接，或本机绝对路径 / file://（png·jpg·gif·webp，单张 ≤6MB，最多 9 张）',
        },
        imageUrls: { type: 'array', items: { type: 'string' }, description: '（老名字，等于 images）' },
      },
      required: ['content'],
    },
    output: 输出,
    async execute(args) {
      try { return await 发一条(args || {}) } catch (error) { return { ok: false, 说: String((error && error.message) || error) } }
    },
  })

  工具({
    name: 'qzone_profile',
    description: '改自己这个 QQ 号的资料：昵称（≤16 字）、签名（≤80 字）、性别（0未知/1男/2女）。改完会回读确认。',
    parameters: {
      type: 'object',
      properties: {
        nickname: { type: 'string', description: '新昵称，最多 16 字' },
        signature: { type: 'string', description: '个性签名，最多 80 字；空串清空' },
        sex: { type: 'integer', enum: [0, 1, 2], description: '0 未知 / 1 男 / 2 女' },
      },
    },
    output: 输出,
    async execute(args) {
      const 配置 = 读配置()
      try {
        if (!配置.allowProfile) throw new Error('改资料这个开关是关着的')
        const 参数 = {}
        if (args && args.nickname != null) {
          const 名 = String(args.nickname).trim()
          if (!名) throw new Error('昵称不能为空')
          if ([...名].length > 16) throw new Error('昵称最多 16 字')
          参数.nickname = 名
        }
        if (args && args.signature != null) {
          const 签 = String(args.signature).trim()
          if ([...签].length > 80) throw new Error('签名最多 80 字')
          参数.personal_note = 签
        }
        if (args && args.sex != null) {
          const 性 = Number(args.sex)
          if (![0, 1, 2].includes(性)) throw new Error('性别只能是 0 / 1 / 2')
          参数.sex = 性
        }
        if (!Object.keys(参数).length) throw new Error('要说改什么（昵称 / 签名 / 性别）')
        const r = await 写一次('profile', 'set_qq_profile', 参数, 配置)
        if (r.预览) return { ok: true, 预览: true, 说: '演练模式：没真改', 参数 }
        if (r.重复) return { ok: true, 重复: true, 说: '上一次改的就是这个，没有重复调用' }
        let 回读 = null
        try { 回读 = await 读资料(await 当前号()) } catch (error) {}
        记('改了资料：' + Object.keys(参数).join(','))
        return { ok: true, acknowledged: true, verified: Boolean(回读), 回读, 说: 回读 ? '已经改了，并回读确认' : 'QQ 接受了，但回读不到（可能有缓存延迟）' }
      } catch (error) {
        return { ok: false, 说: String((error && error.message) || error) }
      }
    },
  })

  工具({
    name: 'qzone_avatar',
    description: '换自己的 QQ 头像。只收一张公开 http(s) 图片链接。',
    parameters: {
      type: 'object',
      properties: { imageUrl: { type: 'string', description: '一张公开的 http(s) 图片链接' } },
      required: ['imageUrl'],
    },
    output: 输出,
    async execute(args) {
      const 配置 = 读配置()
      try {
        if (!配置.allowAvatar) throw new Error('换头像这个开关是关着的')
        const 原 = String((args && args.imageUrl) || '').trim()
        const 一张 = 解析一张(原)   // 公开链接 / file:// / 本机绝对路径都收
        const 图 = 一张.地址
        const r = await 写一次('profile', 'set_qq_avatar', { file: 图 }, 配置, 90000)
        if (r.预览) return { ok: true, 预览: true, 说: '演练模式：没真换', 参数: { file: 图 } }
        if (r.重复) return { ok: true, 重复: true, 说: '同一张图换过了，没有重复调用' }
        记('换头像了')
        return { ok: true, acknowledged: true, 说: '接口收下了，客户端可能有一会儿缓存，以 QQ 里显示为准' }
      } catch (error) {
        return { ok: false, 说: String((error && error.message) || error) }
      }
    },
  })

  // ── 面板接口 ────────────────────────────────────────────────────────
  const 回 = (res, o) => {
    try {
      res.setHeader?.('content-type', 'application/json; charset=utf-8')
      res.end?.(JSON.stringify(o))
    } catch (error) {}
  }
  const 读体 = async (req) => {
    if (req && req.body && typeof req.body === 'object') return req.body
    let 文 = ''
    try { for await (const c of req) 文 += c } catch (error) {}
    try { return JSON.parse(文 || '{}') } catch (error) { return {} }
  }
  const 路线 = (路径, handler) => {
    try {
      ctx.effect(() => ctx.webServer.register({
        kind: 'exact',
        path: 路径,
        handler: async (req, res) => {
          try { await handler(req, res) } catch (error) { 回(res, { ok: false, 说: String((error && error.message) || error) }) }
        },
      }))
    } catch (error) { 记('路由注册失败（' + 路径 + '）：' + String((error && error.message) || error)) }
  }

  路线('/dsh-qzone/state', async (req, res) => {
    const 基础 = await 看现状()
    回(res, { ...基础, 日志, 浏览器兜底: await 浏览器可用() })
  })

  路线('/dsh-qzone/save', async (req, res) => {
    const 来 = await 读体(req)
    const 新 = { ...读配置(), ...(来 && typeof 来 === 'object' ? 来 : {}) }
    // 收一下脏数据：可见范围、数字字段
    if (!范围码[新.defaultVisibility]) 新.defaultVisibility = 'friends'
    for (const k of ['postCooldownMinutes', 'postDailyLimit', 'profileCooldownMinutes', 'maxChars']) {
      const n = Number(新[k])
      新[k] = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 默认配置[k]
    }
    新.napcat = String(新.napcat || '').trim()
    新.token = String(新.token || '').trim()
    if (!存配置(新)) return 回(res, { ok: false, 说: '写不进配置文件：' + 配置路径() })
    记('设置已保存')
    回(res, { ok: true, 配置: 新, 说: '保存好了' })
  })

  路线('/dsh-qzone/publish', async (req, res) => {
    const 体 = await 读体(req)
    try {
      const r = await 发一条({ content: 体.content, visibility: 体.visibility, images: 体.images, imageUrls: 体.imageUrls })
      回(res, { ...r, ...(await 看现状()) })
    } catch (error) {
      回(res, { ok: false, 说: String((error && error.message) || error) })
    }
  })

  路线('/dsh-qzone/publish-dry', async (req, res) => {
    const 体 = await 读体(req)
    try {
      // 只这次走演练，不改用户的配置文件（以前那样并发会互相踩）
      const r = await 发一条({ content: 体.content, visibility: 体.visibility, images: 体.images, imageUrls: 体.imageUrls, dry: true })
      回(res, { ...r, 说: r.说 || '演练：没真发' })
    } catch (error) {
      回(res, { ok: false, 说: String((error && error.message) || error) })
    }
  })

  /** 浏览器兜底：开一个可见的 Edge 扫码（协议端没有空间接口、或要临时用网页版时） */
  路线('/dsh-qzone/browser-login', async (req, res) => {
    const 浏览 = await 载入浏览器()
    if (!浏览) return 回(res, { ok: false, 说: '浏览器兜底模块没带上（legacy/ 丢了？）' })
    try {
      await 浏览.查登录({ 用户目录: 用户目录() })
      const b = await 浏览.起会话({ 用户目录: 用户目录(), 有界面: true })
      const p = await b.新页面('https://qzone.qq.com/')
      await p.等('页面就绪', () => document.readyState === 'complete', null, { 超时: 20000 }).catch(() => {})
      记('已打开扫码窗口（扫完可以直接关掉）')
      回(res, { ok: true, 说: '浏览器开了，扫码登录；登完关掉窗口就行，cookie 留在 ~/.dsh/qzone/profile' })
    } catch (error) {
      回(res, { ok: false, 说: String((error && error.message) || error) })
    }
  })

  记(`已装好 v${版本}｜工具 qzone_state / qzone_publish / qzone_profile / qzone_avatar｜面板 /dsh-qzone/state`)
}
