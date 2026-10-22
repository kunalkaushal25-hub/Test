/* ---------------------------------------------------------------------------
 * stage.js — renderer, studio lighting and camera framing.
 *
 * Portrait lighting: a warm soft key high on her right, a cool fill, and two
 * coloured rims (cool left, rose right) that pick the hair and shoulders out
 * of the dark background. Reflections come from a small procedural studio
 * — a dark room with three softboxes — baked once through PMREM, which is
 * what puts the catchlights in her eyes and the sheen on her lips.
 * ------------------------------------------------------------------------- */

function studioEnvironment(renderer) {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(12, 7, 12),
    new THREE.MeshBasicMaterial({ color: 0x14161f, side: THREE.BackSide })
  );
  room.position.y = 2;
  env.add(room);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.MeshBasicMaterial({ color: 0x2a2630 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.4;
  env.add(floor);

  const box = (w, h, rgbArr, k, pos) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(rgbArr[0] * k, rgbArr[1] * k, rgbArr[2] * k),
        side: THREE.DoubleSide,
      })
    );
    m.position.set(pos[0], pos[1], pos[2]);
    m.lookAt(0, 1.5, 0);
    env.add(m);
  };
  box(2.6, 1.8, [1.0, 0.94, 0.86], 9, [-2.2, 3.0, 3.6]);   // key
  box(1.6, 2.4, [0.80, 0.86, 1.0], 3, [3.4, 1.8, 2.6]);    // fill
  box(3.6, 0.8, [0.75, 0.82, 1.0], 4, [-3.0, 2.6, -3.0]);  // rim, cool
  box(3.0, 0.8, [1.0, 0.76, 0.80], 4, [3.0, 2.8, -3.0]);   // rim, rose

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0.035);
  pmrem.dispose();
  return rt.texture;
}

function buildStage(canvas, { antialias = true, preserve = false } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias,
    alpha: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: preserve,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);

  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 50);

  const key = new THREE.DirectionalLight(new THREE.Color(1.0, 0.92, 0.82), 2.7);
  key.position.set(-1.25, 2.5, 2.2);
  key.target.position.set(0, 1.35, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera;
  sc.left = -0.55; sc.right = 0.55; sc.top = 0.55; sc.bottom = -0.75;
  sc.near = 0.5; sc.far = 6;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.012;
  key.shadow.radius = 4;

  const fill = new THREE.DirectionalLight(new THREE.Color(1.0, 0.94, 0.88), 0.65);
  fill.position.set(1.6, 1.7, 2.2);
  fill.target.position.set(0, 1.35, 0);

  const rimL = new THREE.DirectionalLight(new THREE.Color(0.86, 0.90, 1.0), 1.6);
  rimL.position.set(-2.0, 2.0, -2.2);
  rimL.target.position.set(0, 1.35, 0);

  const rimR = new THREE.DirectionalLight(new THREE.Color(1.0, 0.86, 0.78), 1.6);
  rimR.position.set(2.1, 2.2, -1.8);
  rimR.target.position.set(0, 1.35, 0);

  const hemi = new THREE.HemisphereLight(0xfff2e6, 0x3a302c, 0.45);

  for (const l of [key, fill, rimL, rimR]) { scene.add(l); scene.add(l.target); }
  scene.add(hemi);

  return { renderer, scene, camera, lights: { key, fill, rimL, rimR, hemi } };
}

/* Framings. Each names the point to frame, how much of her must fit
 * (metres tall and wide), and where the camera sits: distance, elevation
 * and yaw around her. The camera fits that box into whatever part of the
 * screen is free between the header and the caption dock. */
const FRAMES = {
  portrait: { c: [0, 1.488, 0.02], h: 0.56, w: 0.44, dist: 1.75, elev: 0.03, yaw: 0 },
  half:     { c: [0, 1.30, 0.0], h: 1.00, w: 0.82, dist: 2.7, elev: 0.03, yaw: 0 },
  full:     { c: [0, 0.89, 0.0], h: 1.86, w: 0.95, dist: 4.6, elev: 0.02, yaw: 0 },
  face:     { c: [0, 1.598, 0.03], h: 0.27, w: 0.24, dist: 0.9, elev: 0.0, yaw: 0 },
  side:     { c: [0, 1.598, 0.0], h: 0.30, w: 0.30, dist: 0.9, elev: 0.0, yaw: Math.PI / 2 },
  three:    { c: [0, 1.59, 0.02], h: 0.30, w: 0.30, dist: 0.9, elev: 0.0, yaw: 0.72 },
  eye:      { c: [0.031, 1.603, 0.07], h: 0.05, w: 0.05, dist: 0.35, elev: 0.0, yaw: 0.12 },
  hands:    { c: [0, 1.25, 0.1], h: 0.60, w: 0.60, dist: 1.6, elev: 0.05, yaw: 0 },
  back:     { c: [0, 1.45, 0.0], h: 0.75, w: 0.6, dist: 1.8, elev: 0.15, yaw: Math.PI },
  top:      { c: [0, 1.62, 0.0], h: 0.36, w: 0.36, dist: 1.0, elev: 0.9, yaw: 0.3 },
  bust3:    { c: [0, 1.45, 0.02], h: 0.75, w: 0.6, dist: 1.8, elev: 0.06, yaw: 0.6 },
};

class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.cur = null;
    this.from = null;
    this.to = null;
    this.t = 1;
    this.yaw = 0;
    this.pitch = 0;
    this.zoom = 1;
    this.set('portrait', true);
  }

  set(name, instant = false) {
    const f = FRAMES[name];
    if (!f) return;
    this.name = name;
    this.from = this.cur ? { ...this.cur } : { ...f };
    this.to = f;
    this.t = instant ? 1 : 0;
    if (instant) this.cur = { ...f };
  }

  /* rect: { W, H, top, bottom } in CSS pixels */
  apply(dt, rect) {
    this.t = Math.min(1, this.t + dt / 1.0);
    const k = easeInOut(this.t);
    const A = this.from, Bf = this.to;
    const mix = (a, b) => (Array.isArray(a) ? a.map((v, i) => lerp(v, b[i], k)) : lerp(a, b, k));
    const f = {};
    for (const key of ['c', 'h', 'w', 'dist', 'elev', 'yaw']) f[key] = mix(A[key], Bf[key]);
    this.cur = f;

    const cam = this.camera;
    const dist = f.dist * this.zoom;
    const yaw = f.yaw + this.yaw, elev = f.elev + this.pitch;
    const c = new THREE.Vector3().fromArray(f.c);
    cam.position.set(
      c.x + dist * Math.sin(yaw) * Math.cos(elev),
      c.y + dist * Math.sin(elev),
      c.z + dist * Math.cos(yaw) * Math.cos(elev)
    );
    cam.lookAt(c);

    const { W, H } = rect;
    const top = rect.top || 0, bottom = rect.bottom || H;
    const hs = Math.max(80, bottom - top);
    const aspect = W / H;
    const tv = Math.max((f.h / 2) / dist * (H / hs), (f.w / 2) / dist / aspect);
    const fov = (2 * Math.atan(tv) * 180) / Math.PI;
    if (Math.abs(cam.fov - fov) > 1e-4 || Math.abs(cam.aspect - aspect) > 1e-6) {
      cam.fov = fov;
      cam.aspect = aspect;
    }
    const centre = (top + bottom) / 2;
    cam.setViewOffset(W, H, 0, H / 2 - centre, W, H);
  }
}
