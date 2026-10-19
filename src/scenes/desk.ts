/**
 * 工作间 — the desk, modelled in three.js.
 *
 * A lamp, a desk, an open book and a window. Daylight: the lamp is off, the
 * window is bright and a computer sits on the desk (工作). Night: the lamp is
 * on, the window goes dark and the computer becomes the open book (生活).
 *
 * Everything here is built from three.js primitives — no external model, no
 * hand-rolled renderer: WebGLRenderer, OrbitControls, standard materials,
 * shadow maps. The whole state is one number, `t` (0 = day, 1 = night), which
 * every light and object reads from, so there is exactly one animation to keep
 * in sync.
 *
 * The scene is created by `createDeskScene()` and destroyed by the function it
 * returns; the page calls those on Astro's page-load / before-swap events so a
 * client-side navigation does not leak a WebGL context.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const DAY = {
	paper: 0xfff1d4,
	desk: 0xfcf4e3,
	wood: 0xc9a27a,
	wall: 0xf6e5c8,
	floor: 0xe0c1a0,
	bg: 0xe8d3bb,
	ink: 0x2a221b,
	lamp: 0x2f2a24,
	accent: 0xa65a3c,
};

const NIGHT = {
	paper: 0x2a2a22,
	desk: 0x2a2820,
	wood: 0x6d5138,
	wall: 0x1a1b15,
	floor: 0x17150f,
	bg: 0x0b0c09,
	ink: 0x14130f,
	lamp: 0x1b1915,
	accent: 0xc49172,
};

/** A soft radial gradient, used for the lamp's halo and its pool of light. */
function radialTexture(inner: string, outer: string, size = 256) {
	const canvas = document.createElement('canvas');
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d');
	if (ctx) {
		const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
		gradient.addColorStop(0, inner);
		gradient.addColorStop(0.45, inner);
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
			for (let i = 0; i < 90; i++) {
				const x = (Math.sin(i * 12.9898) * 43758.5453) % 1;
				const y = (Math.sin(i * 78.233) * 12345.6789) % 1;
				const r = Math.abs(Math.sin(i * 3.7)) * 1.2 + 0.35;
				ctx.globalAlpha = 0.35 + Math.abs(Math.sin(i * 5.2)) * 0.55;
				ctx.beginPath();
				ctx.arc(Math.abs(x) * 512, Math.abs(y) * 300, r, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.globalAlpha = 1;
		} else {
			/* A pale sun and a soft hedge line, so the window reads as outside. */
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
	scene.background = new THREE.Color(0xe8d3bb);

	const camera = new THREE.PerspectiveCamera(32, 16 / 10, 0.1, 60);
	camera.position.set(4.7, 3.05, 6.5);

	const renderer = new THREE.WebGLRenderer({
		antialias: true,
		alpha: false,
		powerPreference: 'high-performance',
	});
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.06;
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFShadowMap;
	renderer.domElement.setAttribute('aria-hidden', 'true');
	host.appendChild(renderer.domElement);

	const controls = new OrbitControls(camera, renderer.domElement);
	controls.target.set(-0.15, 1.2, -0.15);
	controls.enableDamping = true;
	controls.dampingFactor = 0.07;
	controls.enablePan = false;
	controls.minDistance = 3.4;
	controls.maxDistance = 9;
	controls.minPolarAngle = 0.75;
	controls.maxPolarAngle = Math.PI / 2 - 0.06;
	controls.minAzimuthAngle = -0.7;
	controls.maxAzimuthAngle = 0.7;
	controls.rotateSpeed = 0.55;

	/* --- Materials ------------------------------------------------------- */

	const wallMat = new THREE.MeshStandardMaterial({ color: DAY.wall, roughness: 0.96 });
	const deskMat = new THREE.MeshStandardMaterial({ color: DAY.desk, roughness: 0.82 });
	const woodMat = new THREE.MeshStandardMaterial({ color: DAY.wood, roughness: 0.78 });
	const inkMat = new THREE.MeshStandardMaterial({ color: DAY.ink, roughness: 0.72 });
	const lampMat = new THREE.MeshStandardMaterial({ color: DAY.lamp, roughness: 0.55, metalness: 0.25 });
	const paperMat = new THREE.MeshStandardMaterial({ color: DAY.paper, roughness: 0.95 });

	/* --- Room ------------------------------------------------------------ */

	const room = new THREE.Group();
	scene.add(room);

	const wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 9), wallMat);
	wall.position.set(0, 3.2, -2.45);
	wall.receiveShadow = true;
	room.add(wall);

	const floorMat = new THREE.MeshStandardMaterial({ color: 0xe0c1a0, roughness: 0.94 });
	const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 10), floorMat);
	floor.rotation.x = -Math.PI / 2;
	floor.position.set(0, -0.02, 1.6);
	floor.receiveShadow = true;
	room.add(floor);

	/* --- Window, on the left of the frame --------------------------------- */

	const windowGroup = new THREE.Group();
	windowGroup.position.set(-1.85, 2.05, -2.42);
	room.add(windowGroup);

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

	const frameMat = new THREE.MeshStandardMaterial({ color: 0xf7e9cf, roughness: 0.7 });
	const frameBar = (w: number, h: number, x: number, y: number) => {
		const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.07), frameMat);
		bar.position.set(x, y, 0.06);
		bar.castShadow = true;
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
	sill.castShadow = true;
	windowGroup.add(sill);

	/* A second, smaller frame on the wall to the right — a print. */
	const printFrame = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.2, 0.05), frameMat);
	printFrame.position.set(2.15, 2.6, -2.4);
	room.add(printFrame);

	const printPaper = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 1.07), paperMat);
	printPaper.position.set(2.15, 2.6, -2.37);
	room.add(printPaper);

	/* --- Desk ------------------------------------------------------------ */

	const desk = new THREE.Group();
	desk.position.set(0, 0, 0.15);
	scene.add(desk);

	const top = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.1, 1.65), deskMat);
	top.position.set(0, 0.96, 0);
	top.castShadow = true;
	top.receiveShadow = true;
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
		leg.castShadow = true;
		desk.add(leg);
	}

	/* --- Desk lamp, right side ------------------------------------------- */

	const lamp = new THREE.Group();
	lamp.position.set(1.28, 1.01, -0.3);
	desk.add(lamp);

	const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.06, 32), lampMat);
	lampBase.castShadow = true;
	lamp.add(lampBase);

	const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.035, 1.0, 20), lampMat);
	stem.position.set(0, 0.52, 0);
	stem.castShadow = true;
	lamp.add(stem);

	const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.055, 20, 20), lampMat);
	elbow.position.set(0, 1.02, 0);
	lamp.add(elbow);

	const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.78, 20), lampMat);
	arm.position.set(-0.3, 1.16, 0);
	arm.rotation.z = Math.PI / 2.55;
	arm.castShadow = true;
	lamp.add(arm);

	const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.34, 0.36, 32, 1, true), lampMat);
	shade.position.set(-0.62, 1.1, 0);
	shade.rotation.z = -0.42;
	shade.castShadow = true;
	lamp.add(shade);

	const shadeInner = new THREE.Mesh(
		new THREE.CylinderGeometry(0.15, 0.33, 0.34, 32, 1, true),
		new THREE.MeshStandardMaterial({ color: 0xffe9c4, roughness: 0.4, emissive: 0xffcf8a, emissiveIntensity: 0, side: THREE.BackSide }),
	);
	shadeInner.position.copy(shade.position);
	shadeInner.rotation.copy(shade.rotation);
	lamp.add(shadeInner);

	const bulb = new THREE.Mesh(
		new THREE.SphereGeometry(0.085, 24, 24),
		new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: 0xffc072, emissiveIntensity: 0, roughness: 0.35 }),
	);
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

	const lampSpot = new THREE.SpotLight(0xffc988, 0, 6.5, 0.86, 0.8, 1.5);
	lampSpot.position.set(1.28 - 0.66, 1.01 + 0.96, -0.3);
	lampSpot.target.position.set(-0.35, 1.02, -0.05);
	lampSpot.castShadow = true;
	lampSpot.shadow.mapSize.set(1024, 1024);
	lampSpot.shadow.bias = -0.0006;
	scene.add(lampSpot, lampSpot.target);

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
	screenBody.castShadow = true;
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
	stand.castShadow = true;
	computer.add(stand);

	const foot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.24), inkMat);
	foot.position.set(0, 0.015, 0);
	computer.add(foot);

	const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.03, 0.24), inkMat);
	keyboard.position.set(0, 0.015, 0.62);
	keyboard.castShadow = true;
	computer.add(keyboard);

	const book = new THREE.Group();
	book.position.set(-0.35, 1.012, 0.02);
	desk.add(book);

	const bookCover = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.62), new THREE.MeshStandardMaterial({ color: DAY.accent, roughness: 0.7, transparent: true }));
	bookCover.castShadow = true;
	book.add(bookCover);

	const pageGeometry = new THREE.BoxGeometry(0.78, 0.035, 0.56);
	const pages = new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.95, transparent: true });
	for (const side of [-1, 1]) {
		const page = new THREE.Mesh(pageGeometry, pages.clone());
		page.position.set(side * 0.3, 0.055, 0);
		page.rotation.z = side * 0.09;
		page.castShadow = true;
		book.add(page);

		const spineLine = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.002, 0.5), new THREE.MeshStandardMaterial({ color: 0xd8c7a8, roughness: 1, transparent: true }));
		spineLine.position.set(side * 0.14, 0.076, 0);
		book.add(spineLine);
	}

	const bookmark = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.002, 0.24), new THREE.MeshStandardMaterial({ color: DAY.accent, roughness: 0.9, transparent: true }));
	bookmark.position.set(0.08, 0.075, 0.16);
	book.add(bookmark);

	/* --- Small props ------------------------------------------------------ */

	const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.16, 24), new THREE.MeshStandardMaterial({ color: 0xf6e6cc, roughness: 0.8 }));
	mug.position.set(-1.35, 1.09, 0.42);
	mug.castShadow = true;
	desk.add(mug);

	const sheets = new THREE.Mesh(
		new THREE.PlaneGeometry(0.52, 0.7),
		new THREE.MeshStandardMaterial({ color: 0xfff8ea, roughness: 0.95, emissive: 0x2a2013, emissiveIntensity: 0.12 }),
	);
	sheets.rotation.x = -Math.PI / 2;
	sheets.rotation.z = 0.18;
	sheets.position.set(0.62, 1.013, 0.5);
	sheets.receiveShadow = true;
	desk.add(sheets);

	/* A baseboard, so the wall and the floor are two surfaces and not one fade. */
	const baseboard = new THREE.Mesh(new THREE.BoxGeometry(16, 0.12, 0.05), frameMat);
	baseboard.position.set(0, 0.06, -2.42);
	room.add(baseboard);

	/* --- Lights ---------------------------------------------------------- */

	const hemi = new THREE.HemisphereLight(0xfff1d8, 0x9c7c5c, 0.9);
	scene.add(hemi);

	const sun = new THREE.DirectionalLight(0xfff3d6, 1.55);
	sun.position.set(-4.2, 5.2, 2.4);
	sun.castShadow = true;
	sun.shadow.mapSize.set(2048, 2048);
	sun.shadow.camera.near = 0.5;
	sun.shadow.camera.far = 26;
	sun.shadow.camera.left = -8;
	sun.shadow.camera.right = 8;
	sun.shadow.camera.top = 7;
	sun.shadow.camera.bottom = -4;
	sun.shadow.bias = -0.0006;
	scene.add(sun);

	/* Cool moonlight through the window, so the room still has shape at night. */
	const moon = new THREE.PointLight(0x7d8fb8, 0, 12, 1.6);
	moon.position.set(-1.7, 2.4, -1.2);
	scene.add(moon);

	const fill = new THREE.PointLight(0xffd9a8, 0, 6, 2);
	fill.position.set(0.2, 2.2, 2.6);
	scene.add(fill);

	/* --- Mode ------------------------------------------------------------ */

	let night = false;
	let current = 0; /* 0 = day, 1 = night */
	let target = 0;
	let transitionStart = 0;
	let transitionFrom = 0;
	const duration = reduced ? 0 : 1.6;

	const applyMode = (t: number) => {
		current = t;

		hemi.intensity = lerp(0.9, 0.3, t);
		hemi.color.lerpColors(new THREE.Color(0xfff1d8), new THREE.Color(0x4b5170), t);
		hemi.groundColor.lerpColors(new THREE.Color(0x9c7c5c), new THREE.Color(0x14130f), t);

		sun.intensity = lerp(1.55, 0.03, t);
		moon.intensity = lerp(0, 2.4, t);
		fill.intensity = lerp(0, 0.5, t);

		lampSpot.intensity = lerp(0, 12, t);
		(shadeInner.material as THREE.MeshStandardMaterial).emissiveIntensity = lerp(0, 0.85, t);
		(bulb.material as THREE.MeshStandardMaterial).emissiveIntensity = lerp(0, 3.2, t);
		(halo.material as THREE.SpriteMaterial).opacity = lerp(0, 0.85, t);
		(lightPool.material as THREE.MeshBasicMaterial).opacity = lerp(0, 0.75, t);

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
		screenMat.emissiveIntensity = lerp(0.6, 0, t);

		/* The swap itself: the computer squashes away as the book unfolds. */
		const computerAmount = Math.max(0, 1 - t * 1.6);
		const bookAmount = Math.max(0, (t - 0.2) * 1.6);

		computer.visible = computerAmount > 0.01;
		computer.scale.setScalar(0.55 + 0.45 * computerAmount);
		computer.position.y = 1.01 - (1 - computerAmount) * 0.25;
		computer.rotation.y = (1 - computerAmount) * 0.5;
		screenMat.opacity = computerAmount;

		book.visible = bookAmount > 0.01;
		book.scale.setScalar(0.5 + 0.5 * bookAmount);
		book.position.y = 1.012;
		book.rotation.y = (1 - bookAmount) * -0.35;
		book.traverse((object) => {
			const mesh = object as THREE.Mesh;
			if (mesh.isMesh && mesh.material) {
				const material = mesh.material as THREE.MeshStandardMaterial;
				material.transparent = true;
				material.opacity = bookAmount;
			}
		});

		renderer.toneMappingExposure = lerp(1.06, 0.98, t);
	};

	const setNight = (value: boolean, immediate = false) => {
		night = value;
		target = value ? 1 : 0;
		transitionFrom = current;
		transitionStart = performance.now();

		if (immediate || duration === 0) {
			applyMode(target);
			transitionStart = performance.now() - duration * 1000;
		}
	};

	/* --- Resize ---------------------------------------------------------- */

	const resize = () => {
		const width = host.clientWidth;
		const height = host.clientHeight;
		if (!width || !height) return;
		renderer.setSize(width, height, false);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();

		/* A portrait frame has a much narrower horizontal view, so step back
		   instead of cropping the lamp off the desk. */
		const distance = camera.aspect < 1.1 ? 10.6 : 8.5;
		const direction = camera.position.clone().sub(controls.target).normalize();
		camera.position.copy(controls.target).addScaledVector(direction, distance);
	};

	const observer = new ResizeObserver(resize);
	observer.observe(host);
	resize();

	/* --- Loop ------------------------------------------------------------ */

	let frame = 0;
	let visible = true;

	const startedAt = performance.now();

	const render = () => {
		frame = 0;
		if (!visible) return;

		const elapsed = (performance.now() - startedAt) / 1000;
		const progress = duration === 0 ? 1 : Math.min(1, (performance.now() - transitionStart) / (duration * 1000));
		const eased = easeInOut(progress);
		if (eased !== current) applyMode(lerp(transitionFrom, target, eased));

		/* A filament that is not perfectly steady, so the lamp reads as a lamp.
		   Small enough that it is only felt, not watched. */
		if (!reduced && night) {
			const pulse = 0.965 + Math.sin(elapsed * 1.7) * 0.02 + Math.sin(elapsed * 4.3) * 0.015;
			lampSpot.intensity = 12 * pulse;
			(halo.material as THREE.SpriteMaterial).opacity = 0.85 * pulse;
		}

		controls.update();
		renderer.render(scene, camera);
		frame = requestAnimationFrame(render);
	};

	const wake = () => {
		if (!frame && visible) frame = requestAnimationFrame(render);
	};

	const intersection = new IntersectionObserver(
		([entry]) => {
			visible = entry.isIntersecting;
			if (visible) wake();
		},
		{ threshold: 0.05 },
	);
	intersection.observe(host);

	const onVisibility = () => {
		if (document.hidden) {
			visible = false;
		} else {
			visible = true;
			wake();
		}
	};
	document.addEventListener('visibilitychange', onVisibility);

	applyMode(0);
	wake();

	/* Start in whatever theme the page is already in. */
	setNight(document.documentElement.dataset.theme === 'night', true);

	const themeObserver = new MutationObserver(() => {
		setNight(document.documentElement.dataset.theme === 'night');
	});
	themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

	return {
		setNight,
		destroy: () => {
			cancelAnimationFrame(frame);
			frame = 0;
			observer.disconnect();
			intersection.disconnect();
			themeObserver.disconnect();
			document.removeEventListener('visibilitychange', onVisibility);
			controls.dispose();
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
