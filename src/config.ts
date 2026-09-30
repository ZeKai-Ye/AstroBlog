/**
 * Site-wide configuration.
 *
 * Every string below is copied from the `ui设计.free` mockup so the rendered
 * pages line up with the design. Change `title` and `author` to make it yours;
 * nothing else needs to be touched.
 */

export interface NavItem {
  /** Target route. */
  href: string;
  /** First line of the nav item in the design (Chinese). */
  zh: string;
  /** Second line of the nav item in the design (Greek). */
  greek: string;
}

/**
 * Prefixes a root-relative path with Astro's configured `base`.
 *
 * Astro rewrites the asset URLs it generates itself, but not `href`s written by
 * hand in a template. Deploying at the domain root (the default) makes this a
 * no-op; it only matters if `BASE_PATH` is ever set.
 */
const BASE = import.meta.env.BASE_URL.replace(/\/+$/, '');

export const withBase = (path: string) => {
  const normalised = path.startsWith('/') ? path : `/${path}`;
  return `${BASE}${normalised}` || '/';
};

/**
 * Resolves a file name to an image.
 *
 * Drop a photo into `src/assets/` — sub-folders are fine — and write its name
 * relative to that folder in `SITE.images` below. Everything there is picked up
 * at build time, so there is no import to add; Astro then resizes and compresses
 * it once per slot it is used in.
 *
 * Two things this deliberately does:
 *
 *   - matches the extension case-insensitively, because Windows hands you
 *     `IMG_1234.JPG` far more often than `img_1234.jpg`;
 *   - **throws** when a configured name resolves to nothing, instead of quietly
 *     drawing the placeholder. A configured-but-missing picture is always a
 *     typo, and a silent fallback is how you end up staring at an empty slot
 *     wondering why nothing happened.
 */
import type { ImageMetadata } from 'astro';

const EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'];

const files = import.meta.glob<{ default: ImageMetadata }>(
  [
    '/src/assets/**/*.{jpg,jpeg,png,webp,avif,gif}',
    '/src/assets/**/*.{JPG,JPEG,PNG,WEBP,AVIF,GIF}',
  ],
  { eager: true }
);

/** Keyed by the name as written in SITE.images, lower-cased for lookup. */
const byName = new Map<string, { src: ImageMetadata; label: string }>();

for (const [path, mod] of Object.entries(files)) {
  const label = path.replace('/src/assets/', '');
  byName.set(label.toLowerCase(), { src: mod.default, label });
}

export const asset = (name?: string): ImageMetadata | undefined => {
  if (!name) return undefined;

  const wanted = name.replace(/^\.?\//, '').toLowerCase();
  const hit = byName.get(wanted);
  if (hit) return hit.src;

  const available = [...byName.values()].map((entry) => entry.label).sort();
  throw new Error(
    `[assets] SITE.images points at "${name}", but there is no such file in src/assets/.\n` +
      (available.length
        ? `  In there: ${available.join(', ')}\n`
        : '  src/assets/ has no images in it yet.\n') +
      `  Supported extensions: ${EXTENSIONS.join(', ')} (any case).`
  );
};

export const SITE = {
  /** The wordmark in the masthead. In the mockup this is the grey
   *  "待添加的标题主图标位置" placeholder box. */
  title: 'Erga kai Hemerai',

  description: '一个以文字与图像记录工作与时日的个人站点。',
  lang: 'zh-CN',

  /**
   * Fallback identity. Real authors live in `src/content/authors/` — this is
   * only used if that folder is empty, or if a post names an author id that
   * does not exist.
   */
  author: {
    name: '名字',
    bio: '作者简介',
  },

  /** Masthead navigation, in the order drawn in the design. */
  nav: [
    { href: '/', zh: '首页', greek: 'οἶκος' },
    { href: '/works/', zh: '工作', greek: 'Ἔργα' },
    { href: '/blog/', zh: '时日', greek: 'Ἡμέραι' },
    { href: '/about/', zh: '关于', greek: 'περί' },
  ] satisfies NavItem[],

  /** The two feature links in the home-page hero (the pill + badge motifs). */
  features: [
    { href: '/works/', zh: '工作', greek: 'Ἔργα' },
    { href: '/blog/', zh: '时日', greek: 'Ἡμέραι' },
  ],

  /**
   * 工作页的条目。
   *
   * `image` 是 `src/assets/` 里的文件名，留空则该张显示占位块。这三条是示例，
   * 换成你自己的作品即可；要更多条目就往数组里加。
   */
  works: [
    { title: '项目一', meta: '2024 · 进行中', image: '' },
    { title: '项目二', meta: '2023 · 已归档', image: '' },
    { title: '项目三', meta: '2022 · 已归档', image: '' },
  ],

  /**
   * Pictures, by file name inside `src/assets/`.
   *
   * Put `hero-work.jpg` in that folder and write `heroWork: 'hero-work.jpg'`.
   * A name that matches nothing fails the build rather than quietly falling back
   * to the placeholder. Leave a value as `''` to keep the placeholder on
   * purpose. The two hero slots fall back to the newest posts' covers.
   */
  images: {
    /** Home page, left shot (the 工作 feature). */
    heroWork: 'work.jpg',
    /** Home page, right shot in the cream band (the 时日 feature). */
    heroDays: 'free.jpg',
    /** Fallback avatar for the identity above. Each real author's photo goes
     *  next to their own file in src/content/authors/. */
    avatar: '',
  },

  /** Left-aligned label in the footer. */
  footerNote: '底边栏',
} as const;

/** Splits a date into the three stacked lines the design puts beside a title. */
export function formatDateParts(date: Date) {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return {
    year: String(date.getFullYear()),
    month: monthNames[date.getMonth()],
    day: String(date.getDate()).padStart(2, '0'),
    iso: date.toISOString().slice(0, 10),
  };
}
