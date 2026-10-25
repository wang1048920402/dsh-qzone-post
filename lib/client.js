// DSH「QQ 空间」· 网页半边
//
// 在 **DSH 设置** 左侧栏加一项「QQ 空间」。三个页签：
//   总览 / 发布 / 设置
// 只往宿主那几条 /dsh-qzone/* 路由上读写，不碰会话、不直接发消息。

window.__ModuleLoader__.load({
  id: 'dsh-qzone-post',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const React = require('react')
    const inject = ['slots']

    const B = '/dsh-qzone'
    const get = (p) => fetch(B + p, { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
    const post = (p, body) =>
      fetch(B + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
        .then((r) => r.json())
        .catch(() => null)

    const h = React.createElement

    const S = {
      wrap: {
        padding: '12px 14px 24px', fontSize: 13, lineHeight: 1.7,
        background: 'var(--dsw-alias-bg-layer-1, rgba(255,255,255,.92))',
        border: '1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.08))',
        borderRadius: 12,
      },
      h: { fontSize: 14, fontWeight: 600, margin: '16px 0 8px' },
      dim: { opacity: 0.62, fontSize: 12 },
      card: {
        border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8,
        padding: '10px 12px', marginBottom: 10, background: 'var(--dsw-alias-bg-layer-1)',
      },
      row: { display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap' },
      lab: { minWidth: 200, paddingTop: 3, fontSize: 12.5 },
      ctl: { flex: '1 1 260px', minWidth: 220 },
      hint: { opacity: 0.6, fontSize: 11.5, marginTop: 2 },
      input: {
        border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '4px 8px',
        background: 'transparent', color: 'inherit', fontSize: 12.5, width: '100%', boxSizing: 'border-box',
      },
      area: {
        border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 6, padding: '6px 8px',
        background: 'transparent', color: 'inherit', fontSize: 12.5, width: '100%',
        boxSizing: 'border-box', minHeight: 74, fontFamily: 'inherit', resize: 'vertical',
      },
      tabBar: { display: 'flex', gap: 6, margin: '10px 0 12px', flexWrap: 'wrap' },
      tab: {
        padding: '4px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5,
        border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'inherit',
      },
      tab_on: {
        padding: '4px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5,
        border: '1px solid var(--dsw-alias-brand-primary, #4c8bf5)',
        background: 'var(--dsw-alias-brand-primary, #4c8bf5)', color: '#fff',
      },
      btn: {
        padding: '5px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5,
        border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'inherit',
      },
      btn_on: {
        padding: '5px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5,
        border: '1px solid var(--dsw-alias-brand-primary, #4c8bf5)',
        background: 'var(--dsw-alias-brand-primary, #4c8bf5)', color: '#fff',
      },
      ok: { color: '#1e8e3e' },
      warn: { color: '#c0392b' },
      post: { borderTop: '1px dashed var(--dsw-alias-border-l2)', paddingTop: 8, marginTop: 8 },
      log: {
        fontFamily: 'ui-monospace, monospace', fontSize: 11.5, maxHeight: 160, overflow: 'auto',
        background: 'var(--dsw-alias-bg-layer-2, rgba(0,0,0,.03))', borderRadius: 6, padding: '6px 8px',
      },
    }

    const 按钮 = (label, fn, on, 忙) =>
      h('button', { onClick: 忙 ? undefined : fn, style: on ? S.btn_on : S.btn, disabled: 忙 }, label)

    const 勾 = (值, set) =>
      h('input', { type: 'checkbox', checked: Boolean(值), onChange: (e) => set(e.target.checked) })

    const 行 = (label, ctl, hint) =>
      h('div', { style: S.row },
        h('div', { style: S.lab }, label),
        h('div', { style: S.ctl }, ctl, hint ? h('div', { style: S.hint }, hint) : null))

    function Section() {
      const [态, set态] = React.useState(null)
      const [页, set页] = React.useState('总览')
      const [忙, set忙] = React.useState(false)
      const [说, set说] = React.useState('')
      const [草稿, set草稿] = React.useState({ content: '', visibility: 'friends', imageUrls: '' })
      const [配置, set配置] = React.useState(null)
      const [脏, set脏] = React.useState(false)

      // ⚠️ 用 ref 记「有未保存改动」：直接读 state 的话，定时/保存后的刷新会拿到旧值，
      //    把你还没保存的修改冲掉（踩过）
      const 脏Ref = React.useRef(false)
      const 刷 = async () => {
        const r = await get('/state')
        if (r) { set态(r); if (!脏Ref.current) set配置(r.配置) }
        return r
      }
      React.useEffect(() => { 刷() }, [])

      const 改 = (k, v) => { 脏Ref.current = true; set配置((c) => ({ ...(c || {}), [k]: v })); set脏(true) }

      const 存 = async () => {
        set忙(true)
        const r = await post('/save', 配置)
        set忙(false)
        if (r && r.ok) { 脏Ref.current = false; set脏(false); set说('保存好了'); 刷() }
        else set说((r && r.说) || '保存失败')
      }

      const 发 = async (演练) => {
        if (!草稿.content.trim()) { set说('先写点内容'); return }
        set忙(true)
        set说(演练 ? '预览中…' : '发布中…')
        const 图 = 草稿.imageUrls.split(/\n+/).map((s) => s.trim()).filter(Boolean)
        const r = await post(演练 ? '/publish-dry' : '/publish', {
          content: 草稿.content, visibility: 草稿.visibility, images: 图,
        })
        set忙(false)
        set说((r && (r.说 || (r.ok ? '好了' : '没成'))) || '没回应')
        if (r && r.ok && !演练) set草稿({ content: '', visibility: 草稿.visibility, imageUrls: '' })
        刷()
      }

      if (!态) return h('div', { style: S.wrap }, '读取中…')

      const 配置_ = 配置 || 态.配置 || {}
      const 协议端 = 态.协议端 || {}
      const 资料 = 态.资料 || {}
      const 空间 = 态.空间 || {}
      const 日志 = 态.日志 || []

      const 页签 = h('div', { style: S.tabBar },
        ...['总览', '发布', '设置'].map((名) => h('div', {
          key: 名, onClick: () => set页(名), style: 页 === 名 ? S.tab_on : S.tab,
        }, 名)))

      const 总览页 = h('div', null,
        h('div', { style: S.card },
          h('div', { style: S.h, margin: '0 0 8px' }, '现在什么样'),
          h('div', null, 态.号 ? ('✓ 登录的号：' + 态.号 + '（' + (资料.昵称 || '?') + '）') : ('⚠ ' + (态.号错 || '没登录'))),
          h('div', { style: S.dim }, '协议端：' + (协议端.地址 || '?') + (协议端.令牌 ? '｜带令牌' : '')),
          h('div', { style: S.dim },
            '今天发了 ' + (态.今天发了几条 || 0) + ' 条｜上限 ' + (配置_.postDailyLimit || 0)
            + '｜两条间隔 ' + (配置_.postCooldownMinutes || 0) + ' 分钟'
            + (配置_.dryRun ? '｜⚠ 演练模式开着（不会真发）' : ''))),
        h('div', { style: S.card },
          h('div', { style: S.h, margin: '0 0 8px' }, '最近的说说（共 ' + (空间.总数 || 0) + ' 条）'),
          空间.动态 && 空间.动态.length
            ? h('div', null, ...空间.动态.slice(0, 6).map((p, i) => h('div', { key: p.tid || i, style: S.post },
              h('div', null, String(p.正文 || '').slice(0, 120)),
              h('div', { style: S.dim }, new Date(Number(p.时间) * 1000).toLocaleString() + (p.tid ? '｜' + p.tid : '')))))
            : h('div', { style: S.dim }, 空间.错 || '还没有说说')),
        h('div', { style: S.card },
          h('div', { style: S.h, margin: '0 0 8px' }, '最近操作'),
          (态.最近操作 && 态.最近操作.length)
            ? h('div', { style: S.dim }, ...态.最近操作.map((e, i) => h('div', { key: i },
              new Date(e.at).toLocaleString() + '｜' + e.kind + '｜' + e.status + (e.通道 ? '｜' + e.通道 : '') + (e.tid ? '｜' + e.tid : ''))))
            : h('div', { style: S.dim }, '还没有')),
        h('div', { style: S.card },
          h('div', { style: S.h, margin: '0 0 8px' }, '日志'),
          h('div', { style: S.log }, ...(日志.length ? 日志.map((l, i) => h('div', { key: i }, l.时间 + '  ' + l.文本)) : ['（还没有）']))))

      const 发布页 = h('div', null,
        h('div', { style: S.card },
          h('div', { style: S.h, margin: '0 0 8px' }, '发一条'),
          行('正文', h('textarea', {
            style: S.area, value: 草稿.content,
            onChange: (e) => set草稿({ ...草稿, content: e.target.value }),
            placeholder: '想说什么…（1~3 句就好）',
          }), '上限 ' + (配置_.maxChars || 600) + ' 字；同样的内容不会重复发'),
          行('谁能看见', h('select', {
            style: S.input, value: 草稿.visibility,
            onChange: (e) => set草稿({ ...草稿, visibility: e.target.value }),
          },
            h('option', { value: 'friends' }, '好友可见'),
            h('option', { value: 'public' }, '所有人可见'),
            h('option', { value: 'self' }, '仅自己可见'))),
          行('图片（可空）', h('textarea', {
            style: S.area, value: 草稿.imageUrls,
            onChange: (e) => set草稿({ ...草稿, imageUrls: e.target.value }),
            placeholder: '一行一个：公开 http(s) 链接，或本机绝对路径（C:\\a.png）',
          }), 'png / jpg / gif / webp，单张 ≤6MB，最多 9 张'),
          h('div', { style: S.hint },
            '自己的表情包也能发：填它在 ~/.dsh/meme-packs/… 下的绝对路径（原图直发，GIF 不会变静态）。'),
          h('div', { style: S.row },
            按钮('预览（不发）', () => 发(true), false, 忙),
            按钮(忙 ? '等一下…' : '发布', () => 发(false), true, 忙)),
          说 ? h('div', { style: 说.includes('没') || 说.includes('失败') ? S.warn : S.ok }, 说) : null,
          h('div', { style: S.hint }, '发布走协议端接口；协议端不认这套接口时，会自动退到浏览器兜底（见「设置」）。')))

      const 设置页 = h('div', null,
        h('div', { style: S.card },
          h('div', { style: S.h, margin: '0 0 8px' }, '开关'),
          行('允许发动态', 勾(配置_.allowPublish, (v) => 改('allowPublish', v))),
          行('允许改资料（昵称/签名/性别）', 勾(配置_.allowProfile, (v) => 改('allowProfile', v))),
          行('允许换头像', 勾(配置_.allowAvatar, (v) => 改('allowAvatar', v))),
          行('协议端没有空间接口时，用浏览器兜底', 勾(配置_.browserFallback, (v) => 改('browserFallback', v)),
            '兜底 = 开一个 Edge 走网页版发布框（第一次要扫码）。关掉就只走协议端。'),
          行('演练模式（只预览，不真发）', 勾(配置_.dryRun, (v) => 改('dryRun', v)))),
        h('div', { style: S.card },
          h('div', { style: S.h, margin: '0 0 8px' }, '频率'),
          行('默认可见范围', h('select', {
            style: S.input, value: 配置_.defaultVisibility || 'friends',
            onChange: (e) => 改('defaultVisibility', e.target.value),
          },
            h('option', { value: 'friends' }, '好友可见'),
            h('option', { value: 'public' }, '所有人可见'),
            h('option', { value: 'self' }, '仅自己可见'))),
          行('两条动态最短间隔（分钟）', h('input', {
            style: S.input, type: 'number', min: 0, value: 配置_.postCooldownMinutes ?? 30,
            onChange: (e) => 改('postCooldownMinutes', Number(e.target.value)),
          }), '0 = 不限间隔（重复内容仍会被挡）'),
          行('每天最多几条', h('input', {
            style: S.input, type: 'number', min: 0, value: 配置_.postDailyLimit ?? 6,
            onChange: (e) => 改('postDailyLimit', Number(e.target.value)),
          }), '0 = 不限；按北京时间算'),
          行('资料/头像修改间隔（分钟）', h('input', {
            style: S.input, type: 'number', min: 0, value: 配置_.profileCooldownMinutes ?? 60,
            onChange: (e) => 改('profileCooldownMinutes', Number(e.target.value)),
          })),
          行('正文上限（字）', h('input', {
            style: S.input, type: 'number', min: 100, value: 配置_.maxChars ?? 600,
            onChange: (e) => 改('maxChars', Number(e.target.value)),
          }))),
        h('div', { style: S.card },
          h('div', { style: S.h, margin: '0 0 8px' }, '协议端'),
          行('地址', h('input', {
            style: S.input, value: 配置_.napcat || '',
            onChange: (e) => 改('napcat', e.target.value),
            placeholder: '留空 = 用「通到 QQ」里那个（http://127.0.0.1:3000）',
          }), '装过「通到 QQ」就不用填'),
          行('令牌', h('input', {
            style: S.input, value: 配置_.token || '',
            onChange: (e) => 改('token', e.target.value),
            placeholder: '协议端开了鉴权才填',
          })),
          h('div', { style: S.dim }, '现在连的是：' + ((态.协议端 && 态.协议端.地址) || '?') + (态.协议端 && 态.协议端.令牌 ? '（带令牌）' : ''))),
        h('div', { style: S.card },
          h('div', { style: S.h, margin: '0 0 8px' }, '浏览器兜底'),
          h('div', { style: S.dim }, '只有协议端不支持空间接口时才用得上。第一次要扫码登录，cookie 存在 ~/.dsh/qzone/profile。'),
          h('div', { style: S.row }, 按钮('打开扫码窗口', async () => {
            set说('开浏览器…')
            const r = await post('/browser-login', {})
            set说((r && r.说) || '没回应')
          }))),
        h('div', { style: S.row },
          按钮(忙 ? '保存中…' : '保存设置', 存, true, 忙),
          脏 ? h('span', { style: S.warn }, '有改动还没保存') : h('span', { style: S.ok }, '已同步 ✓')))

      return h('div', { style: S.wrap },
        h('div', { style: S.h, margin: '0 0 4px' }, 'QQ 空间'),
        h('div', { style: S.dim }, '版本 ' + (态.版本 || '?') + '｜配置文件 ~/.dsh/qzone-self-config.json'),
        页签,
        页 === '总览' ? 总览页 : (页 === '发布' ? 发布页 : 设置页))
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      slots.inject('settings.section', () =>
        slots.register(
          { name: 'settings.section', id: 'qzone-post', order: 56, label: () => 'QQ 空间' },
          Section,
        ),
      )
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
