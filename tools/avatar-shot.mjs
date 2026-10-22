/* ---------------------------------------------------------------------------
 * avatar-shot.mjs — render stills of the avatar for checking by eye.
 *
 *   node tools/avatar-shot.mjs '{"name":"face","view":"face"}' ...
 *   SHEET=4 node tools/avatar-shot.mjs --gestures      every gesture, one grid
 *
 * Each argument is a JSON object handed to window.__still() in the page;
 * the frame is saved to out/avatar/<name>.png. With SHEET=<columns> the
 * stills are tiled into out/avatar/sheet.jpg instead.
 * ------------------------------------------------------------------------- */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (...a) => path.join(ROOT, ...a);

function resolvePlaywright() {
  for (const id of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try { return require(id); } catch { /* keep looking */ }
  }
  throw new Error('playwright not found (npm i -D playwright, or install it globally)');
}

function resolveChromium() {
  const explicit = process.env.CHROMIUM_PATH;
  if (explicit && fs.existsSync(explicit)) return explicit;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (fs.existsSync(base)) {
    for (const d of fs.readdirSync(base)) {
      const c = path.join(base, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(c)) return c;
    }
  }
  return undefined;
}

function serve(dir) {
  const srv = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(dir, rel === '/' ? 'avatar.html' : rel);
    if (!file.startsWith(dir)) { res.statusCode = 403; return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.statusCode = 404; return res.end('not found'); }
      res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream');
      res.end(buf);
    });
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve(srv)));
}

async function main() {
  const args = process.argv.slice(2);
  const shots = args.filter((a) => a.startsWith('{')).map((a) => JSON.parse(a));
  const wantGestures = args.includes('--gestures');
  if (!shots.length && !wantGestures) shots.push({ name: 'face', view: 'face' });
  const W = Number(process.env.W || 900), H = Number(process.env.H || 900);

  const { chromium } = resolvePlaywright();
  const srv = await serve(p('public'));
  const browser = await chromium.launch({
    executablePath: resolveChromium(),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
           '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--force-color-profile=srgb'],
  });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const problems = [];
  page.on('console', (m) => { problems.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(String(e)));

  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${srv.address().port}/avatar.html?still=1`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 180000 }).catch(() => {});
  console.log(`ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (problems.length) console.log('page:\n  ' + problems.join('\n  '));

  const dir = p('out/avatar');
  fs.mkdirSync(dir, { recursive: true });
  if (wantGestures) {
    const list = await page.evaluate(() => window.Aisha.gestures().map((n) => [n, window.__peak(n)]));
    for (const [n, t] of list) shots.push({ name: n, gesture: n, t, view: process.env.VIEW || 'half', full: 1 });
  }
  const cols = Number(process.env.SHEET || 0);
  if (cols) {
    const rows = Math.ceil(shots.length / cols);
    await page.evaluate(([c, r, w, h]) => window.__sheet.init(c, r, w, h), [cols, rows, Math.round(W * 0.5), Math.round(H * 0.5)]);
    for (let i = 0; i < shots.length; i++) {
      await page.evaluate(([o, k]) => { window.__still(o); window.__sheet.grab(k, o.name); }, [shots[i], i]);
    }
    const url = await page.evaluate(() => window.__sheet.out());
    const file = path.join(dir, 'sheet.jpg');
    fs.writeFileSync(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
    console.log(path.relative(ROOT, file));
    await browser.close(); srv.close();
    return;
  }
  for (const s of shots) {
    await page.evaluate((o) => window.__still(o), s);
    const file = path.join(dir, `${s.name || 'shot'}.png`);
    await page.screenshot({ path: file });
    console.log(path.relative(ROOT, file));
  }
  if (problems.length) console.log('page:\n  ' + problems.join('\n  '));
  await browser.close();
  srv.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
