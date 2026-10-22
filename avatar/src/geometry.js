/* ---------------------------------------------------------------------------
 * geometry.js — the modelling kit.
 *
 * Every body part is a lofted tube: a centre line through a handful of
 * sections, each a superellipse with separate front and back depths. A part
 * is sampled on an (s, θ) grid — s along the part, θ around it — and the
 * resulting vertices are skinned by a weight function of their rest
 * position. Garments are the same surfaces sampled a few millimetres out,
 * with the same weights, so they deform exactly with the body beneath.
 * ------------------------------------------------------------------------- */

const _t = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/* Superellipse lobe: sign-preserving |c|^(2/n). n = 2 is an ellipse; larger n
 * squares the section off (shoulders, palm). */
const sp = (c, n) => Math.sign(c) * Math.abs(c) ** (2 / n);

/* sections: [{ p: Vector3, rx, rf, rb, n }]
 *   rx  half-width along the side axis
 *   rf  depth in front of the centre line, rb behind it
 * front: the direction that counts as "front" for this part.
 * bulge(s, th): optional extra outward offset, for local anatomy. */
function limbSampler(sections, { front = new THREE.Vector3(0, 0, 1), bulge = null } = {}) {
  const P = sections.map((q) => q.p);
  const RX = sections.map((q) => q.rx);
  const RF = sections.map((q) => q.rf);
  const RB = sections.map((q) => q.rb);
  const N = sections.map((q) => q.n || 2);
  const last = sections.length - 1;

  const center = (s, out) => crVec(P, clamp(s, 0, 1) * last, out);

  const frame = (s, U, V, T) => {
    const u = clamp(s, 0, 1) * last;
    crVec(P, Math.min(last, u + 0.002), _a);
    crVec(P, Math.max(0, u - 0.002), _b);
    T.subVectors(_a, _b).normalize();
    V.copy(front).addScaledVector(T, -front.dot(T)).normalize();
    U.crossVectors(V, T);
  };

  const U = new THREE.Vector3(), V = new THREE.Vector3(), T = new THREE.Vector3();

  function point(s, th, out) {
    const u = clamp(s, 0, 1) * last;
    center(s, out);
    frame(s, U, V, T);
    const n = crScalar(N, u);
    const c = Math.cos(th), sn = Math.sin(th);
    const ex = sp(c, n), ey = sp(sn, n);
    const rx = Math.max(0, crScalar(RX, u));
    const rv = Math.max(0, sn >= 0 ? crScalar(RF, u) : crScalar(RB, u));
    out.addScaledVector(U, rx * ex).addScaledVector(V, rv * ey);
    if (bulge) {
      const k = bulge(s, th);
      if (k) {
        _t.copy(U).multiplyScalar(c).addScaledVector(V, sn).normalize();
        out.addScaledVector(_t, k);
      }
    }
    return out;
  }

  /* For upright parts: the s at which the centre line reaches height y. */
  function sAtY(y) {
    let lo = 0, hi = 1;
    const up = center(1, _a).y > center(0, _b).y;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const cy = center(mid, _a).y;
      if ((cy < y) === up) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  return { point, center, frame, sAtY };
}

/* Accumulates vertices for one mesh, then emits a BufferGeometry with skin
 * attributes. Each vertex keeps the part tag and (s, θ) it was sampled at so
 * weight and colour functions can use them. */
class MeshBuilder {
  constructor() {
    this.p = [];
    this.uv = [];
    this.ix = [];
    this.meta = [];
    this.seams = [];
  }

  get count() { return this.p.length / 3; }

  vert(v, u, w, meta) {
    this.p.push(v.x, v.y, v.z);
    this.uv.push(u, w);
    this.meta.push(meta);
    return this.count - 1;
  }

  /* point(s, th, out) -> out. rows x cols cells; s runs from 0 to 1 and the
   * ring order must satisfy U x V = T for outward faces (limbSampler does). */
  grid({ rows, cols, point, part, closed = true, capStart = false, capEnd = false,
         flip = false, s0 = 0, s1 = 1, th0 = 0, th1 = TAU }) {
    const base = this.count;
    const ring = cols + 1;
    const v = new THREE.Vector3();
    for (let i = 0; i <= rows; i++) {
      const s = lerp(s0, s1, i / rows);
      for (let j = 0; j <= cols; j++) {
        const th = closed ? (j / cols) * TAU : lerp(th0, th1, j / cols);
        point(s, th, v, j / cols);
        this.vert(v, j / cols, i / rows, { part, s, th, i, j });
      }
      if (closed) this.seams.push([base + i * ring, base + i * ring + cols]);
    }
    const quad = (a, b, c, d) => {
      if (flip) { this.ix.push(a, c, b, b, c, d); }
      else { this.ix.push(a, b, c, b, d, c); }
    };
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const a = base + i * ring + j;
        quad(a, a + 1, a + ring, a + ring + 1);
      }
    }
    const cap = (row, start) => {
      const c = new THREE.Vector3();
      for (let j = 0; j < cols; j++) {
        const k = (base + row * ring + j) * 3;
        c.x += this.p[k]; c.y += this.p[k + 1]; c.z += this.p[k + 2];
      }
      c.multiplyScalar(1 / cols);
      const m = this.meta[base + row * ring];
      const ci = this.vert(c, 0.5, start ? 0 : 1, { ...m, cap: true });
      for (let j = 0; j < cols; j++) {
        const a = base + row * ring + j;
        if (start !== flip) this.ix.push(ci, a + 1, a);
        else this.ix.push(ci, a, a + 1);
      }
    };
    if (capStart) cap(0, true);
    if (capEnd) cap(rows, false);
    return { base, ring, rows, cols };
  }

  /* weights(meta, pos) -> [[boneIndex, w], ...]; colour(meta, pos, nrm) -> Color */
  build({ weights = null, colour = null } = {}) {
    const g = new THREE.BufferGeometry();
    const n = this.count;
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.ix);
    g.computeVertexNormals();

    // Seam columns are duplicated for UVs; give both copies the same normal.
    const nr = g.attributes.normal.array;
    for (const [a, b] of this.seams) {
      for (let k = 0; k < 3; k++) {
        const m = (nr[a * 3 + k] + nr[b * 3 + k]) / 2;
        nr[a * 3 + k] = m; nr[b * 3 + k] = m;
      }
    }
    for (const [a, b] of this.seams) {
      _t.fromArray(nr, a * 3).normalize();
      _t.toArray(nr, a * 3); _t.toArray(nr, b * 3);
    }

    const pos = new THREE.Vector3();
    const nrm = new THREE.Vector3();

    if (weights) {
      const si = new Uint16Array(n * 4);
      const sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        pos.fromArray(this.p, i * 3);
        const list = weights(this.meta[i], pos)
          .filter((e) => e[1] > 1e-4)
          .sort((x, y) => y[1] - x[1])
          .slice(0, 4);
        const tot = list.reduce((acc, e) => acc + e[1], 0) || 1;
        list.forEach((e, k) => { si[i * 4 + k] = e[0]; sw[i * 4 + k] = e[1] / tot; });
        if (!list.length) sw[i * 4] = 1;
      }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    }

    if (colour) {
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        pos.fromArray(this.p, i * 3);
        nrm.fromArray(nr, i * 3);
        const c = colour(this.meta[i], pos, nrm);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    }

    g.computeBoundingSphere();
    return g;
  }
}

/* Blend weights between consecutive bones along a part: stops is a list of
 * [s, boneIndex]; within `soft` of each stop the two neighbours cross-fade. */
function chainWeights(stops, s, soft) {
  if (s <= stops[0][0]) return [[stops[0][1], 1]];
  for (let k = 1; k < stops.length; k++) {
    const [sk, bk] = stops[k];
    const [, bp] = stops[k - 1];
    const w = soft[k] || soft[0] || 0.03;
    if (s < sk + w) {
      const t = smooth(sk - w, sk + w, s);
      if (t <= 0) return [[bp, 1]];
      return [[bp, 1 - t], [bk, t]];
    }
  }
  return [[stops[stops.length - 1][1], 1]];
}
