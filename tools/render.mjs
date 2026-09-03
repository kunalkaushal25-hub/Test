/* ---------------------------------------------------------------------------
 * render.mjs — offline frame capture.
 *
 * Steps film time by hand rather than trusting a wall clock, so the output is
 * frame-exact and reproducible no matter how slow the software rasteriser is.
 * Frames are screenshotted as JPEG and piped straight into ffmpeg.
 *
 *   node tools/render.mjs --preview      six stills at the shot boundaries
 *   node tools/render.mjs                the full film
 *
 * Options: --width --height --fps --start --end --out --quality
 * ------------------------------------------------------------------------- */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (...a) => path.join(ROOT, ...a);

/* -- argument parsing ------------------------------------------------------ */
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const PREVIEW = flag('preview');
const WIDTH = Number(opt('width', 1920));
const HEIGHT = Number(opt('height', 1080));
const FPS = Number(opt('fps', 30));
const QUALITY = Number(opt('quality', 95));
const OUT = opt('out', p('out/serenz-a922-studio-walkthrough.mp4'));
const NO_AA = flag('no-aa');

/* -- dependency resolution ------------------------------------------------- */
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
  return undefined;   // let playwright fall back to its own download
}

function resolveFfmpeg() {
  try { return require('@ffmpeg-installer/ffmpeg').path; } catch { /* fall through */ }
  return process.env.FFMPEG_PATH || 'ffmpeg';
}

/* -- static server --------------------------------------------------------- */
function serve(dir) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript' };
  const srv = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel === '/favicon.ico') { res.statusCode = 204; return res.end(); }
    const file = path.join(dir, rel === '/' ? 'index.html' : rel);
    if (!file.startsWith(dir)) { res.statusCode = 403; return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.statusCode = 404; return res.end('not found'); }
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      res.end(buf);
    });
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve(srv)));
}

/* -- helpers --------------------------------------------------------------- */
const write = (stream, buf) =>
  stream.write(buf) ? Promise.resolve() : new Promise((r) => stream.once('drain', r));

/* Grab one composited frame as a JPEG buffer, in-page (see app.js). */
async function capture(page, t, quality) {
  const url = await page.evaluate(
    ([tt, q]) => window.__captureFrame(tt, q), [t, quality / 100]
  );
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
}

