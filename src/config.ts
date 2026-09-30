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
 * Drop a photo into `src/assets/` and write its **file name** in `SITE.images`
 * below — everything in that folder is picked up at build time, so there is no
 * import to add. Astro then resizes/compresses it for each slot it is used in.
 *
 * Returns `undefined` for an empty name, which is what makes `Figure` fall back
 * to the design's placeholder block.
 */
import type { ImageMetadata } from 'astro';

const files = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/*.{jpg,jpeg,png,webp,avif,gif}',
  { eager: true }
);

export const asset = (name?: string): ImageMetadata | undefined => {
  if (!name) return undefined;

  const entry = files[`/src/assets/${name}`];
  if (!entry && import.meta.env.DEV) {
    console.warn(
      `[assets] src/assets/${name} not found — that slot will show the placeholder. ` +
        `Available: ${Object.keys(files).map((k) => k.split('/').pop()).join(', ') || '(none)'}`
    );
  }
  return entry?.default;
};

export const SITE = {
  /** The wordmark in the masthead. In the mockup this is the grey
   *  "待添加的标题主图标位置" placeholder box. */
  title: 'Erga kai Hemerai',

  description: '一个以文字与图像记录工作与时日的个人站点。',
  lang: 'zh-CN',

  /** Author block — the right-hand card on a post page. */
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
   * Pictures, by file name inside `src/assets/`.
   *
   * Put `hero-work.jpg` in that folder and write `heroWork: 'hero-work.jpg'`.
   * Leave a value as `''` to keep the design's placeholder block. The two hero
   * slots fall back to the newest posts' covers when left empty.
   */
  images: {
    /** Home page, left shot (the 工作 feature). */
    heroWork: '',
    /** Home page, right shot in the cream band (the 时日 feature). */
    heroDays: '',
    /** Author card in the post sidebar. */
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
