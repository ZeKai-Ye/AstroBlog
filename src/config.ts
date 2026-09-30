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
 * GitHub Pages serves a project repo from `/<repo>/`, so the deploy workflow
 * sets `BASE_PATH` and every internal link has to carry it — Astro rewrites the
 * asset URLs it generates, but not `href`s written by hand in a template.
 * Locally the base is `/` and this is a no-op.
 */
const BASE = import.meta.env.BASE_URL.replace(/\/+$/, '');

export const withBase = (path: string) => {
  const normalised = path.startsWith('/') ? path : `/${path}`;
  return `${BASE}${normalised}` || '/';
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
