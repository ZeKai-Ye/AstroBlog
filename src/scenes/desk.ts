/**
 * 工作间 — the desk, modelled in three.js for the home page's concept demo.
 *
 * A lamp, a desk, an open book and a window. Daylight: the lamp is off, the
 * window is bright and a computer sits on the desk (工作). Night: the lamp is
 * on, the window goes dark and the computer becomes the open book (生活).
 *
 * Performance notes, because this now lives on the front page:
 *
 *   - no real-time shadow maps (the single biggest cost); soft contact shadows
 *     are painted as radial-gradient planes instead, which is also the look a
 *     flat illustration wants;
 *   - the camera is fixed — no OrbitControls — so the frame only changes when
 *     the theme does;
 *   - nothing renders on a loop. Frames are drawn on demand: once on layout,
 *     during a theme transition, and on resize. An idle desk costs zero GPU.
 *
 * Everything is built from three.js primitives — no external model.
 */
import * as THREE from 'three';

const DAY = {
	paper: 0xfff1d4,
	desk: 0xfdf7ec,
	wood: 0xc9a27a,
	wall: 0xf0d9c7,
	floor: 0xd8b68d,
	bg: 0xe8d3bb,
	ink: 0x2a221b,
	lamp: 0x2f2a24,
	accent: 0xa65a3c,
	sky: 0x9cc2dc,
};

const NIGHT = {
	paper: 0x2a2a22,
	desk: 0x2a2820,
	wood: 0x6d5138,
	wall: 0x1d1e17,
	floor: 0x15140f,
	bg: 0x0b0c09,
	ink: 0x14130f,
	lamp: 0x1b1915,
	accent: 0xc49172,
	sky: 0x3a4a66,
};

/** A soft radial gradient, used for light pools and contact shadows. */
function radialTexture(inner: string, outer: string, size = 256) {
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d');
	if (ctx) {
		const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
		gradient.addColorStop(0, inner);
		gradient.addColorStop(0.5, inner);
		gradient.addColorStop(1, outer);
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, size, size);
	}
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}

