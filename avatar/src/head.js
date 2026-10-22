/* ---------------------------------------------------------------------------
 * head.js — the face.
 *
 * The skull is a dense sphere pushed out to an ellipsoid that tapers to a
 * soft chin, and the face is sculpted onto its front as a field of Gaussian
 * bumps and hollows: nose, sockets, cheekbones, muzzle, chin. Everything is
 * authored in "face space" — metres relative to the head centre FACE.C.
 *
 * Features that have to move every frame (lips, mouth, teeth, brows) are not
 * morph targets: they are small meshes rebuilt from a handful of parameters
 * and laid onto the skin through a height table, so they always sit on the
 * face whatever the jaw and cheeks are doing.
 * ------------------------------------------------------------------------- */

const FACE = {
  C: new THREE.Vector3(0, 0.066, 0.021),   // head centre, relative to the head joint
  eyeX: 0.0306, eyeY: 0.0015, eyeZ: 0.0646, eyeR: 0.0127, eyeTilt: 6 * DEG,
  noseY: -0.0425, mouthY: -0.0655, chinY: -0.1120, mouthW: 0.0222,
};

/* The sculpt, as a forward displacement over the front of the face. */
function faceDisp(x, y) {
  const F = FACE;
  const ax = Math.abs(x);
  let z = 0;

  // Nose: a ridge rising from the bridge to the tip, narrow and straight.
  const top = 0.007;
  const t = clamp((top - y) / (top - F.noseY), 0, 1);
  const h = 0.0032 + 0.0118 * t ** 1.7;
  const wdt = 0.0050 + 0.0030 * t;
  const below = y < F.noseY ? gauss(y - F.noseY, 0.0036) : 1;
  const above = y > top ? gauss(y - top, 0.007) : 1;
  z += h * gauss(x, wdt) * below * above;
  z += 0.0040 * g2(x, y - F.noseY - 0.0012, 0.0058, 0.0052);            // tip
  z += 0.0034 * g2(ax - 0.0098, y - F.noseY + 0.0002, 0.0040, 0.0038);  // alae
  z -= 0.0010 * g2(ax - 0.0064, y - F.noseY + 0.0042, 0.0022, 0.0018); // nostril shadow

  // Eyes sit in shallow sockets under a soft brow.
  z -= 0.0082 * g2(ax - F.eyeX, y - F.eyeY, 0.0165, 0.0112);
  z -= 0.0028 * g2(ax - 0.0165, y - F.eyeY + 0.001, 0.0048, 0.0058);
  z += 0.0030 * g2(ax - 0.030, y - 0.0215, 0.022, 0.0072);

  // High cheekbones, full cheek apples.
  z += 0.0052 * g2(ax - 0.0415, y + 0.0235, 0.0150, 0.0118);
  z += 0.0026 * g2(ax - 0.0300, y + 0.0360, 0.0120, 0.0110);

  // Muzzle, philtrum, the hollow under the lower lip, chin.
  z += 0.0040 * g2(x, y - F.mouthY, 0.0225, 0.0150);
  z -= 0.0018 * g2(ax - 0.050, y + 0.064, 0.010, 0.013);                // under the cheekbone
  z -= 0.0008 * g2(x, y - (F.noseY - 0.0155), 0.0021, 0.0050);
  z -= 0.0020 * g2(x, y - (F.mouthY - 0.0165), 0.0120, 0.0042);
  z += 0.0050 * g2(x, y - (F.chinY + 0.0170), 0.0125, 0.0110);
  return z;
}

/* The skull, as horizontal superellipse sections: half-width and the depth
 * of the front and back of the head at the midline. The face between chin
 * and brow comes from a table sampled every centimetre; the cranium above
 * and the chin below are elliptical caps so neither ends in a point. Tuned
 * against front and side views, not measured. */
const HEAD_Y0 = -0.12, HEAD_DY = 0.01;
// Width above the brow; below it the jaw curve in headProfile takes over.
const HEAD_RX = [0.0170, 0.0310, 0.0408, 0.0484, 0.0530, 0.0562, 0.0596, 0.0626, 0.0650, 0.0672, 0.0690, 0.0704, 0.0713, 0.0719, 0.0721, 0.0721];
const HEAD_ZF = [0.0640, 0.0706, 0.0755, 0.0784, 0.0806, 0.0824, 0.0842, 0.0856, 0.0865, 0.0871, 0.0876, 0.0880, 0.0882, 0.0880, 0.0870, 0.0855];
const HEAD_ZB = [0.0120, -0.0040, -0.0220, -0.0400, -0.0560, -0.0700, -0.0810, -0.0900, -0.0970, -0.1015, -0.1045, -0.1060, -0.1065, -0.1060, -0.1045, -0.1015];

