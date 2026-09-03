/* ---------------------------------------------------------------------------
 * lighting.js — daylight through the balcony, a procedural sky, and the
 * interior practicals.
 *
 * One shadow-casting light (the sun) keeps the render affordable under
 * software rasterisation; the practicals are unshadowed fill.
 * ------------------------------------------------------------------------- */

const SKY_VERT = `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = `
  uniform vec3 uTop, uHorizon, uBottom, uSunColor;
  uniform vec3 uSunDir;
  uniform float uSunSize;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = h > 0.0
      ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55))
      : mix(uHorizon, uBottom, pow(clamp(-h, 0.0, 1.0), 0.40));
    // Sun disc with a broad glow.
    float ca = dot(d, normalize(uSunDir));
    col += uSunColor * pow(clamp(ca, 0.0, 1.0), 900.0) * 12.0 * uSunSize;
    col += uSunColor * pow(clamp(ca, 0.0, 1.0), 14.0) * 0.30;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* Equirectangular sky used to light the room, baked once through PMREM. */
function skyEnvTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.00, '#4d7fc4');
  grad.addColorStop(0.42, '#a8c6e4');
  grad.addColorStop(0.52, '#e8dcc8');
  grad.addColorStop(1.00, '#6d6155');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);
  // A soft sun lobe so reflections have somewhere to catch.
  const sg = g.createRadialGradient(360, 108, 2, 360, 108, 70);
  sg.addColorStop(0, 'rgba(255,246,220,1)');
  sg.addColorStop(1, 'rgba(255,246,220,0)');
  g.fillStyle = sg;
  g.fillRect(290, 38, 140, 140);
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* Colour grades the film moves between. */
const GRADE_DAY = {
  top: [0.20, 0.42, 0.78], horizon: [0.72, 0.81, 0.90], bottom: [0.47, 0.45, 0.43],
  sun: [1.00, 0.96, 0.88], sunSize: 1.0,
  sunDir: [0.42, 0.40, 0.82], sunI: 2.5, hemiI: 0.72,
  hemiSky: 0xbcd4f2, hemiGround: 0x9c8a72,
  practical: 0.40, exposure: 0.88, fog: [0.78, 0.84, 0.90], fogD: 0.0016,
};

const GRADE_DUSK = {
  top: [0.10, 0.15, 0.36], horizon: [0.94, 0.56, 0.32], bottom: [0.22, 0.18, 0.19],
  sun: [1.00, 0.62, 0.34], sunSize: 1.5,
  sunDir: [0.60, 0.10, 0.79], sunI: 1.2, hemiI: 0.34,
  hemiSky: 0x5c6a92, hemiGround: 0x4a3a30,
  practical: 1.60, exposure: 1.00, fog: [0.42, 0.34, 0.36], fogD: 0.0030,
};

function mix3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
const mix1 = (a, b, t) => a + (b - a) * t;

