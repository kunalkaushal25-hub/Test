/* ---------------------------------------------------------------------------
 * build.mjs — assemble one self-contained page.
 *
 * three.js r160 ships no usable UMD build (build/three.min.js is just a
 * deprecation stub), and the published page must not depend on a CDN. So we
 * take the self-contained ES module build and rewrite its single trailing
 * `export { A as B, ... }` clause into `window.THREE = { B: A, ... }`, which
 * turns it into a plain classic script.
 *
 *   node tools/build.mjs
 * ------------------------------------------------------------------------- */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (...a) => path.join(ROOT, ...a);

const SRC_ORDER = [
  'src/scene/plan.js',
  'src/scene/materials.js',
  'src/scene/shell.js',
  'src/scene/furniture.js',
  'src/scene/lighting.js',
  'src/camera/shots.js',
  'src/overlay.js',
  'src/validate.js',
  'src/app.js',
];

function globaliseThree() {
  const file = p('node_modules/three/build/three.module.min.js');
  if (!fs.existsSync(file)) {
    throw new Error('three.module.min.js not found — run `npm install` first.');
  }
  let src = fs.readFileSync(file, 'utf8');

  if (/^\s*import[\s{'"]/m.test(src)) {
    throw new Error('three build is not self-contained (it has imports); pin three@0.160.0.');
  }

  const clauses = [...src.matchAll(/\bexport\s*\{/g)];
  if (clauses.length !== 1) {
    throw new Error(`expected exactly 1 export clause in three, found ${clauses.length}`);
  }

  const m = src.match(/\bexport\s*\{([\s\S]*?)\}\s*;?\s*$/);
  if (!m) throw new Error('could not locate the trailing export clause in three');

  const pairs = m[1]
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
    .map((e) => {
      const as = e.split(/\s+as\s+/);
      const local = as[0].trim();
      const exported = (as[1] || as[0]).trim();
      // Exported names are plain identifiers in this build; guard anyway.
      if (!/^[A-Za-z_$][\w$]*$/.test(exported)) {
        throw new Error(`unexpected exported name: ${exported}`);
      }
      return `${exported}:${local}`;
    });

  src = src.slice(0, m.index) + `;window.THREE={${pairs.join(',')}};\n`;
  return { src, count: pairs.length };
}

function build() {
  const three = globaliseThree();

  const app = SRC_ORDER.map((f) => {
    const body = fs.readFileSync(p(f), 'utf8');
    return `\n/* ===== ${f} ===== */\n${body}`;
  }).join('\n');

  const wrapped = `(function () {\n"use strict";\nconst THREE = window.THREE;\n${app}\n})();`;

  let html = fs.readFileSync(p('src/index.template.html'), 'utf8');

  // Guard against the payloads being swallowed by a stray replacement pattern.
  const inject = (tpl, token, code) => {
    if (!tpl.includes(token)) throw new Error(`template is missing ${token}`);
    return tpl.replace(token, () => code);
  };

  html = inject(html, '/*__THREE__*/', three.src);
  html = inject(html, '/*__APP__*/', wrapped);

  fs.mkdirSync(p('public'), { recursive: true });
  fs.writeFileSync(p('public/index.html'), html);

  const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
  console.log(`three:  ${three.count} exports globalised (${kb(three.src.length)})`);
  console.log(`app:    ${SRC_ORDER.length} modules (${kb(wrapped.length)})`);
  console.log(`wrote:  public/index.html (${kb(html.length)})`);

  // The Artifact host only scans the first 8 KB for a <title>.
  const titleAt = html.indexOf('<title>');
  if (titleAt < 0 || titleAt > 8000) {
    throw new Error('<title> must appear within the first 8 KB of the page');
  }
}

build();