const CROWN_Y = 0.0, CROWN_H = 0.119;     // cranium cap: from the brow to y = 0.119
const JAW_Y = 0.015, JAW_H = 0.127;       // cheekbone to chin: a soft V, chin at y = -0.112
const _prof = { rx: 0, zf: 0, zb: 0 };

/* Table plus the jaw curve, without the cranium cap. */
function baseProfile(y, P) {
  const u = (Math.min(y, HEAD_Y0 + HEAD_DY * (HEAD_RX.length - 1)) - HEAD_Y0) / HEAD_DY;
  P.rx = crScalar(HEAD_RX, Math.max(0, u));
  P.zf = crScalar(HEAD_ZF, Math.max(0, u));
  P.zb = crScalar(HEAD_ZB, Math.max(0, u));
  if (y < JAW_Y) {
    // From the widest point down, the outline is one superellipse quadrant
    // ending at the chin; a little fullness is added back at the cheeks.
    const q = clamp((JAW_Y - y) / JAW_H, 0, 1);
    P.rx = 0.0721 * Math.max(0, 1 - q ** 2.5) ** (1 / 2.5)
      + 0.0016 * gauss(y + 0.035, 0.016) - 0.0030 * gauss(y + 0.088, 0.014);
    // The front of the chin rolls under towards the throat.
    const yc = -0.095;
    if (y < yc) {
      const zfj = crScalar(HEAD_ZF, (yc - HEAD_Y0) / HEAD_DY);
      const e = Math.sqrt(Math.max(0, 1 - ((yc - y) / (yc - (JAW_Y - JAW_H))) ** 2));
      P.zf = 0.036 + (zfj - 0.036) * e ** 0.5;
    }
  }
  return P;
}

const _capBase = { rx: 0, zf: 0, zb: 0 };

function headProfile(y) {
  const P = baseProfile(y, _prof);
  if (y > CROWN_Y) {
    // The cranium cap starts at the brow and is blended in over 3.5 cm so
    // its slope matches the face below; a hard switch shows as a ring.
    const c = baseProfile(CROWN_Y, _capBase);
    const e = Math.sqrt(Math.max(0, 1 - ((y - CROWN_Y) / CROWN_H) ** 2));
    const zm = -0.012;
    const w = smooth(CROWN_Y, CROWN_Y + 0.035, y);
    P.rx = lerp(P.rx, c.rx * e ** 0.85, w);
    P.zf = lerp(P.zf, zm + (c.zf - zm) * e ** 0.9, w);
    P.zb = lerp(P.zb, zm + (c.zb - zm) * e, w);
  }
  return P;
}

/* The profile, its blend exponents and the widest-point depth, tabulated
 * every 0.2 mm so the ray casts below are lookups rather than splines. */
const HLUT = (() => {
  const y0 = JAW_Y - JAW_H, y1 = CROWN_Y + CROWN_H, step = 0.0002;
  const n = Math.ceil((y1 - y0) / step) + 1;
  const t = { y0, y1, step, n, rx: new Float32Array(n), zf: new Float32Array(n), zb: new Float32Array(n),
    zm: new Float32Array(n), nf: new Float32Array(n), nb: new Float32Array(n) };
  for (let i = 0; i < n; i++) {
    const y = y0 + i * step;
    const P = headProfile(y);
    t.rx[i] = P.rx; t.zf[i] = P.zf; t.zb[i] = P.zb;
    t.zm[i] = -0.010 - 0.008 * smooth(-0.05, -0.095, y);
    t.nf[i] = lerp(2.0, 2.6, smooth(0.035, 0.0, y));
    t.nb[i] = 2.0 + 0.6 * smooth(-0.06, -0.095, y);
  }
  return t;
})();

function headInside(x, y, z) {
  const L = HLUT;
  if (y <= L.y0 || y >= L.y1) return 2;
  const f = (y - L.y0) / L.step;
  const i = Math.min(L.n - 2, f | 0), u = f - i;
  const rx = L.rx[i] + (L.rx[i + 1] - L.rx[i]) * u;
  if (rx <= 1e-5) return 2;
  const zm = L.zm[i];
  if (z >= zm) {
    const zf = L.zf[i] + (L.zf[i + 1] - L.zf[i]) * u;
    const n = L.nf[i];
    const rz = Math.max(1e-4, zf - zm);
    return Math.abs(x / rx) ** n + ((z - zm) / rz) ** n;
  }
  const zb = L.zb[i] + (L.zb[i + 1] - L.zb[i]) * u;
  const n = L.nb[i];
  const rz = Math.max(1e-4, zm - zb);
  return Math.abs(x / rx) ** n + ((zm - z) / rz) ** n;
}

