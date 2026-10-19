# Erga kai Hemerai

一个以 Astro 构建的个人博客。界面按 `demo/oneside-demo`（方向 A「工作与时日」）的
设计语言重构：暖纸底色、宋体大标题、发丝分隔线、点线目录、实时日晷，以及右上角
「工作 / 时日」昼夜切换。内容、路由与写作方式没有变，变的只是这一层纸墨。

角色的分配是这样的：

| 文件 | 用途 |
| :-- | :-- |
| `demo/oneside-demo/` | **现在以它为准**的设计参考（纯静态 HTML/CSS/JS，无构建） |
| `ui设计.jpg` | 最早一版的导出稿，页面骨架与 1280px 内容列仍沿用 |
| `ui设计.free` | 上面那份稿子的 Lunacy 14.1 源文件，取精确坐标用 |

重构前的完整设计没有丢，随时可以取回：

| 位置 | 内容 |
| :-- | :-- |
| tag `pre-redesign-backup` | 重构开始前的站点快照（含 `demo/`），`git checkout` 即可 |
| 分支 `demo-exp` | 重构所在分支；上面的 tag 指向它的第一个提交 |
| 分支 `master` | 重构前的站点主线（不含 `demo/`） |

## 命令

| 命令 | 作用 |
| :-- | :-- |
| `npm install` | 安装依赖 |
| `npm run dev` | 开发服务器 + 本地编辑器 |
| `npm run edit` | 同 `dev`，起编辑器用的入口 |
| `npm run build` | 产出静态站点到 `./dist/` |
| `npm run preview` | 预览 `./dist/` |
| `npm run test:editor` | 编辑器 frontmatter 读写器的自测 |
| `npm run astro -- --help` | Astro CLI 帮助 |

## 本地编辑器

`npm run dev` 之后打开 **http://localhost:4321/__edit**（终端启动时会打印这个地址）。

> **不要直接双击 `tools/editor/ui.html`。** 那是 `file://` 页面，没有后端，所有请求都会
> 失败 —— 编辑器是挂在 dev server 上的中间件，只能通过上面那个地址访问。真这么打开了，
> 页面会直接告诉你正确姿势，不用猜。

它不是一个独立进程，而是挂在 Vite dev server 上的一个中间件，所以：

- **进不了线上。** 插件标了 `apply: 'serve'`，`npm run build` 根本不会构造它 ——
  `dist/` 里没有任何编辑器相关的东西，Cloudflare 上也没有。
- **预览是真的。** 右侧预览就是本站在 iframe 里，保存后 Vite 的 HMR 自己刷新。
- 只在 localhost 上，没有对外暴露任何接口。

四个页签：

| 页签 | 能做什么 |
| :-- | :-- |
| **文章** | 建 / 改 / 删文章；标题、日期、摘要、标签、作者、封面（可从图库挑）、草稿、Markdown 正文 |
| **作者** | 建 / 改 / 删作者；名字、身份、简介、头像、排序、外链、自我介绍 |
| **图片** | 拖拽上传到 `src/assets/`、显示每张被引用几处、复制文件名、删除（被引用时会警告）；下划线开头的标为「暂存 · 不上线」 |
| **站点** | 站名、简介、语言、页脚小字、首页两张图（最近一篇配图 / 关于区照片）、工作页条目、导航 |

**重命名。** 「文件名 / 链接」那一栏可以直接改，点旁边的**重命名**即可 —— 文件名就是 id，
也就是 URL。改**作者**的文件名时，TA 名下所有文章里的署名会一起更新（不这么做的话，
那些文章会悄悄退回到第一位作者）；改**文章**的文件名只会换掉它自己的链接，旧地址没有跳转。

`Ctrl/Cmd + S` 保存；有未保存改动时关页面会拦一下。保存是直接写文件，所以在编辑器里
改完就等于改好了源码，照常 `git commit` 即可。

编辑器的 frontmatter 读写器是手写的一小份 YAML 子集（为它引一个依赖要重写近百条
lockfile 记录，不划算）。它读不懂的文件会**拒绝写入并显示原文**，而不是猜着改坏，
所以最坏情况只是那个文件在编辑器里只读。自测：`npm run test:editor`。

## 部署

用 **Cloudflare** 部署：仓库已接入 Cloudflare 的 Git 集成，推送后由 Cloudflare
自己跑 `npm run build` 并发布，所以仓库里**不需要**任何 GitHub Actions workflow。

构建产物是纯静态的 `dist/`，构建命令 `npm run build`，输出目录 `dist`。

两个可选环境变量（不设也能正常构建）：

