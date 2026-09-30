# 图片放这里

**站上所有图片都在这个文件夹。** 其它地方只写**文件名**，不写路径。

最省事的办法是用编辑器（`npm run dev` → http://localhost:4321/__edit）：「图片」页把文件
拖进来，然后在「站点」/「文章」/「作者」页点「选择…」。手工改的话，文件名写在这几处：

| 位置 | 写在哪 | 字段 |
| :-- | :-- | :-- |
| 顶部站标 | `src/settings.json` | `images.logo` |
| 首页左边（工作） | `src/settings.json` | `images.heroWork` |
| 首页右边（时日） | `src/settings.json` | `images.heroDays` |
| 兜底头像 | `src/settings.json` | `images.avatar` |
| 工作页卡片 | `src/settings.json` | `works[].image` |
| 文章封面 | 那篇文章的 frontmatter | `cover` |
| 作者头像 | 那位作者的 frontmatter | `avatar` |

支持 `jpg` / `jpeg` / `png` / `webp` / `avif` / `gif`，**扩展名不区分大小写**，**子目录也认**
（文件在 `photos/hero.jpg`，就写 `photos/hero.jpg`）。

留空（`''`）就显示设计稿的占位块；`images.logo` 留空则退回站名文字。

**文件名写错不会静默失败** —— 构建会直接报错，并列出这个文件夹里现有的文件。`.heic`
（iPhone 默认）和 `.bmp` 不认，先转成 jpg。

> 设计稿的源文件（`.psd` 之类）不要放这里：构建只读图片格式，放进来对网站没有任何作用，
> 而且会被 `.gitignore` 忽略。导出 png/jpg 后把文件名填到上面那些位置即可。

图片要提交进 Git 才算数 —— Cloudflare 从仓库构建，看不到你本地的文件。原图多大都行，
Astro 会另生成压缩版本，只是仓库里会留着原图。
