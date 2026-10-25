# dsh-qzone-post · QQ 空间

给 DSH 用的 QQ 空间插件：**发带图说说、看最近动态、改昵称/签名/性别、换头像**。

默认走**协议端（SnowLuma / NapCat）自带的空间接口** —— 不装浏览器、不需要 cookie、不点坐标。
协议端不认识这套接口时，自动退到**浏览器兜底**（CDP 点网页版发表框，会标 `通道: 浏览器`）。

## 装

```powershell
# 方式一：从 tgz 装（推荐）
dsh plugin add <path>\dsh-qzone-post-1.0.0.tgz

# 方式二：直接用目录（开发时）
#   把本目录放到 %USERPROFILE%\.dsh\dsh-plugins\ 下，profile 的 package.json 里加：
#   "dsh-qzone-post": "link:C:/Users/<你>/.dsh/dsh-plugins/dsh-qzone-post"
```

装完**重启一次** DSH：设置页左侧会出现「QQ 空间」。

## 四个工具

| 工具 | 干什么 |
| --- | --- |
| `qzone_state` | 昵称 / 签名 / 最近动态 / 今天发了几条 / 最近操作 |
| `qzone_publish` | 发说说（`friends` 好友 / `public` 所有人 / `self` 仅自己），可带图 |
| `qzone_profile` | 改昵称（≤16）/ 签名（≤80）/ 性别（0/1/2），改完回读 |
| `qzone_avatar` | 换头像（一张图） |

## 面板

设置页 → **QQ 空间**，三个页签：

- **总览**：登录的号、昵称、今天发了几条、最近说说、最近操作、日志
- **发布**：正文 / 可见范围 / 图片；「预览（不发）」只演练，一个写接口都不调
- **设置**：三个许可开关、浏览器兜底、演练模式、默认可见范围、频率与字数上限、协议端地址与令牌

## 图片怎么给

一行一个，三种写法都收：

```
https://example.com/a.png
C:\Users\你\Pictures\a.gif
~/.dsh/meme-packs/whale-girl-emoji/memes/happy/xxx.webp
```

本机图会先查：存在、png/jpg/gif/webp、单张 ≤6MB，然后**原样**（不重编码）交给协议端 —— GIF 还是动的。
相对路径不猜（直接报错，免得发错图）。最多 9 张，自动去重。

## 协议端在哪

按这个顺序找，先有先用：

1. 本插件配置里的 `napcat` / `token`
2. `~/.dsh/qq-bridge-config.json` 里的 `NapCat` / `令牌`（装了「通到 QQ」就不用填第二遍）
3. `http://127.0.0.1:3000`

## 它守的规矩

- **先查重**：同样的正文不重复发；同样的资料不重复改。
- **先落盘再调用**：接口超时记 `unknown`，下次先核对最近动态（按前 40 字认领），**不盲目重发**。
- **频率**：动态之间默认 30 分钟、每天最多 6 条；资料/头像 60 分钟。
- **演练模式**：`dryRun: true` 时只回参数。
- **只说做到的事**：接口回 tid 才算 verified；改资料靠回读。没说成就别说成了。

## 配置文件

`~/.dsh/qzone-self-config.json`（改完立即生效，不用重启）：

```json
{
  "allowPublish": true, "allowProfile": true, "allowAvatar": true,
  "defaultVisibility": "friends",
  "postCooldownMinutes": 30, "postDailyLimit": 6,
  "profileCooldownMinutes": 60, "maxChars": 600,
  "dryRun": false, "browserFallback": true,
  "napcat": "", "token": ""
}
```

操作记录在 `~/.dsh/qzone-self/state.json`：最近 7 天、最多 200 条，只存状态/正文摘要/哈希，不存凭证。

## 排错

| 症状 | 先看什么 |
| --- | --- |
| 面板说「没登录」 | 协议端有没有登录 QQ（`get_login_info`） |
| 发出去没 tid | 接口接受了但没回执 → 去空间里看一眼，别重发 |
| 一直「操作太密」 | 频率设置，或 `postDailyLimit` 到了 |
| 图片发不出去 | 路径是不是绝对路径、格式、大小；协议端支不支持 `file://` |

## 参考

- SnowLuma API：`send_qzone_msg` / `get_qzone_msg_list` / `set_qq_profile` / `set_qq_avatar`
- 实现思路来自 `skills-qq-self`（先落盘、超时核对、可见范围码 1/4/64）

## 边界

这是**拿你自己的号说话**。插件不会自己定时发，也不会往群里广播。
