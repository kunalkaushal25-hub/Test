/* ---------------------------------------------------------------------------
 * hair.js — long, soft-waved honey-blonde hair with a centre part.
 *
 * About 1,700 ribbon strands ("hair cards"), each grown from a root on the
 * scalp: combed away from the part, pulled down by gravity, kept out of the
 * head, neck, shoulders and arms by simple colliders, then given a soft
 * S-wave below the ears. Strands are grown in clumps that share a comb
 * direction, a wave and a fate — in front of the shoulder or behind it —
 * which is what makes them read as locks rather than noise.
 *
 * The mesh rides the head bone. In the vertex shader the lower lengths are
 * re-expressed in the chest's frame, so hair lying on the blazer stays on
 * the blazer when she turns her head, and the free ends swing a little.
 * ------------------------------------------------------------------------- */

const HAIR = {
  strands: 2100,
  step: 0.005,
  rows: 54,
  root: [88, 58, 36],
  mid: [160, 112, 64],
  tip: [210, 164, 102],
};

/* -- colliders ------------------------------------------------------------ */

function headRadiusMap() {
  const NL = 160, NB = 80;
  const r = new Float32Array((NL + 1) * (NB + 1));
  const p = new THREE.Vector3();
  for (let j = 0; j <= NB; j++) {
    const lat = -Math.PI / 2 + (Math.PI * j) / NB;
    for (let i = 0; i <= NL; i++) {
      const lon = -Math.PI + (TAU * i) / NL;
      headPoint(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon), p);
      r[j * (NL + 1) + i] = p.length();
    }
  }
  return (dx, dy, dz) => {
    const lon = Math.atan2(dx, dz), lat = Math.asin(clamp(dy, -1, 1));
    const fi = ((lon + Math.PI) / TAU) * NL, fj = ((lat + Math.PI / 2) / Math.PI) * NB;
    const i = clamp(Math.floor(fi), 0, NL - 1), j = clamp(Math.floor(fj), 0, NB - 1);
    const u = fi - i, v = fj - j;
    const a = r[j * (NL + 1) + i], b = r[j * (NL + 1) + i + 1];
    const c = r[(j + 1) * (NL + 1) + i], d = r[(j + 1) * (NL + 1) + i + 1];
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
}

const TCOL = [0, 1, 2, 3, 4, 5].map((k) => TORSO.map((r) => r[k]));

/* Implicit blazer surface: < 1 inside. */
function torsoF(x, y, z, extra) {
  if (y < 0.84 || y > 1.47) return 2;
  const u = torsoSAtY(y) * (TORSO.length - 1);
  const cz = crScalar(TCOL[1], u);
  const rx = crScalar(TCOL[2], u) + extra + BLAZER.pad * gauss(y - 1.382, 0.022);
  const rf = crScalar(TCOL[3], u) + extra, rb = crScalar(TCOL[4], u) + extra;
  const n = crScalar(TCOL[5], u);
  const dz = z - cz;
  return Math.abs(x / rx) ** n + Math.abs(dz / (dz > 0 ? rf : rb)) ** n;
}

