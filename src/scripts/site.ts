/**
 * The site's client behaviour, bundled once by BaseLayout.
 *
 * Setup is wrapped in `init()` because the site uses Astro's ClientRouter:
 * every navigation swaps the body, so the work has to be torn down before the
 * swap and re-attached on `astro:page-load`. Without the router the same code
 * still runs once on load.
 *
 * Nothing here is required for the page to read: effects enhance what is
 * already in the DOM, and `data-reveal` is only hidden once `.js` is present —
 * a render without this file shows the whole page, not a blank one.
 */

const root = document.documentElement;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const pick = <T extends Element = HTMLElement>(selector: string, scope: ParentNode = document) =>
	scope.querySelector<T>(selector);

const pickAll = <T extends Element = HTMLElement>(selector: string, scope: ParentNode = document) =>
	[...scope.querySelectorAll<T>(selector)];

const NIGHT = 'night';
const DAY = 'day';
const THEME_KEY = 'erga-theme';

let initialized = false;
const cleanups: Array<() => void> = [];

/** Register a window/document listener that is removed on teardown. */
const on = (
	target: Window | Document,
	type: string,
	handler: EventListenerOrEventListenerObject,
	options?: AddEventListenerOptions,
) => {
	target.addEventListener(type, handler, options);
	cleanups.push(() => target.removeEventListener(type, handler, options));
};

/** Register a timer that is cleared on teardown. */
const timer = (handle: number) => {
	cleanups.push(() => window.clearInterval(handle));
	cleanups.push(() => window.clearTimeout(handle));
};

/** The saved preference; storage can be unavailable, hence the try. */
const readStoredTheme = () => {
	try {
		return localStorage.getItem(THEME_KEY);
	} catch {
		return null;
	}
};

/**
 * ClientRouter builds the incoming page from HTML that was rendered without the
 * theme (the boot script only runs in a real document load), so the `data-theme`
 * attribute would be dropped on every navigation. Write the current theme onto
 * the incoming document before the swap and night readers stay in the dark.
 */
const carryThemeAcrossSwap = (event: Event) => {
	const incoming = (event as Event & { newDocument?: Document }).newDocument;
	if (!incoming) return;

	if (root.dataset.theme === NIGHT) incoming.documentElement.dataset.theme = NIGHT;
	else incoming.documentElement.removeAttribute('data-theme');

	const meta = incoming.querySelector('meta[name="theme-color"]');
	if (meta) meta.setAttribute('content', root.dataset.theme === NIGHT ? '#171812' : '#fff1d4');
};