| 变量 | 作用 |
| :-- | :-- |
| `SITE_URL` | 站点源，用于 `<link rel="canonical">` 与 og 标签；不设则跳过 canonical |
| `BASE_PATH` | 子路径，Cloudflare 默认部署在域名根目录，保持不设即可 |

`src/config.ts` 的 `withBase()` 给模板里的手写链接加 `BASE_PATH` 前缀（Astro 只重写
它自己生成的资源 URL，`<a href="/blog/">` 这类硬编码路径不会自动处理）。在根目录部署
时它是空操作；万一改到子路径下，把 `BASE_PATH` 设上就能整体生效。

以后若换成自定义域名，`configure-pages` 会自己把 `BASE_PATH` 解析成空，无需改代码。

## 结构

```
tools/
├── editor/              本地编辑器：Vite 插件 + 单文件 UI + frontmatter 读写器
└── picomatch-esm.mjs    依赖修补，见文末
src/
├── settings.json        站名、导航、图片槽位、工作页条目（编辑器写这个文件）
├── config.ts            类型化的 SITE + UI 文案 + withBase() / asset() / 日期与阅读时长
├── authors.ts           作者查找：排序、按 id 取、按作者统计篇数
├── content.config.ts    authors / blog 两个内容集合
├── loaders/
│   └── html-posts.ts    让 `.html` 也能当文章（见「用 HTML 写文章」）
├── content/blog/*.md    文章（也可写成 *.html）
├── content/authors/*.md 作者
├── assets/              全部图片都在这里 + 自己的说明
├── styles/global.css    设计令牌（纸 / 墨 / 夜读 / 字号）+ 版式与文章排版
├── scripts/site.ts      客户端行为：主题切换、日晷时钟、进场动效、预览面板、回到顶部
├── layouts/BaseLayout.astro  纸面外壳：主题预置脚本、进度线、昼夜转场层
├── components/
│   ├── SiteHeader.astro   报头：站名 + 中/希双语导航 + 此刻时钟 + 工作/时日开关
│   ├── SiteFooter.astro   底边栏：版权、中文导航、Colophon
│   ├── BackToTop.astro    回到顶部
│   ├── Sundial.astro      实时日晷：一圈代表一天，弧线与光点随时间推进
│   ├── PostRow.astro      编目一行：序号 / 标题 / 分类 / 日期 / 箭头，并携带预览数据
│   ├── Figure.astro       图片位；无图时画裁切参考线与标签
│   ├── AuthorCard.astro   作者卡：文章侧栏用，作者一览的格子也用它
│   └── SearchBox.astro    搜索框（下划线式，提交到 /search/）
└── pages/
    ├── index.astro           首页：首屏 + 最近一篇 + 文章 + 工作 + 关于
    ├── blog/index.astro      时日 · 编目 + 此刻卡片 + 标签
    ├── blog/[...slug].astro  文章页：大标题、引线导语、正文、作者卡、上下篇
    ├── authors/[...id].astro 作者页：头像、简介、TA 写的文章
    ├── works.astro           工作档案
    ├── about.astro           关于 + 题图 + 作者一览 + Colophon
    ├── search.astro          站内搜索（构建期生成索引，浏览器端过滤）
    └── 404.astro
```

## 设计令牌

`src/styles/global.css` 顶部是全部取自 `demo/oneside-demo` 的值。页面在 1600px 处封顶，
内容列 1280px，正文列 `--measure: 44rem`（约 700px）。

| 用途 | 亮（工作） | 夜（时日） |
| :-- | :-- | :-- |
| 纸面底色 | `#F2EEE5` | `#171812` |
| 深一档纸 / 色带 | `#E3DBCE` | `#22231C` |
| 墨色 / 正文 | `#3B372F` / `#4C473E` | `#D8D2C5` / `#C7C1B4` |
| 次级文字 | `#6F6A5E` | `#999487` |
| 发丝线 | `rgb(53 50 43 / .15)` | `rgb(216 210 197 / .16)` |
| 强调色（陶土） | `#9C5A3D` | `#C49172` |
| 字体 | Noto Serif SC（标题 / 正文）、系统无衬线（界面小字 9–13px）、楷体（便签与印章） | 同左 |

三件事值得单独说明：

- **昼夜是一套变量，不是两套样式。** `html[data-theme="night"]` 只重写颜色令牌，
  组件里没有任何一处再判断主题；纸张与夜读共用同一份排版。
- **颗粒感**来自 `body::before` 里一块 150px 的 SVG 噪声（2.6% 不透明度，夜间 3.6%），
  它压在所有内容之上但 `pointer-events: none`，所以只是质感，不挡点击。
