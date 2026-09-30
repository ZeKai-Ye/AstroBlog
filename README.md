# Erga kai Hemerai

一个以 Astro 构建的个人博客。界面按仓库根目录的设计稿还原：

- **`ui设计.jpg`** — 导出的最终稿，**以它为准**
- **`ui设计.free`** — Lunacy 14.1 源文件，用于取精确坐标与图层信息

两份稿子并不完全一致（`.free` 是较早的版本），有冲突时按 `.jpg` 来。已经核对到的差异：

| 位置 | `.free` 图层数据 | `.jpg` 实际渲染 |
| :-- | :-- | :-- |
| 文章页正文块 | `x 0–1382`，填充 `#757575` | `x 151–1381`，填充 `#AAA4A4`（占位灰） |
| 首页胶囊右端 | 一个 `115×115` 的矩形，`iconId: t8RS9QqzNZG3` | **点状箭头 →**，不是实心圆 |

其余元素（报头 301px、logo 块 480–1440、导航 y 211、首图 320–960、次图 960–1600、
两枚胶囊 1111–1600 / 320–809、推荐四行 960–1677、底边栏 306px）两份稿子一致。

## 命令

| 命令 | 作用 |
| :-- | :-- |
| `npm install` | 安装依赖 |
| `npm run dev` | 开发服务器（http://localhost:4321） |
| `npm run build` | 产出静态站点到 `./dist/` |
| `npm run preview` | 预览 `./dist/` |
| `npm run astro -- --help` | Astro CLI 帮助 |

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
src/
├── config.ts            站点标题、导航、withBase()、asset()、日期格式化
├── authors.ts           作者查找：排序、按 id 取、按作者统计篇数
├── content.config.ts    authors / blog 两个内容集合
├── content/blog/*.md    文章
├── content/authors/*.md 作者（头像就放在各自 .md 旁边）
├── assets/              站点级图片 + 自己的说明
├── styles/global.css    设计令牌（颜色 / 字体 / 尺寸）+ 基础排版
├── layouts/BaseLayout.astro
├── components/
│   ├── SiteHeader.astro   报头：标题块 + 中/希双语导航
│   ├── SiteFooter.astro   底边栏（导航只保留中文）
│   ├── BackToTop.astro    回到顶部按钮
│   ├── WaveBand.astro     首页的波浪边奶油色色带
│   ├── HeroPill.astro     首页胶囊标签 + 点状箭头
│   ├── PostRow.astro      推荐列表的一行（顶部细线分隔）
│   ├── Figure.astro       图片位；无图时显示占位块
│   ├── AuthorCard.astro   作者卡：文章侧栏用，作者一览的格子也用它
│   └── SearchBox.astro    搜索框
└── pages/
    ├── index.astro           首页（设计稿第 1 帧）
    ├── blog/index.astro      时日 · 列表
    ├── blog/[...slug].astro  文章页（设计稿第 2 帧）
    ├── authors/[...id].astro 作者页：头像、简介、TA 写的文章
    ├── works.astro           工作（占位）
    ├── about.astro           关于 + 作者一览
    ├── search.astro          站内搜索（构建期生成索引，浏览器端过滤）
    └── 404.astro
```

## 设计令牌

`src/styles/global.css` 顶部是所有取自设计稿的值。原稿两块画布都是 1920×4320，
导航与首屏栅格占 x 320–1600，也就是一个 1280px 的内容列，全站共用它。

| 用途 | 值 |
| :-- | :-- |
| 报头底板（首页） | `#FFF1D4` + `0 6px 4px rgb(0 0 0 / .25)` 投影 |
| 报头底板（文章页） | `#FFF1D4` 80% 透明（稿件的 `CCFFF1D4`） |
| 首屏 / 页脚底色（画布底色） | `#F0D9C7` |
| 波浪色带 | `#FFF1D4` |
| 文章页底色 / 卡片 | `#FCF4E3` |
| 正文 / 次级文字 | `#000000` / `#757575` |
| 分隔线 | `#BDBDBD` |
| 强调色（推荐、关于、点状箭头） | `#F49D99` `#ECB181` `#F29191` `#EB9D60` |
| 字体 | LXGW WenKai Mono TC（正文/界面）、Inter（大号区块标题） |

注意报头是**奶油色底板压在棕黄画布上**，不是棕黄本身——`.free` 里它的图层是
`fill:"FFF1D4"` 加一层 25% 黑的投影，`.jpg` 在 y 301–311 也能量到这段投影。

色带高度按设计稿的整屏 1080px 保留（`--band-min`），所以「关于」那一带即便文字很少
也保持空旷——这是稿子本来的节奏。

波浪边是**从 jpg 逐点采样后拟合**的，不是照抄 `.free` 的 `points` 数组：沿顶边每 40px
取一次色，得到 `x=0→64`、`x=340→95`（谷）、`x=1600→7`（峰）、`x=1920→62`，再让每个
接缝处切线连续。构建结果与稿件逐点比对，全宽误差在 4px 以内。上下两条边共用同一条
路径（底边翻转），因此保持同相——色带整体在左侧下沉、右侧上浮。

设计稿里所有纯灰 `#ABA4A4` 方块是**图片位置演示**，不是配色，所以站内没有任何地方
使用这个灰色；`Figure` 组件在缺图时画的是暖沙色占位块。

稿件变量集合里还声明了一套绿/琥珀色 Material 调色板（主色 `#4CAF50`、强调色 `#FFC107`
等）。两块画布都没有用到它，因此只在 `global.css` 中作为 `--p-*` 令牌保留备查。

## 相对设计稿的三处主动偏离

这三处是刻意的，改回去只需动对应令牌：

| 偏差 | 原因 | 位置 |
| :-- | :-- | :-- |
| 报头从 301px 缩到约 178px | 原稿报头占了首屏四分之一，偏高 | `SiteHeader.astro` 的 `.masthead__logo` / `--fs-nav` |
| 页脚导航只保留中文 | 报头已经有一遍「中文 / 希腊文」对照，页脚再来一遍太吵 | `SiteFooter.astro` |
| 增加了回到顶部按钮 | 稿子里没有，但长页面需要 | `BackToTop.astro` |

底边栏中文后的希腊文已去掉；站点名 `Erga kai Hemerai` 在 `src/config.ts` 的 `title`。

## 换图片

站内一共有 5 处图片位，分两种放法。

### 1. 站点级图片 —— 放进 `src/assets/`，在 config 里写文件名

把照片丢进 **`src/assets/`**，然后在 `src/config.ts` 的 `SITE.images` 填**文件名**：

```ts
images: {
  heroWork: 'hero-work.jpg',   // 首页左边那张（工作）
  heroDays: 'hero-days.jpg',   // 首页奶油色带里那张（时日）
  avatar:   'avatar.jpg',      // 兜底头像，一般用不到
},
```

`avatar` 只在作者没有自己的头像时才用到 —— 作者的头像放在各自那份作者 `.md` 旁边，
见下面的「作者」一节。

不用写 `import` —— `asset()` 会在构建时把 `src/assets/` 下的文件全部登记，按名字取用。
**子目录也认**（文件在 `photos/hero.jpg`，就写 `photos/hero.jpg`）。

三条容易踩的规则：

- **文件名必须和实际完全一致**。写错不会静默降级，而是**直接构建失败**并列出目录里
  现有的文件：

  ```
  [assets] SITE.images points at "hero-days.jpg", but there is no such file in src/assets/.
    In there: free.jpg
    Supported extensions: jpg, jpeg, png, webp, avif, gif (any case).
  ```

- **扩展名不区分大小写**，`IMG_1234.JPG` 和 `img_1234.jpg` 都能用。
- **只认这几种格式**：`jpg` / `jpeg` / `png` / `webp` / `avif` / `gif`。`.heic`（iPhone 默认）
  和 `.bmp` 不认，先转成 jpg。

留 `''` 就是设计稿那个占位块。首页那两张如果不填，会退回到最新两篇文章的封面。

> 图片要提交进 Git 才算数 —— Cloudflare 从仓库构建，看不到你本地的文件。原图多大都行，
> Astro 会另生成压缩版本，只是仓库里会留着原图。

### 2. 文章封面 —— 放在文章旁边，写相对路径

```yaml
---
title: 标题
cover: ./cover.jpg      # 与这篇 .md 同目录
coverAlt: 图片说明
---
```

### 尺寸与裁剪

`Figure` 组件用 `object-fit: cover` 填满各自的格子，比例由 `ratio` 决定，所以**放原图即可**，
不用自己先裁。各位置的比例：

| 位置 | 比例 | 设计稿尺寸 |
| :-- | :-- | :-- |
| 首页主图 / 次图 | `640 / 755` | 640×755 |
| 文章页封面 | `16 / 9` | — |
| 作者头像 | `294 / 266` | 294×266 |
| 工作页卡片 | `4 / 3` | — |

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
# cover: ./cover.jpg  # 可选题图
---
```

## 作者

作者是一份内容集合，`src/content/authors/` 下一人一个 Markdown：

```yaml
---
name: 沈砚
role: 主笔                    # 可选，显示在名字上方
bio: 一句话简介，出现在卡片和文章侧栏
avatar: ./shen-yan.png        # 可选，与这份 .md 同目录
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