const smin = (a, b, k) => {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return lerp(b, a, h) - k * h * (1 - h);
};

/* The eye pit. Inside the opening (sized for the widest the lids ever
 * open) the skin must lie behind the eyeball or it shows through; over the
 * lids it must lie just behind the lid shells so they read as lids; and at
 * the crease it rises steeply in front of them. */
const LID_SX = 1.17, LID_R = 1.075;
const LID_OPEN_MAX = { up: 0.64, low: 0.62 };

function eyePitLimit(ex, ey) {
  const F = FACE;
  const R = F.eyeR, Rl = R * LID_R;
  const half = Math.sqrt(Math.max(0, Rl * Rl - (ex / LID_SX) ** 2));
  const yUp = Math.sin(LID_OPEN_MAX.up) * half;
  const yLo = -Math.sin(LID_OPEN_MAX.low) * half;
  // Beyond the ball's own edge the "opening" is just skin at lid depth;
  // otherwise the corners become deep slits.
  const inOpen = smooth(yUp + 0.0012, yUp - 0.0003, ey) * smooth(yLo - 0.0012, yLo + 0.0003, ey)
    * smooth(R * 1.02, R * 0.86, Math.abs(ex));
  const rb = R - 0.0005;
  const ball = F.eyeZ + Math.sqrt(Math.max(0, rb * rb - ex * ex - ey * ey));
  // Lid surface, then the crease: the skin climbs away in front of the lid.
  const rn = Math.hypot(ex / LID_SX, ey) / Rl;
  const crease = ey >= 0 ? 0.88 : 0.80;
  const rc = Math.min(rn, crease) * Rl;
  const lid = F.eyeZ + Math.sqrt(Math.max(0, Rl * Rl - rc * rc)) - 0.0004
    + Math.max(0, rn - crease) ** 1.5 * Rl * 4.0;
  return { z: lerp(lid, ball, inOpen), reach: 1 - smooth(1.15, 1.5, rn) };
}

function eyePit(x, y, z) {
  const F = FACE;
  const c = Math.cos(F.eyeTilt), sn = Math.sin(F.eyeTilt);
  for (const side of [1, -1]) {
    const dx = (x - F.eyeX * side) * side, dy = y - F.eyeY;
    const ex = dx * c + dy * sn, ey = -dx * sn + dy * c;
    if (Math.abs(ex) > 0.03 || Math.abs(ey) > 0.03) continue;
    const pit = eyePitLimit(ex, ey);
    if (pit.reach > 0) z = lerp(z, smin(z, pit.z, 0.0022), pit.reach);
  }
  return z;
}

/* Where a ray from the head centre leaves the skull, plus the face sculpt. */
function headPoint(dx, dy, dz, out) {
  let lo = 0.02, hi = 0.16;
  for (let i = 0; i < 17; i++) {
    const t = (lo + hi) / 2;
    if (headInside(dx * t, dy * t, dz * t) < 1) lo = t; else hi = t;
  }
  const r = (lo + hi) / 2;
  out.set(dx * r, dy * r, dz * r);
  const w = smooth(0.12, 0.55, dz);
  if (w > 0) {
    out.z += w * faceDisp(out.x, out.y);
    out.z = eyePit(out.x, out.y, out.z);
  }
  return out;
}

/* Height table: skin depth z at (x, y) over the front of the face, found by
 * walking the sphere direction until the sculpted point lands on (x, y). */
const SURF = { x0: -0.066, y0: -0.136, step: 0.001, nx: 0, ny: 0, z: null };

function buildSurfaceTable() {
  const S = SURF;
  S.nx = Math.round((-2 * S.x0) / S.step) + 1;
  S.ny = Math.round((0.078 - S.y0) / S.step) + 1;
  S.z = new Float32Array(S.nx * S.ny);
  const p = new THREE.Vector3(), d = new THREE.Vector3();
  for (let j = 0; j < S.ny; j++) {
    const y = S.y0 + j * S.step;
    for (let i = 0; i < S.nx; i++) {
      const x = S.x0 + i * S.step;
      d.set(x, y, 0.085).normalize();
      for (let k = 0; k < 4; k++) {
        headPoint(d.x, d.y, d.z, p);
        d.set(x, y, p.z).normalize();
      }
      headPoint(d.x, d.y, d.z, p);
      S.z[j * S.nx + i] = p.z;
    }
  }
}

