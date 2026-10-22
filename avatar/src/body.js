/* ---------------------------------------------------------------------------
 * body.js — everything below the head: skin, a tailored blazer over a knit
 * top, suit trousers, shoes, and a gold lapel pin.
 *
 * The torso is one lofted section table; the skin, the top and the blazer
 * are all sampled from it at increasing offsets, with the same skin weights,
 * so the layers deform together and never poke through one another.
 * ------------------------------------------------------------------------- */

/* y, centre z, half-width, front depth, back depth, squareness */
const TORSO = [
  [0.84, -0.005, 0.163, 0.082, 0.090, 2.2],
  [0.90, -0.005, 0.168, 0.081, 0.093, 2.3],
  [0.97, -0.006, 0.157, 0.077, 0.083, 2.3],
  [1.04, -0.004, 0.136, 0.072, 0.071, 2.2],
  [1.10, -0.002, 0.121, 0.069, 0.065, 2.2],
  [1.16, 0.000, 0.125, 0.073, 0.067, 2.2],
  [1.22, 0.002, 0.133, 0.084, 0.073, 2.2],
  [1.27, 0.002, 0.140, 0.090, 0.079, 2.2],
  [1.32, -0.002, 0.147, 0.083, 0.083, 2.3],
  [1.36, -0.008, 0.153, 0.071, 0.081, 2.6],
  [1.39, -0.014, 0.152, 0.060, 0.071, 3.0],
  [1.415, -0.020, 0.116, 0.050, 0.058, 2.6],
  [1.435, -0.024, 0.066, 0.047, 0.050, 2.2],
  [1.46, -0.024, 0.0535, 0.049, 0.050, 2.0],
  [1.50, -0.020, 0.0505, 0.0475, 0.048, 2.0],
  [1.54, -0.016, 0.0475, 0.0450, 0.046, 2.0],
  [1.585, -0.012, 0.040, 0.034, 0.040, 2.0],
];
const TORSO_Y = TORSO.map((r) => r[0]);

/* offset: pushes every radius out (a garment layer). pad: shoulder pads. */
function torsoSampler(offset = 0, { pad = 0, bust = 0, clavicle = 0 } = {}) {
  const sec = TORSO.map(([y, cz, rx, rf, rb, n]) => ({
    p: new THREE.Vector3(0, y, cz),
    rx: rx + offset + pad * gauss(y - 1.382, 0.022),
    rf: rf + offset,
    rb: rb + offset,
    n,
  }));
  const last = TORSO.length - 1;
  const bulge = (bust || clavicle) ? (s, th) => {
    const y = crScalar(TORSO_Y, s * last);
    const front = Math.sin(th);
    if (front <= 0) return 0;
    // th = π/2 is the front; ±0.5 rad either side is where the bust sits.
    const d = Math.abs(th - Math.PI / 2);
    let k = bust * gauss(d - 0.55, 0.32) * gauss(y - 1.262, 0.045) * front;
    k += clavicle * gauss(y - 1.408, 0.006) * smooth(0.12, 0.35, d) * (1 - smooth(1.0, 1.3, d));
    return k;
  } : null;
  const smp = limbSampler(sec, { bulge });
  // Every torso layer shares one centre line, so height -> s is one table.
  smp.sAtY = torsoSAtY;
  return smp;
}

const TORSO_S = (() => {
  const n = 1024;
  const ys = new Float32Array(n + 1);
  const P = TORSO.map((r) => new THREE.Vector3(0, r[0], r[1]));
  const v = new THREE.Vector3();
  for (let i = 0; i <= n; i++) ys[i] = crVec(P, (i / n) * (P.length - 1), v).y;
  return { n, ys };
})();

function torsoSAtY(y) {
  const { n, ys } = TORSO_S;
  if (y <= ys[0]) return 0;
  if (y >= ys[n]) return 1;
  let lo = 0, hi = n;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ys[mid] < y) lo = mid; else hi = mid;
  }
  return (lo + (y - ys[lo]) / (ys[hi] - ys[lo])) / n;
}

/* Skin weights by rest position: hips -> spine -> chest -> neck -> head up
 * the body, with the shoulder girdle and the top of the arm taking over at
 * the sides of the upper chest. */
