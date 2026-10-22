/* ---------------------------------------------------------------------------
 * util.js — numeric helpers shared by every avatar module.
 *
 * Everything here is pure and allocation-free on the hot path; the animation
 * code calls these hundreds of times a frame.
 * ------------------------------------------------------------------------- */

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;

/* Hermite step. Works with a > b too, which reads naturally for ramps that
 * grow downwards (e.g. "0 above the cheekbone, 1 at the chin"). */
function smooth(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

const gauss = (x, s) => Math.exp(-(x * x) / (2 * s * s));
const g2 = (x, y, sx, sy) => Math.exp(-(x * x) / (2 * sx * sx) - (y * y) / (2 * sy * sy));

const easeInOut = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const easeOut = (t) => 1 - (1 - clamp(t, 0, 1)) ** 3;

/* Deterministic PRNG, so the hair and every idle cycle are identical on
 * every load and in every preview still. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Smooth 1-D value noise in [-1, 1]. Idle motion is built from a few octaves
 * of this so it never visibly loops. */
function hash1(i, seed) {
  let h = Math.imul((i | 0) ^ Math.imul(seed | 0, 0x27d4eb2d), 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return ((h >>> 0) / 4294967296) * 2 - 1;
}

function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash1(i, seed), hash1(i + 1, seed), u);
}

const fbm1 = (x, seed = 0) =>
  noise1(x, seed) * 0.62 + noise1(x * 2.13 + 7.7, seed + 1) * 0.27 + noise1(x * 4.71 + 3.1, seed + 2) * 0.11;

/* Catmull-Rom through evenly spaced samples; u runs 0..n-1. */
function crScalar(arr, u) {
  const n = arr.length;
  const i = clamp(Math.floor(u), 0, n - 2);
  const t = clamp(u - i, 0, 1);
  const p0 = arr[Math.max(0, i - 1)], p1 = arr[i], p2 = arr[i + 1], p3 = arr[Math.min(n - 1, i + 2)];
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function crVec(arr, u, out) {
  const n = arr.length;
  const i = clamp(Math.floor(u), 0, n - 2);
  const t = clamp(u - i, 0, 1);
  const p0 = arr[Math.max(0, i - 1)], p1 = arr[i], p2 = arr[i + 1], p3 = arr[Math.min(n - 1, i + 2)];
  const t2 = t * t, t3 = t2 * t;
  const c = (a, b, c2, d) =>
    0.5 * ((2 * b) + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t2 + (-a + 3 * b - 3 * c2 + d) * t3);
  out.set(c(p0.x, p1.x, p2.x, p3.x), c(p0.y, p1.y, p2.y, p3.y), c(p0.z, p1.z, p2.z, p3.z));
  return out;
}

/* Keyframe track: [[t, value], ...] with eased segments. Values may be
 * numbers or arrays of numbers. */
function track(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (t >= last[0]) return last[1];
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const [t0, a] = keys[i];
  const [t1, b] = keys[i + 1];
  const u = easeInOut((t - t0) / (t1 - t0));
  if (typeof a === 'number') return lerp(a, b, u);
  const out = new Array(a.length);
  for (let k = 0; k < a.length; k++) out[k] = lerp(a[k], b[k], u);
  return out;
}

/* sRGB 0-255 triple -> linear THREE.Color (vertex colours are linear). */
function srgb(r, g, b) {
  return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
}
