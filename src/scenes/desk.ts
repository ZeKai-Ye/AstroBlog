/**
 * 概念演示 — a desk, modelled as a small collectible diorama in three.js.
 *
 * The reference for the look is `demo/reference.html`: a miniature on a slate
 * plinth with a brass lip, cel-shaded surfaces, procedural canvas
 * textures and a warm/cool light split. The model itself is this site's own —
 * a desk, a lamp, a book, a computer and a window — but it is dressed with the
 * same ideas: a plinth, a rug, a chair, a shelf, books, a plant, pens.
 *
 * Performance, because this sits on the front page:
 *
 *   - no shadow maps and no OrbitControls; the camera is fixed;
 *   - nothing renders on a loop; frames are drawn on layout, on a theme
 *     change and on resize, and a theme change is throttled while it runs;
 *   - three.js is imported lazily by the page when the section approaches.
 */
import * as THREE from 'three';

const DAY = {
	wall: 0xf0d9c7,
	floor: 0xe9d2b6,
	desk: 0xfdf6e9,
	/* Textured materials are tinted white in the day and darkened at night —
	   a coloured tint on top of a coloured map would multiply into mud. */
	wood: 0xffffff,
	rug: 0xffffff,
	rugEdge: 0xfff1d4,
	ink: 0x2a221b,
	lamp: 0x2f2a24,
	plinth: 0x3a2e21,
	brass: 0xc9a15b,
	paper: 0xfff8ea,
	rose: 0xf29191,
	peach: 0xecb181,
	orange: 0xeb9d60,
	green: 0x7c8c5a,
	pot: 0xd9b08c,
	bg: 0xe8d3bb,
};

const NIGHT = {
	wall: 0x1e1f18,
	floor: 0x17150f,
	desk: 0x2e2b22,
	wood: 0x6d5138,
	rug: 0x3a2a26,
	rugEdge: 0x4a3a30,
	ink: 0x14130f,
	lamp: 0x1b1915,
	plinth: 0x1e1a14,
	brass: 0x6e5230,
	paper: 0x2a2a22,
	rose: 0x8a5654,
	peach: 0x8a6a4e,
	orange: 0x8a6242,
	green: 0x3c4630,
	pot: 0x5a4632,
	bg: 0x0b0c09,
};

/* --- Procedural textures (Canvas2D -> THREE.CanvasTexture) --------------- */

function canvasTexture(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (ctx) paint(ctx);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 2;
	return texture;
}

/** A 4-step ramp for MeshToonMaterial: the reference's cel-shading in a file. */
function toonGradient() {
	const texture = canvasTexture(4, 1, (ctx) => {
		const steps = ['#c8c8c8', '#dedede', '#f0f0f0', '#ffffff'];
		steps.forEach((shade, index) => {
			ctx.fillStyle = shade;
			ctx.fillRect(index, 0, 1, 1);
		});
	});
	texture.minFilter = THREE.NearestFilter;
	texture.magFilter = THREE.NearestFilter;
	texture.generateMipmaps = false;
	return texture;
}

/** Warm wood grain, drawn once and shared by the desk top and legs. */
function woodTexture() {
	return canvasTexture(256, 256, (ctx) => {
		ctx.fillStyle = '#c9a27a';
		ctx.fillRect(0, 0, 256, 256);
		for (let i = 0; i < 46; i++) {
			const y = Math.random() * 256;
			const width = 40 + Math.random() * 200;
			ctx.strokeStyle = `rgba(122, 84, 52, ${0.05 + Math.random() * 0.12})`;
			ctx.lineWidth = 0.6 + Math.random() * 1.8;
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.bezierCurveTo(80, y + 4, 170, y - 5, 256, y + 2);
			ctx.stroke();
			void width;
		}
		for (let i = 0; i < 10; i++) {
			ctx.strokeStyle = 'rgba(86, 58, 34, 0.18)';
			ctx.lineWidth = 1;
			ctx.beginPath();
			const x = Math.random() * 256;
			ctx.ellipse(x, Math.random() * 256, 10 + Math.random() * 22, 3 + Math.random() * 6, Math.random(), 0, Math.PI * 2);
			ctx.stroke();
		}
	});
}

