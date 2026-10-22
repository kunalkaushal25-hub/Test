/* ---------------------------------------------------------------------------
 * materials.js — skin, eyes, lips, fabric and the canvas textures behind
 * them. No image files: every texture is drawn here at load.
 * ------------------------------------------------------------------------- */

const PALETTE = {
  skin: [236, 196, 172],
  blush: [228, 150, 136],
  lips: [204, 116, 112],
  lipsInner: [160, 80, 82],
  shadow: [168, 118, 120],     // eyeshadow: a soft mauve
  hair: [128, 84, 50],
  hairTip: [196, 150, 98],
  brow: [92, 62, 42],
  iris: [104, 140, 158],       // grey-blue
  irisInner: [150, 140, 100],  // a warm ring round the pupil
  top: [228, 214, 194],        // cream knit
  blazer: [214, 193, 167],     // sand beige
  trousers: [206, 186, 160],   // the suit's trousers
  shoe: [216, 186, 160],       // nude
  gold: [214, 176, 110],
};

/* Skin: a physical material with a wrapped, red-shifted diffuse terminator.
 * Light bleeding through skin makes the shadow edge warm and soft rather
 * than grey and hard; that one change does most of the "not plastic" work. */
function patchSkin(shader) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <lights_physical_pars_fragment>',
    THREE.ShaderChunk.lights_physical_pars_fragment.replace(
      'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
      `float nlRaw = dot( geometryNormal, directLight.direction );
       vec3 wrapNL = clamp( ( vec3( nlRaw ) + vec3( 0.42, 0.20, 0.14 ) ) / vec3( 1.42, 1.20, 1.14 ), 0.0, 1.0 );
       reflectedLight.directDiffuse += wrapNL * directLight.color * BRDF_Lambert( material.diffuseColor );`
    )
  );
}

function skinMaterial(opts = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.5,
    metalness: 0,
    sheen: 0.35,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(1.0, 0.62, 0.52),
    clearcoat: 0.06,
    clearcoatRoughness: 0.45,
    specularIntensity: 0.55,
    ...opts,
  });
  m.onBeforeCompile = patchSkin;
  m.customProgramCacheKey = () => 'skin';
  return m;
}

function canvasTexture(w, h, draw, { srgb = true, repeat = false } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}

const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const mixc = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));

/* Eyeball texture for a sphere whose pole faces forward. Rows run from the
 * front pole (v = 0) backwards, so the iris and pupil are horizontal bands
 * and the radial fibres are vertical strokes. */
