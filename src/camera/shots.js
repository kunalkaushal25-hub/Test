/* ---------------------------------------------------------------------------
 * shots.js — the edit.
 *
 * Each shot carries camera position keys and look-at keys. Both are run
 * through Catmull-Rom splines and sampled with an eased parameter, so moves
 * arrive and leave softly instead of snapping between keys.
 * ------------------------------------------------------------------------- */

const EASE = {
  linear: (u) => u,
  inOut: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  out: (u) => 1 - Math.pow(1 - u, 3),
  in: (u) => u * u * u,
  // Settles gently without fully stopping — used for the long dolly moves.
  glide: (u) => 1 - Math.pow(1 - u, 2.2),
};

/* The unit is only 3.9 m wide, so interior shots run on a wide lens (fov is
 * vertical; the frame is 16:9 letterboxed to scope). Aim points look *along*
 * the plan wherever possible — pointing straight at a wall 1.5 m away fills
 * the frame with nothing. */
const SHOTS = [
  {
    id: 'establish', t0: 0, t1: 8.5, ease: 'inOut', shake: 0,
    fov: 50, dollhouse: true,
    keys: [
      { p: [-4.5, 10.5, 12.5], l: [1.95, 0.6, 4.8] },
      { p: [ 1.5, 11.5, 14.5], l: [1.95, 0.6, 4.8] },
      { p: [ 7.5, 11.0, 12.5], l: [1.95, 0.6, 4.8] },
      { p: [11.0,  9.5,  8.5], l: [1.95, 0.7, 4.9] },
    ],
  },
  {
    id: 'approach', t0: 8.5, t1: 14.5, ease: 'inOut', shake: 0.4,
    fov: 56,
    keys: [
      { p: [1.95, 1.62, -3.10], l: [2.45, 1.45, -0.30] },
      { p: [2.35, 1.58, -1.10], l: [2.70, 1.40,  1.60] },
      { p: [2.55, 1.56,  0.60], l: [2.90, 1.35,  3.20] },
    ],
  },
  {
    id: 'kitchen', t0: 14.5, t1: 25.5, ease: 'inOut', shake: 0.5,
    caption: 'Kitchen',
    captionNote: 'Refrigerator · Microwave · Cooker · Washer/Dryer · Exhaust Hood',
    fov: 62,
    // Backs into the room and turns to look north up the galley run, so the
    // whole counter reads at once instead of one cabinet door at arm's length.
    keys: [
      { p: [2.30, 1.58, 4.40], l: [3.50, 1.25, 1.60] },
      { p: [2.35, 1.56, 3.80], l: [3.55, 1.20, 1.40] },
      { p: [2.45, 1.55, 3.10], l: [3.58, 1.15, 1.20] },
      { p: [2.62, 1.54, 2.35], l: [3.60, 1.15, 0.80] },
    ],
  },
  {
    id: 'bath', t0: 25.5, t1: 34.5, ease: 'inOut', shake: 0.5,
    caption: 'Bath',
    captionNote: 'Walk-in shower · Vanity · WC',
    fov: 66,
    keys: [
      { p: [3.00, 1.56, 1.55], l: [1.55, 1.25, 1.10] },
      { p: [2.45, 1.54, 1.40], l: [1.20, 1.18, 0.95] },
      { p: [2.00, 1.52, 1.32], l: [0.75, 1.15, 0.80] },
    ],
  },
  {
    id: 'reveal', t0: 34.5, t1: 41.0, ease: 'glide', shake: 0.5,
    captionNote: 'Built-in wardrobe · Open-plan studio, 3.9 × 8.0 m internal',
    fov: 60,
    // Travels south down the length of the plan: wardrobe passing on the
    // right, then bed, dining and living opening up towards the balcony.
    keys: [
      { p: [2.95, 1.58, 2.30], l: [2.60, 1.35, 4.60] },
      { p: [2.75, 1.56, 3.40], l: [2.20, 1.25, 5.60] },
      { p: [2.60, 1.54, 4.40], l: [1.80, 1.20, 6.60] },
    ],
  },
  {
    id: 'bedroom', t0: 41.0, t1: 53.0, ease: 'inOut', shake: 0.45,
    caption: 'Living / Bedroom',
    captionNote: 'Double bed · Mattress · Nightstand · Wardrobe',
    fov: 60,
    keys: [
      { p: [3.30, 1.60, 3.70], l: [1.30, 1.10, 4.40] },
      { p: [3.40, 1.56, 4.50], l: [1.05, 0.95, 4.70] },
      { p: [3.25, 1.52, 5.30], l: [0.85, 0.92, 4.95] },
      { p: [2.95, 1.50, 6.00], l: [0.70, 1.00, 5.40] },
    ],
  },
  {
    id: 'living', t0: 53.0, t1: 63.5, ease: 'inOut', shake: 0.45,
    captionNote: 'Sofa · Center Table · TV Cabinet · Chandelier',
    fov: 62,
    // Dollies south past the sofa, then turns back to reveal the TV wall.
    keys: [
      { p: [3.35, 1.58, 4.90], l: [1.30, 0.95, 6.60] },
      { p: [3.30, 1.55, 5.50], l: [1.00, 0.88, 7.00] },
      { p: [3.05, 1.52, 6.20], l: [0.85, 0.88, 7.25] },
      { p: [2.55, 1.53, 7.00], l: [1.60, 1.00, 7.60] },
      { p: [2.15, 1.55, 7.15], l: [3.70, 1.50, 6.40] },
    ],
  },
  {
    id: 'dining', t0: 63.5, t1: 71.0, ease: 'inOut', shake: 0.45,
    captionNote: 'Dining Table with 2 chairs',
    fov: 58,
    keys: [
      { p: [2.15, 1.58, 7.00], l: [2.70, 1.15, 5.40] },
      { p: [2.25, 1.55, 6.40], l: [2.76, 1.02, 4.90] },
      { p: [2.35, 1.53, 5.90], l: [2.78, 0.95, 4.55] },
    ],
  },
  {
    id: 'toBalcony', t0: 71.0, t1: 79.5, ease: 'inOut', shake: 0.5,
    caption: 'Balcony',
    captionNote: 'Window curtain · Full-height sliding glazing',
    fov: 60,
    // Threads the open half of the slider, which parks on the west side.
    keys: [
      { p: [1.70, 1.56, 6.00], l: [1.45, 1.35,  8.60] },
      { p: [1.50, 1.55, 7.00], l: [1.40, 1.30,  9.60] },
      { p: [1.40, 1.55, 7.95], l: [1.45, 1.25, 11.00] },
      { p: [1.45, 1.56, 8.90], l: [1.60, 1.22, 12.00] },
    ],
  },
  {
    id: 'balconyTurn', t0: 79.5, t1: 87.5, ease: 'inOut', shake: 0.4,
    fov: 58,
    keys: [
      { p: [1.40, 1.56, 9.30], l: [2.30, 1.40, 12.00] },
      { p: [2.00, 1.56, 9.45], l: [2.70, 1.35, 10.30] },
      { p: [2.60, 1.56, 9.40], l: [1.90, 1.35,  7.80] },
      { p: [2.80, 1.57, 9.20], l: [1.45, 1.30,  7.00] },
    ],
  },
  {
    id: 'hero', t0: 87.5, t1: 99.0, ease: 'inOut', shake: 0,
    fov: 46,
    keys: [
      { p: [2.80, 1.60,  9.35], l: [1.60, 1.30, 7.20] },
      { p: [3.80, 3.00, 12.20], l: [1.95, 1.20, 7.00] },
      { p: [5.80, 5.40, 15.60], l: [1.95, 1.10, 6.60] },
      { p: [7.60, 7.60, 18.60], l: [1.95, 1.00, 6.20] },
    ],
  },
];

