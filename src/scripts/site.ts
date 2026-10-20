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
import { getTimes as getSunTimes } from 'suncalc';

const root = document.documentElement;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const pick = <T extends Element = HTMLElement>(selector: string, scope: ParentNode = document) =>
	scope.querySelector<T>(selector);

const pickAll = <T extends Element = HTMLElement>(selector: string, scope: ParentNode = document) =>
	[...scope.querySelectorAll<T>(selector)];

const NIGHT = 'night';
const DAY = 'day';
const THEME_KEY = 'erga-theme';
const MANUAL_KEY = 'erga-theme-manual';

/**
 * The site follows the sun at 东八区 / 北纬 23° — a point in southern China, so
 * the daylight hours are the ones this blog's own time (Asia/Shanghai) has.
 *
 * Day means 工作, night means 生活: the switch is conceptual, not just a colour
 * flip, so the home page shows a different edition in each. `suncalc` does the
 * astronomy (NOAA's algorithm, maintained since 2011); we only compare clocks.
 */
const SUN = { lat: 23, lng: 113, label: '东八区 · 北纬 23°' };

const timeZoneClock = new Intl.DateTimeFormat('en-GB', {
	timeZone: 'Asia/Shanghai',
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23',
});

const localDateParts = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'Asia/Shanghai',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
});

interface SolarDay {
	sunrise: Date | null;
	sunset: Date | null;
	isNight: boolean;
	/** The next sunrise or sunset, or null when the sun does not set. */
	next: Date | null;
}

/**
 * Sun times for the local (Asia/Shanghai) day containing `now`.
 *
 * `getTimes` works from the UTC day of the date it is given, so it is fed local
 * noon converted to UTC — otherwise a lookup at 02:00 local would land on the
 * previous UTC day and report the wrong sunrise.
 */
const solarDay = (now: Date): SolarDay => {
	const noonUtc = (offsetDays = 0) => {
		const parts = localDateParts.formatToParts(new Date(now.getTime() + offsetDays * 86_400_000));
		const year = Number(parts.find((part) => part.type === 'year')?.value);
		const month = Number(parts.find((part) => part.type === 'month')?.value);
		const day = Number(parts.find((part) => part.type === 'day')?.value);
		/* 04:00 UTC is noon in UTC+8. */
		return new Date(Date.UTC(year, month - 1, day, 4));
	};

	const times = getSunTimes(noonUtc(), SUN.lat, SUN.lng);
	const sunrise = times.sunrise ?? null;
	const sunset = times.sunset ?? null;

	if (!sunrise || !sunset) {
		/* Polar day/night cannot happen at 23°N, but the fallback is cheap. */
		const hour = Number(timeZoneClock.format(now).slice(0, 2));
		return { sunrise, sunset, isNight: hour < 6 || hour >= 18, next: null };
	}

	const isNight = now < sunrise || now >= sunset;
	let next: Date | null;
	if (now < sunrise) next = sunrise;
	else if (now < sunset) next = sunset;
	else next = getSunTimes(noonUtc(1), SUN.lat, SUN.lng).sunrise ?? null;

	return { sunrise, sunset, isNight, next };
};


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
 * and `data-edition` attributes would be dropped on every navigation. Write the
 * current pair onto the incoming document before the swap.
 */
