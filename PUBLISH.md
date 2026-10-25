# 发布到 npm —— 照着敲就行

包已经打好了：`dist/dsh-qzone-post-1.0.0.tgz`（约 27KB，包名 `dsh-qzone-post` 目前没被占用）。

## 0. 准备（一次性）

需要 Node 22+ 和 npm 账号。这台机器自带的 node/pnpm 在这里：

```powershell
$node = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
$pnpm = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs"
cd "$env:USERPROFILE\.dsh\dsh-plugins\dsh-qzone-post"
```

## 1. 先确认包是对了

```powershell
& $node $pnpm pack --pack-destination dist
& $node $pnpm publish --dry-run --no-git-checks
```

第二条会打印「📦 dsh-qzone-post@1.0.0 → https://registry.npmjs.org/」和一句 dry run 警告 —— 说明清单没问题，且**不会真发**。

## 2. 登录 npm（只需要一次）

```powershell
npx npm login
```

浏览器会弹出来授权。如果账号开了 2FA，这一步和发布时都会要一次性验证码 —— **在你自己终端里跑**，别让我在后台跑（后台会卡在验证码上）。

登完确认一下：

```powershell
npx npm whoami        # 打印你的用户名就对了
```

## 3. 发布

```powershell
& $node $pnpm publish --no-git-checks
```

## 4. 核对

```powershell
npx npm view dsh-qzone-post version     # 应该打印 1.0.0
npx npm view dsh-qzone-post dist.tarball
```

## 5. 以后改版本再发

```powershell
# 改 package.json 的 version（例如 1.0.1），然后
& $node $pnpm pack --pack-destination dist
& $node $pnpm publish --no-git-checks
```

npm 不允许覆盖同版本号，**必须先改 version**。

## 常见坑

| 报错 | 原因 / 怎么办 |
| --- | --- |
| `ENEEDAUTH` | 没登录。回到第 2 步。 |
| `EOTP` | 账号开了 2FA，需要一次性验证码 —— 在终端里手动跑，不要后台跑。 |
| `403 You do not have permission` | 包名被别人占了，或你的账号没这个 scope 的权限。 |
| `EPUBLISHCONFLICT` | 这个版本号已经发过了，改 version 再来。 |
| `ERR_PNPM_GIT_UNCLEAN` | 目录不是干净的 git 仓库，加 `--no-git-checks`。 |

## 发完之后

别人这么装：

```powershell
pnpm add dsh-qzone-post
# 或在 DSH 的 profile 目录里
```

装完重启 DSH，设置页左侧会出现「QQ 空间」。

---

# 发到 GitHub（比 npm 简单，而且 DSH 插件市场认 github 源）

这台机器没装 git / gh，先装一个：

```powershell
winget install --id Git.Git -e
```

（装完重开一个终端，`git --version` 能出版本就行。）

## 1. 建仓库

网页开 <https://github.com/new>，名字填 `dsh-qzone-post`，**不要**勾 README / .gitignore（本地已经有了）。

## 2. 推上去

```powershell
cd "$env:USERPROFILE\.dsh\dsh-plugins\dsh-qzone-post"
git init
git add -A
git commit -m "dsh-qzone-post 1.0.1：QQ 空间发说说/改资料/换头像"
git branch -M main
git remote add origin https://github.com/wang1048920402/dsh-qzone-post.git
git push -u origin main
```

首次 push 会弹浏览器授权（Git Credential Manager 会记住）。

## 3. 发版本（Release）

```powershell
git tag v1.0.1
git push origin v1.0.1
```

然后网页 **Releases → Draft a new release**：选 `v1.0.1`，标题写 `1.0.1`，
把 `dist\dsh-qzone-post-1.0.1.tgz` 拖进附件区，发布。

## 4. 别人怎么装

- **从市场装**：DSH 插件市场支持 github 源（安装时锁 commit SHA）。
- **从 tgz 装**：下载 Release 里的 tgz，`pnpm add <路径>`。
- **从源码 link**：`"dsh-qzone-post": "link:C:/.../dsh-qzone-post"`。

## 注意

- 别把 `dist/`、`node_modules/` 提交上去（.gitignore 已经排掉了）。
- `package.json` 里的 `repository` / `homepage` 现在写的是 `Yuuyuko-uu/dsh-qzone-post`；
  如果你的 GitHub 用户名不是这个，**先改 package.json 再推**。
- 两个渠道可以同时发：GitHub 给源码和 Release，npm 给 `pnpm add dsh-qzone-post`。

---

# ✅ 已发布（2026-10-25）

- 仓库：<https://github.com/wang1048920402/dsh-qzone-post>
- Release：<https://github.com/wang1048920402/dsh-qzone-post/releases/tag/v1.0.1>
- 描述与 topics 已补：`dsh-plugin` `deepseek-harness` `qzone` `qq-space` `onebot` `napcat` `snowluma` `dsh`
- 多余的那层 `dsh-qzone-post/` 子目录已递归删除；根目录现在就是插件本体

**验证过的安装方式**（真跑通）：

```powershell
pnpm add https://github.com/wang1048920402/dsh-qzone-post/releases/download/v1.0.1/dsh-qzone-post-1.0.1.tgz
```

装完 `apply()` 正常，四个工具都在：`qzone_state` / `qzone_publish` / `qzone_profile` / `qzone_avatar`。