const FILM_DURATION = SHOTS[SHOTS.length - 1].t1;

/* Dusk ramp: the light turns as the camera reaches the balcony. */
function duskAt(t) {
  const a = 68.0, b = 83.0;
  return Math.min(1, Math.max(0, (t - a) / (b - a)));
}

/* The ceiling is lifted for the opening and closing doll-house shots. */
function ceilingVisibleAt(t) {
  return t >= 7.0;
}

function buildCamera(P) {
  // Curves are built once per shot and reused for every frame.
  for (const s of SHOTS) {
    const pts = s.keys.map((k) => new THREE.Vector3(k.p[0], k.p[1], k.p[2]));
    const lts = s.keys.map((k) => new THREE.Vector3(k.l[0], k.l[1], k.l[2]));
    s._pc = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.35);
    s._lc = new THREE.CatmullRomCurve3(lts, false, 'catmullrom', 0.35);
  }

  const _p = new THREE.Vector3();
  const _l = new THREE.Vector3();

  function shotAt(t) {
    for (const s of SHOTS) if (t < s.t1) return s;
    return SHOTS[SHOTS.length - 1];
  }

  /* Applies the camera state for film time `t` (seconds). */
  function apply(camera, t) {
    const s = shotAt(t);
    const u = Math.min(1, Math.max(0, (t - s.t0) / (s.t1 - s.t0)));
    const e = (EASE[s.ease] || EASE.inOut)(u);

    s._pc.getPoint(e, _p);
    s._lc.getPoint(e, _l);

    // A trace of handheld drift, deterministic in t so renders repeat exactly.
    if (s.shake) {
      const k = s.shake;
      _p.x += Math.sin(t * 1.7 + 0.4) * 0.011 * k;
      _p.y += Math.sin(t * 2.3 + 1.1) * 0.009 * k + Math.sin(t * 0.9) * 0.006 * k;
      _p.z += Math.sin(t * 1.3 + 2.2) * 0.010 * k;
      _l.x += Math.sin(t * 1.1 + 0.9) * 0.020 * k;
      _l.y += Math.sin(t * 1.9 + 2.7) * 0.016 * k;
    }

    camera.position.copy(_p);
    camera.lookAt(_l);

    const fov = s.fov || 48;
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    return s;
  }

  return { apply, shotAt, SHOTS, FILM_DURATION };
}