/** A rug: warm ground, cream border, a couple of quiet stripes. */
function rugTexture() {
	return canvasTexture(256, 160, (ctx) => {
		ctx.fillStyle = '#e8b9a8';
		ctx.fillRect(0, 0, 256, 160);
		ctx.strokeStyle = 'rgba(255, 241, 212, 0.85)';
		ctx.lineWidth = 8;
		ctx.strokeRect(10, 10, 236, 140);
		ctx.strokeStyle = 'rgba(255, 241, 212, 0.45)';
		ctx.lineWidth = 3;
		ctx.strokeRect(22, 22, 212, 116);
		ctx.fillStyle = 'rgba(166, 90, 60, 0.18)';
		for (let x = 30; x < 230; x += 24) ctx.fillRect(x, 30, 8, 100);
	});
}

/** The view outside the window: warm daylight, or a deep night with stars. */
function skyTexture(night: boolean) {
	return canvasTexture(512, 512, (ctx) => {
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
			ctx.fillStyle = 'rgba(255, 246, 220, 0.92)';
			ctx.beginPath();
			ctx.arc(360, 150, 46, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = 'rgba(126, 148, 106, 0.4)';
			ctx.beginPath();
			ctx.ellipse(170, 460, 210, 82, 0, 0, Math.PI * 2);
			ctx.fill();
		}
	});
}