function torsoWeights(I, p) {
  const y = p.y, ax = Math.abs(p.x), S = p.x >= 0 ? 'L' : 'R';
  const wh = 1 - smooth(0.97, 1.10, y);
  const ws = smooth(0.97, 1.10, y) * (1 - smooth(1.15, 1.28, y));
  const wc = smooth(1.15, 1.28, y) * (1 - smooth(1.415, 1.46, y));
  const wn = smooth(1.415, 1.46, y) * (1 - smooth(1.50, 1.55, y));
  const wd = smooth(1.50, 1.55, y);
  const a = smooth(0.12, 0.165, ax) * smooth(1.27, 1.36, y);
  const c = smooth(0.05, 0.13, ax) * smooth(1.26, 1.35, y);
  const armW = wc * 0.55 * a;
  const shW = wc * 0.7 * c * (1 - 0.55 * a);
  return [
    [I.hips, wh], [I.spine, ws], [I.chest, wc - armW - shW],
    [I['shoulder' + S], shW], [I['upperArm' + S], armW],
    [I.neck, wn], [I.head, wd],
  ];
}

/* Arm sections from the shoulder joint to the wrist (left; k mirrors). */
function armSections(J, S, grow = 0) {
  const k = S === 'L' ? 1 : -1;
  const s0 = J['upperArm' + S].pos, e = J['forearm' + S].pos, w = J['hand' + S].pos;
  const at = (a, b, t) => a.clone().lerp(b, t);
  const g = grow;
  return [
    { p: s0.clone().add(new THREE.Vector3(-0.012 * k, 0.030, 0)), rx: 0.026 + g, rf: 0.030 + g, rb: 0.032 + g },
    { p: s0.clone().add(new THREE.Vector3(-0.002 * k, 0.004, 0.002)), rx: 0.0455 + g, rf: 0.045 + g, rb: 0.046 + g },
    { p: at(s0, e, 0.22), rx: 0.042 + g, rf: 0.041 + g, rb: 0.042 + g },
    { p: at(s0, e, 0.50), rx: 0.037 + g, rf: 0.036 + g, rb: 0.037 + g },
    { p: at(s0, e, 0.80), rx: 0.0325 + g, rf: 0.031 + g, rb: 0.033 + g },
    { p: e.clone(), rx: 0.0295 + g, rf: 0.0295 + g, rb: 0.033 + g },
    { p: at(e, w, 0.20), rx: 0.0330 + g, rf: 0.0335 + g, rb: 0.0315 + g },
    { p: at(e, w, 0.55), rx: 0.0280 + g, rf: 0.0265 + g, rb: 0.0255 + g },
    { p: at(e, w, 0.88), rx: 0.0215 + g, rf: 0.0245 + g, rb: 0.0225 + g },
    { p: w.clone().add(new THREE.Vector3(0, -0.004, 0.002)), rx: 0.0190 + g, rf: 0.0255 + g, rb: 0.0235 + g },
  ];
}
const ARM_ELBOW = 5 / 9, ARM_WRIST = 8.6 / 9;

function armWeights(I, S, s) {
  if (s < 0.1) {
    const t = smooth(0.0, 0.1, s);
    return [[I['shoulder' + S], (1 - t) * 0.6], [I.chest, (1 - t) * 0.4], [I['upperArm' + S], t]];
  }
  return chainWeights([[0, I['upperArm' + S]], [ARM_ELBOW, I['forearm' + S]], [ARM_WRIST, I['hand' + S]]],
    s, [0, 0.05, 0.03]);
}