function surfaceZ(x, y) {
  const S = SURF;
  const fx = clamp((x - S.x0) / S.step, 0, S.nx - 1.001);
  const fy = clamp((y - S.y0) / S.step, 0, S.ny - 1.001);
  const i = Math.floor(fx), j = Math.floor(fy);
  const u = fx - i, v = fy - j;
  const a = S.z[j * S.nx + i], b = S.z[j * S.nx + i + 1];
  const c = S.z[(j + 1) * S.nx + i], d = S.z[(j + 1) * S.nx + i + 1];
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

/* Morph fields, as displacements of a rest point. Shared by the skin's morph
 * targets and the per-frame lips so the two never come apart. */
function morphJaw(x, y, z, out) {
  const F = FACE;
  const w = smooth(F.mouthY - 0.0008, F.mouthY - 0.0135, y) * smooth(-0.05, 0.025, z);
  const reach = w * (0.42 + 0.58 * smooth(-0.02, 0.07, z));
  return out.set(-x * 0.035 * reach, -0.0105 * reach, -0.0036 * reach);
}

function morphSmile(x, y, z, out) {
  const F = FACE;
  const ax = Math.abs(x), sx = Math.sign(x);
  const c = g2(ax - F.mouthW, y - F.mouthY, 0.0105, 0.0095);
  const ch = g2(ax - 0.035, y + 0.035, 0.0155, 0.0125);
  const fr = smooth(-0.01, 0.04, z);
  return out.set(sx * 0.0018 * c * fr, (0.0050 * c + 0.0030 * ch) * fr, (-0.0012 * c + 0.0030 * ch) * fr);
}

function morphNarrow(x, y, z, out) {
  const F = FACE;
  const ax = Math.abs(x), sx = Math.sign(x);
  const c = g2(ax - F.mouthW * 0.8, y - F.mouthY, 0.0125, 0.010) * smooth(0.0, 0.04, z);
  const m = g2(x, y - F.mouthY, 0.02, 0.012) * smooth(0.0, 0.04, z);
  return out.set(-sx * 0.0042 * c, 0, 0.0016 * c + 0.0012 * m);
}

function morphWide(x, y, z, out) {
  const F = FACE;
  const ax = Math.abs(x), sx = Math.sign(x);
  const c = g2(ax - F.mouthW, y - F.mouthY, 0.011, 0.009) * smooth(0.0, 0.04, z);
  return out.set(sx * 0.0030 * c, 0.0006 * c, -0.0010 * c);
}

const MORPHS = [morphJaw, morphSmile, morphNarrow, morphWide];
const M_JAW = 0, M_SMILE = 1, M_NARROW = 2, M_WIDE = 3;

/* ---------------------------------------------------------------------- */

function skinColourAt(x, y, front) {
  const F = FACE;
  const ax = Math.abs(x);
  const c = srgb(...PALETTE.skin);
  const blush = srgb(...PALETTE.blush);
  const shadow = srgb(...PALETTE.shadow);
  c.lerp(blush, 0.22 * g2(ax - 0.039, y + 0.027, 0.0165, 0.0135) * front);
  c.lerp(blush, 0.07 * g2(x, y - F.noseY, 0.008, 0.006) * front);
  c.lerp(blush, 0.10 * g2(x, y - (F.chinY + 0.02), 0.012, 0.010) * front);
  c.lerp(shadow, 0.28 * g2(ax - F.eyeX - 0.003, y - F.eyeY - 0.0105, 0.0150, 0.0062) * front);
  // The inner corner of the socket shows between the lids: make it the
  // pink of the caruncle rather than a hole.
  c.lerp(srgb(220, 140, 140), 0.55 * g2(ax - 0.0182, y - F.eyeY, 0.0030, 0.0030) * front);
  return c;
}

function buildHeadMesh(mat) {
  const mb = new MeshBuilder();
  // Cubic warps crowd the vertices onto the face — the eye sockets need
  // about a millimetre of resolution — and thin them out over the scalp.
  const warpLon = (a) => a * (0.3 + 0.7 * a * a);
  const warpLat = (b) => b * (0.45 + 0.55 * b * b);
  const d = new THREE.Vector3();
  mb.grid({
    rows: 220, cols: 300, part: 'head',
    point: (s, th, out) => {
      const lat = (Math.PI / 2 - 0.02) * warpLat(2 * s - 1);
      const lon = Math.PI * warpLon(th / Math.PI - 1);
      d.set(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
      return headPoint(d.x, d.y, d.z, out);
    },
  });
  const geo = mb.build({
    colour: (m, p) => skinColourAt(p.x, p.y, smooth(0.0, 0.05, p.z)),
  });

  // Morph targets from the same fields the lips use.
  const pos = geo.attributes.position;
  const v = new THREE.Vector3(), o = new THREE.Vector3();
  geo.morphAttributes.position = MORPHS.map((fn) => {
    const arr = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      fn(v.x, v.y, v.z, o);
      arr[i * 3] = o.x; arr[i * 3 + 1] = o.y; arr[i * 3 + 2] = o.z;
    }
    return new THREE.Float32BufferAttribute(arr, 3);
  });
  geo.morphTargetsRelative = true;

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'head';
  mesh.morphTargetInfluences = MORPHS.map(() => 0);
  return mesh;
}

/* ---------------------------------------------------------------------- */

function buildEye(side, mats) {
  const F = FACE;
  const R = F.eyeR;
  const grp = new THREE.Group();
  grp.position.set(F.eyeX * side, F.eyeY, F.eyeZ);
  grp.rotation.z = F.eyeTilt * side;
  if (side < 0) grp.scale.x = -1;

  const ballGeo = new THREE.SphereGeometry(R, 48, 32);
  ballGeo.rotateX(Math.PI / 2);   // texture pole -> forwards
  const ball = new THREE.Mesh(ballGeo, mats.eye);
  grp.add(ball);

  // Lids: hemispherical shells a touch larger than the eye, stretched wide
  // for an almond opening. Rotating them about X opens and closes the eye.
  const lidGeo = (upper) => {
    const g = new THREE.SphereGeometry(
      R * LID_R, 64, 20, -0.45, Math.PI + 0.9,
      upper ? 0 : Math.PI / 2, Math.PI / 2
    );
    g.scale(LID_SX, 1, 1);
    return g;
  };
  const upper = new THREE.Mesh(lidGeo(true), mats.lid);
  const lower = new THREE.Mesh(lidGeo(false), mats.lid);
  upper.rotation.x = -0.40;
  lower.rotation.x = 0.50;
  grp.add(upper, lower);

  // Upper lashes ride the upper lid.
  const lashes = new THREE.Mesh(lashGeometry(R * LID_R, LID_SX, true), mats.lash);
  upper.add(lashes);
  const lowLash = new THREE.Mesh(lashGeometry(R * LID_R * 0.995, LID_SX, false), mats.lowLash);
  lower.add(lowLash);

  return { grp, ball, upper, lower, side };
}

/* A ribbon along the lid margin. In lid space the margin is the horizontal
 * great circle; u runs inner -> outer corner, v from the lid outwards. */
function lashGeometry(R, sx, upper) {
  const NU = 40;
  const pos = [], uv = [], idx = [];
  const rows = 3;
  for (let i = 0; i <= NU; i++) {
    const u = i / NU;
    const phi = lerp(0.12, Math.PI + 0.16, u);
    const base = new THREE.Vector3(-Math.cos(phi) * R * sx, 0, Math.sin(phi) * R);
    const out = new THREE.Vector3(-Math.cos(phi) * sx, 0, Math.sin(phi)).normalize();
    const len = upper ? 0.0030 + 0.0038 * u ** 1.4 : 0.0016 + 0.0010 * u;
    const lift = upper ? 1 : -1;
    for (let r = 0; r <= rows; r++) {
      const v = r / rows;
      // Out first, then curling up: the classic lifted lash.
      const p = base.clone()
        .addScaledVector(out, len * (0.15 + 0.85 * Math.sin(v * Math.PI * 0.5)) * 0.85)
        .add(new THREE.Vector3(0, lift * len * (0.25 * v + 0.75 * v * v) * (upper ? 1.05 : 0.6), 0));
      // A small wing past the outer corner.
      if (upper && u > 0.8) p.x += sx * 0.0025 * ((u - 0.8) / 0.2) ** 2 * v;
      pos.push(p.x, p.y, p.z);
      uv.push(u, 1 - v);
    }
  }
  for (let i = 0; i < NU; i++) {
    for (let r = 0; r < rows; r++) {
      const a = i * (rows + 1) + r;
      const b = a + rows + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ---------------------------------------------------------------------- */

/* A dynamic mesh with a fixed topology whose positions are rewritten each
 * frame. */
function dynamicMesh(nVerts, index, mat, { colours = false } = {}) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nVerts * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nVerts * 2), 2));
  if (colours) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nVerts * 3), 3));
  g.setIndex(index);
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  return m;
}