- **代码块**用 Shiki 的双主题（`github-light` / `github-dark`）加 `defaultColor: false`，
  输出 `--shiki-light` / `--shiki-dark` 变量，再由同一个 `data-theme` 选择器取色——
  见 `astro.config.mjs` 的 `markdown.shikiConfig`。

## 与旧版设计的关系

这次是按 demo 重做视觉，页面骨架、路由、内容集合与编辑器都沿用上一版，所以：

| 变化 | 说明 |
| :-- | :-- |
| 移除波浪色带与胶囊标签 | `WaveBand.astro` / `HeroPill.astro` 属于旧的奶油—棕黄语言，新首屏是排版而非图片 |
| 移除 `SiteMark.astro` | 报头改成文字站标；`images.logo` 改为「关于」页的整幅题图 |
| 新增 `Sundial.astro`、`scripts/site.ts` | 实时日晷与全部客户端行为集中在这个脚本里 |
| 新增「工作 / 时日」昼夜切换 | 右上角开关，圆形昼夜转场，偏好存 `localStorage.erga-theme` |
| 新增阅读进度线与编目悬停预览 | 首页「文章」区悬停 / 聚焦时右侧摘要卡交叉淡入 |

**主题与无脚本降级：** 主题偏好由 `<head>` 里的内联脚本在首次绘制前读取，避免白闪；
`data-reveal` / 首屏入场只在 `.js` 存在时隐藏元素，所以关掉 JavaScript 后整页照常可读。
所有动效都遵循 `prefers-reduced-motion`。

## 换图片

**所有图片都在一个地方：`src/assets/`。** 传进去之后，在需要的地方写**文件名**即可。

最省事的办法是用编辑器（见「本地编辑器」一节）：「图片」页把文件拖进去，然后在作者 /
文章 / 站点页点「选择…」。手工改的话，文件名写在这几处：

| 位置 | 写在哪 | 字段 |
| :-- | :-- | :-- |
| 关于页的整幅题图 | `src/settings.json` | `images.logo` |
| 首页「最近一篇」配图 | `src/settings.json` | `images.heroWork` |
| 首页「关于」区的小照片 | `src/settings.json` | `images.heroDays` |
| 兜底头像 | `src/settings.json` | `images.avatar` |
| 工作页卡片 | `src/settings.json` | `works[].image` |
| 文章封面 | 那篇文章的 frontmatter | `cover`（HTML 文章写 `<meta name="cover">`） |
| 作者头像 | 那位作者的 frontmatter | `avatar` |

```yaml
# src/content/blog/my-post.md
---
title: 标题
cover: my-photo.jpg      # 文件名，不是路径
coverAlt: 图片说明
---
```

```yaml
# src/content/authors/shen-yan.md
---
name: 沈砚
avatar: shen-yan.jpg     # 文件名，不是路径
---
```

不用写 `import` —— `asset()` 会在构建时把 `src/assets/` 下的文件全部登记，按名字取用。
**子目录也认**（文件在 `photos/hero.jpg`，就写 `photos/hero.jpg`）。

三条容易踩的规则：

- **文件名必须和实际完全一致**。写错不会静默降级，而是**直接构建失败**并列出目录里
  现有的文件：
  ```
  [assets] settings.json points at "hero-days.jpg", but there is no such file in src/assets/.
    In there: free.jpg
    Supported extensions: jpg, jpeg, png, webp, avif, gif (any case).
  ```
- **扩展名不区分大小写**，`IMG_1234.JPG` 和 `img_1234.jpg` 都能用。
- **只认这几种格式**：`jpg` / `jpeg` / `png` / `webp` / `avif` / `gif`。`.heic`（iPhone 默认）
  和 `.bmp` 不认，先转成 jpg。
- **文件名以 `_` 开头 = 暂存，不上线**。文件照旧留在磁盘和仓库里，但不打包进 `dist/`，
  所以不会传到你线上站点；编辑器「图片」里它会变灰、标成「暂存 · 不上线」，也选不中。
  还没想好放哪的照片就加个下划线，想用了再去掉（比如 `_寒假.jpg` → `寒假.jpg`）。

留空（`''`）时那个位置画的是纸面占位块——一条裁切线、一个标签，不是灰方块。
首页「最近一篇」的图留空会退回到那篇文章的封面；「关于」区的小照片留空就只剩占位。

`images.logo` 是「关于」页顶部那块整幅题图（原来用作报头站标）。报头现在是文字站标，
取 `title`；这张图按 960×181 的横图导出放进去正好，比例在页面里按 `960 / 181` 裁剪。