const init = () => {
	if (initialized) return;
	initialized = true;

	/* ======================================================================
	   Intro — the hero settles in once the fonts are in, or after 700ms.
	   ====================================================================== */

	const markReady = () => root.classList.add('is-ready');

	root.classList.remove('is-ready');
	if (document.fonts?.ready) {
		document.fonts.ready.then(markReady).catch(markReady);
	}
	const readyTimer = window.setTimeout(markReady, 700);
	cleanups.push(() => window.clearTimeout(readyTimer));

	/* The footer's year, so it never goes stale. */
	pickAll('[data-year]').forEach((node) => {
		node.textContent = String(new Date().getFullYear());
	});

	/* ======================================================================
	   Theme — 工作 (paper, lights on) / 生活 (night, lights off)
	   ====================================================================== */

	const themeToggle = pick('[data-theme-toggle]');
	const skyWash = pick('[data-sky-wash]');
	const themeMeta = document.querySelector('meta[name="theme-color"]');

	const WASH_BG = { night: '#171812', day: '#fff1d4' } as const;
	const THEME_COLOR = { night: '#171812', day: '#fff1d4' } as const;

	let switching = false;
	let switchTimer = 0;
	let washTimer = 0;

	const applyModeCopy = (isNight: boolean) => {
		pickAll('[data-mode-copy]').forEach((node) => {
			const text = node.dataset[isNight ? 'night' : 'day'];
			if (text) node.textContent = text;
		});

		const mark = pick('[data-mode-mark]');
		if (mark) mark.textContent = isNight ? '生活' : '工作';

		const markEn = pick('[data-mode-mark-en]');
		if (markEn) markEn.textContent = isNight ? 'L' : 'W';
	};

	const applyTheme = (theme: 'day' | 'night', { persist = true } = {}) => {
		const isNight = theme === NIGHT;

		if (isNight) root.dataset.theme = NIGHT;
		else delete root.dataset.theme;

		applyModeCopy(isNight);

		if (themeToggle) {
			themeToggle.setAttribute('aria-pressed', String(isNight));
			themeToggle.setAttribute(
				'aria-label',
				isNight ? '切换到工作模式（开灯）' : '切换到生活模式（关灯）',
			);
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

		if (reducedMotion.matches || !skyWash) {
			applyTheme(next);
			return;
		}

		switching = true;
		window.clearTimeout(switchTimer);
		window.clearTimeout(washTimer);

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

	applyTheme(
		root.dataset.theme === NIGHT || readStoredTheme() === NIGHT ? NIGHT : DAY,
		{ persist: false },
	);
	themeToggle?.addEventListener('click', switchTheme);

	/* Other pages' controls (the 工作间 lamp) can flip the same switch. */
	const onToggleRequest = () => switchTheme();
	window.addEventListener('erga:toggle-theme', onToggleRequest);
	cleanups.push(() => window.removeEventListener('erga:toggle-theme', onToggleRequest));
	themeMeta?.setAttribute('content', THEME_COLOR[root.dataset.theme === NIGHT ? NIGHT : DAY]);

	/* ======================================================================
	   The clock — header line, dial hands, "一天已过 xx%" all from one source
	   ====================================================================== */

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
		const minute = Number(
			timeParts.find((part) => part.type === 'minute')?.value ?? now.getMinutes(),
		);

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

		root.style.setProperty('--day-progress', `${ratio * 360}deg`);
		root.style.setProperty('--day-angle', `${ratio * 360}deg`);
	};

	updateClock();
	timer(window.setInterval(updateClock, 30_000));

	/* ======================================================================
	   Entrance — reveal on arrival, with a fail-safe
	   ====================================================================== */

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

		const sweep = window.setTimeout(() => {
			revealItems.forEach((item) => item.classList.add('is-visible'));
			observer.disconnect();
		}, 2400);

		cleanups.push(() => {
			observer.disconnect();
			window.clearTimeout(sweep);
		});
	} else {
		revealItems.forEach((item) => item.classList.add('is-visible'));
	}

	/* ======================================================================
	   Reading progress + the header tightening up + back to top
	   ====================================================================== */

	const progressBar = pick('[data-scroll-progress]');
	const header = pick('[data-site-header]');
	const toTop = pick<HTMLButtonElement>('[data-to-top]');
	let scrollFrame = 0;

	const updateScroll = () => {
		scrollFrame = 0;

		const max = document.documentElement.scrollHeight - window.innerHeight;
		const progress = max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0;

		if (progressBar) progressBar.style.transform = `scaleX(${progress})`;
		if (header) header.classList.toggle('is-compact', window.scrollY > 72);
		if (toTop) toTop.classList.toggle('is-visible', window.scrollY > 600);
	};

	const requestScrollUpdate = () => {
		if (!scrollFrame) scrollFrame = window.requestAnimationFrame(updateScroll);
	};

	on(window, 'scroll', requestScrollUpdate, { passive: true });
	on(window, 'resize', requestScrollUpdate);
	updateScroll();

	toTop?.addEventListener('click', () => {
		window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
	});

	/* ======================================================================
	   Article preview — the home page's 文章 list
	   ====================================================================== */

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
					const key =
						field === 'index'
							? 'previewIndex'
							: `preview${field[0].toUpperCase()}${field.slice(1)}`;
					const value = row.dataset[key];
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
		cleanups.push(() => window.clearTimeout(previewTimer));
	}
};

const teardown = () => {
	initialized = false;
	cleanups.forEach((fn) => fn());
	cleanups.length = 0;
};

const onBeforeSwap = (event: Event) => {
	carryThemeAcrossSwap(event);
	teardown();
};

/* ClientRouter fires these; without it we simply start on load. */
if (!(window as unknown as { __ergaSite?: boolean }).__ergaSite) {
	(window as unknown as { __ergaSite?: boolean }).__ergaSite = true;
	document.addEventListener('astro:before-swap', onBeforeSwap);
	document.addEventListener('astro:page-load', init);
}

init();

export {};