const clock = (s) => {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

async function main() {
  const bootT0 = Date.now();
  if (!fs.existsSync(p('public/index.html'))) {
    throw new Error('public/index.html missing — run `node tools/build.mjs` first');
  }

  const { chromium } = resolvePlaywright();
  const srv = await serve(p('public'));
  const port = srv.address().port;

  const browser = await chromium.launch({
    executablePath: resolveChromium(),
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--hide-scrollbars',
      '--force-color-profile=srgb',
      '--disable-frame-rate-limit',
    ],
  });

  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });

  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(String(e)));

  await page.goto(`http://127.0.0.1:${port}/?render=1${NO_AA ? '&aa=0' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', null, { timeout: 120000 });

  if (problems.length) {
    console.error('page reported errors:\n  ' + problems.join('\n  '));
    await browser.close(); srv.close();
    process.exit(1);
  }

  const startedAt = Date.now() - bootT0;
  const duration = await page.evaluate('window.__duration');
  const shots = await page.evaluate('window.__shots');

  /* ---- camera sanity check ---------------------------------------------- */
  if (flag('check')) {
    const { issues } = await page.evaluate('window.__validate(0.2)');
    if (!issues.length) {
      console.log('camera check: clean — no embedded, tight or cramped framing');
    } else {
      console.log(`camera check: ${issues.length} problem window(s)\n`);
      for (const i of issues) {
        console.log(
          `  ${i.kind.padEnd(9)} ${i.shot.padEnd(13)} ` +
          `${i.t0.toFixed(1)}s–${i.t1.toFixed(1)}s   worst ${i.worst.toFixed(2)} m`
        );
      }
    }
    await browser.close(); srv.close();
    process.exit(issues.length ? 1 : 0);
  }

  /* ---- benchmark: isolate startup cost from per-frame cost -------------- */
  if (flag('bench')) {
    const n = Number(opt('bench', 30));
    // Warm up: the first frame after a light-count change recompiles every
    // shader, which is very slow under SwiftShader and would skew the mean.
    await capture(page, 41, QUALITY);

    let inPage = 0;
    const t0 = Date.now();
    for (let i = 0; i < n; i++) {
      const a = Date.now();
      await capture(page, 41 + i / 30, QUALITY);
      inPage += Date.now() - a;
    }
    const per = (Date.now() - t0) / n;
    console.log(`  render+capture ${(inPage / n).toFixed(0)} ms/frame`);
    const full = Math.round(duration * FPS) * per / 60000;
    console.log(`startup ${(startedAt / 1000).toFixed(1)}s`);
    console.log(`${per.toFixed(0)} ms/frame at ${WIDTH}x${HEIGHT}`);
    console.log(`full film (${Math.round(duration * FPS)} frames) ~ ${full.toFixed(0)} min`);
    await browser.close(); srv.close();
    return;
  }

  /* ---- a single still, for checking one moment quickly ------------------ */
  if (flag('at')) {
    const t = Number(opt('at', 0));
    const dir = p('out/preview');
    fs.mkdirSync(dir, { recursive: true });
    await page.evaluate((tt) => window.__renderFrame(tt), t);
    const file = path.join(dir, `at-${t.toFixed(1).replace('.', '_')}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
    console.log(`${path.relative(ROOT, file)}  @ ${t.toFixed(1)}s`);
    await browser.close(); srv.close();
    return;
  }

  /* ---- preview: stills at the shot boundaries --------------------------- */
  if (PREVIEW) {
    const dir = p('out/preview');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });

    // A representative moment inside each shot, plus the end card.
    const marks = shots.map((s) => ({ id: s.id, t: s.t0 + (s.t1 - s.t0) * 0.55 }));
    marks.push({ id: 'endcard', t: duration - 2.5 });

    for (let i = 0; i < marks.length; i++) {
      const { id, t } = marks[i];
      await page.evaluate((tt) => window.__renderFrame(tt), t);
      const file = path.join(dir, `${String(i).padStart(2, '0')}-${id}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
      console.log(`  ${path.basename(file)}  @ ${t.toFixed(1)}s`);
    }
    console.log(`\n${marks.length} stills -> out/preview/`);
    await browser.close(); srv.close();
    return;
  }

  /* ---- full render ------------------------------------------------------ */
  const start = Number(opt('start', 0));
  const end = Number(opt('end', duration));
  const total = Math.round((end - start) * FPS);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  const audio = p('out/ambient.wav');
  const hasAudio = fs.existsSync(audio);

  const args = [
    '-y',
    '-f', 'image2pipe', '-framerate', String(FPS), '-i', 'pipe:0',
    ...(hasAudio ? ['-i', audio] : []),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
    '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-movflags', '+faststart',
    ...(hasAudio ? ['-c:a', 'aac', '-b:a', '192k', '-shortest'] : []),
    OUT,
  ];

  const ff = spawn(resolveFfmpeg(), args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let ffErr = '';
  ff.stderr.on('data', (d) => { ffErr += d.toString(); if (ffErr.length > 40000) ffErr = ffErr.slice(-20000); });
  const ffDone = new Promise((resolve, reject) => {
    ff.on('error', reject);
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}\n${ffErr}`))));
  });
  ff.stdin.on('error', () => { /* surfaced through ffDone */ });

  console.log(`rendering ${total} frames  ${WIDTH}x${HEIGHT} @ ${FPS}fps  (${clock(end - start)})`);
  if (hasAudio) console.log('muxing out/ambient.wav');

  const t0 = Date.now();
  for (let i = 0; i < total; i++) {
    const t = start + i / FPS;
    const buf = await capture(page, t, QUALITY);
    await write(ff.stdin, buf);

    if (i % 60 === 0 || i === total - 1) {
      const done = i + 1;
      const el = (Date.now() - t0) / 1000;
      const eta = el / done * (total - done);
      const pct = ((done / total) * 100).toFixed(1);
      process.stdout.write(
        `\r  ${String(done).padStart(5)}/${total}  ${pct.padStart(5)}%  ` +
        `film ${clock(t)}  elapsed ${clock(el)}  eta ${clock(eta)}   `
      );
    }
  }
  process.stdout.write('\n');

  ff.stdin.end();
  await ffDone;

  await browser.close();
  srv.close();

  if (problems.length) console.error(`note: ${problems.length} page error(s) during render`);

  const size = fs.statSync(OUT).size;
  console.log(`wrote ${path.relative(ROOT, OUT)}  ${(size / 1048576).toFixed(1)} MB` +
              `  in ${clock((Date.now() - t0) / 1000)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