function buildColliders(rig) {
  const J = rig.J;
  const C = J.head.pos.clone().add(FACE.C);
  const rmap = headRadiusMap();
  const tmp = new THREE.Vector3(), g = new THREE.Vector3();
  const arms = SIDES.map(([S]) => [J['upperArm' + S].pos.clone(), J['forearm' + S].pos.clone()]);

  /* Push p out of everything; returns the last contact normal or null. */
  function collide(p, off) {
    let hit = null;
    // Head: radial.
    tmp.subVectors(p, C);
    let d = tmp.length();
    tmp.multiplyScalar(1 / d);
    const R = rmap(tmp.x, tmp.y, tmp.z) + off;
    if (d < R) { p.copy(C).addScaledVector(tmp, R); hit = tmp.clone(); }

    // The face: an oval in front of it that hair may frame but not cross,
    // so locks fall beside the cheeks rather than over them.
    tmp.subVectors(p, C);
    if (tmp.z > -0.012 && tmp.y > -0.125 && tmp.y < 0.075) {
      const ey = (tmp.y + 0.028) / 0.097;
      const half = 0.0675 * Math.sqrt(Math.max(0, 1 - ey * ey)) + off * 0.5;
      if (Math.abs(tmp.x) < half) {
        const sx = tmp.x >= 0 ? 1 : -1;
        p.x = C.x + sx * half;
        hit = new THREE.Vector3(sx, 0, 0);
      }
    }

    // Neck, with the blazer collar round its base.
    if (p.y < 1.56 && p.y > 1.36) {
      const cz = lerp(-0.026, -0.012, (p.y - 1.40) / 0.18);
      const r = (p.y < 1.465 ? 0.066 : 0.052) + off;
      tmp.set(p.x, 0, p.z - cz);
      d = tmp.length();
      if (d < r) {
        tmp.multiplyScalar(1 / Math.max(d, 1e-6));
        p.x = tmp.x * r; p.z = cz + tmp.z * r;
        hit = tmp.clone();
      }
    }

    // Blazer: march out along the gradient of the implicit surface.
    const extra = BLAZER.off + 0.012 + off * 0.6;
    if (torsoF(p.x, p.y, p.z, extra) < 1) {
      const h = 0.002;
      g.set(
        torsoF(p.x + h, p.y, p.z, extra) - torsoF(p.x - h, p.y, p.z, extra),
        torsoF(p.x, p.y + h, p.z, extra) - torsoF(p.x, p.y - h, p.z, extra),
        torsoF(p.x, p.y, p.z + h, extra) - torsoF(p.x, p.y, p.z - h, extra)
      ).normalize();
      for (let k = 0; k < 30 && torsoF(p.x, p.y, p.z, extra) < 1; k++) p.addScaledVector(g, 0.0015);
      hit = g.clone();
    }

    // Upper arms.
    for (const [a, b] of arms) {
      tmp.subVectors(b, a);
      const t = clamp(tmp.dot(g.subVectors(p, a)) / tmp.lengthSq(), 0, 1);
      const q = a.clone().addScaledVector(tmp, t);
      g.subVectors(p, q);
      d = g.length();
      const r = 0.060 + off * 0.6;
      if (d < r) { g.multiplyScalar(1 / d); p.copy(q).addScaledVector(g, r); hit = g.clone(); }
    }
    return hit;
  }

  return { C, rmap, collide };
}

/* How much a scalp point (relative to the head centre) is inside the
 * hairline: 0 on the face, ears and nape, 1 under the hair, soft between. */
function hairMask(p) {
  let m = 1;
  if (p.z > -0.02) {
    const e = (p.x / 0.066) ** 2 + ((p.y + 0.030) / 0.095) ** 2;
    m *= lerp(1, smooth(0.92, 1.22, e), smooth(-0.02, -0.004, p.z));
  }
  m *= 1 - smooth(-0.026, -0.036, p.y) * smooth(-0.052, -0.040, p.z);
  m *= smooth(-0.090, -0.080, p.y);
  return m;
}

const hairRegion = (p) => hairMask(p) > 0.5;

/* -- strand growth -------------------------------------------------------- */

