/**
 * The site's client behaviour, bundled once by BaseLayout.
 *
 * Nothing here is required for the page to read: every effect either enhances
 * something already in the DOM (the clock, the preview panel, the theme wash) or
 * is skipped when the browser cannot do it. The one exception is `data-reveal`,
 * whose hidden state is only applied after the inline boot script adds `.js` —
 * so a render without this file shows the whole page, not a blank one.
 */

const root = document.documentElement;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const pick = <T extends Element = HTMLElement>(selector: string, scope: ParentNode = document) =>
	scope.querySelector<T>(selector);

const pickAll = <T extends Element = HTMLElement>(selector: string, scope: ParentNode = document) =>
	[...scope.querySelectorAll<T>(selector)];

/* ==========================================================================
   Intro — the hero settles in once the fonts are in, or after 700ms anyway.
   ========================================================================== */

const markReady = () => root.classList.add('is-ready');

if (document.fonts?.ready) {
	document.fonts.ready.then(markReady).catch(markReady);
}
window.setTimeout(markReady, 700);

/* The footer's year, so it never goes stale. */
pickAll('[data-year]').forEach((node) => {
	node.textContent = String(new Date().getFullYear());
});

/* ==========================================================================
   Theme — 工作 (paper) / 时日 (night)

   The preference is stored under `erga-theme`. The inline boot script in
   BaseLayout reads the same key before first paint so a night reader never
   gets a white flash; this half only handles the toggle and the transition.
   ========================================================================== */

const THEME_KEY = 'erga-theme';
const NIGHT = 'night';
const DAY = 'day';

const themeToggle = pick('[data-theme-toggle]');
const skyWash = pick('[data-sky-wash]');
const themeMeta = document.querySelector('meta[name="theme-color"]');

const WASH_BG = { night: '#171812', day: '#f2eee5' } as const;
const THEME_COLOR = { night: '#171812', day: '#f2eee5' } as const;

let switching = false;
let switchTimer = 0;
let washTimer = 0;

const applyModeCopy = (isNight: boolean) => {
	pickAll('[data-mode-copy]').forEach((node) => {
		const text = node.dataset[isNight ? 'night' : 'day'];
		if (text) node.textContent = text;
	});

	const mark = pick('[data-mode-mark]');
	if (mark) mark.textContent = isNight ? '时日' : '工作';

	const markEn = pick('[data-mode-mark-en]');
	if (markEn) markEn.textContent = isNight ? 'D' : 'W';
};

const applyTheme = (theme: 'day' | 'night', { persist = true } = {}) => {
	const isNight = theme === NIGHT;

	if (isNight) root.dataset.theme = NIGHT;
	else delete root.dataset.theme;

	applyModeCopy(isNight);

	if (themeToggle) {
		themeToggle.setAttribute('aria-pressed', String(isNight));
		themeToggle.setAttribute('aria-label', isNight ? '切换到工作模式（开灯）' : '切换到时日模式（关灯）');
	}
	if (themeMeta) themeMeta.setAttribute('content', THEME_COLOR[theme]);

	if (persist) {
		try {
			localStorage.setItem(THEME_KEY, theme);
		} catch {
			/* storage can be unavailable; the theme still applies for this view */
		}
	}
};

const switchTheme = () => {
	if (switching) return;

	const next = root.dataset.theme === NIGHT ? DAY : NIGHT;

	/* No animation: either the reader asked for less motion, or there is no
	   wash layer to animate. Apply immediately so the toggle still works. */
	if (reducedMotion.matches || !skyWash) {
		applyTheme(next);
		return;
	}

	switching = true;
	window.clearTimeout(switchTimer);
	window.clearTimeout(washTimer);

	/* The circle opens from the middle of the sun/moon orb. */
	const origin = themeToggle?.querySelector('.theme-orb') ?? themeToggle;
	if (origin) {
		const rect = origin.getBoundingClientRect();
		const x = ((rect.left + rect.width / 2) / window.innerWidth) * 100;
		const y = ((rect.top + rect.height / 2) / window.innerHeight) * 100;
		skyWash.style.setProperty('--wash-x', `${x.toFixed(2)}%`);
		skyWash.style.setProperty('--wash-y', `${y.toFixed(2)}%`);
	}

	skyWash.style.setProperty('--wash-bg', WASH_BG[next]);
	skyWash.classList.remove('is-running');
	void skyWash.offsetWidth; /* restart the animation */
	skyWash.classList.add('is-running');

	switchTimer = window.setTimeout(() => applyTheme(next), 680);
	washTimer = window.setTimeout(() => {
		skyWash.classList.remove('is-running');
		switching = false;
	}, 1250);
};

applyTheme(root.dataset.theme === NIGHT ? NIGHT : DAY, { persist: false });
themeToggle?.addEventListener('click', switchTheme);

/* ==========================================================================
   The clock

   Time is the one thing the demo makes readable instead of decorative: the
   header line, the dial's hands and the "一天已过 xx%" all come from one
   function, so they can never disagree. Asia/Shanghai keeps it the site's
   clock rather than the reader's.
   ========================================================================== */

const TIME_ZONE = 'Asia/Shanghai';

const clockNodes = pickAll('[data-clock]');
const clockTimeNodes = pickAll('[data-clock-time]');
const dateNode = pick('[data-date]');
const dayStatusNode = pick('[data-day-status]');
const nowProgressNode = pick('[data-now-progress]');
const nowDateNode = pick('[data-now-date]');

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
	timeZone: TIME_ZONE,
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23',
});

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
	timeZone: TIME_ZONE,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	weekday: 'short',
});