function buildLighting(scene, renderer, M, P) {
  const { W, D_INT, D_TOT, H } = P;

  /* -- image-based lighting ------------------------------------------------ */
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envTex = skyEnvTexture();
  const envRT = pmrem.fromEquirectangular(envTex);
  scene.environment = envRT.texture;
  envTex.dispose();
  pmrem.dispose();

  /* -- sky dome ------------------------------------------------------------ */
  const skyUniforms = {
    uTop: { value: new THREE.Vector3() },
    uHorizon: { value: new THREE.Vector3() },
    uBottom: { value: new THREE.Vector3() },
    uSunColor: { value: new THREE.Vector3() },
    uSunDir: { value: new THREE.Vector3(0.4, 0.4, 0.8) },
    uSunSize: { value: 1.0 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(600, 32, 20),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, fog: false,
    })
  );
  sky.name = 'sky';
  scene.add(sky);

  scene.fog = new THREE.FogExp2(0xc4d2de, 0.0016);

  /* -- sun ----------------------------------------------------------------- */
  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  const s = 8;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.022;
  sun.target.position.set(W / 2, 1.0, D_INT * 0.55);
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xbcd4f2, 0x9c8a72, 0.72);
  scene.add(hemi);

  // A dim bounce from the balcony back into the room, so the deep end of the
  // plan does not go flat black under software rendering.
  const bounce = new THREE.DirectionalLight(0xdfe8f2, 0.35);
  bounce.position.set(W / 2, 0.6, D_TOT);
  bounce.target.position.set(W / 2, 1.6, 0);
  scene.add(bounce);
  scene.add(bounce.target);

  /* -- interior practicals ------------------------------------------------- */
  const practicals = [];
  const practical = (color, intensity, dist, x, y, z) => {
    const l = new THREE.PointLight(color, intensity, dist, 2.0);
    l.position.set(x, y, z);
    scene.add(l);
    practicals.push({ light: l, base: intensity });
    return l;
  };
  practical(0xffd9a8, 12.0, 7.0, P.chandelier.x, H - P.chandelier.drop - 0.05, P.chandelier.z);
  practical(0xffe6c4, 6.0, 4.5, W - 0.55, 2.10, 1.10);          // kitchen
  practical(0xffeed6, 5.0, 4.0, 0.95, 2.55, 1.00);              // bath
  practical(0xffcf96, 4.5, 3.0, 0.32, 1.02, 5.75);              // bedside lamp
  practical(0xffe8cc, 5.0, 4.5, 2.55, 2.60, 1.60);              // foyer
  practical(0xffe8cc, 6.0, 5.5, 1.40, 2.60, 4.60);              // sleeping zone
  practical(0xffe8cc, 5.0, 5.0, 3.00, 2.60, 7.20);              // living
  practical(0xffe0bc, 5.0, 4.5, W / 2, P.H_BAL - 0.25, D_INT + 0.85); // balcony

  // With the ceiling lifted for the doll-house shots the room loses its
  // bounce, so it gets a dedicated top-down fill that is off the rest of time.
  const dollFill = new THREE.DirectionalLight(0xeef4ff, 0.0);
  dollFill.position.set(W / 2, 22, D_INT * 0.5);
  dollFill.target.position.set(W / 2, 0, D_INT * 0.5);
  scene.add(dollFill);
  scene.add(dollFill.target);

  const state = { sky, sun, hemi, bounce, practicals, dollFill, uniforms: skyUniforms };
  state.setDollhouse = (on) => { dollFill.intensity = on ? 1.05 : 0.0; };

  /* dusk: 0 = midday, 1 = golden hour */
  state.setDusk = (t) => {
    t = Math.min(1, Math.max(0, t));
    const A = GRADE_DAY, B = GRADE_DUSK;
    const top = mix3(A.top, B.top, t);
    const hor = mix3(A.horizon, B.horizon, t);
    const bot = mix3(A.bottom, B.bottom, t);
    const sc = mix3(A.sun, B.sun, t);
    const sd = mix3(A.sunDir, B.sunDir, t);
    const fog = mix3(A.fog, B.fog, t);

    skyUniforms.uTop.value.set(top[0], top[1], top[2]);
    skyUniforms.uHorizon.value.set(hor[0], hor[1], hor[2]);
    skyUniforms.uBottom.value.set(bot[0], bot[1], bot[2]);
    skyUniforms.uSunColor.value.set(sc[0], sc[1], sc[2]);
    skyUniforms.uSunDir.value.set(sd[0], sd[1], sd[2]).normalize();
    skyUniforms.uSunSize.value = mix1(A.sunSize, B.sunSize, t);

    sun.color.setRGB(sc[0], sc[1], sc[2]);
    sun.intensity = mix1(A.sunI, B.sunI, t);
    sun.position.set(
      W / 2 + sd[0] * 26,
      Math.max(1.2, sd[1] * 26),
      D_INT * 0.55 + sd[2] * 26
    );

    hemi.intensity = mix1(A.hemiI, B.hemiI, t);
    hemi.color.setHex(t < 0.5 ? A.hemiSky : B.hemiSky);
    hemi.groundColor.setHex(t < 0.5 ? A.hemiGround : B.hemiGround);
    bounce.intensity = mix1(0.35, 0.16, t);

    const p = mix1(A.practical, B.practical, t);
    for (const q of practicals) q.light.intensity = q.base * p;

    // Emissive fittings glow harder as the daylight drops.
    M.lampshade.emissiveIntensity = mix1(0.55, 2.20, t);

    scene.fog.color.setRGB(fog[0], fog[1], fog[2]);
    scene.fog.density = mix1(A.fogD, B.fogD, t);
    renderer.toneMappingExposure = mix1(A.exposure, B.exposure, t);
  };

  state.setDusk(0);
  return state;
}