> 图片要提交进 Git 才算数 —— Cloudflare 从仓库构建，看不到你本地的文件。所以放进去之前
> 先跑一次 `npm run images`（见下），别把相机原图提交上去。

### 别把原图提交进仓库

照片原图动辄 5–8 MB，而站点实际渲染出来的 webp 往往只有几百 KB —— 原图从来没被访问过，
只是躺在仓库里，跟着每一次 clone 和每一次部署构建。所以放图之前先跑：

```bash
npm run images            # 处理 src/assets（加 --public 连 public/ 一起）
npm run images -- --dry   # 只看会做什么，不动文件
```

它会做三件事：把原图移到 `originals/`（已在 .gitignore 里，是你自己留的备份），在原位置
写一份长边不超过 1600px 的 `.webp`，并**自动把 settings 和 frontmatter 里对它的引用改掉**。
长边 1600 比任何地方请求的最大宽度都大（`Figure` 要 480/800/1200，关于页题图 960），所以高分屏
不会被喂不饱。小于 100 KB 的图不动，压完反而变大的会保持原样并告诉你。

引用改错了不会静默坏掉：`asset()` 遇到解析不了的名字会直接让**构建失败**，所以 `npm run build`
就是检查。

### 尺寸与裁剪

`Figure` 组件用 `object-fit: cover` 填满各自的格子，比例由 `ratio` 决定，所以**放原图即可**，
不用自己先裁。各位置的比例：

| 位置 | 比例 | 说明 |
| :-- | :-- | :-- |
| 首页「最近一篇」配图 | `4 / 4.5` | 竖图；窄屏改为 `16 / 10` |
| 首页 / 关于页的小照片 | `4 / 5` | 「关于」区，窄屏限宽 18rem |
| 关于页题图 | `960 / 181` | 整幅横幅 |
| 文章页封面 | `16 / 9` | — |
| 作者头像 | `1 / 1` | 卡片与作者页一致 |
| 工作页卡片 | `4 / 3` | 无图时画 CSS 图形 |

Astro 会为每个尺寸生成 WebP 的 `srcset`（480w / 800w / 1200w），浏览器按需下载。

### 网站图标

替换 `public/favicon.svg`（以及 `public/favicon.ico`）即可，不用改代码。

## 写文章

在 `src/content/blog/` 放 Markdown 即可，文件名就是 URL 片段（`/blog/<文件名>/`）。

```yaml
---
title: 标题
description: 摘要，会出现在列表与搜索里
pubDate: 2024-03-03
tags: ['随笔']
draft: false        # true 则不进入任何索引
# cover: cover.jpg  # 可选题图，src/assets/ 里的文件名
---
```

正文里插图也可以直接用相对路径（`![](photo.jpg)`，相对这份 `.md` 文件），Astro 一样会
压缩优化。只是那样图片会散在各个文章目录里，和「所有图片都在 `src/assets/`」的约定
不一致 —— 想统一就还是用 `cover:` / 编辑器里的「选择…」。

## 用 HTML 写文章

markdown 表达不了的东西 —— `<video>`、`<audio>`、`<iframe>` 嵌入、自定义结构、
自己的 `<style>` 和 `<script>` —— 就把那篇文章写成 `.html`：

```
src/content/blog/my-post.html
```

文章头是**一行一个 `<meta>` 标签**，放在文件最开头，下面是一段 **HTML 片段**，原样注入
文章正文：报头、日期、作者卡、搜索、上下篇都还在，只有正文换成你的标记。两种格式在
首页、列表、搜索、作者页里没有任何区别。

```html
<meta name="title" content="标题">
<meta name="description" content="摘要">
<meta name="pubDate" content="2024-03-03">
<meta name="tags" content="随笔, 工具">
<meta name="author" content="shizuku">

<h2>随便什么结构</h2>
<p>正文直接写 HTML，不经过 markdown 解析。</p>

<figure>
	<img src="/media/photo.jpg" alt="说明" />
	<figcaption>图注</figcaption>
</figure>

<video controls src="/media/clip.mp4"></video>
<iframe src="https://player.bilibili.com/player.html?bvid=..." title="视频"></iframe>
```

字段和 markdown 的 frontmatter 一一对应：`title`、`description`、`pubDate`、`updatedDate`、
`tags`（逗号分隔）、`cover`、`coverAlt`、`author`、`draft`、`slug`。只有 `title` 和
`pubDate` 是必填。