/** The view outside the window: warm daylight, or a deep night with stars. */
function skyTexture(night: boolean) {
	const canvas = document.createElement('canvas');
	canvas.width = 512;
	canvas.height = 512;
	const ctx = canvas.getContext('2d');
	if (ctx) {
		const gradient = ctx.createLinearGradient(0, 0, 0, 512);
		if (night) {
			gradient.addColorStop(0, '#070b18');
			gradient.addColorStop(0.6, '#101a30');
			gradient.addColorStop(1, '#1d2740');
		} else {
			gradient.addColorStop(0, '#b9d8e8');
			gradient.addColorStop(0.55, '#e4ecdf');
			gradient.addColorStop(1, '#f6e2c4');
		}
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, 512, 512);

		if (night) {
			ctx.fillStyle = '#f4ead6';
			for (let i = 0; i < 80; i++) {
				const x = Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1);
				const y = Math.abs((Math.sin(i * 78.233) * 12345.6789) % 1);
				const r = Math.abs(Math.sin(i * 3.7)) * 1.2 + 0.35;
				ctx.globalAlpha = 0.35 + Math.abs(Math.sin(i * 5.2)) * 0.5;
				ctx.beginPath();
				ctx.arc(x * 512, y * 300, r, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.globalAlpha = 1;
		} else {
			ctx.fillStyle = 'rgba(255, 246, 220, 0.9)';
			ctx.beginPath();
			ctx.arc(370, 150, 46, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = 'rgba(126, 148, 106, 0.35)';
			ctx.beginPath();
			ctx.ellipse(180, 470, 220, 90, 0, 0, Math.PI * 2);
			ctx.fill();
		}
	}
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}

const easeInOut = (value: number) =>
	value < 0.5 ? 4 * value * value * value : 1 - (-2 * value + 2) ** 3 / 2;

const lerp = THREE.MathUtils.lerp;

export interface DeskScene {
	destroy: () => void;
	setNight: (night: boolean, immediate?: boolean) => void;
}

export function createDeskScene(host: HTMLElement): DeskScene {
	const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	const scene = new THREE.Scene();
	scene.background = new THREE.Color(DAY.bg);

	const camera = new THREE.PerspectiveCamera(30, 16 / 8.2, 0.1, 60);
	const target = new THREE.Vector3(-0.2, 1.18, -0.15);
	const viewDirection = new THREE.Vector3(0.56, 0.23, 0.79).normalize();

	const renderer = new THREE.WebGLRenderer({
		antialias: true,
		alpha: false,
		powerPreference: 'high-performance',
	});
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.05;
	renderer.domElement.setAttribute('aria-hidden', 'true');
	host.appendChild(renderer.domElement);

	/* --- Materials ------------------------------------------------------- */

	const wallMat = new THREE.MeshStandardMaterial({ color: DAY.wall, roughness: 0.98 });
	const deskMat = new THREE.MeshStandardMaterial({ color: DAY.desk, roughness: 0.85 });
	const woodMat = new THREE.MeshStandardMaterial({ color: DAY.wood, roughness: 0.8 });
	const inkMat = new THREE.MeshStandardMaterial({ color: DAY.ink, roughness: 0.75 });
	const lampMat = new THREE.MeshStandardMaterial({ color: DAY.lamp, roughness: 0.5, metalness: 0.2 });
	const paperMat = new THREE.MeshStandardMaterial({ color: DAY.paper, roughness: 0.96 });
	const floorMat = new THREE.MeshStandardMaterial({ color: DAY.floor, roughness: 0.95 });
	const frameMat = new THREE.MeshStandardMaterial({ color: 0xf7e9cf, roughness: 0.72 });

	/* --- Room ------------------------------------------------------------ */

	const wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 9), wallMat);
	wall.position.set(0, 3.2, -2.45);
	scene.add(wall);

	const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 10), floorMat);
	floor.rotation.x = -Math.PI / 2;
	floor.position.set(0, -0.02, 1.6);
	scene.add(floor);

	const baseboard = new THREE.Mesh(new THREE.BoxGeometry(16, 0.12, 0.05), frameMat);
	baseboard.position.set(0, 0.06, -2.42);
	scene.add(baseboard);

	/* --- Window, left of the frame --------------------------------------- */

	const windowGroup = new THREE.Group();
	windowGroup.position.set(-1.85, 2.05, -2.42);
	scene.add(windowGroup);

	const skyDay = new THREE.Mesh(
		new THREE.PlaneGeometry(1.85, 2.25),
		new THREE.MeshBasicMaterial({ map: skyTexture(false), transparent: true }),
	);
	const skyNight = new THREE.Mesh(
		new THREE.PlaneGeometry(1.85, 2.25),
		new THREE.MeshBasicMaterial({ map: skyTexture(true), transparent: true, opacity: 0 }),
	);
	skyDay.position.z = 0.01;
	skyNight.position.z = 0.012;
	windowGroup.add(skyDay, skyNight);

	const frameBar = (w: number, h: number, x: number, y: number) => {
		const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.07), frameMat);
		bar.position.set(x, y, 0.06);
		windowGroup.add(bar);
	};
	frameBar(2.05, 0.09, 0, 1.17);
	frameBar(2.05, 0.09, 0, -1.17);
	frameBar(0.09, 2.43, -0.98, 0);
	frameBar(0.09, 2.43, 0.98, 0);
	frameBar(0.06, 2.35, 0, 0);
	frameBar(2.0, 0.06, 0, 0.12);

	const sill = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 0.26), frameMat);
	sill.position.set(0, -1.24, 0.1);
	windowGroup.add(sill);

	/* The light the window throws into the room, painted on the floor. */
	const windowPool = new THREE.Mesh(
		new THREE.PlaneGeometry(4.6, 3.2),
		new THREE.MeshBasicMaterial({
			map: radialTexture('rgba(255, 241, 208, 0.5)', 'rgba(255, 241, 208, 0)'),
			transparent: true,
			opacity: 0.5,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
		}),
	);
	windowPool.rotation.x = -Math.PI / 2;
	windowPool.position.set(-1.5, 0.005, 0.4);
	scene.add(windowPool);

	/* A print on the wall, right of the window. */
	const printFrame = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.2, 0.05), frameMat);
	printFrame.position.set(2.15, 2.6, -2.4);
	scene.add(printFrame);

	const printPaper = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 1.07), paperMat);
	printPaper.position.set(2.15, 2.6, -2.37);
	scene.add(printPaper);

	/* --- Desk ------------------------------------------------------------ */

	const desk = new THREE.Group();
	desk.position.set(0, 0, 0.15);
	scene.add(desk);

	const top = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.1, 1.65), deskMat);
	top.position.set(0, 0.96, 0);
	desk.add(top);

	const legGeometry = new THREE.BoxGeometry(0.11, 0.95, 0.11);
	for (const [x, z] of [
		[-1.78, -0.68],
		[1.78, -0.68],
		[-1.78, 0.68],
		[1.78, 0.68],
	]) {
		const leg = new THREE.Mesh(legGeometry, woodMat);
		leg.position.set(x, 0.48, z);
		desk.add(leg);
	}

	/* --- Desk lamp, right side ------------------------------------------- */

	const lamp = new THREE.Group();
	lamp.position.set(1.28, 1.01, -0.3);
	desk.add(lamp);

	const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.06, 24), lampMat);
	lamp.add(lampBase);

	const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.035, 1.0, 16), lampMat);
	stem.position.set(0, 0.52, 0);
	lamp.add(stem);

	const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 16), lampMat);
	elbow.position.set(0, 1.02, 0);
	lamp.add(elbow);

	const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.78, 16), lampMat);
	arm.position.set(-0.3, 1.16, 0);
	arm.rotation.z = Math.PI / 2.55;
	lamp.add(arm);

	const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.34, 0.36, 24, 1, true), lampMat);
	shade.position.set(-0.62, 1.1, 0);
	shade.rotation.z = -0.42;
	lamp.add(shade);

	const shadeInnerMat = new THREE.MeshStandardMaterial({
		color: 0xffe9c4,
		roughness: 0.4,
		emissive: 0xffcf8a,
		emissiveIntensity: 0,
		side: THREE.BackSide,
	});
	const shadeInner = new THREE.Mesh(
		new THREE.CylinderGeometry(0.15, 0.33, 0.34, 24, 1, true),
		shadeInnerMat,
	);
	shadeInner.position.copy(shade.position);
	shadeInner.rotation.copy(shade.rotation);
	lamp.add(shadeInner);

	const bulbMat = new THREE.MeshStandardMaterial({
		color: 0xfff4dc,
		emissive: 0xffc072,
		emissiveIntensity: 0,
		roughness: 0.35,
	});
	const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 20), bulbMat);
	bulb.position.set(-0.66, 0.96, 0);
	lamp.add(bulb);

	const halo = new THREE.Sprite(
		new THREE.SpriteMaterial({
			map: radialTexture('rgba(255, 210, 150, 0.95)', 'rgba(255, 190, 120, 0)'),
			transparent: true,
			opacity: 0,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
		}),
	);
	halo.position.copy(bulb.position);
	halo.scale.set(1.25, 1.25, 1.25);
	lamp.add(halo);

	const lampSpot = new THREE.PointLight(0xffc08a, 0, 3.6, 1.7);
	lampSpot.position.set(1.28 - 0.66, 1.01 + 0.92, -0.3);
	scene.add(lampSpot);

	const lampFill = new THREE.PointLight(0xffbc80, 0, 5, 1.8);
	lampFill.position.set(0.62, 2.05, -0.3);
	scene.add(lampFill);

	/* Warm spill on the desk under the lamp. */
	const lightPool = new THREE.Mesh(
		new THREE.PlaneGeometry(3.2, 2.5),
		new THREE.MeshBasicMaterial({
			map: radialTexture('rgba(255, 202, 132, 0.55)', 'rgba(255, 190, 120, 0)'),
			transparent: true,
			opacity: 0,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
		}),
	);
	lightPool.rotation.x = -Math.PI / 2;
	lightPool.position.set(0.15, 1.012, -0.12);
	desk.add(lightPool);

	/* --- The two things that swap ---------------------------------------- */

	const computer = new THREE.Group();
	computer.position.set(-0.35, 1.01, -0.15);
	desk.add(computer);

	const screenBody = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.62, 0.05), inkMat);
	screenBody.position.set(0, 0.52, 0);
	screenBody.rotation.x = -0.1;
	computer.add(screenBody);

	const screenMat = new THREE.MeshStandardMaterial({
		color: 0xdfe9f2,
		emissive: 0x9cc2dc,
		emissiveIntensity: 0.55,
		roughness: 0.4,
		transparent: true,
	});
	const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.52), screenMat);
	screen.position.set(0, 0.52, 0.028);
	screen.rotation.x = -0.1;
	computer.add(screen);

	const stand = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.16), inkMat);
	stand.position.set(0, 0.1, 0);
	computer.add(stand);

	const foot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.24), inkMat);
	foot.position.set(0, 0.015, 0);
	computer.add(foot);

	const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.03, 0.24), inkMat);
	keyboard.position.set(0, 0.015, 0.62);
	computer.add(keyboard);

	const book = new THREE.Group();
	book.position.set(-0.35, 1.012, 0.02);
	desk.add(book);

	const coverMat = new THREE.MeshStandardMaterial({ color: DAY.accent, roughness: 0.7, transparent: true });
	const bookCover = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.62), coverMat);
	book.add(bookCover);

	const pageMat = new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.95, transparent: true });
	for (const side of [-1, 1]) {
		const page = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.035, 0.56), pageMat.clone());
		page.position.set(side * 0.3, 0.055, 0);
		page.rotation.z = side * 0.09;
		book.add(page);
	}

	const bookmarkMat = new THREE.MeshStandardMaterial({ color: DAY.accent, roughness: 0.9, transparent: true });
	const bookmark = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.002, 0.24), bookmarkMat);
	bookmark.position.set(0.08, 0.075, 0.16);
	book.add(bookmark);

	/* --- Small props ------------------------------------------------------ */

	const mug = new THREE.Mesh(
		new THREE.CylinderGeometry(0.1, 0.09, 0.16, 20),
		new THREE.MeshStandardMaterial({ color: 0xf6e6cc, roughness: 0.85 }),
	);
	mug.position.set(-1.35, 1.09, 0.42);
	desk.add(mug);

	const sheetMat = new THREE.MeshStandardMaterial({
		color: 0xfff8ea,
		roughness: 0.95,
		emissive: 0x2a2013,
		emissiveIntensity: 0.1,
	});
	const sheets = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.7), sheetMat);
	sheets.rotation.x = -Math.PI / 2;
	sheets.rotation.z = 0.18;
	sheets.position.set(0.62, 1.013, 0.5);
	desk.add(sheets);

	/* --- Painted shadows -------------------------------------------------
	   No shadow maps: a dark radial gradient under the desk and under the
	   objects that sit on it. Cheap, soft, and in keeping with the flat look. */

	const shadowMat = (opacity: number) =>
		new THREE.MeshBasicMaterial({
			map: radialTexture(`rgba(38, 24, 12, ${opacity})`, 'rgba(38, 24, 12, 0)'),
			transparent: true,
			depthWrite: false,
		});

	const deskShadow = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 2.9), shadowMat(0.42));
	deskShadow.rotation.x = -Math.PI / 2;
	deskShadow.position.set(0.25, 0.002, 0.35);
	scene.add(deskShadow);

	const objectShadow = shadowMat(0.14);
	const contact = (x: number, z: number, w: number, h: number) => {
		const patch = new THREE.Mesh(new THREE.PlaneGeometry(w, h), objectShadow);
		patch.rotation.x = -Math.PI / 2;
		patch.position.set(x, 1.013, z);
		desk.add(patch);
	};
	contact(0.66, -0.3, 0.75, 0.75); /* lamp base */
	contact(-0.35, -0.1, 1.4, 0.9); /* computer / book */
	contact(-1.35, 0.42, 0.4, 0.4); /* mug */

	/* --- Light ------------------------------------------------------------
	   Day: window light + bounce. Night: the lamp, a cool rim from the window
	   and a warm glow on the wall behind the lamp. */

	const ambient = new THREE.AmbientLight(0xfff1dc, 0.22);
	scene.add(ambient);

	const hemi = new THREE.HemisphereLight(0xfff1d8, 0xc0a180, 0.72);
	scene.add(hemi);

	const sun = new THREE.DirectionalLight(0xfff3d6, 1.2);
	sun.position.set(-4.2, 5.2, 2.4);
	scene.add(sun);

	const moon = new THREE.PointLight(0x8ea3cc, 0, 10, 1.5);
	moon.position.set(-1.8, 2.1, -0.5);
	scene.add(moon);

	const wallGlow = new THREE.Sprite(
		new THREE.SpriteMaterial({
			map: radialTexture('rgba(255, 190, 120, 0.5)', 'rgba(255, 190, 120, 0)'),
			transparent: true,
			opacity: 0,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
		}),
	);
	wallGlow.position.set(0.9, 1.9, -2.3);
	wallGlow.scale.set(4.4, 4.4, 1);
	scene.add(wallGlow);

	const windowGlow = new THREE.Sprite(
		new THREE.SpriteMaterial({
			map: radialTexture('rgba(255, 248, 226, 0.65)', 'rgba(255, 248, 226, 0)'),
			transparent: true,
			opacity: 0.35,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
		}),
	);
	windowGlow.position.set(-1.85, 2.05, -2.25);
	windowGlow.scale.set(3.1, 3.4, 1);
	scene.add(windowGlow);

	/* --- Mode ------------------------------------------------------------ */

	let night = false;
	let current = 0; /* 0 = day, 1 = night */
	let targetValue = 0;
	let transitionFrom = 0;
	let transitionStart = 0;
	let transitionDone = true;
	const duration = reduced ? 0 : 1.5;

	const applyMode = (t: number) => {
		current = t;

		ambient.intensity = lerp(0.22, 0.12, t);
		hemi.intensity = lerp(0.72, 0.34, t);
		hemi.color.lerpColors(new THREE.Color(0xfff1d8), new THREE.Color(0x5a6078), t);
		hemi.groundColor.lerpColors(new THREE.Color(0xc0a180), new THREE.Color(0x1c1a14), t);

		sun.intensity = lerp(1.2, 0.03, t);
		moon.intensity = lerp(0, 4.2, t);
		lampSpot.intensity = lerp(0, 20, t);
		lampFill.intensity = lerp(0, 1.4, t);

		shadeInnerMat.emissiveIntensity = lerp(0, 0.9, t);
		bulbMat.emissiveIntensity = lerp(0, 3.2, t);
		(halo.material as THREE.SpriteMaterial).opacity = lerp(0, 0.9, t);
		(lightPool.material as THREE.MeshBasicMaterial).opacity = lerp(0, 0.85, t);
		(wallGlow.material as THREE.SpriteMaterial).opacity = lerp(0, 0.6, t);
		(windowGlow.material as THREE.SpriteMaterial).opacity = lerp(0.32, 0.12, t);
		(windowPool.material as THREE.MeshBasicMaterial).opacity = lerp(0.48, 0.2, t);
		(windowPool.material as THREE.MeshBasicMaterial).color.lerpColors(
			new THREE.Color(0xfff1d0),
			new THREE.Color(0x9fb4d8),
			t,
		);

		(skyDay.material as THREE.MeshBasicMaterial).opacity = 1 - t;
		(skyNight.material as THREE.MeshBasicMaterial).opacity = t;
		skyNight.visible = t > 0.01;
		skyDay.visible = t < 0.99;

		(scene.background as THREE.Color).lerpColors(new THREE.Color(DAY.bg), new THREE.Color(NIGHT.bg), t);
		wallMat.color.lerpColors(new THREE.Color(DAY.wall), new THREE.Color(NIGHT.wall), t);
		floorMat.color.lerpColors(new THREE.Color(DAY.floor), new THREE.Color(NIGHT.floor), t);
		deskMat.color.lerpColors(new THREE.Color(DAY.desk), new THREE.Color(NIGHT.desk), t);
		woodMat.color.lerpColors(new THREE.Color(DAY.wood), new THREE.Color(NIGHT.wood), t);
		lampMat.color.lerpColors(new THREE.Color(DAY.lamp), new THREE.Color(NIGHT.lamp), t);
		paperMat.color.lerpColors(new THREE.Color(DAY.paper), new THREE.Color(NIGHT.paper), t);
		screenMat.emissiveIntensity = lerp(0.55, 0, t);

		/* The swap: the computer squashes away as the book unfolds. */
		const computerAmount = Math.max(0, 1 - t * 1.6);
		const bookAmount = Math.max(0, (t - 0.2) * 1.6);

		computer.visible = computerAmount > 0.01;
		computer.scale.setScalar(0.55 + 0.45 * computerAmount);
		computer.position.y = 1.01 - (1 - computerAmount) * 0.25;
		computer.rotation.y = (1 - computerAmount) * 0.5;
		screenMat.opacity = computerAmount;

		book.visible = bookAmount > 0.01;
		book.scale.setScalar(0.5 + 0.5 * bookAmount);
		book.rotation.y = (1 - bookAmount) * -0.35;
		for (const material of [coverMat, bookmarkMat]) material.opacity = bookAmount;
		book.traverse((object) => {
			const mesh = object as THREE.Mesh;
			if (mesh.isMesh && mesh.material) {
				const material = mesh.material as THREE.MeshStandardMaterial;
				material.transparent = true;
				material.opacity = bookAmount;
			}
		});

		renderer.toneMappingExposure = lerp(1.05, 0.99, t);
	};

	/* --- On-demand rendering --------------------------------------------- */

	let rafId = 0;

	const draw = (now: number) => {
		rafId = 0;

		if (!transitionDone) {
			const progress =
				duration === 0 ? 1 : Math.min(1, (now - transitionStart) / (duration * 1000));
			applyMode(lerp(transitionFrom, targetValue, easeInOut(progress)));
			transitionDone = progress >= 1;
			if (!transitionDone) rafId = requestAnimationFrame(draw);
		}

		renderer.render(scene, camera);
	};

	const requestRender = () => {
		if (rafId) return;
		rafId = requestAnimationFrame(draw);
	};

	const setNight = (value: boolean, immediate = false) => {
		night = value;
		targetValue = value ? 1 : 0;

		if (immediate || duration === 0) {
			transitionDone = true;
			applyMode(targetValue);
			requestRender();
			return;
		}

		transitionFrom = current;
		transitionStart = performance.now();
		transitionDone = false;
		requestRender();
	};

	/* --- Size ------------------------------------------------------------
	   The camera is fixed, so framing is just a distance that keeps the desk
	   whole at any aspect — a tall screen steps back rather than cropping. */

	const resize = () => {
		const width = host.clientWidth;
		const height = host.clientHeight;
		if (!width || !height) return;

		renderer.setSize(width, height, false);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();

		const distance = camera.aspect < 1.2 ? 9.6 : 7.9;
		camera.position.copy(target).addScaledVector(viewDirection, distance);
		camera.lookAt(target);

		requestRender();
	};

	const observer = new ResizeObserver(resize);
	observer.observe(host);
	resize();

	applyMode(0);
	setNight(document.documentElement.dataset.theme === 'night', true);

	return {
		setNight,
		destroy: () => {
			cancelAnimationFrame(rafId);
			rafId = 0;
			observer.disconnect();
			renderer.dispose();
			scene.traverse((object) => {
				const mesh = object as THREE.Mesh;
				if (!mesh.isMesh) return;
				mesh.geometry?.dispose();
				const material = mesh.material;
				if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
				else material?.dispose();
			});
			renderer.domElement.remove();
		},
	};
}