function eyeTexture(iris = PALETTE.iris, inner = PALETTE.irisInner) {
  const rand = mulberry32(7);
  return canvasTexture(512, 512, (g, W, H) => {
    // Sclera: warm white, a little pinker towards the back.
    const sg = g.createLinearGradient(0, 0, 0, H);
    sg.addColorStop(0.0, '#f6f1ec');
    sg.addColorStop(0.35, '#f1e7e2');
    sg.addColorStop(1.0, '#d9aaa6');
    g.fillStyle = sg;
    g.fillRect(0, 0, W, H);

    const irisV = 0.175 * H;   // iris edge, as a fraction of the pole-to-pole span
    const pupilV = 0.060 * H;

    // Iris base, darkening outwards to a limbal ring.
    const ig = g.createLinearGradient(0, 0, 0, irisV);
    ig.addColorStop(0.0, rgb(inner));
    ig.addColorStop(0.42, rgb(mixc(inner, iris, 0.75)));
    ig.addColorStop(0.62, rgb(iris));
    ig.addColorStop(0.86, rgb(mixc(iris, [20, 40, 52], 0.35)));
    ig.addColorStop(1.0, 'rgb(28,36,44)');
    g.fillStyle = ig;
    g.fillRect(0, 0, W, irisV);

    // Fibres: light and dark radial strokes.
    for (let i = 0; i < 900; i++) {
      const x = rand() * W;
      const y0 = pupilV + rand() * (irisV - pupilV) * 0.3;
      const y1 = y0 + (irisV - y0) * (0.4 + rand() * 0.6);
      const light = rand() < 0.5;
      g.strokeStyle = light
        ? `rgba(225,235,230,${0.05 + rand() * 0.12})`
        : `rgba(10,30,40,${0.05 + rand() * 0.14})`;
      g.lineWidth = 0.6 + rand() * 1.4;
      g.beginPath();
      g.moveTo(x, y0);
      g.lineTo(x + (rand() - 0.5) * 6, y1);
      g.stroke();
    }

    // Pupil with a soft edge.
    const pg = g.createLinearGradient(0, 0, 0, pupilV * 1.25);
    pg.addColorStop(0, '#050608');
    pg.addColorStop(0.8, '#07090b');
    pg.addColorStop(1, 'rgba(7,9,11,0)');
    g.fillStyle = pg;
    g.fillRect(0, 0, W, pupilV * 1.25);

    // Soft limbal blur into the sclera.
    const lg = g.createLinearGradient(0, irisV - 4, 0, irisV + 10);
    lg.addColorStop(0, 'rgba(40,50,58,0.55)');
    lg.addColorStop(1, 'rgba(240,232,228,0)');
    g.fillStyle = lg;
    g.fillRect(0, irisV - 4, W, 14);

    // A few fine veins at the back.
    g.strokeStyle = 'rgba(190,80,80,0.18)';
    g.lineWidth = 1;
    for (let i = 0; i < 26; i++) {
      let x = rand() * W, y = H * (0.5 + rand() * 0.5);
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (rand() - 0.5) * 30; y -= rand() * 30;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
}

function eyeMaterial() {
  return new THREE.MeshPhysicalMaterial({
    map: eyeTexture(),
    roughness: 0.32,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    specularIntensity: 0.4,
  });
}

/* Lashes: u along the lid, v outwards from it. A dark liner along v = 0,
 * strands thickening towards the outer corner (u = 1) into a soft wing. */
function lashTexture() {
  const rand = mulberry32(21);
  return canvasTexture(512, 128, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    // Liner.
    const lg = g.createLinearGradient(0, 0, 0, 22);
    lg.addColorStop(0, 'rgba(22,14,12,1)');
    lg.addColorStop(1, 'rgba(22,14,12,0)');
    g.fillStyle = lg;
    g.fillRect(0, 0, W, 22);
    for (let i = 0; i < 230; i++) {
      const u = Math.pow(rand(), 0.8);
      const x = u * W;
      const len = H * (0.45 + 0.5 * u) * (0.75 + rand() * 0.25);
      const lean = (0.15 + 0.55 * u) * len;
      g.strokeStyle = `rgba(18,12,10,${0.75 + rand() * 0.25})`;
      g.lineWidth = 2.6 - 1.4 * rand();
      g.beginPath();
      g.moveTo(x, 2);
      g.quadraticCurveTo(x + lean * 0.3, len * 0.55, x + lean, len);
      g.stroke();
    }
  });
}

/* Brow: feathered hairs, denser at the head of the brow. */
function browTexture() {
  const rand = mulberry32(5);
  return canvasTexture(256, 64, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) {
      const u = rand();
      const x = u * W;
      const y = H * (0.15 + rand() * 0.7);
      const len = 8 + rand() * 10;
      // Hairs at the head of the brow point up; along the arch they lie flat.
      const ang = lerp(-1.25, -0.25, smooth(0.05, 0.45, u)) + (rand() - 0.5) * 0.3;
      const edge = Math.min(1, Math.min(y, H - y) / (H * 0.18));
      g.strokeStyle = `rgba(${PALETTE.brow.join(',')},${(0.4 + rand() * 0.5) * edge})`;
      g.lineWidth = 1.2 + rand() * 1.2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      g.stroke();
    }
  });
}

/* A fine rib knit, as a normal-ish bump pattern baked into a roughness and
 * colour tile. Subtle — it only needs to stop the top reading as plastic. */