function buildHands(mb, rig, I, S) {
  const J = rig.J;
  const k = S === 'L' ? 1 : -1;
  const w = J['hand' + S].pos;
  const W = (x, y, z) => new THREE.Vector3(w.x + x * k, w.y + y, w.z + z);

  // Palm: thin across X, wide front to back.
  const palm = limbSampler([
    { p: W(0, 0.004, 0.001), rx: 0.0185, rf: 0.025, rb: 0.023 },
    { p: W(0.0005, -0.022, 0.003), rx: 0.0165, rf: 0.033, rb: 0.030 },
    { p: W(0.001, -0.050, 0.002), rx: 0.0145, rf: 0.0375, rb: 0.0355 },
    { p: W(0.001, -0.076, 0.0), rx: 0.0135, rf: 0.0365, rb: 0.0355 },
    { p: W(0.001, -0.091, 0.0), rx: 0.0118, rf: 0.031, rb: 0.030 },
  ]);
  mb.grid({ rows: 18, cols: 28, point: palm.point, part: { kind: 'palm', S }, capEnd: true });

  // Fingers.
  for (const f of FINGERS) {
    const L = FINGER_LAYOUT[f];
    const a = J[`${f}1${S}`].pos, b = J[`${f}2${S}`].pos, c = J[`${f}3${S}`].pos;
    const tip = fingerTip(J, f, S);
    const r = L.r;
    const sec = (p, rr) => ({ p, rx: rr * 0.86, rf: rr, rb: rr });
    const smp = limbSampler([
      sec(a.clone().add(new THREE.Vector3(0, 0.014, 0)), r * 1.15),
      sec(a.clone(), r * 1.07),
      sec(a.clone().lerp(b, 0.5), r * 0.97),
      sec(b.clone(), r * 0.98),
      sec(b.clone().lerp(c, 0.5), r * 0.89),
      sec(c.clone(), r * 0.86),
      sec(c.clone().lerp(tip, 0.55), r * 0.82),
      sec(c.clone().lerp(tip, 0.86), r * 0.68),
      sec(tip.clone(), r * 0.22),
    ]);
    mb.grid({ rows: 30, cols: 12, point: smp.point, part: { kind: 'finger', f, S }, capEnd: true });
  }

  // Thumb: from the ball of the thumb inside the palm out to the tip.
  const t1 = J[`thumb1${S}`].pos, t2 = J[`thumb2${S}`].pos, t3 = J[`thumb3${S}`].pos;
  const tt = thumbTip(J, S);
  const tsec = (p, rr) => ({ p, rx: rr * 0.92, rf: rr, rb: rr });
  const thumb = limbSampler([
    tsec(t1.clone().add(new THREE.Vector3(0.006 * k, 0.006, -0.008)), 0.0150),
    tsec(t1.clone().lerp(t2, 0.35), 0.0138),
    tsec(t2.clone(), 0.0107),
    tsec(t2.clone().lerp(t3, 0.5), 0.0098),
    tsec(t3.clone(), 0.0094),
    tsec(t3.clone().lerp(tt, 0.55), 0.0088),
    tsec(t3.clone().lerp(tt, 0.86), 0.0072),
    tsec(tt.clone(), 0.0025),
  ], { front: new THREE.Vector3(k, 0, 0.3).normalize() });
  mb.grid({ rows: 26, cols: 12, point: thumb.point, part: { kind: 'thumb', S }, capEnd: true });
}

function handWeights(I, m) {
  const S = m.part.S;
  if (m.part.kind === 'palm') {
    return chainWeights([[0, I['forearm' + S]], [0.12, I['hand' + S]]], m.s, [0, 0.1]);
  }
  if (m.part.kind === 'finger') {
    const f = m.part.f;
    return chainWeights([[0, I['hand' + S]], [1 / 8, I[`${f}1${S}`]], [3 / 8, I[`${f}2${S}`]], [5 / 8, I[`${f}3${S}`]]],
      m.s, [0, 0.05, 0.05, 0.04]);
  }
  return chainWeights([[0, I['hand' + S]], [0.2, I[`thumb1${S}`]], [2 / 7, I[`thumb2${S}`]], [4 / 7, I[`thumb3${S}`]]],
    m.s, [0, 0.08, 0.05, 0.05]);
}

function bodySkinColour(m, p, n) {
  const c = srgb(...PALETTE.skin);
  const kind = m.part.kind;
  if (kind === 'finger' || kind === 'thumb') {
    // Nails: the back of the last phalanx, a soft nude polish.
    const k = m.part.S === 'L' ? 1 : -1;
    const dorsal = kind === 'thumb'
      ? new THREE.Vector3(0.75 * k, 0.1, 0.65).normalize()
      : new THREE.Vector3(k, 0, 0);
    const tipZone = kind === 'thumb' ? smooth(0.70, 0.76, m.s) : smooth(0.80, 0.85, m.s);
    const nail = tipZone * smooth(0.45, 0.65, n.dot(dorsal)) * (1 - smooth(0.97, 1.0, m.s));
    c.lerp(srgb(232, 170, 165), 0.15 * smooth(0.3, 0.6, m.s));
    c.lerp(srgb(236, 186, 180), nail * 0.9);
  }
  if (kind === 'arm') c.lerp(srgb(236, 172, 160), 0.18 * gauss(m.s - ARM_ELBOW, 0.03));
  if (kind === 'torso') {
    // A touch of warmth where the neck meets the chest.
    c.lerp(srgb(238, 182, 166), 0.10 * gauss(p.y - 1.40, 0.03));
  }
  return c;
}

