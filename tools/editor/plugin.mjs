/**
 * The local editor, mounted as a Vite dev-server middleware.
 *
 * It lives inside `npm run dev` rather than in a separate process so that:
 *
 *   - `apply: 'serve'` makes it structurally impossible for it to reach a build
 *     — `npm run build` never even constructs this plugin, so there is no
 *     dev-only route to accidentally ship to Cloudflare;
 *   - the live preview is just an <iframe src="/"> on the same origin, with
 *     Vite's HMR already wired up: saving a file reloads the preview;
 *   - the machine running the editor is the machine holding the repo, so writes
 *     are plain `fs` calls with no API surface on the network.
 *
 * Routes, all under `/__edit`:
 *
 *   GET    /                  the editor UI
 *   GET    /api/state         every post, author, setting and media file
 *   POST   /api/post          create or update one post
 *   DELETE /api/post?id=      delete a post
 *   POST   /api/author        create or update one author
 *   DELETE /api/author?id=    delete an author
 *   POST   /api/settings      replace settings.json
 *   POST   /api/media         upload (raw body, name in `x-file-name`)
 *   DELETE /api/media?name=   delete an image
 *   GET    /media/<name>      serve an image, for the previews
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as store from './store.mjs';

const MOUNT = '/__edit';
const UI_FILE = fileURLToPath(new URL('./ui.html', import.meta.url));

const CONTENT_TYPES = {
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.webp': 'image/webp',
	'.avif': 'image/avif',
	'.gif': 'image/gif',
};

function sendJson(res, status, payload) {
	const body = JSON.stringify(payload);
	res.statusCode = status;
	res.setHeader('content-type', 'application/json; charset=utf-8');
	res.setHeader('cache-control', 'no-store');
	res.end(body);
}

async function readJsonBody(req) {
	const chunks = [];
	for await (const chunk of req) chunks.push(chunk);
	const text = Buffer.concat(chunks).toString('utf8');
	if (text.trim() === '') return {};
	try {
		return JSON.parse(text);
	} catch (error) {
		throw new store.EditorError(`request body is not valid JSON: ${error.message}`);
	}
}

async function readRawBody(req) {
	const chunks = [];
	for await (const chunk of req) chunks.push(chunk);
	return Buffer.concat(chunks);
}

async function handle(req, res) {
	const url = new URL(req.url ?? '/', 'http://localhost');
	const path = url.pathname;
	const method = req.method ?? 'GET';

	if (path === '/' || path === '/index.html') {
		const html = await readFile(UI_FILE, 'utf8');
		res.statusCode = 200;
		res.setHeader('content-type', 'text/html; charset=utf-8');
		res.setHeader('cache-control', 'no-store');
		res.end(html);
		return;
	}

	if (path.startsWith('/media/')) {
		const name = decodeURIComponent(path.slice('/media/'.length));
		const dot = name.lastIndexOf('.');
		const bytes = await store.readMedia(name);
		res.statusCode = 200;
		res.setHeader('content-type', CONTENT_TYPES[name.slice(dot).toLowerCase()] ?? 'application/octet-stream');
		res.setHeader('cache-control', 'no-store');
		res.end(bytes);
		return;
	}

	if (!path.startsWith('/api/')) {
		sendJson(res, 404, { error: `no such editor route: ${path}` });
		return;
	}

	const route = path.slice('/api/'.length);

	if (route === 'state' && method === 'GET') {
		const [posts, authors, settings, media, usage] = await Promise.all([
			store.listPosts(),
			store.listAuthors(),
			store.readSettings(),
			store.listMedia(),
			store.mediaUsage(),
		]);
		sendJson(res, 200, {
			posts,
			authors,
			settings,
			media,
			usage: Object.fromEntries(usage),
			root: store.root,
		});
		return;
	}

	if (route === 'post') {
		if (method === 'POST') {
			const body = await readJsonBody(req);
			const saved = await store.writePost(body.id, body.data, body.body);
			sendJson(res, 200, { post: saved });
			return;
		}
		if (method === 'DELETE') {
			await store.deletePost(url.searchParams.get('id'));
			sendJson(res, 200, { ok: true });
			return;
		}
	}

	if (route === 'author') {
		if (method === 'POST') {
			const body = await readJsonBody(req);
			const saved = await store.writeAuthor(body.id, body.data, body.body);
			sendJson(res, 200, { author: saved });
			return;
		}
		if (method === 'DELETE') {
			await store.deleteAuthor(url.searchParams.get('id'));
			sendJson(res, 200, { ok: true });
			return;
		}
	}

	if (route === 'settings' && method === 'POST') {
		const body = await readJsonBody(req);
		sendJson(res, 200, { settings: await store.writeSettings(body.settings) });
		return;
	}

	if (route === 'media') {
		if (method === 'POST') {
			const header = req.headers['x-file-name'];
			if (typeof header !== 'string') {
				throw new store.EditorError('missing x-file-name header');
			}
			// The header has to be ASCII, so the UI percent-encodes the name.
			let name;
			try {
				name = decodeURIComponent(header);
			} catch {
				throw new store.EditorError(`x-file-name is not valid percent-encoding: ${header}`);
			}
			const bytes = await readRawBody(req);
			if (bytes.length === 0) throw new store.EditorError('the uploaded file is empty');
			sendJson(res, 200, { media: await store.saveMedia(name, bytes) });
			return;
		}
		if (method === 'DELETE') {
			await store.deleteMedia(url.searchParams.get('name'));
			sendJson(res, 200, { ok: true });
			return;
		}
	}

	sendJson(res, 404, { error: `no such editor route: ${method} ${path}` });
}

export function localEditor() {
	return {
		name: 'tasty-transit:local-editor',
		/** Serve only. A build never constructs this plugin at all. */
		apply: 'serve',
		configureServer(server) {
			server.middlewares.use(MOUNT, (req, res, next) => {
				handle(req, res).catch((error) => {
					const status = error instanceof store.EditorError ? error.status : 500;
					if (status === 500) {
						server.config.logger.error(`[editor] ${error.stack ?? error.message}`);
					}
					sendJson(res, status, { error: error.message });
				});
				// `next` is unused: /__edit owns everything below this mount.
				void next;
			});
			server.config.logger.info(`  ➜  Editor:  http://localhost:${server.config.server.port ?? 4321}${MOUNT}`);
		},
	};
}
