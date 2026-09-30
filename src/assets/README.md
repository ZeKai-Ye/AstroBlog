# 图片放这里

把照片丢进这个文件夹，然后在 `src/config.ts` 的 `SITE.images` 里写**文件名**：

```ts
images: {
  heroWork: 'hero-work.jpg',   // 首页左边那张（工作）
  heroDays: 'hero-days.jpg',   // 首页奶油色带里那张（时日）
  avatar:   'avatar.jpg',      // 兜底头像，一般用不到
},
```

`avatar` 只在作者没有自己的头像时才用到 —— 作者的图片放在
`src/content/authors/` 里各自那份 `.md` 旁边，见根目录 README 的「作者」一节。

支持 `jpg` / `jpeg` / `png` / `webp` / `avif` / `gif`。文件名写错时开发服务器会在
终端里提示，并列出这个文件夹里现有的文件。

留空（`''`）就显示设计稿的占位块。首页那两张如果不写，会退回到最新两篇文章的封面。

Astro 会为每个用到的地方自动缩放和压缩，所以直接放原图即可，不用自己先裁。

## 文章封面不走这里

文章自己的封面图放在**那篇 Markdown 旁边**，在 frontmatter 里用相对路径引用：

```yaml
---
title: 标题
cover: ./cover.jpg      # 与这篇 .md 同目录
coverAlt: 图片说明
---
```

详见仓库根目录的 README。