/* Quads over an (nu+1) x (nv+1) vertex grid. Faces point along u x v;
 * `flip` reverses them for grids that run the other way. */
function gridIndex(nu, nv, flip = false) {
  const idx = [];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j;
      const b = a + nv + 1;
      if (flip) idx.push(a, a + 1, b, b, a + 1, b + 1);
      else idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return idx;
}

const LIP_NX = 36, LIP_NJ = 8;
const BROW_N = 22;

function buildHead(rig, M) {
  buildSurfaceTable();

  const face = new THREE.Group();
  face.name = 'face';
  face.position.copy(FACE.C);
  rig.byName.head.add(face);

  const skin = buildHeadMesh(M.skin);
  face.add(skin);

  const eyes = [buildEye(1, M), buildEye(-1, M)];
  for (const e of eyes) face.add(e.grp);

  // Lips, mouth interior, teeth.
  // The upper lip's rows climb away from the mouth line and the lower lip's
  // descend, so the lower lip (and the downward-built mouth strips) flip.
  const nLip = (LIP_NX + 1) * (LIP_NJ + 1);
  const upperLip = dynamicMesh(nLip, gridIndex(LIP_NX, LIP_NJ), M.lips, { colours: true });
  const lowerLip = dynamicMesh(nLip, gridIndex(LIP_NX, LIP_NJ, true), M.lips, { colours: true });
  const mouth = dynamicMesh((LIP_NX + 1) * 3, gridIndex(LIP_NX, 2, true), M.mouth, { colours: true });
  const teethU = dynamicMesh((LIP_NX + 1) * 2, gridIndex(LIP_NX, 1, true), M.teeth, { colours: true });
  const teethL = dynamicMesh((LIP_NX + 1) * 2, gridIndex(LIP_NX, 1), M.teeth, { colours: true });
  mouth.renderOrder = 1; teethU.renderOrder = 2; teethL.renderOrder = 2;
  face.add(mouth, teethU, teethL, upperLip, lowerLip);

  const brows = [1, -1].map(() => {
    const m = dynamicMesh((BROW_N + 1) * 2, gridIndex(BROW_N, 1), M.brow);
    m.renderOrder = 3;
    face.add(m);
    return m;
  });

  const head = { face, skin, eyes, upperLip, lowerLip, mouth, teethU, teethL, brows };
  updateMouth(head, { jaw: 0, smile: 0, narrow: 0, wide: 0 });
  updateBrows(head, {});
  return head;
}