const carryThemeAcrossSwap = (event: Event) => {
	const incoming = (event as Event & { newDocument?: Document }).newDocument;
	if (!incoming) return;

	if (root.dataset.theme === NIGHT) incoming.documentElement.dataset.theme = NIGHT;
	else incoming.documentElement.removeAttribute('data-theme');

	incoming.documentElement.dataset.edition = root.dataset.edition === 'life' ? 'life' : 'work';

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

	const applyEdition = (isLife: boolean) => {
		pickAll('[data-mode-copy]').forEach((node) => {
			const text = node.dataset[isLife ? 'night' : 'day'];
			if (text) node.textContent = text;
		});

		const mark = pick('[data-mode-mark]');
		if (mark) mark.textContent = isLife ? '生活' : '工作';

		const markEn = pick('[data-mode-mark-en]');
		if (markEn) markEn.textContent = isLife ? 'L' : 'W';

		root.dataset.edition = isLife ? 'life' : 'work';

		if (themeToggle) themeToggle.setAttribute('aria-pressed', String(isLife));
	};

	const applyTheme = (theme: 'day' | 'night', { persist = true } = {}) => {
		const isNight = theme === NIGHT;

		if (isNight) root.dataset.theme = NIGHT;
		else delete root.dataset.theme;

		/* The desk scene's state line describes the light, not the edition. */
		pickAll('[data-desk-state]').forEach((node) => {
			node.textContent = isNight ? '生活 / 夜里' : '工作 / 白天';
		});

		if (themeMeta) themeMeta.setAttribute('content', THEME_COLOR[theme]);

		if (persist) {
			try {
				localStorage.setItem(THEME_KEY, theme);
			} catch {
				/* storage can be unavailable; the theme still applies for this view */
			}
		}
	};

	/* The switch flips the lights and the edition together — that is the
	   site's gesture — but `data-edition` is its own attribute, so a colour
	   change can never silently swap the page under the reader. */
	const applyBoth = (theme: 'day' | 'night', options?: { persist?: boolean }) => {
		applyTheme(theme, options);
		applyEdition(theme === NIGHT);
	};

	const currentTheme = () => (root.dataset.theme === NIGHT ? NIGHT : DAY);

	/* On the home page the editions are different issues. A reader halfway
	   down one should land on the cover of the other, not in the middle of an
	   unrelated section. */
	const goToCover = () => {
		if (!document.querySelector('.edition--work')) return;
		if (window.scrollY > 240) window.scrollTo({ top: 0, behavior: 'auto' });
	};

	const transitionTo = (next: 'day' | 'night') => {
		if (switching || currentTheme() === next) return;

		if (reducedMotion.matches || !skyWash) {
			applyBoth(next);
			goToCover();
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

		/* Colour transitions are off for the duration (they would animate
		   hundreds of properties behind the wash), so the flip is one paint. */
		root.classList.add('is-theme-switching');

		skyWash.classList.remove('is-running');
		void skyWash.offsetWidth; /* restart the animation */
		skyWash.classList.add('is-running');

		/* Swap the theme and the edition under the opaque middle of the bloom;
		   the same moment is when a deep reader is returned to the cover. */
		switchTimer = window.setTimeout(() => {
			applyBoth(next);
			goToCover();
		}, 380);
		washTimer = window.setTimeout(() => {
			skyWash.classList.remove('is-running');
			root.classList.remove('is-theme-switching');
			switching = false;
		}, 980);
	};

	/* --- Following the sun ------------------------------------------------ */

	const isManual = () => {
		try {
			return localStorage.getItem(MANUAL_KEY) === '1';
		} catch {
			return false;
		}
	};

	const markManual = () => {
		try {
			localStorage.setItem(MANUAL_KEY, '1');
		} catch {
			/* storage can be unavailable; the choice still holds for this view */
		}
	};

	/** Write "日出 06:12 · 日落 18:41" wherever the page asks for it. */
	const paintSunLabel = (solar: SolarDay) => {
		if (!solar.sunrise || !solar.sunset) return;
		const text = `日出 ${timeZoneClock.format(solar.sunrise)} · 日落 ${timeZoneClock.format(solar.sunset)}`;
		pickAll('[data-sun-times]').forEach((node) => {
			node.textContent = text;
		});
		if (themeToggle) {
			themeToggle.title = `${SUN.label} · ${text} · 亮灯是工作版，熄灯是生活版`;
		}
	};

	const switchEdition = () => {
		/* A hand on the switch means the reader outranks the sun for now. */
		markManual();
		transitionTo(currentTheme() === NIGHT ? DAY : NIGHT);
	};

	const solarNow = solarDay(new Date());
	paintSunLabel(solarNow);

	/* The sun decides which edition opens; after that only the reader flips
	   it. Nothing changes the page while someone is reading it. */
	if (isManual()) {
		applyBoth(
			root.dataset.theme === NIGHT || readStoredTheme() === NIGHT ? NIGHT : DAY,
			{ persist: false },
		);
	} else {
		applyBoth(solarNow.isNight ? NIGHT : DAY, { persist: true });
	}

	/* Coming back to a tab refreshes the sun reading, not the edition. */
	on(document, 'visibilitychange', () => {
		if (document.hidden) return;
		paintSunLabel(solarDay(new Date()));
	});

	themeToggle?.addEventListener('click', switchEdition);

	/* ======================================================================
	   The phone masthead — the four links open as a panel under the header.
	   ====================================================================== */

	const navToggle = pick<HTMLButtonElement>('[data-nav-toggle]');
	const siteNav = pick<HTMLElement>('#site-nav');
	const navOpen = () => siteNav?.classList.contains('is-open') ?? false;

	const setNav = (open: boolean) => {
		if (!navToggle || !siteNav) return;
		siteNav.classList.toggle('is-open', open);
		navToggle.setAttribute('aria-expanded', String(open));
	};

	navToggle?.addEventListener('click', () => setNav(!navOpen()));
	siteNav?.addEventListener('click', (event) => {
		if ((event.target as Element).closest('a')) setNav(false);
	});
	on(document, 'pointerdown', (event) => {
		if (!navOpen()) return;
		const target = event.target as Node;
		if (siteNav?.contains(target) || navToggle?.contains(target)) return;
		setNav(false);
	});
	on(document, 'keydown', (event) => {
		if (event.key !== 'Escape' || !navOpen()) return;
		setNav(false);
		navToggle?.focus();
	});

	/* Other pages' controls (the 工作间 lamp) can flip the same switch. */
	const onToggleRequest = () => switchEdition();
	window.addEventListener('erga:toggle-theme', onToggleRequest);
	cleanups.push(() => window.removeEventListener('erga:toggle-theme', onToggleRequest));
	themeMeta?.setAttribute('content', THEME_COLOR[currentTheme()]);

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

		if (dateNode) {
			dateNode.textContent = dateLabel;
			dateNode.setAttribute('datetime', `${year}-${month}-${day}`);
		}
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

	const progressBar = pick<HTMLElement>('[data-scroll-progress]');
	const header = pick('[data-site-header]');
	const toTop = pick<HTMLButtonElement>('[data-to-top]');
	const progressSelector = progressBar?.dataset.progressTarget ?? '';
	const progressTarget = progressSelector
		? document.querySelector<HTMLElement>(progressSelector)
		: null;
	let scrollFrame = 0;

	/* The article page's table of contents. The headings are already in the
	   document with their ids; this only marks the one being read. */
	const toc = pick<HTMLElement>('[data-toc]');
	const tocLinks = toc ? pickAll<HTMLAnchorElement>('a', toc) : [];
	const tocTargets = tocLinks
		.map((link) => {
			const id = link.getAttribute('href')?.slice(1);
			return id ? document.getElementById(id) : null;
		})
		.filter((node): node is HTMLElement => Boolean(node));

	const updateToc = () => {
		if (!tocTargets.length) return;

		let current = tocTargets[0];
		for (const heading of tocTargets) {
			if (heading.getBoundingClientRect().top <= 150) current = heading;
		}

		tocLinks.forEach((link) => {
			const active = link.getAttribute('href') === `#${current.id}`;
			link.classList.toggle('is-active', active);
			if (active) link.setAttribute('aria-current', 'location');
			else link.removeAttribute('aria-current');
		});
	};

	const updateScroll = () => {
		scrollFrame = 0;

		const max = document.documentElement.scrollHeight - window.innerHeight;
		let progress = max > 0 ? Math.min(Math.max(window.scrollY / max, 0), 1) : 0;

		/* On a post the bar follows the article body instead of the whole
		   document, so it reaches the end where the prose does. */
		if (progressTarget) {
			const top = progressTarget.getBoundingClientRect().top + window.scrollY;
			const start = top - 120;
			const end = top + progressTarget.offsetHeight - window.innerHeight + 120;
			progress =
				end > start
					? Math.min(Math.max((window.scrollY - start) / (end - start), 0), 1)
					: window.scrollY >= start
						? 1
						: 0;
		}

		if (progressBar) progressBar.style.transform = `scaleX(${progress})`;
		if (header) header.classList.toggle('is-compact', window.scrollY > 72);
		if (toTop) toTop.classList.toggle('is-visible', window.scrollY > 600);
		updateToc();
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
	   Code blocks — a language label and a copy button around the Shiki
	   output that is already in the page.
	   ====================================================================== */

	pickAll<HTMLPreElement>('.prose pre.astro-code').forEach((pre) => {
		if (pre.parentElement?.classList.contains('code-block')) return;

		const wrapper = document.createElement('div');
		wrapper.className = 'code-block';
		pre.parentNode?.insertBefore(wrapper, pre);
		wrapper.appendChild(pre);

		const bar = document.createElement('div');
		bar.className = 'code-block__bar';

		const label = document.createElement('span');
		label.className = 'code-block__lang';
		label.textContent = pre.dataset.language ?? 'code';

		const copy = document.createElement('button');
		copy.type = 'button';
		copy.className = 'code-block__copy';
		copy.textContent = '复制';
		copy.addEventListener('click', async () => {
			const text = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
			try {
				await navigator.clipboard.writeText(text);
				copy.textContent = '已复制';
			} catch {
				copy.textContent = '复制失败';
			}
			window.setTimeout(() => {
				copy.textContent = '复制';
			}, 1600);
		});

		bar.append(label, copy);
		wrapper.insertBefore(bar, pre);
	});

	/* `/` focuses the search field wherever one is on the page. */
	on(document, 'keydown', (event) => {
		if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
		const target = event.target as HTMLElement | null;
		if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
		const field = pick<HTMLInputElement>('#site-search');
		if (!field) return;
		event.preventDefault();
		field.focus();
		field.scrollIntoView({
			block: 'center',
			behavior: reducedMotion.matches ? 'auto' : 'smooth',
		});
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