/* ---------------------------------------------------------------------- */

function skinned(geo, mat, rig, name) {
  const m = new THREE.SkinnedMesh(geo, mat);
  m.name = name;
  m.bind(rig.skeleton, new THREE.Matrix4());
  m.frustumCulled = false;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function buildBody(rig, M) {
  const I = rig.index;
  const J = rig.J;
  const parts = {};

  /* -- skin: neck, upper chest, arms, hands ------------------------------ */
  {
    const mb = new MeshBuilder();
    const torso = torsoSampler(0, { bust: 0.010, clavicle: 0.0022 });
    const s0 = torso.sAtY(1.27), s1 = torso.sAtY(1.585);
    mb.grid({ rows: 70, cols: 72, s0, s1, point: torso.point, part: { kind: 'torso' } });
    for (const [S] of SIDES) {
      const arm = limbSampler(armSections(J, S));
      mb.grid({ rows: 60, cols: 32, point: arm.point, part: { kind: 'arm', S }, capStart: true });
      buildHands(mb, rig, I, S);
    }
    const geo = mb.build({
      weights: (m, p) => {
        const kind = m.part.kind;
        if (kind === 'torso') return torsoWeights(I, p);
        if (kind === 'arm') return armWeights(I, m.part.S, m.s);
        return handWeights(I, m);
      },
      colour: bodySkinColour,
    });
    parts.skin = skinned(geo, M.body, rig, 'bodySkin');
  }

  /* -- knit top: a fitted shell under the blazer ------------------------- */
  {
    const mb = new MeshBuilder();
    const top = torsoSampler(0.0045, { bust: 0.010 });
    const yTop = (th) => 1.372 + 0.030 * (1 - Math.max(0, Math.sin(th))) + 0.02 * Math.max(0, -Math.sin(th));
    mb.grid({
      rows: 70, cols: 72, part: { kind: 'top' },
      point: (s, th, out) => {
        const sb = top.sAtY(0.98), st = top.sAtY(yTop(th));
        return top.point(lerp(sb, st, s), th, out);
      },
    });
    const geo = mb.build({ weights: (m, p) => torsoWeights(I, p) });
    parts.top = skinned(geo, M.top, rig, 'top');
  }

  /* -- blazer ------------------------------------------------------------ */
  parts.blazer = buildBlazer(rig, M);

  /* -- trousers and shoes ------------------------------------------------ */
  {
    const mb = new MeshBuilder();
    const pelvis = torsoSampler(0.010);
    const sb = pelvis.sAtY(0.76), st = pelvis.sAtY(1.075);
    mb.grid({ rows: 24, cols: 72, s0: sb, s1: st, point: pelvis.point, part: { kind: 'pelvis' } });
    for (const [S, k] of SIDES) {
      const L = (x, y, z, r) => ({ p: new THREE.Vector3(x * k, y, z), rx: r, rf: r * 1.0, rb: r * 1.04 });
      const leg = limbSampler([
        L(0.087, 0.87, -0.004, 0.083),
        L(0.089, 0.78, 0.0, 0.087),
        L(0.091, 0.65, 0.004, 0.080),
        L(0.093, 0.50, 0.008, 0.075),
        L(0.095, 0.30, 0.008, 0.080),
        L(0.097, 0.11, 0.008, 0.089),
        L(0.098, 0.035, 0.008, 0.093),
      ]);
      mb.grid({ rows: 50, cols: 40, point: leg.point, part: { kind: 'leg', S } });
    }
    const geo = mb.build({
      weights: (m, p) => {
        if (m.part.kind === 'pelvis') return torsoWeights(I, p);
        const S = m.part.S;
        if (m.s < 0.12) {
          const t = smooth(0.0, 0.12, m.s);
          return [[I.hips, 1 - t], [I['upperLeg' + S], t]];
        }
        return chainWeights([[0, I['upperLeg' + S]], [0.5, I['lowerLeg' + S]]], m.s, [0, 0.07]);
      },
    });
    parts.trousers = skinned(geo, M.trousers, rig, 'trousers');

    const sb2 = new MeshBuilder();
    for (const [S, k] of SIDES) {
      const F = (x, y, z, rx, rf, rb) => ({ p: new THREE.Vector3(x * k, y, z), rx, rf, rb });
      const shoe = limbSampler([
        F(0.094, 0.050, -0.075, 0.010, 0.012, 0.012),
        F(0.094, 0.058, -0.060, 0.032, 0.036, 0.030),
        F(0.096, 0.050, 0.000, 0.038, 0.032, 0.030),
        F(0.099, 0.034, 0.080, 0.036, 0.022, 0.022),
        F(0.101, 0.022, 0.140, 0.020, 0.014, 0.014),
        F(0.102, 0.016, 0.165, 0.004, 0.004, 0.004),
      ], { front: new THREE.Vector3(0, 1, 0) });
      sb2.grid({ rows: 30, cols: 24, point: shoe.point, part: { kind: 'shoe', S }, capStart: true, capEnd: true });
    }
    const sgeo = sb2.build({
      weights: (m) => chainWeights([[0, I['foot' + m.part.S]], [0.75, I['toes' + m.part.S]]], m.s, [0, 0.06]),
    });
    parts.shoes = skinned(sgeo, M.shoe, rig, 'shoes');
  }

  return parts;
}

/* -------------------------------------------------------------------------
 * Blazer: a sheet that wraps from one front edge round the back to the
 * other, open in a V above the button; lapels folded back over the V,
 * a rolled collar round the back of the neck, structured shoulders and
 * full-length sleeves.
 * ---------------------------------------------------------------------- */
const BLAZER = { button: 1.07, hem: 0.875, off: 0.013, pad: 0.008 };

function blazerOpenHalf(y) {
  if (y <= BLAZER.button) return 0;
  const t = clamp((y - BLAZER.button) / (1.425 - BLAZER.button), 0, 1);
  return 0.004 + 0.082 * t ** 0.85;
}

/* Lapel width along the front edge; the notch sits at y ≈ 1.372. */
function lapelWidth(y) {
  const keys = [[1.07, 0.0], [1.13, 0.018], [1.23, 0.036], [1.31, 0.048], [1.355, 0.054],
    [1.362, 0.026], [1.40, 0.030], [1.43, 0.032]];
  if (y <= keys[0][0]) return 0;
  for (let i = 1; i < keys.length; i++) {
    if (y <= keys[i][0]) {
      const [y0, a] = keys[i - 1], [y1, b] = keys[i];
      return lerp(a, b, (y - y0) / (y1 - y0));
    }
  }
  return keys[keys.length - 1][1];
}

function buildBlazer(rig, M) {
  const I = rig.index;
  const J = rig.J;
  const B = BLAZER;
  const shell = torsoSampler(B.off, { pad: B.pad, bust: 0.004 });
  const nAt = (y) => {
    // section squareness at height y, for inverting the superellipse
    const u = clamp(shell.sAtY(y), 0, 1) * (TORSO.length - 1);
    return crScalar(TORSO.map((r) => r[5]), u);
  };
  const rxAt = (y) => {
    const u = clamp(shell.sAtY(y), 0, 1) * (TORSO.length - 1);
    return crScalar(TORSO.map((r) => r[2]), u) + B.off + B.pad * gauss(y - 1.382, 0.022);
  };
  // Angle half-width of the front opening at height y (th = π/2 is centre front).
  const delta = (y) => {
    const w = blazerOpenHalf(y);
    if (w <= 0) return 0;
    return Math.asin(Math.min(1, (w / rxAt(y)) ** (nAt(y) / 2)));
  };
  const yTop = (th) => 1.425 + 0.022 * Math.max(0, -Math.sin(th));

  const mb = new MeshBuilder();
  const tmp = new THREE.Vector3();

  // Body of the jacket: rows from the hem up to the collar line.
  mb.grid({
    rows: 96, cols: 120, closed: false, th0: 0, th1: 1, part: { kind: 'shell' },
    point: (s, t, out) => {
      // Solve the row height and the column angle together: the open edges
      // depend on height and the top edge depends on angle.
      let y = lerp(B.hem, 1.425, s);
      let th = 0;
      for (let k = 0; k < 3; k++) {
        const d = delta(y);
        th = Math.PI / 2 + d + t * (TAU - 2 * d);
        y = lerp(B.hem, yTop(th), s);
      }
      // A little flare over the hips so the hem stands off the body.
      const flare = 0.010 * smooth(1.0, B.hem, y);
      shell.point(shell.sAtY(y), th, out);
      if (flare) {
        tmp.set(out.x, 0, out.z - (-0.005)).normalize();
        out.addScaledVector(tmp, flare);
      }
      return out;
    },
  });

  // Lapels: panels folded back from each front edge.
  for (const side of [1, -1]) {
    mb.grid({
      rows: 90, cols: 6, closed: false, th0: 0, th1: 1, part: { kind: 'lapel', side }, flip: side < 0,
      point: (s, t, out) => {
        const y = lerp(B.button, 1.43, s);
        const d = delta(y);
        const rx = rxAt(y);
        const thEdge = Math.PI / 2 + side * d;
        // Lapel width as an angle across the surface.
        const dth = lapelWidth(y) / Math.max(0.03, rx);
        const th = thEdge + side * dth * t;
        shell.point(shell.sAtY(y), th, out);
        // Sit on the jacket, rolled up a little along the fold.
        tmp.set(out.x, 0, out.z + 0.005).normalize();
        out.addScaledVector(tmp, 0.0045 + 0.0045 * Math.sin(Math.PI * t) * smooth(1.12, 1.28, y));
        return out;
      },
    });
  }

  // Collar: rises from the collar line round the back of the neck, rolls
  // over and falls back down onto the shoulders.
  const prof = [[0, 0.0], [0.020, -0.002], [0.030, 0.004], [0.026, 0.016], [0.008, 0.026]];
  mb.grid({
    rows: prof.length - 1, cols: 60, closed: false, th0: 0, th1: 1, part: { kind: 'collar' },
    point: (s, t, out) => {
      const dTop = delta(1.425);
      const th = Math.PI / 2 + dTop + t * (TAU - 2 * dTop);
      const y0 = yTop(th);
      const u = s * (prof.length - 1);
      const up = crScalar(prof.map((q) => q[0]), u);
      const outw = crScalar(prof.map((q) => q[1]), u);
      // Taper the collar into the lapels at the front.
      const front = smooth(0.15, 0.0, Math.min(t, 1 - t));
      shell.point(shell.sAtY(y0 + up * (1 - 0.6 * front)), th, out);
      tmp.set(out.x, 0, out.z + 0.02).normalize();
      out.addScaledVector(tmp, outw * (1 - 0.4 * front) - 0.004);
      return out;
    },
  });

  // Sleeves, full length with a little ease.
  for (const [S] of SIDES) {
    // The sleeve cap is domed so it rounds off the padded shoulder.
    const sec = armSections(J, S, 0.011);
    const last = sec[sec.length - 1];
    last.rx += 0.006; last.rf += 0.004; last.rb += 0.004;
    const arm = limbSampler(sec);
    mb.grid({ rows: 56, cols: 32, s1: 0.95, point: arm.point, part: { kind: 'sleeve', S }, capStart: true });
  }

  const geo = mb.build({
    weights: (m, p) => {
      const k = m.part.kind;
      if (k === 'sleeve') return armWeights(I, m.part.S, m.s);
      return torsoWeights(I, p);
    },
  });
  const blazer = skinned(geo, M.blazer, rig, 'blazer');

  // Gold bar pin on her left lapel.
  const pinGeo = new THREE.CapsuleGeometry(0.0022, 0.016, 4, 10);
  pinGeo.rotateZ(Math.PI / 2 - 0.35);
  const pin = new THREE.Mesh(pinGeo, M.gold);
  const pinPos = new THREE.Vector3();
  {
    const y = 1.305;
    const d = delta(y);
    const rx = rxAt(y);
    const th = Math.PI / 2 + d + (lapelWidth(y) / rx) * 0.55;
    shell.point(shell.sAtY(y), th, pinPos);
    pinPos.z += 0.008;
  }
  pin.position.copy(pinPos).sub(J.chest.pos);
  pin.castShadow = true;
  rig.byName.chest.add(pin);

  return blazer;
}