function knitTexture() {
  return canvasTexture(256, 256, (g, W, H) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 8) {
      const grd = g.createLinearGradient(x, 0, x + 8, 0);
      grd.addColorStop(0, 'rgba(0,0,0,0.05)');
      grd.addColorStop(0.5, 'rgba(0,0,0,0.0)');
      grd.addColorStop(1, 'rgba(0,0,0,0.05)');
      g.fillStyle = grd;
      g.fillRect(x, 0, 8, H);
    }
    for (let y = 0; y < H; y += 4) {
      g.fillStyle = 'rgba(0,0,0,0.035)';
      g.fillRect(0, y, W, 1);
    }
  }, { repeat: true });
}

/* Twill: fine diagonal ribs, for the suiting. */
function twillTexture() {
  return canvasTexture(256, 256, (g, W, H) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(0,0,0,0.07)';
    g.lineWidth = 1.5;
    for (let i = -H; i < W; i += 5) {
      g.beginPath();
      g.moveTo(i, H);
      g.lineTo(i + H, 0);
      g.stroke();
    }
  }, { repeat: true });
}

function fabricMaterials() {
  const knit = knitTexture();
  knit.repeat.set(10, 10);
  const twill = twillTexture();
  twill.repeat.set(10, 10);
  const blazer = new THREE.MeshPhysicalMaterial({
    color: srgb(...PALETTE.blazer),
    map: twill,
    roughness: 0.78,
    sheen: 0.55,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(1.0, 0.95, 0.88),
    side: THREE.DoubleSide,
  });
  const top = new THREE.MeshPhysicalMaterial({
    color: srgb(...PALETTE.top),
    map: knit,
    roughness: 0.82,
    sheen: 0.8,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color(1, 0.97, 0.92),
  });
  const trousers = new THREE.MeshPhysicalMaterial({
    color: srgb(...PALETTE.trousers),
    map: twill,
    roughness: 0.78,
    sheen: 0.5,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(1.0, 0.95, 0.88),
    side: THREE.DoubleSide,
  });
  const shoe = new THREE.MeshPhysicalMaterial({
    color: srgb(...PALETTE.shoe),
    roughness: 0.38,
    clearcoat: 0.5,
    clearcoatRoughness: 0.3,
  });
  const gold = new THREE.MeshPhysicalMaterial({
    color: srgb(...PALETTE.gold),
    metalness: 1,
    roughness: 0.22,
  });
  return { top, blazer, trousers, shoe, gold };
}

function buildMaterials() {
  const lidTone = srgb(...PALETTE.skin).lerp(srgb(...PALETTE.shadow), 0.40);
  const lashTex = lashTexture();
  const M = {
    skin: skinMaterial(),
    body: skinMaterial(),
    lid: skinMaterial({ vertexColors: false, color: lidTone }),
    eye: eyeMaterial(),
    lash: new THREE.MeshStandardMaterial({
      map: lashTex, color: 0xffffff, transparent: true, alphaTest: 0.04,
      depthWrite: false, side: THREE.DoubleSide, roughness: 0.7,
    }),
    lowLash: new THREE.MeshStandardMaterial({
      map: lashTex, color: 0xffffff, transparent: true, opacity: 0.22, alphaTest: 0.02,
      depthWrite: false, side: THREE.DoubleSide, roughness: 0.7,
    }),
    brow: new THREE.MeshStandardMaterial({
      map: browTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide,
      roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    }),
    lips: (() => {
      const m = new THREE.MeshPhysicalMaterial({
        vertexColors: true, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.25,
        sheen: 0.3, sheenColor: new THREE.Color(1, 0.6, 0.6), sheenRoughness: 0.4,
      });
      m.onBeforeCompile = patchSkin;
      m.customProgramCacheKey = () => 'lips';
      return m;
    })(),
    mouth: new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.6, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    }),
    teeth: new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.35, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    }),
    ...fabricMaterials(),
  };
  return M;
}
