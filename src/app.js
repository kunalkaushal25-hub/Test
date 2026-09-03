/* ---------------------------------------------------------------------------
 * app.js — assembles the scene and drives it.
 *
 * Two modes share one code path:
 *   ?render=1   offline — no clock, no UI. tools/render.mjs steps time itself
 *               through window.__renderFrame(t), so the film is deterministic.
 *   default     live — plays on a rAF clock with transport controls and an
 *               explore mode.
 * ------------------------------------------------------------------------- */

const IS_RENDER = new URLSearchParams(location.search).has('render');

const stage = document.getElementById('stage');
const glCanvas = document.getElementById('gl');
const uiCanvas = document.getElementById('ui');
const uiCtx = uiCanvas.getContext('2d');

const renderer = new THREE.WebGLRenderer({
  canvas: glCanvas,
  antialias: true,
  powerPreference: 'high-performance',
  // Offline capture screenshots outside the rAF cycle, so the drawing buffer
  // has to survive until the compositor reads it.
  preserveDrawingBuffer: IS_RENDER,
});
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.05, 2000);

const M = buildMaterials();
const shell = buildShell(scene, M, PLAN);
const furniture = buildFurniture(scene, M, PLAN);
const lighting = buildLighting(scene, renderer, M, PLAN);
const film = buildCamera(PLAN);

/* -------------------------------------------------------------------------
 * Sizing
 * ---------------------------------------------------------------------- */
let VW = 1920, VH = 1080;

function resize() {
  VW = stage.clientWidth;
  VH = stage.clientHeight;
  renderer.setSize(VW, VH, false);
  uiCanvas.width = VW;
  uiCanvas.height = VH;
  camera.aspect = VW / VH;
  camera.updateProjectionMatrix();
}

/* -------------------------------------------------------------------------
 * Frame
 * ---------------------------------------------------------------------- */
function renderFrame(t) {
  t = Math.max(0, Math.min(film.FILM_DURATION, t));

  lighting.setDusk(duskAt(t));

  const shot = explore.active ? null : film.apply(camera, t);

  lighting.setDollhouse(!!(shot && shot.dollhouse) || (explore.active && explore.cutaway));

  const showCeiling = explore.active ? !explore.cutaway : ceilingVisibleAt(t);
  shell.ceiling.visible = showCeiling;
  shell.balconySoffit.visible = showCeiling;
  shell.corridor.visible = !(shot && shot.dollhouse) && !(explore.active && explore.cutaway);

  renderer.render(scene, camera);

  if (explore.active) {
    uiCtx.clearRect(0, 0, VW, VH);
  } else {
    drawOverlay(uiCtx, VW, VH, t, shot, film.FILM_DURATION);
  }
}

window.__renderFrame = renderFrame;
window.__validate = (step) => buildValidator(scene, camera, film)(step);
window.__duration = film.FILM_DURATION;
window.__shots = film.SHOTS.map((s) => ({ id: s.id, t0: s.t0, t1: s.t1, caption: s.caption }));

/* -------------------------------------------------------------------------
 * Explore mode — a compact orbit controller (examples/ is not bundled)
 * ---------------------------------------------------------------------- */
const explore = {
  active: false,
  cutaway: true,
  target: new THREE.Vector3(PLAN.W / 2, 1.1, 4.6),
  theta: -0.6, phi: 1.05, radius: 11.5,
};

function applyExplore() {
  explore.phi = Math.max(0.15, Math.min(Math.PI / 2 + 0.35, explore.phi));
  explore.radius = Math.max(1.2, Math.min(40, explore.radius));
  const { target: c, radius: r, theta, phi } = explore;
  camera.position.set(
    c.x + r * Math.sin(phi) * Math.sin(theta),
    c.y + r * Math.cos(phi),
    c.z + r * Math.sin(phi) * Math.cos(theta)
  );
  camera.lookAt(c);
  if (camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
}

/* -------------------------------------------------------------------------
 * Live playback + transport
 * ---------------------------------------------------------------------- */
if (!IS_RENDER) {
  const bar = document.getElementById('bar');
  const playBtn = document.getElementById('play');
  const scrub = document.getElementById('scrub');
  const timeEl = document.getElementById('time');
  const exploreBtn = document.getElementById('explore');
  const cutBtn = document.getElementById('cut');
  const hint = document.getElementById('hint');

  let playing = true;
  let t = 0;
  let last = performance.now();

  scrub.max = String(film.FILM_DURATION);

  const fmt = (v) => {
    const m = Math.floor(v / 60), s = Math.floor(v % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  function setPlaying(v) {
    playing = v;
    playBtn.textContent = v ? '❚❚' : '▶';
    playBtn.setAttribute('aria-label', v ? 'Pause' : 'Play');
  }

  playBtn.addEventListener('click', () => setPlaying(!playing));

  scrub.addEventListener('input', () => {
    t = Number(scrub.value);
    if (explore.active) toggleExplore(false);
  });

  function toggleExplore(v) {
    explore.active = v;
    exploreBtn.classList.toggle('on', v);
    cutBtn.hidden = !v;
    hint.hidden = !v;
    if (v) { setPlaying(false); applyExplore(); }
    else { renderFrame(t); }
  }
  exploreBtn.addEventListener('click', () => toggleExplore(!explore.active));
  cutBtn.addEventListener('click', () => {
    explore.cutaway = !explore.cutaway;
    cutBtn.classList.toggle('on', explore.cutaway);
  });

  // Pointer drag: rotate, or pan with shift / right button.
  let drag = null;
  stage.addEventListener('pointerdown', (e) => {
    if (!explore.active) return;
    drag = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 2 };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY;
    if (drag.pan) {
      const k = explore.radius * 0.0016;
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
      explore.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
    } else {
      explore.theta -= dx * 0.005;
      explore.phi -= dy * 0.005;
    }
    applyExplore();
  });
  const endDrag = () => { drag = null; };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('contextmenu', (e) => { if (explore.active) e.preventDefault(); });
  stage.addEventListener('wheel', (e) => {
    if (!explore.active) return;
    e.preventDefault();
    explore.radius *= Math.exp(e.deltaY * 0.0012);
    applyExplore();
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.key === ' ') { e.preventDefault(); if (!explore.active) setPlaying(!playing); }
    if (e.key === 'e' || e.key === 'E') toggleExplore(!explore.active);
  });

  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (playing && !explore.active) {
      t += dt;
      if (t >= film.FILM_DURATION) { t = 0; }
      scrub.value = String(t);
    }
    timeEl.textContent = `${fmt(t)} / ${fmt(film.FILM_DURATION)}`;
    renderFrame(t);
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  resize();
  setPlaying(true);
  requestAnimationFrame(loop);
  bar.hidden = false;
} else {
  // Offline render: fixed frame size, driven externally.
  resize();
  renderFrame(0);
}

window.__ready = true;