/** Soft radial gradient for light pools and contact shadows. */
function radialTexture(inner: string, outer: string) {
	return canvasTexture(256, 256, (ctx) => {
		const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
		gradient.addColorStop(0, inner);
		gradient.addColorStop(0.5, inner);
		gradient.addColorStop(1, outer);
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, 256, 256);
	});
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
	const target = new THREE.Vector3(0, 1.12, -0.35);
	const viewDirection = new THREE.Vector3(0.5, 0.24, 0.83).normalize();

	const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.02;
	renderer.domElement.setAttribute('aria-hidden', 'true');
	host.appendChild(renderer.domElement);

	/* --- Materials ------------------------------------------------------- */

	const gradientMap = toonGradient();
	const grain = woodTexture();
	const rugMap = rugTexture();

	const toon = (color: number, extra: Partial<THREE.MeshToonMaterialParameters> = {}) =>
		new THREE.MeshToonMaterial({ color, gradientMap, ...extra });

	const wallMat = toon(DAY.wall);
	const floorMat = toon(DAY.floor);
	const deskMat = toon(DAY.desk);
	const woodMat = toon(DAY.wood, { map: grain });
	const rugMat = toon(DAY.rug, { map: rugMap });
	const inkMat = toon(DAY.ink);
	const lampMat = toon(DAY.lamp, { map: grain });
	const plinthMat = toon(DAY.plinth);
	const brassMat = new THREE.MeshStandardMaterial({ color: DAY.brass, roughness: 0.5, metalness: 0.2 });
	const paperMat = toon(DAY.paper);
	const frameMat = toon(0xf7e9cf);
	const bookReds = [toon(DAY.rose), toon(DAY.peach), toon(DAY.orange)];
	const potMat = toon(DAY.pot);
	const leafMat = toon(DAY.green);
	const greenMat = toon(0x6f8b52);

	/* --- Diorama base ---------------------------------------------------- */

	const plinthBody = new THREE.Mesh(new THREE.BoxGeometry(6.7, 0.55, 5.1), plinthMat);
	plinthBody.position.set(0, -0.3, -0.1);
	scene.add(plinthBody);

	const plinthLip = new THREE.Mesh(new THREE.BoxGeometry(6.98, 0.07, 5.38), brassMat);
	/* The lip's top has to stay below the room floor, or this box paints over
	   the whole floor with its dark material. */
	plinthLip.position.set(0, -0.09, -0.1);
	scene.add(plinthLip);

	/* --- Room ------------------------------------------------------------ */

	const floor = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 4.6), floorMat);
	floor.rotation.x = -Math.PI / 2;
	floor.position.set(0, 0.012, -0.1);
	scene.add(floor);

	const backWall = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 3.4), wallMat);
	backWall.position.set(0, 1.7, -2.4);
	scene.add(backWall);

	const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.4), wallMat);
	leftWall.rotation.y = Math.PI / 2;
	leftWall.position.set(-3.1, 1.7, -0.1);
	scene.add(leftWall);

	const baseboard = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.12, 0.05), frameMat);
	baseboard.position.set(0, 0.06, -2.37);
	scene.add(baseboard);

	const baseboardLeft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 4.6), frameMat);
	baseboardLeft.position.set(-3.07, 0.06, -0.1);
	scene.add(baseboardLeft);

	const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.3), rugMat);
	rug.rotation.x = -Math.PI / 2;
	rug.position.set(-0.1, 0.02, 0.6);
	scene.add(rug);

	/* --- Window, left of the frame --------------------------------------- */

	const windowGroup = new THREE.Group();
	windowGroup.position.set(-1.62, 1.92, -2.38);
	scene.add(windowGroup);

	const skyDay = new THREE.Mesh(
		new THREE.PlaneGeometry(1.5, 1.9),
		new THREE.MeshBasicMaterial({ map: skyTexture(false), transparent: true }),
	);
	const skyNight = new THREE.Mesh(
		new THREE.PlaneGeometry(1.5, 1.9),
		new THREE.MeshBasicMaterial({ map: skyTexture(true), transparent: true, opacity: 0 }),
	);
	skyDay.position.z = 0.01;
	skyNight.position.z = 0.012;
	windowGroup.add(skyDay, skyNight);

	const bar = (w: number, h: number, x: number, y: number) => {
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.07), frameMat);
		mesh.position.set(x, y, 0.06);
		windowGroup.add(mesh);
	};
	bar(1.66, 0.08, 0, 0.99);
	bar(1.66, 0.08, 0, -0.99);
	bar(0.08, 2.06, -0.79, 0);
	bar(0.08, 2.06, 0.79, 0);
	bar(0.05, 2.0, 0, 0);
	bar(1.6, 0.05, 0, 0.12);

	const sill = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.07, 0.24), frameMat);
	sill.position.set(0, -1.05, 0.1);
	windowGroup.add(sill);

	const windowGlow = new THREE.Sprite(
		new THREE.SpriteMaterial({
			map: radialTexture('rgba(255, 248, 226, 0.7)', 'rgba(255, 248, 226, 0)'),
			transparent: true,
			opacity: 0.16,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
		}),
	);
	windowGlow.position.set(-1.62, 1.95, -2.22);
	windowGlow.scale.set(2.3, 2.6, 1);
	scene.add(windowGlow);

	/* --- Wall furniture -------------------------------------------------- */

	const printFrame = new THREE.Mesh(new THREE.BoxGeometry(0.82, 1.02, 0.05), frameMat);
	printFrame.position.set(1.55, 2.05, -2.37);
	scene.add(printFrame);

	const printPaper = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), paperMat);
	printPaper.position.set(1.55, 2.05, -2.34);
	scene.add(printPaper);

	/* A shelf with a few books, right of the window. */
	const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.26), woodMat);
	shelf.position.set(0.42, 2.52, -2.24);
	scene.add(shelf);

	const shelfBooks = new THREE.Group();
	shelfBooks.position.set(0.42, 2.55, -2.2);
	scene.add(shelfBooks);
	const shelfColors = [DAY.rose, DAY.paper, DAY.peach, 0x8aa07a, DAY.orange];
	shelfColors.forEach((colour, index) => {
		const height = 0.26 + (index % 3) * 0.03;
		const bookMesh = new THREE.Mesh(
			new THREE.BoxGeometry(0.06 + (index % 2) * 0.02, height, 0.2),
			toon(colour),
		);
		bookMesh.position.set(-0.62 + index * 0.11, height / 2, 0);
		shelfBooks.add(bookMesh);
	});

	/* --- Desk ------------------------------------------------------------ */

	const desk = new THREE.Group();
	desk.position.set(0, 0, 0.1);
	scene.add(desk);

	const top = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.1, 1.4), deskMat);
	top.position.set(0, 0.96, 0);
	desk.add(top);

	const legGeometry = new THREE.BoxGeometry(0.1, 0.95, 0.1);
	for (const [x, z] of [
		[-1.5, -0.56],
		[1.5, -0.56],
		[-1.5, 0.56],
		[1.5, 0.56],
	]) {
		const leg = new THREE.Mesh(legGeometry, woodMat);
		leg.position.set(x, 0.48, z);
		desk.add(leg);
	}

	/* --- Chair, pulled out to one side ----------------------------------- */

	const chair = new THREE.Group();
	chair.position.set(2.05, 0, 0.55);
	chair.rotation.y = -0.7;
	scene.add(chair);

	const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.5), woodMat);
	seat.position.set(0, 0.55, 0);
	chair.add(seat);

	const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.05), woodMat);
	chairBack.position.set(0, 0.83, -0.24);
	chair.add(chairBack);

	for (const [x, z] of [
		[-0.23, -0.2],
		[0.23, -0.2],
		[-0.23, 0.2],
		[0.23, 0.2],
	]) {
		const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.55, 0.05), woodMat);
		leg.position.set(x, 0.27, z);
		chair.add(leg);
	}

	/* --- Desk lamp ------------------------------------------------------- */

	const lamp = new THREE.Group();
	lamp.position.set(1.15, 1.01, -0.42);
	desk.add(lamp);

	const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.06, 20), lampMat);
	lamp.add(lampBase);

	const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.95, 14), lampMat);
	stem.position.set(0, 0.5, 0);
	lamp.add(stem);

	const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 14), lampMat);
	elbow.position.set(0, 0.98, 0);
	lamp.add(elbow);

	const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.72, 14), lampMat);
	arm.position.set(-0.28, 1.1, 0);
	arm.rotation.z = Math.PI / 2.55;
	lamp.add(arm);

	const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.32, 0.34, 20, 1, true), lampMat);
	shade.position.set(-0.58, 1.05, 0);
	shade.rotation.z = -0.42;
	lamp.add(shade);

	const shadeInnerMat = new THREE.MeshToonMaterial({
		color: 0xffe9c4,
		emissive: 0xffcf8a,
		emissiveIntensity: 0,
		side: THREE.BackSide,
		gradientMap,
	});
	const shadeInner = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.31, 0.32, 20, 1, true), shadeInnerMat);
	shadeInner.position.copy(shade.position);
	shadeInner.rotation.copy(shade.rotation);
	lamp.add(shadeInner);

	const bulbMat = new THREE.MeshToonMaterial({
		color: 0xfff4dc,
		emissive: 0xffc072,
		emissiveIntensity: 0,
		gradientMap,
	});
	const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), bulbMat);
	bulb.position.set(-0.62, 0.92, 0);
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
	halo.scale.set(1.15, 1.15, 1);
	lamp.add(halo);

	const lightPool = new THREE.Mesh(
		new THREE.PlaneGeometry(3, 2.3),
		new THREE.MeshBasicMaterial({
			map: radialTexture('rgba(255, 202, 132, 0.55)', 'rgba(255, 190, 120, 0)'),
			transparent: true,
			opacity: 0,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
		}),
	);
	lightPool.rotation.x = -Math.PI / 2;
	lightPool.position.set(0.1, 1.013, -0.25);
	desk.add(lightPool);

	/* --- Computer / book ------------------------------------------------- */

	const computer = new THREE.Group();
	computer.position.set(-0.4, 1.01, -0.2);
	desk.add(computer);

	const screenBody = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.58, 0.05), inkMat);
	screenBody.position.set(0, 0.5, 0);
	screenBody.rotation.x = -0.08;
	computer.add(screenBody);

	const screenMat = new THREE.MeshToonMaterial({
		color: 0xe6eef4,
		emissive: 0x9cc2dc,
		emissiveIntensity: 0.5,
		gradientMap,
		transparent: true,
	});
	const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.48), screenMat);
	screen.position.set(0, 0.5, 0.028);
	screen.rotation.x = -0.08;
	computer.add(screen);

	const stand = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.14), inkMat);
	stand.position.set(0, 0.1, 0);
	computer.add(stand);

	const foot = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.03, 0.22), inkMat);
	foot.position.set(0, 0.015, 0);
	computer.add(foot);

	const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.03, 0.22), inkMat);
	keyboard.position.set(0, 0.015, 0.56);
	computer.add(keyboard);

	const book = new THREE.Group();
	book.position.set(-0.4, 1.012, 0);
	desk.add(book);

	const coverMat = toon(DAY.rose, { transparent: true });
	const bookCover = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.05, 0.6), coverMat);
	book.add(bookCover);

	const pageMats: THREE.MeshToonMaterial[] = [];
	for (const side of [-1, 1]) {
		const pageMat = toon(DAY.paper, { transparent: true });
		pageMats.push(pageMat);
		const page = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.035, 0.54), pageMat);
		page.position.set(side * 0.29, 0.055, 0);
		page.rotation.z = side * 0.09;
		book.add(page);
	}

	const bookmark = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.002, 0.22), toon(DAY.brass, { transparent: true }));
	bookmark.position.set(0.08, 0.075, 0.15);
	book.add(bookmark);

	/* --- Desk props ------------------------------------------------------ */

	/* A stack of books, offset so the shelf and the stack do not repeat. */
	const stack = new THREE.Group();
	stack.position.set(-1.16, 1.012, -0.38);
	stack.rotation.y = 0.2;
	desk.add(stack);
	[0.055, 0.05, 0.06].forEach((height, index) => {
		const cover = new THREE.Mesh(
			new THREE.BoxGeometry(0.62 - index * 0.04, height, 0.44 - index * 0.03),
			bookReds[index],
		);
		cover.position.set(0, height / 2 + index * 0.058, 0);
		cover.rotation.y = index * 0.14 - 0.1;
		stack.add(cover);
		const pages = new THREE.Mesh(
			new THREE.BoxGeometry(0.56 - index * 0.04, height * 0.7, 0.38 - index * 0.03),
			toon(0xfff8ea),
		);
		pages.position.set(0, height / 2 + index * 0.058, 0);
		pages.rotation.y = index * 0.14 - 0.1;
		stack.add(pages);
	});

	/* Pen cup with three pencils. */
	const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 16), potMat);
	cup.position.set(1.32, 1.09, 0.42);
	desk.add(cup);
	[-0.03, 0.01, 0.04].forEach((offset, index) => {
		const pencil = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.34, 8), toon(index === 1 ? DAY.brass : DAY.ink));
		pencil.position.set(1.32 + offset, 1.23 + index * 0.015, 0.42 + offset * 0.6);
		pencil.rotation.z = (index - 1) * 0.22;
		pencil.rotation.x = (index - 1) * 0.12;
		desk.add(pencil);
	});

	/* A small plant. */
	const plant = new THREE.Group();
	plant.position.set(-1.42, 1.012, 0.42);
	desk.add(plant);
	const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.15, 14), potMat);
	pot.position.y = 0.075;
	plant.add(pot);
	for (let i = 0; i < 5; i++) {
		const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.24, 5), leafMat);
		const angle = (i / 5) * Math.PI * 2;
		leaf.position.set(Math.cos(angle) * 0.05, 0.24, Math.sin(angle) * 0.05);
		leaf.rotation.z = Math.cos(angle) * 0.6;
		leaf.rotation.x = Math.sin(angle) * 0.6;
		plant.add(leaf);
	}

	const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.15, 18), toon(0xf6e6cc));
	mug.position.set(-0.78, 1.085, 0.44);
	desk.add(mug);

	const sheets = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.62), toon(0xfff8ea));
	sheets.rotation.x = -Math.PI / 2;
	sheets.rotation.z = 0.16;
	sheets.position.set(0.62, 1.013, 0.44);
	desk.add(sheets);

	/* --- Painted shadows ------------------------------------------------- */

	const shadowMat = (opacity: number) =>
		new THREE.MeshBasicMaterial({
			map: radialTexture(`rgba(38, 24, 12, ${opacity})`, 'rgba(38, 24, 12, 0)'),
			transparent: true,
			depthWrite: false,
		});

	const deskShadow = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.2), shadowMat(0.32));
	deskShadow.rotation.x = -Math.PI / 2;
	deskShadow.position.set(0.15, 0.026, 0.3);
	scene.add(deskShadow);

	const chairShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), shadowMat(0.18));
	chairShadow.rotation.x = -Math.PI / 2;
	chairShadow.position.set(2.05, 0.027, 0.55);
	scene.add(chairShadow);

	/* --- Lights ---------------------------------------------------------- */

	const ambient = new THREE.AmbientLight(0xfff1dc, 0.76);
	scene.add(ambient);

	const hemi = new THREE.HemisphereLight(0xfff1d8, 0xd6bd9e, 0.8);
	scene.add(hemi);

	const sun = new THREE.DirectionalLight(0xfff3d6, 1.24);
	sun.position.set(-3.6, 4.6, 2.2);
	scene.add(sun);

	const moon = new THREE.PointLight(0x8ea3cc, 0, 9, 1.5);
	moon.position.set(-1.8, 2.1, -0.8);
	scene.add(moon);

	const lampLight = new THREE.PointLight(0xffc08a, 0, 3.4, 1.7);
	lampLight.position.set(1.15 - 0.62, 1.01 + 0.92, -0.42);
	scene.add(lampLight);

	const lampFill = new THREE.PointLight(0xffbc80, 0, 5, 1.8);
	lampFill.position.set(1.15 - 0.5, 2.0, -0.42);
	scene.add(lampFill);

	const wallGlow = new THREE.Sprite(
		new THREE.SpriteMaterial({
			map: radialTexture('rgba(255, 190, 120, 0.5)', 'rgba(255, 190, 120, 0)'),
			transparent: true,
			opacity: 0,
			depthWrite: false,
			blending: THREE.AdditiveBlending,
		}),
	);
	wallGlow.position.set(0.7, 1.8, -2.3);
	wallGlow.scale.set(4, 4, 1);
	scene.add(wallGlow);

	/* --- Mode ------------------------------------------------------------ */

	let night = false;
	let current = 0;
	let targetValue = 0;
	let transitionFrom = 0;
	let transitionStart = 0;
	let transitionDone = true;
	const duration = reduced ? 0 : 1.25;

	const colors = {
		wallDay: new THREE.Color(DAY.wall),
		wallNight: new THREE.Color(NIGHT.wall),
		floorDay: new THREE.Color(DAY.floor),
		floorNight: new THREE.Color(NIGHT.floor),
		deskDay: new THREE.Color(DAY.desk),
		deskNight: new THREE.Color(NIGHT.desk),
		woodDay: new THREE.Color(DAY.wood),
		woodNight: new THREE.Color(NIGHT.wood),
		rugDay: new THREE.Color(DAY.rug),
		rugNight: new THREE.Color(NIGHT.rug),
		inkDay: new THREE.Color(DAY.ink),
		inkNight: new THREE.Color(NIGHT.ink),
		lampDay: new THREE.Color(DAY.lamp),
		lampNight: new THREE.Color(NIGHT.lamp),
		paperDay: new THREE.Color(DAY.paper),
		paperNight: new THREE.Color(NIGHT.paper),
		plinthDay: new THREE.Color(DAY.plinth),
		plinthNight: new THREE.Color(NIGHT.plinth),
		brassDay: new THREE.Color(DAY.brass),
		brassNight: new THREE.Color(NIGHT.brass),
		hemiSkyDay: new THREE.Color(0xfff1d8),
		hemiSkyNight: new THREE.Color(0x5a6078),
		hemiGroundDay: new THREE.Color(0xc0a180),
		hemiGroundNight: new THREE.Color(0x1c1a14),
		bgDay: new THREE.Color(DAY.bg),
		bgNight: new THREE.Color(NIGHT.bg),
	};

	const applyMode = (t: number) => {
		current = t;

		ambient.intensity = lerp(0.76, 0.18, t);
		hemi.intensity = lerp(0.8, 0.3, t);
		hemi.color.lerpColors(colors.hemiSkyDay, colors.hemiSkyNight, t);
		hemi.groundColor.lerpColors(colors.hemiGroundDay, colors.hemiGroundNight, t);

		sun.intensity = lerp(1.24, 0.03, t);
		moon.intensity = lerp(0, 4.2, t);
		lampLight.intensity = lerp(0, 22, t);
		lampFill.intensity = lerp(0, 1.6, t);

		shadeInnerMat.emissiveIntensity = lerp(0, 0.9, t);
		bulbMat.emissiveIntensity = lerp(0, 3.2, t);
		(halo.material as THREE.SpriteMaterial).opacity = lerp(0, 0.9, t);
		(lightPool.material as THREE.MeshBasicMaterial).opacity = lerp(0, 0.8, t);
		(wallGlow.material as THREE.SpriteMaterial).opacity = lerp(0, 0.55, t);
		(windowGlow.material as THREE.SpriteMaterial).opacity = lerp(0.3, 0.1, t);

		(skyDay.material as THREE.MeshBasicMaterial).opacity = 1 - t;
		(skyNight.material as THREE.MeshBasicMaterial).opacity = t;
		skyNight.visible = t > 0.01;
		skyDay.visible = t < 0.99;

		(scene.background as THREE.Color).lerpColors(colors.bgDay, colors.bgNight, t);
		wallMat.color.lerpColors(colors.wallDay, colors.wallNight, t);
		floorMat.color.lerpColors(colors.floorDay, colors.floorNight, t);
		deskMat.color.lerpColors(colors.deskDay, colors.deskNight, t);
		woodMat.color.lerpColors(colors.woodDay, colors.woodNight, t);
		rugMat.color.lerpColors(colors.rugDay, colors.rugNight, t);
		inkMat.color.lerpColors(colors.inkDay, colors.inkNight, t);
		lampMat.color.lerpColors(colors.lampDay, colors.lampNight, t);
		paperMat.color.lerpColors(colors.paperDay, colors.paperNight, t);
		plinthMat.color.lerpColors(colors.plinthDay, colors.plinthNight, t);
		brassMat.color.lerpColors(colors.brassDay, colors.brassNight, t);
		screenMat.emissiveIntensity = lerp(0.5, 0, t);

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
		coverMat.opacity = bookAmount;
		for (const material of pageMats) material.opacity = bookAmount;
		bookmark.visible = bookAmount > 0.5;
		(bookmark.material as THREE.MeshToonMaterial).opacity = bookAmount;

		renderer.toneMappingExposure = lerp(1.02, 0.96, t);
	};

	/* --- On-demand rendering, ~24fps while transitioning ------------------ */

	let rafId = 0;
	let lastDraw = 0;
	let inView = true;

	const draw = (now: number) => {
		rafId = 0;

		if (!transitionDone) {
			if (now - lastDraw < 42) {
				rafId = requestAnimationFrame(draw);
				return;
			}
			lastDraw = now;

			const progress = duration === 0 ? 1 : Math.min(1, (now - transitionStart) / (duration * 1000));
			applyMode(lerp(transitionFrom, targetValue, easeInOut(progress)));
			transitionDone = progress >= 1;
			if (!transitionDone) rafId = requestAnimationFrame(draw);
		}

		renderer.render(scene, camera);
	};

	const requestRender = () => {
		if (rafId || !inView) return;
		rafId = requestAnimationFrame(draw);
	};

	const visibility = new IntersectionObserver(
		([entry]) => {
			inView = entry.isIntersecting;
			if (inView) requestRender();
		},
		{ threshold: 0.02 },
	);
	visibility.observe(host);

	const setNight = (value: boolean, immediate = false) => {
		night = value;
		targetValue = value ? 1 : 0;

		/* Changing the lamp while the desk is off-screen does not need an
		   animation: it is already correct when it scrolls back in. */
		if (immediate || duration === 0 || !inView) {
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

	/* --- Size ------------------------------------------------------------ */

	const resize = () => {
		const width = host.clientWidth;
		const height = host.clientHeight;
		if (!width || !height) return;

		renderer.setSize(width, height, false);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();

		const distance = camera.aspect < 1.2 ? 10.2 : 8.4;
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
			visibility.disconnect();
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