/* ---------------------------------------------------------------------- */

const _mv = new THREE.Vector3();
const _mo = new THREE.Vector3();

function applyMorphs(x, y, z, inf, jawW, out) {
  out.set(x, y, z);
  // The lower lip rides the jaw outright (jawW tapers it to the corners);
  // the skin's own jaw field fades in below the mouth line instead.
  if (inf.jaw && jawW) {
    const reach = 0.42 + 0.58 * smooth(-0.02, 0.07, z);
    out.x -= x * 0.035 * reach * inf.jaw * jawW;
    out.y -= 0.0105 * reach * inf.jaw * jawW;
    out.z -= 0.0036 * reach * inf.jaw * jawW;
  }
  if (inf.smile) { morphSmile(x, y, z, _mo); out.addScaledVector(_mo, inf.smile); }
  if (inf.narrow) { morphNarrow(x, y, z, _mo); out.addScaledVector(_mo, inf.narrow); }
  if (inf.wide) { morphWide(x, y, z, _mo); out.addScaledVector(_mo, inf.wide); }
  return out;
}

/* st: { jaw, smile, narrow, wide, smirk } — all roughly 0..1 */
function updateMouth(head, st) {
  const F = FACE;
  const w = F.mouthW * (1 + 0.07 * (st.smile || 0));
  const cornerUp = 0.0012 * (st.smirk || 0);
  const lipsSkin = srgb(...PALETTE.skin);
  const lipCol = srgb(...PALETTE.lips);
  const lipIn = srgb(...PALETTE.lipsInner);
  const pucker = st.narrow || 0;

  // A smile lifts and widens the corners of the mouth line itself.
  const smile = st.smile || 0;
  const yu = (x) => F.mouthY + cornerUp * (x / w) * Math.abs(x / w) + 0.0032 * smile * (x / w) ** 2;
  const hu = (x) => {
    const q = Math.max(0, 1 - (x / w) ** 2);
    const bow = 1 - 0.14 * gauss(x, 0.0028) + 0.05 * gauss(Math.abs(x) - 0.0058, 0.0028);
    return 0.0071 * q ** 0.52 * bow;
  };
  const hl = (x) => 0.0095 * Math.max(0, 1 - (x / w) ** 2) ** 0.5;
  const bulge = (j) => Math.sin(Math.PI * clamp(j, 0, 1)) ** 0.55;
  const fwd = 1 + 0.55 * pucker;

  const inf = { jaw: st.jaw, smile: st.smile, narrow: st.narrow, wide: st.wide };
  const pos = (m) => m.geometry.attributes.position.array;
  const col = (m) => m.geometry.attributes.color.array;
  const uvs = (m) => m.geometry.attributes.uv.array;

  const UP = pos(head.upperLip), LO = pos(head.lowerLip);
  const UPc = col(head.upperLip), LOc = col(head.lowerLip);
  const UPu = uvs(head.upperLip), LOu = uvs(head.lowerLip);
  const innerU = [], innerL = [];
  const c = new THREE.Color();

  for (let i = 0; i <= LIP_NX; i++) {
    const x = -w * Math.cos((Math.PI * i) / LIP_NX);
    const taper = Math.max(0, 1 - (x / w) ** 2);
    // The lower lip rides the jaw, but its corners stay nearly closed.
    const jawW = 0.12 + 0.88 * taper ** 0.55;
    for (let j = 0; j <= LIP_NJ; j++) {
      const v = j / LIP_NJ;
      const k = (i * (LIP_NJ + 1) + j);

      // Upper lip
      let y = yu(x) + hu(x) * v;
      let z = surfaceZ(x, y) + 0.0050 * fwd * taper ** 0.45 * bulge(v) - 0.0003 * (1 - v);
      applyMorphs(x, y, z, inf, 0.0, _mv);
      UP[k * 3] = _mv.x; UP[k * 3 + 1] = _mv.y; UP[k * 3 + 2] = _mv.z;
      if (j === 0) innerU.push(_mv.clone());
      c.copy(lipCol).lerp(lipIn, 0.45 * (1 - v) ** 3).lerp(lipsSkin, 0.30 * v ** 6);
      UPc[k * 3] = c.r; UPc[k * 3 + 1] = c.g; UPc[k * 3 + 2] = c.b;
      UPu[k * 2] = i / LIP_NX; UPu[k * 2 + 1] = v;

      // Lower lip
      y = yu(x) - hl(x) * v;
      z = surfaceZ(x, y) + 0.0062 * fwd * taper ** 0.45 * bulge(v) - 0.0003 * (1 - v);
      applyMorphs(x, y, z, inf, jawW, _mv);
      LO[k * 3] = _mv.x; LO[k * 3 + 1] = _mv.y; LO[k * 3 + 2] = _mv.z;
      if (j === 0) innerL.push(_mv.clone());
      c.copy(lipCol).lerp(lipIn, 0.45 * (1 - v) ** 3).lerp(lipsSkin, 0.30 * v ** 6);
      LOc[k * 3] = c.r; LOc[k * 3 + 1] = c.g; LOc[k * 3 + 2] = c.b;
      LOu[k * 2] = i / LIP_NX; LOu[k * 2 + 1] = v;
    }
  }

  // Mouth interior: a dark membrane between the inner lip edges, bowed back.
  const MP = pos(head.mouth), MC = col(head.mouth);
  const TU = pos(head.teethU), TUc = col(head.teethU);
  const TL = pos(head.teethL), TLc = col(head.teethL);
  const dark = new THREE.Color(0.10, 0.025, 0.03);
  const tongue = new THREE.Color(0.34, 0.09, 0.10);
  const tooth = new THREE.Color(0.86, 0.84, 0.80);
  const toothShade = new THREE.Color(0.42, 0.36, 0.34);
  for (let i = 0; i <= LIP_NX; i++) {
    const a = innerU[i], b = innerL[i];
    const gap = Math.max(0, a.y - b.y);
    const x = a.x;
    const taper = Math.max(0, 1 - (x / w) ** 2);
    for (let r = 0; r < 3; r++) {
      const t = r / 2;
      const k = i * 3 + r;
      MP[k * 3] = lerp(a.x, b.x, t);
      MP[k * 3 + 1] = lerp(a.y + 0.0003, b.y - 0.0003, t);
      MP[k * 3 + 2] = lerp(a.z, b.z, t) + 0.0004 - 0.0006 * Math.sin(Math.PI * t);
      c.copy(dark).lerp(tongue, t > 0.9 ? smooth(0.004, 0.010, gap) * 0.8 : 0);
      MC[k * 3] = c.r; MC[k * 3 + 1] = c.g; MC[k * 3 + 2] = c.b;
    }
    // Upper teeth hang from the upper lip, lower teeth peek over the lower.
    const th = Math.min(gap * 0.5, 0.0036) * smooth(0.0, 0.7, taper);
    const tl = Math.min(gap * 0.18, 0.0018) * smooth(0.2, 0.8, taper);
    const shade = 1 - smooth(0.35, 0.95, Math.abs(x) / w);
    for (let r = 0; r < 2; r++) {
      const k = i * 2 + r;
      TU[k * 3] = a.x; TU[k * 3 + 1] = a.y + 0.0004 - th * r; TU[k * 3 + 2] = a.z + 0.0007;
      TL[k * 3] = b.x; TL[k * 3 + 1] = b.y - 0.0004 + tl * r; TL[k * 3 + 2] = b.z + 0.0007;
      c.copy(toothShade).lerp(tooth, shade);
      TUc[k * 3] = c.r; TUc[k * 3 + 1] = c.g; TUc[k * 3 + 2] = c.b;
      TLc[k * 3] = c.r * 0.85; TLc[k * 3 + 1] = c.g * 0.85; TLc[k * 3 + 2] = c.b * 0.85;
    }
  }

  for (const m of [head.upperLip, head.lowerLip, head.mouth, head.teethU, head.teethL]) {
    m.geometry.attributes.position.needsUpdate = true;
    if (m.geometry.attributes.color) m.geometry.attributes.color.needsUpdate = true;
    if (m.geometry.attributes.uv) m.geometry.attributes.uv.needsUpdate = true;
  }
  head.upperLip.geometry.computeVertexNormals();
  head.lowerLip.geometry.computeVertexNormals();
  head.mouth.geometry.computeVertexNormals();
  head.teethU.geometry.computeVertexNormals();
  head.teethL.geometry.computeVertexNormals();

  const infl = head.skin.morphTargetInfluences;
  infl[M_JAW] = st.jaw; infl[M_SMILE] = st.smile; infl[M_NARROW] = st.narrow; infl[M_WIDE] = st.wide;
}