function growStrands(rig) {
  const rand = mulberry32(2024);
  const col = buildColliders(rig);
  const { C, rmap } = col;
  const dir = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const scalpAt = (d, out) => out.copy(d).normalize().multiplyScalar(rmap(...d.clone().normalize().toArray()));

  // Locks: strands that share a key share a wave, a length and a fate.
  const clumps = new Map();
  const clumpFor = (key, front) => {
    if (!clumps.has(key)) {
      clumps.set(key, {
        front: rand() < front,
        phase: rand() * TAU,
        amp: 0.009 + rand() * 0.006,
        lambda: 0.11 + rand() * 0.025,
        len: rand(),
        tint: rand(),
      });
    }
    return clumps.get(key);
  };

  /* Root, comb direction, offset and lock for one strand, by layer:
   *   part  - from the centre parting, over the top and down each side
   *   line  - along the hairline, so its edge is hair rather than cap
   *   back  - the back of the head, straight down
   *   fill  - anywhere, underneath, for body */
  function seed(kind) {
    const rootRel = new THREE.Vector3();
    let comb, off, cl;
    for (let tries = 0; tries < 200; tries++) {
      if (kind === 'part') {
        const u = rand();
        const phi = lerp(0.62, -0.75, u);       // from the front hairline back over the crown
        const side = rand() < 0.5 ? -1 : 1;
        dir.set(side * (0.012 + 0.05 * rand() ** 2), Math.cos(phi), Math.sin(phi));
        scalpAt(dir, rootRel);
        if (!hairRegion(rootRel)) continue;
        const back = smooth(0.2, 0.85, u);
        comb = new THREE.Vector3(side * lerp(1.0, 0.45, back), -0.15, lerp(-0.15, -0.9, back));
        off = 0.0045 + 0.0075 * rand();
        cl = clumpFor(`p${side}:${Math.round(u * 16)}`, u < 0.6 ? 0.95 : 0.1);
        cl.side = side;
        return { rootRel, comb, off, cl, side };
      }
      // Uniform direction on the scalp.
      const z = rand() * 2 - 1, a = rand() * TAU, q = Math.sqrt(1 - z * z);
      dir.set(q * Math.cos(a), z, q * Math.sin(a));
      scalpAt(dir, rootRel);
      if (!hairRegion(rootRel)) continue;
      const side = Math.abs(rootRel.x) < 0.004 ? (rand() < 0.5 ? -1 : 1) : Math.sign(rootRel.x);
      if (kind === 'line') {
        // Keep roots that sit within ~1 cm of the hairline.
        tmp.set(rootRel.x * 0.94, rootRel.y - 0.011, rootRel.z + 0.004);
        if (hairRegion(tmp) || rootRel.z < -0.02) continue;
        comb = new THREE.Vector3(side * 0.7, -0.35, -0.55);
        off = 0.0025 + 0.004 * rand();
        cl = clumpFor(`l${side}:${Math.round(Math.atan2(rootRel.y, Math.abs(rootRel.x)) * 8)}`, 0.9);
        return { rootRel, comb, off, cl, side };
      }
      if (kind === 'back') {
        if (rootRel.z > -0.035) continue;
        comb = new THREE.Vector3(rootRel.x * 3, -1, -0.12);
        off = 0.003 + 0.010 * rand();
        cl = clumpFor(`b${Math.round(rootRel.x * 28)}:${Math.round(rootRel.y * 14)}`, 0.0);
        return { rootRel, comb, off, cl, side };
      }
      // fill
      const backness = smooth(-0.02, -0.07, rootRel.z);
      comb = new THREE.Vector3(side * lerp(0.5, 0.15, backness), lerp(-0.8, -1.0, backness), lerp(0.05, -0.2, backness));
      off = 0.0018 + 0.0045 * rand();
      const frontness = smooth(-0.045, 0.02, rootRel.z);
      cl = clumpFor(`f${Math.round(rootRel.x * 24)}:${Math.round(rootRel.z * 24)}`, frontness * 0.9);
      return { rootRel, comb, off, cl, side };
    }
    return null;
  }

  const strands = [];
  const kinds = [['part', 0.40], ['line', 0.14], ['back', 0.24], ['fill', 0.22]];
  for (let i = 0; i < HAIR.strands; i++) {
    let r = rand(), kind = 'fill';
    for (const [k, f] of kinds) { if (r < f) { kind = k; break; } r -= f; }
    const sd = seed(kind);
    if (!sd) continue;
    const { rootRel, comb, off, cl, side } = sd;
    cl.side = cl.side || side;
    const rd = rootRel.clone().normalize();
    const layer = clamp((off - 0.0018) / 0.011, 0, 1);
    const p = C.clone().addScaledVector(rd, rmap(rd.x, rd.y, rd.z) + off);

    dir.copy(comb);
    const n0 = rd.clone();
    dir.addScaledVector(n0, -dir.dot(n0)).normalize();

    const endY = cl.front ? 1.15 + 0.07 * cl.len + 0.015 * rand() : 1.10 + 0.08 * cl.len + 0.015 * rand();
    const pts = [p.clone()];
    const nrm = [n0.clone()];
    let travelled = 0;
    while (pts.length < 220 && p.y > endY && travelled < 0.64) {
      const gk = smooth(0.0, 0.05, travelled);
      dir.y -= 0.20 * gk;
      const shoulderBand = smooth(1.52, 1.44, p.y) * smooth(1.30, 1.38, p.y);
      dir.z += (cl.front ? 0.09 : -0.07) * shoulderBand;
      // Lengths fall close to the body rather than off the shoulder points.
      const onShoulder = smooth(1.47, 1.42, p.y) * smooth(1.34, 1.38, p.y) * smooth(0.09, 0.14, Math.abs(p.x));
      if (onShoulder > 0) dir.x *= 1 - 0.6 * onShoulder;
      dir.normalize();
      p.addScaledVector(dir, HAIR.step);
      const hit = col.collide(p, off);
      if (hit) {
        const dn = dir.dot(hit);
        if (dn < 0) dir.addScaledVector(hit, -dn).normalize();
      }
      travelled += HAIR.step;
      pts.push(p.clone());
      nrm.push(n0.clone());
    }
    if (pts.length < 4) continue;

    // A smooth frame for the strand: near the root the ribbon lies on the
    // scalp (normal = radial from the head centre); hanging, it faces out
    // from the body's vertical axis. Collision normals are too noisy to use.
    const len = travelled;
    const frame = (k, out) => {
      const a = (k / (pts.length - 1)) * len;
      const h = tmp.subVectors(pts[k], C).normalize();
      const bx = pts[k].x, bz = pts[k].z + 0.01;
      const body = new THREE.Vector3(bx, 0, bz).normalize();
      return out.copy(h).lerp(body, smooth(0.03, 0.12, a)).normalize();
    };
    for (let k = 0; k < pts.length; k++) frame(k, nrm[k]);

    // Soft waves below the ears, in the plane of the hair, then relax and
    // re-collide.
    const waveStart = 0.09 + 0.03 * rand();
    // Neighbouring locks wave together; that reads as a head of waves.
    const wavePhase = rootRel.x * 22 + rootRel.z * 14 + rootRel.y * 6;
    const tng = new THREE.Vector3(), sideV = new THREE.Vector3();
    for (let k = 1; k < pts.length; k++) {
      const a = (k / (pts.length - 1)) * len;
      const amp = cl.amp * smooth(waveStart, waveStart + 0.10, a);
      if (amp <= 0) continue;
      tng.subVectors(pts[Math.min(k + 1, pts.length - 1)], pts[k - 1]).normalize();
      sideV.crossVectors(tng, nrm[k]).normalize();
      const ph = (TAU * a) / cl.lambda + cl.phase * 0.35 + wavePhase;
      pts[k].addScaledVector(sideV, amp * Math.sin(ph)).addScaledVector(nrm[k], amp * 0.25 * Math.cos(ph));
    }
    for (let it = 0; it < 3; it++) {
      for (let k = 1; k < pts.length - 1; k++) {
        tmp.addVectors(pts[k - 1], pts[k + 1]).multiplyScalar(0.5);
        pts[k].lerp(tmp, 0.4);
      }
    }
    for (let k = 1; k < pts.length; k++) col.collide(pts[k], off * 0.9);

    const wide = sd.cl && rootRel.y > 0.05 ? 1.25 : 1;
    strands.push({ pts, nrm, layer, cl, width: lerp(0.010, 0.007, layer) * wide * (0.8 + 0.4 * rand()), tint: rand() });
  }
  return { strands, col };
}