**为什么用 `<meta>` 而不是 `---`：** `---` 是纯文字，外部 HTML 编辑器（Word 之类）会把它
当正文，包进 `<p>`、把换行压成空格，文章头就废了。`<meta>` 是编辑器认识的标签，而且是
**空元素、没有闭合标签**，自动补全没有东西可补。每个字段独立成行，最坏情况也只丢一个字段。
（`---` 仍然认，方便和 markdown 保持一致；但外部编辑器里请用 `<meta>`。）

要紧的几条：

- **是片段，不是整页。** 不要写 `<!doctype>` / `<html>` / `<head>` / `<body>` ——
  那些位置属于站点外壳。写了会直接报错提醒你，而不是偷偷套两层。
- **文章头必须在最开头**，在它之前只能有空白。它不会被当成正文显示出来。
- **编辑器要是动了 `name` 属性**，就改用 `data-post="title"` 代替 `name="title"` ——
  两种写法都认，而 `data-post` 这种自定义属性外部编辑器没有理由去碰。哪个标签少了字段名
  会直接报错点名，不会含糊地说缺 `title`。
- **头被弄坏了也能救**：在站内编辑器里打开这篇文章，把缺的字段填回去、保存，文章头就会
  按正确形式重写一遍。
- **媒体文件放 `public/` 下**，用 `/` 开头的普通路径引用：`/media/clip.mp4` 对应
  `public/media/clip.mp4`。HTML 文章**不走** Astro 的图片管线，所以 `src/assets/`
  那套「只写文件名」的规则在这里不适用。
- **`<style>` / `<script>` 会生效。** `<script>` 在页面加载时就运行，不需要
  `is:inline` 之类的标记。注意它们**没有作用域**，写选择器时想清楚是不是只想影响这一段。
- **常规标签自动沿用站点排版。** `h2` / `p` / `ul` / `table` / `img` 这些和 markdown
  文章一样有 `.prose` 的样式；`video` / `audio` / `iframe` 会自动撑满正文列宽
  （嵌入播放器按 16:9）。想改就在元素上写 `style`，或在自己的 `<style>` 里覆盖。
- **视频别提交进 Git。** Cloudflare 是从仓库构建的，大文件会把仓库撑坏。视频更适合放
  外部（B 站 / YouTube / Cloudflare Stream）用 `<iframe>` 嵌，或放对象存储后用
  `<video src="https://...">`。
- **`.html` 和 `.md` 不能重名**，它们会抢同一个 URL；撞了会在构建时报错并指出两个文件。
  文件名仍然只用小写英文、数字和短横线，它决定 `/blog/<文件名>/`。

编辑器里一样能用：「+ 新建」时文件名写 `my-post.html` 就是 HTML 文章，
列表里会标一个 `· HTML`，正文框按原样编辑，没有 markdown 的那些规矩。

## 作者

作者是一份内容集合，`src/content/authors/` 下一人一个 Markdown：

```yaml
---
name: 沈砚
role: 主笔                    # 可选，显示在名字上方
bio: 一句话简介，出现在卡片和文章侧栏
avatar: shen-yan.png          # 可选，src/assets/ 里的文件名（不是相对路径）
order: 1                      # 可选，作者一览里的排序，小的在前
links:                        # 可选
  - label: 邮箱
    href: mailto:you@example.com
---
这里可以写长一点的自我介绍（Markdown 正文）。
```

文件名就是 id（作者页在 `/authors/<文件名>/`），文章里用 `author:` 指向它：

```yaml
---
title: 标题
author: shen-yan
---
```

没写 `author` 的文章归到第一位作者；`author` 写错时开发服务器会提示并列出可用 id。

**作者一览**在 `/about/` 页面底部，列出全部作者（头像、名字、身份、简介、篇数）。
点进任意一位是 `/authors/<id>/`：完整简介、TA 的所有文章；文章页侧栏的作者卡也指向同一页。

示例里的三位作者和头像是占位内容。换成你自己的：删掉多余的 `.md` 和图片、改掉剩下的，
作者一览、篇数、文章归属都会自动跟着变。

## 一处依赖修补

`astro.config.mjs` 把裸包名 `picomatch` 指向了 `tools/picomatch-esm.mjs`。

Astro 7.3.5 加载 `src/content.config.ts` 时使用的 Vite 环境会把 `astro` 包标记为
`noExternal`，于是 `astro/dist/content/loaders/glob.js` 被内联，而它 `import` 的
`picomatch` 是纯 CommonJS 包——Vite 的模块运行器没有 CJS 互操作，其内部的 `require`
会抛 `require is not defined`，导致 `astro sync` / `astro build` 直接失败。指向一个用
`createRequire` 包一层的小文件即可绕过，不需要改动任何依赖。详见该文件顶部注释。