/* Brows: an arched, tapering strip laid on the forehead.
 * st: { up: [L, R], inner: [L, R], furrow } */
const BROW_PATH = [
  new THREE.Vector2(0.0104, 0.0152),
  new THREE.Vector2(0.0235, 0.0202),
  new THREE.Vector2(0.0392, 0.0228),
  new THREE.Vector2(0.0548, 0.0172),
];
const BROW_W = [0.0056, 0.0052, 0.0042, 0.0015];

function updateBrows(head, st) {
  const up = st.up || [0, 0];
  const inner = st.inner || [0, 0];
  const furrow = st.furrow || 0;
  const xs = BROW_PATH.map((p) => p.x), ys = BROW_PATH.map((p) => p.y);
  [1, -1].forEach((side, b) => {
    const m = head.brows[b];
    const P = m.geometry.attributes.position.array;
    const U = m.geometry.attributes.uv.array;
    for (let i = 0; i <= BROW_N; i++) {
      const t = i / BROW_N;
      const u = t * (BROW_PATH.length - 1);
      const x0 = crScalar(xs, u), y0 = crScalar(ys, u);
      const innerK = 1 - smooth(0.0, 0.75, t);
      const y = y0 + 0.0040 * up[b] + 0.0042 * inner[b] * innerK - 0.0022 * furrow * innerK;
      const x = x0 - 0.0016 * furrow * innerK;
      // The strip's width runs along the curve's normal.
      const ua = Math.min(BROW_PATH.length - 1, u + 0.02);
      let nx = -(crScalar(ys, ua) - y0), ny = crScalar(xs, ua) - x0;
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      const wd = crScalar(BROW_W, u) * (1 + 0.12 * furrow * innerK);
      for (let r = 0; r < 2; r++) {
        const s = r ? 0.5 : -0.5;
        const px = (x + nx * wd * s) * side;
        const py = y + ny * wd * s;
        const k = i * 2 + r;
        P[k * 3] = px; P[k * 3 + 1] = py; P[k * 3 + 2] = surfaceZ(px, py) + 0.00055;
        U[k * 2] = t; U[k * 2 + 1] = r;
      }
    }
    m.geometry.attributes.position.needsUpdate = true;
    m.geometry.attributes.uv.needsUpdate = true;
    m.geometry.computeVertexNormals();
  });
}