/* -- ribbons --------------------------------------------------------------- */

function resample(pts, n) {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const L = acc[acc.length - 1];
  const out = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = (i / (n - 1)) * L;
    while (j < acc.length - 2 && acc[j + 1] < s) j++;
    const t = (s - acc[j]) / Math.max(1e-9, acc[j + 1] - acc[j]);
    out.push({ p: pts[j].clone().lerp(pts[j + 1], clamp(t, 0, 1)), j, t });
  }
  return { out, L };
}

function hairTexture() {
  const rand = mulberry32(99);
  return canvasTexture(512, 128, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    for (let i = 0; i < 120; i++) {
      const y0 = H * (0.06 + 0.88 * rand());
      const edge = Math.min(y0, H - y0) / (H * 0.5);
      const a = (0.45 + 0.55 * rand()) * Math.min(1, edge * 2.0);
      const l = 170 + rand() * 85;
      g.strokeStyle = `rgba(${Math.round(l)},${Math.round(l)},${Math.round(l)},${a})`;
      g.lineWidth = 1.0 + rand() * 1.8;
      const end = W * (0.82 + 0.18 * rand());
      g.beginPath();
      g.moveTo(0, y0);
      const wob = (rand() - 0.5) * 6;
      g.bezierCurveTo(W * 0.33, y0 + wob, W * 0.66, y0 - wob, end, y0 + wob * 0.5);
      g.stroke();
    }
    // Taper the alpha towards the tip.
    g.globalCompositeOperation = 'destination-in';
    const tg = g.createLinearGradient(0, 0, W, 0);
    tg.addColorStop(0, 'rgba(0,0,0,1)');
    tg.addColorStop(0.82, 'rgba(0,0,0,1)');
    tg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = tg;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
  });
}