const updateClock = () => {
	const now = new Date();
	const timeParts = timeFormatter.formatToParts(now);
	const hour = Number(timeParts.find((part) => part.type === 'hour')?.value ?? now.getHours());
	const minute = Number(timeParts.find((part) => part.type === 'minute')?.value ?? now.getMinutes());

	const dateParts = dateFormatter.formatToParts(now);
	const year = dateParts.find((part) => part.type === 'year')?.value ?? '';
	const month = dateParts.find((part) => part.type === 'month')?.value ?? '';
	const day = dateParts.find((part) => part.type === 'day')?.value ?? '';
	const weekday = dateParts.find((part) => part.type === 'weekday')?.value ?? '';

	const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
	const dateLabel = `${year}.${month}.${day}${weekday ? ` / ${weekday}` : ''}`;
	const ratio = (hour * 60 + minute) / 1440;
	const percent = Math.round(ratio * 100);

	clockNodes.forEach((node) => {
		node.textContent = `此刻 ${time}`;
	});
	clockTimeNodes.forEach((node) => {
		node.textContent = time;
	});

	if (dateNode) dateNode.textContent = dateLabel;
	if (dayStatusNode) dayStatusNode.textContent = `一天已过 ${percent}%`;
	if (nowProgressNode) nowProgressNode.textContent = `${percent}%`;
	if (nowDateNode) nowDateNode.textContent = `${month}.${day}`;

	/* Both the big dial and the 14px one in the header read these. */
	root.style.setProperty('--day-progress', `${ratio * 360}deg`);
	root.style.setProperty('--day-angle', `${ratio * 360}deg`);
};

updateClock();
window.setInterval(updateClock, 30_000);

/* ==========================================================================
   Entrance — reveal on arrival, with a fail-safe

   The 2.4s sweep marks everything visible whether or not it was ever
   intersected. That matters more than it looks: if an observer callback is
   missed (a very tall viewport, a prerender), the page would otherwise keep a
   blank section forever.
   ========================================================================== */

const revealItems = pickAll('[data-reveal]');
const canObserve = 'IntersectionObserver' in window;

if (revealItems.length && canObserve && !reducedMotion.matches) {
	const observer = new IntersectionObserver(
		(entries, instance) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				entry.target.classList.add('is-visible');
				instance.unobserve(entry.target);
			}
		},
		{ threshold: 0.08, rootMargin: '0px 0px -6% 0px' },
	);

	revealItems.forEach((item) => observer.observe(item));

	window.setTimeout(() => {
		revealItems.forEach((item) => item.classList.add('is-visible'));
		observer.disconnect();
	}, 2400);
} else {
	revealItems.forEach((item) => item.classList.add('is-visible'));
}

/* ==========================================================================
   Reading progress + the header tightening up
   ========================================================================== */

const progressBar = pick('[data-scroll-progress]');
const header = pick('[data-site-header]');
let scrollFrame = 0;

const updateScroll = () => {
	scrollFrame = 0;

	const max = document.documentElement.scrollHeight - window.innerHeight;
	const progress = max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0;

	if (progressBar) progressBar.style.transform = `scaleX(${progress})`;
	if (header) header.classList.toggle('is-compact', window.scrollY > 72);

	const toTop = pick('[data-to-top]');
	if (toTop) toTop.classList.toggle('is-visible', window.scrollY > 600);
};

window.addEventListener(
	'scroll',
	() => {
		if (!scrollFrame) scrollFrame = window.requestAnimationFrame(updateScroll);
	},
	{ passive: true },
);

window.addEventListener('resize', () => {
	if (!scrollFrame) scrollFrame = window.requestAnimationFrame(updateScroll);
});

updateScroll();

/* ==========================================================================
   Article preview — the home page's 文章 list

   Each row carries the whole card as data attributes; the panel copies the
   fields across with a short cross-fade. The markup already holds the first
   post, so the panel never renders empty.
   ========================================================================== */

const previewPanel = pick('[data-article-preview]');

if (previewPanel) {
	const fields = new Map(
		pickAll<HTMLElement>('[data-preview-field]', previewPanel).map((node) => [
			node.dataset.previewField ?? '',
			node,
		]),
	);

	const rows = pickAll<HTMLElement>('[data-preview]');
	let previewTimer = 0;
	let previewToken = 0;

	const showRow = (row: HTMLElement, immediate = false) => {
		const token = (previewToken += 1);
		window.clearTimeout(previewTimer);

		const commit = () => {
			if (token !== previewToken) return;

			fields.forEach((node, field) => {
				const value = row.dataset[field === 'index' ? 'previewIndex' : `preview${field[0].toUpperCase()}${field.slice(1)}`];
				if (value !== undefined) node.textContent = value;
			});

			previewPanel.classList.remove('is-changing');
		};

		if (immediate || reducedMotion.matches) {
			commit();
		} else {
			previewPanel.classList.add('is-changing');
			previewTimer = window.setTimeout(commit, 150);
		}
	};

	rows.forEach((row) => {
		row.addEventListener('pointerenter', () => showRow(row));
		row.addEventListener('focus', () => showRow(row));
	});

	if (rows[0]) showRow(rows[0], true);
}

/* ==========================================================================
   Back to top
   ========================================================================== */

const toTop = pick<HTMLButtonElement>('[data-to-top]');

if (toTop) {
	toTop.addEventListener('click', () => {
		window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
	});
}

export {};