function buildHair(rig, M) {
  const { strands, col } = growStrands(rig);
  const headPos = rig.J.head.pos;
  const chestPos = rig.J.chest.pos;
  const R = HAIR.rows;
  const nV = strands.length * R * 2;
  const pos = new Float32Array(nV * 3);
  const nor = new Float32Array(nV * 3);
  const tan = new Float32Array(nV * 4);
  const uv = new Float32Array(nV * 2);
  const colr = new Float32Array(nV * 3);
  const aW = new Float32Array(nV);
  const aS = new Float32Array(nV);
  const idx = [];
  const cRoot = srgb(...HAIR.root), cMid = srgb(...HAIR.mid), cTip = srgb(...HAIR.tip);
  const c = new THREE.Color();
  const t = new THREE.Vector3(), n = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Vector3();

  let v = 0;
  strands.forEach((st) => {
    const { out } = resample(st.pts, R);
    const light = st.cl.tint * 0.6 + st.tint * 0.4;
    for (let i = 0; i < R; i++) {
      const s = i / (R - 1);
      const P = out[i].p;
      const k = Math.min(out[i].j, st.nrm.length - 1);
      t.subVectors(out[Math.min(i + 1, R - 1)].p, out[Math.max(i - 1, 0)].p).normalize();
      // Lie flat on whatever the strand rests on.
      n.copy(st.nrm[k]);
      n.addScaledVector(t, -n.dot(t)).normalize();
      b.crossVectors(t, n).normalize();
      const wdt = st.width * (s < 0.04 ? lerp(0.5, 1, s / 0.04) : 1) * (1 - 0.65 * smooth(0.7, 1.0, s));
      // Root to tip: dark roots, golden lengths, lighter ends; streaks per strand.
      c.copy(cRoot).lerp(cMid, smooth(0.0, 0.22, s)).lerp(cTip, smooth(0.35, 1.0, s) * (0.55 + 0.45 * light));
      c.multiplyScalar(0.82 + 0.36 * light);
      // Body-follow: lengths below the jaw ride the chest.
      const wBody = smooth(1.50, 1.40, P.y);
      for (let side = 0; side < 2; side++) {
        q.copy(P).addScaledVector(b, (side ? 0.5 : -0.5) * wdt).sub(headPos);
        pos[v * 3] = q.x; pos[v * 3 + 1] = q.y; pos[v * 3 + 2] = q.z;
        nor[v * 3] = n.x; nor[v * 3 + 1] = n.y; nor[v * 3 + 2] = n.z;
        tan[v * 4] = t.x; tan[v * 4 + 1] = t.y; tan[v * 4 + 2] = t.z; tan[v * 4 + 3] = 1;
        uv[v * 2] = s; uv[v * 2 + 1] = side;
        colr[v * 3] = c.r; colr[v * 3 + 1] = c.g; colr[v * 3 + 2] = c.b;
        aW[v] = wBody;
        aS[v] = s;
        v++;
      }
    }
  });
  let base = 0;
  for (let si = 0; si < strands.length; si++) {
    for (let i = 0; i < R - 1; i++) {
      const a = base + i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    base += R * 2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('tangent', new THREE.BufferAttribute(tan, 4));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  geo.setAttribute('hairW', new THREE.BufferAttribute(aW, 1));
  geo.setAttribute('hairS', new THREE.BufferAttribute(aS, 1));
  geo.setIndex(nV > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));

  const uniforms = {
    uFollow: { value: new THREE.Matrix4() },
    uSway: { value: new THREE.Vector3() },
    uTime: { value: 0 },
  };
  const patch = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float hairW;
        attribute float hairS;
        uniform mat4 uFollow;
        uniform vec3 uSway;
        uniform float uTime;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        objectNormal = normalize( mix( objectNormal, mat3( uFollow ) * objectNormal, hairW ) );
        #ifdef USE_TANGENT
          objectTangent = normalize( mix( objectTangent, mat3( uFollow ) * objectTangent, hairW ) );
        #endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 followed = ( uFollow * vec4( transformed, 1.0 ) ).xyz;
        transformed = mix( transformed, followed, hairW );
        float free = hairS * hairS * ( 1.0 - 0.75 * hairW );
        transformed += uSway * free;
        transformed.x += 0.0025 * free * sin( uTime * 1.3 + position.y * 40.0 + position.z * 25.0 );
        transformed.z += 0.0018 * free * sin( uTime * 1.1 + position.x * 35.0 );`);
  };

  const mat = new THREE.MeshPhysicalMaterial({
    map: hairTexture(),
    vertexColors: true,
    roughness: 0.48,
    metalness: 0,
    anisotropy: 0.7,
    anisotropyRotation: Math.PI / 2,
    sheen: 0.22,
    sheenRoughness: 0.4,
    sheenColor: new THREE.Color(0.9, 0.62, 0.32),
    specularIntensity: 0.35,
    specularColor: new THREE.Color(1.0, 0.85, 0.6),
    side: THREE.DoubleSide,
    alphaTest: 0.32,
    alphaToCoverage: true,
  });
  mat.onBeforeCompile = patch;
  mat.customProgramCacheKey = () => 'hair';

  const depth = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking, map: mat.map, alphaTest: 0.4, side: THREE.DoubleSide,
  });
  depth.onBeforeCompile = patch;
  depth.customProgramCacheKey = () => 'hair-depth';

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'hair';
  mesh.customDepthMaterial = depth;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  rig.byName.head.add(mesh);

  const cap = buildScalp(col);
  cap.position.copy(col.C).sub(headPos);
  rig.byName.head.add(cap);

  // uFollow = H^-1 * Chest * T(h0 - c0): head-local rest positions carried
  // rigidly by the chest instead of the head.
  const offset = new THREE.Matrix4().makeTranslation(headPos.x - chestPos.x, headPos.y - chestPos.y, headPos.z - chestPos.z);
  const hInv = new THREE.Matrix4();
  const sway = { v: new THREE.Vector3(), x: new THREE.Vector3(), prev: null };
  const hq = new THREE.Quaternion();

  function update(dt, time) {
    const head = rig.byName.head, chest = rig.byName.chest;
    hInv.copy(head.matrixWorld).invert();
    uniforms.uFollow.value.copy(hInv).multiply(chest.matrixWorld).multiply(offset);
    uniforms.uTime.value = time;

    // Swing: a damped spring driven by how fast the head is turning,
    // expressed in head space so the ends lag behind the motion.
    head.getWorldQuaternion(hq);
    const fwd = new THREE.Vector3(0, -0.2, 0).applyQuaternion(hq);
    if (!sway.prev) sway.prev = fwd.clone();
    const vel = fwd.clone().sub(sway.prev).multiplyScalar(1 / Math.max(dt, 1e-3));
    sway.prev.copy(fwd);
    const dtc = Math.min(dt, 0.05);
    sway.v.addScaledVector(vel, -0.9 * dtc * 6).addScaledVector(sway.x, -60 * dtc).multiplyScalar(Math.exp(-5 * dtc));
    sway.x.addScaledVector(sway.v, dtc).clampLength(0, 0.03);
    const local = sway.x.clone().applyQuaternion(hq.clone().invert());
    uniforms.uSway.value.copy(local);
  }

  return { mesh, cap, update, uniforms };
}

/* The scalp under the strands: the head shape, lifted a few millimetres,
 * kept inside the hairline, with a feathered edge. */
function buildScalp(col) {
  const mb = new MeshBuilder();
  const d = new THREE.Vector3();
  const p = new THREE.Vector3();
  mb.grid({
    rows: 90, cols: 140, part: 'scalp',
    point: (s, th, out) => {
      const lat = lerp(-Math.PI / 2 + 0.05, Math.PI / 2 - 0.02, s);
      const lon = th - Math.PI;
      d.set(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
      return out.copy(d).multiplyScalar(col.rmap(d.x, d.y, d.z) + 0.0022);
    },
  });
  const root = srgb(...HAIR.root).multiplyScalar(0.9);
  const geo = mb.build({ colour: () => root });
  // Keep faces near or inside the hairline and feather the edge with
  // per-vertex alpha, so the cap never ends in a stepped line.
  const P = geo.attributes.position;
  const n = P.count;
  const rgba = new Float32Array(n * 4);
  const mask = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(P, i);
    mask[i] = hairMask(p);
    rgba[i * 4] = root.r; rgba[i * 4 + 1] = root.g; rgba[i * 4 + 2] = root.b;
    rgba[i * 4 + 3] = smooth(0.35, 0.9, mask[i]);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(rgba, 4));
  const ix = geo.index.array;
  const keep = [];
  for (let i = 0; i < ix.length; i += 3) {
    if (mask[ix[i]] > 0.3 || mask[ix[i + 1]] > 0.3 || mask[ix[i + 2]] > 0.3) keep.push(ix[i], ix[i + 1], ix[i + 2]);
  }
  geo.setIndex(keep);
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.75, transparent: true, alphaTest: 0.05, alphaToCoverage: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'scalp';
  mesh.receiveShadow = true;
  return mesh;
}
