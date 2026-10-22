/* ---------------------------------------------------------------------------
 * app.js — assembles Aisha and runs the page.
 *
 *   ?user=John        who she greets (default: John)
 *   ?endpoint=URL     POST { message, history, user } -> { reply, gesture?, mood? }
 *   ?view=half        start framed portrait | half | full
 *   ?q=low            lighter hair and no shadows, for older phones
 *   ?still=1          no clock; tools/avatar-shot.mjs drives window.__still()
 *
 * window.Aisha is the integration surface: say(), gesture(), mood(), view(),
 * and respond — replace it to plug in any assistant.
 * ------------------------------------------------------------------------- */

const PARAMS = new URLSearchParams(location.search);
const STILL = PARAMS.has('still');
const LOW = PARAMS.get('q') === 'low';
const CONFIG = {
  assistant: 'Aisha',
  user: PARAMS.get('user') || 'John',
  endpoint: PARAMS.get('endpoint') || '',
};
if (LOW) HAIR.strands = 950;

const appEl = document.getElementById('app');
const canvas = document.getElementById('gl');
const captionEl = document.getElementById('caption');
const youEl = document.getElementById('you');
const statusEl = document.getElementById('status');
const chipsEl = document.getElementById('chips');
const formEl = document.getElementById('ask');
const msgEl = document.getElementById('msg');
const micEl = document.getElementById('mic');
const muteEl = document.getElementById('mute');
const backEl = document.getElementById('back');
const viewsEl = document.getElementById('views');
const fadeEl = document.getElementById('fade');
const headerEl = document.querySelector('header');
const dockEl = document.getElementById('dock');

/* -- build ------------------------------------------------------------------ */
const { renderer, scene, camera } = buildStage(canvas, { preserve: STILL });
if (LOW) renderer.shadowMap.enabled = false;
const timings = [];
const timed = (label, fn) => { const t = performance.now(); const r = fn(); timings.push(`${label} ${(performance.now() - t).toFixed(0)}ms`); return r; };
const rig = buildSkeleton();
const M = timed('materials', buildMaterials);
scene.add(rig.root);
const head = timed('head', () => buildHead(rig, M));
const body = timed('body', () => buildBody(rig, M));
for (const m of Object.values(body)) scene.add(m);
const hair = timed('hair', () => buildHair(rig, M));
window.__timings = timings;
const face = new FaceController(head);
const motion = new MotionController(rig, face);
const voice = new Voice();
const cam = new CameraRig(camera);

const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
motion.reduced = reduceMotion;

document.getElementById('name').textContent = CONFIG.assistant;

/* -- layout ----------------------------------------------------------------- */
let rect = { W: 1, H: 1, top: 0, bottom: 1 };

function layout() {
  const W = appEl.clientWidth, H = appEl.clientHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LOW ? 1.25 : 2));
  renderer.setSize(W, H, false);
  const top = headerEl.getBoundingClientRect().bottom;
  const dockTop = captionEl.getBoundingClientRect().top;
  rect = { W, H, top: top + 4, bottom: Math.max(top + 120, dockTop + 18) };
  // The fade covers the lower part of her frame and is solid black from the
  // caption down, so the dock reads cleanly over her.
  const fh = (rect.bottom - rect.top) * 0.28;
  const total = H - (rect.bottom - fh);
  fadeEl.style.top = `${rect.bottom - fh}px`;
  fadeEl.style.bottom = '0px';
  fadeEl.style.background = `linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0.75) ${fh * 0.6}px, #000 ${fh}px, #000 ${total}px)`;
}

/* -- the look of her eyes: follow the pointer, settle back on you ----------- */
const gazeHome = new THREE.Vector3();
const gazePointer = new THREE.Vector3();
let pointerAt = -10;
let clock = 0;

function updateGazeHome() {
  gazeHome.copy(camera.position);
}

function pointerToWorld(cx, cy, out) {
  const r = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);
  // Intersect a plane half a metre in front of her face.
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.55);
  return ray.ray.intersectPlane(plane, out) ? out : null;
}

/* -- conversation ------------------------------------------------------------ */
const history = [];
let busy = false;

function setStatus(s) {
  statusEl.dataset.s = s;
  statusEl.querySelector('span').textContent =
    { idle: 'Online', listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking' }[s] || 'Online';
}

function speak(text, { mood = 'warm', gesture = null } = {}) {
  face.setMood(mood);
  face.speaking = true;
  motion.setState('speaking');
  setStatus('speaking');
  if (gesture) motion.play(gesture);
  const spoken = voice.say(text, {
    onCue: (name) => { if (!motion.play(name) && MOODS[name]) face.setMood(name); },
    onEnd: () => {
      face.speaking = false;
      face.viseme = { name: 'rest', k: 0 };
      motion.setState('idle');
      setStatus('idle');
      setTimeout(() => { if (!voice.speaking) face.setMood('neutral'); }, 2500);
    },
  });
  captionEl.textContent = spoken;
  history.push({ role: 'assistant', content: spoken });
  return spoken;
}

async function respond(message) {
  if (CONFIG.endpoint) {
    try {
      const res = await fetch(CONFIG.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history: history.slice(-12), user: CONFIG.user }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { text: data.reply || data.text || '', mood: data.mood, gesture: data.gesture };
    } catch (e) {
      console.warn('assistant endpoint failed, using the built-in replies:', e);
    }
  }
  return localReply(message, CONFIG.user);
}

async function send(message) {
  message = message.trim();
  if (!message || busy) return;
  busy = true;
  voice.stop();
  youEl.textContent = `You: ${message}`;
  youEl.hidden = false;
  history.push({ role: 'user', content: message });
  setStatus('thinking');
  motion.setState('thinking');
  face.setMood('think');
  face.gazeOverride = null;
  const started = performance.now();
  const reply = await Aisha.respond(message);
  // A beat of thought reads as listening rather than as lag.
  const wait = Math.max(0, 650 - (performance.now() - started));
  await new Promise((r) => setTimeout(r, wait));
  busy = false;
  speak(reply.text || "Sorry, I didn't catch that.", { mood: reply.mood || 'warm', gesture: reply.gesture });
}

function greet() {
  speak(`[wave] Hi ${CONFIG.user}, how can I assist you?`, { mood: 'happy' });
}

/* -- public API ------------------------------------------------------------- */
const Aisha = {
  config: CONFIG,
  say: (text, opts) => speak(text, opts),
  gesture: (name) => motion.play(name),
  mood: (name) => face.setMood(name),
  view: (name) => setView(name),
  gestures: () => Object.keys(GESTURES).filter((k) => !GESTURES[k].quiet),
  respond,
  send,
};
window.Aisha = Aisha;

/* -- UI --------------------------------------------------------------------- */
function setView(name) {
  if (!FRAMES[name]) return;
  cam.set(name);
  for (const b of viewsEl.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === name));
  fadeEl.style.opacity = name === 'portrait' ? '1' : '0.35';
}

for (const name of Aisha.gestures()) {
  const g = GESTURES[name];
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip';
  b.innerHTML = `<span aria-hidden="true">${g.icon}</span>${g.label}`;
  b.addEventListener('click', () => { motion.play(name); unlockVoice(); });
  chipsEl.appendChild(b);
}

if (!STILL) {
  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    unlockVoice();
    send(msgEl.value);
    msgEl.value = '';
  });

  let typingTimer = 0;
  msgEl.addEventListener('input', () => {
    if (voice.speaking || busy) return;
    motion.setState('listening');
    face.setMood('listen');
    setStatus('listening');
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      if (!voice.speaking && !busy) { motion.setState('idle'); face.setMood('neutral'); setStatus('idle'); }
    }, 2500);
  });

  muteEl.addEventListener('click', () => {
    voice.enabled = !voice.enabled;
    if (!voice.enabled && voice.synth) voice.synth.cancel();
    muteEl.classList.toggle('off', !voice.enabled);
    muteEl.setAttribute('aria-label', voice.enabled ? 'Turn voice off' : 'Turn voice on');
    muteEl.title = voice.enabled ? 'Voice on' : 'Voice off';
    muteEl.querySelector('.wave').style.display = voice.enabled ? '' : 'none';
  });

  backEl.addEventListener('click', () => {
    voice.stop();
    history.length = 0;
    youEl.hidden = true;
    unlockVoice();
    greet();
  });

  viewsEl.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setView(b.dataset.v);
  });

  // Voice input, where the browser has it and allows it.
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    micEl.hidden = false;
    let rec = null;
    micEl.addEventListener('click', () => {
      if (rec) { rec.stop(); return; }
      try {
        rec = new SR();
        rec.lang = 'en-US';
        rec.interimResults = true;
        motion.setState('listening'); face.setMood('listen'); setStatus('listening');
        rec.onresult = (e) => {
          const r = e.results[e.results.length - 1];
          msgEl.value = r[0].transcript;
          if (r.isFinal) { send(msgEl.value); msgEl.value = ''; }
        };
        rec.onerror = () => { micEl.hidden = true; };
        rec.onend = () => { rec = null; micEl.classList.remove('off'); if (!busy && !voice.speaking) { motion.setState('idle'); setStatus('idle'); } };
        rec.start();
        micEl.classList.add('off');
      } catch (err) {
        micEl.hidden = true;
        rec = null;
      }
    });
  }

  // Pointer: eyes follow; a tap on her gets a reaction; a drag turns her.
  let drag = null;
  canvas.addEventListener('pointermove', (e) => {
    if (pointerToWorld(e.clientX, e.clientY, gazePointer)) pointerAt = clock;
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 6) drag.moved = true;
      cam.yaw = clamp(drag.yaw - dx * 0.006, -0.9, 0.9);
      cam.pitch = clamp(drag.pitch + dy * 0.003, -0.25, 0.35);
    }
  });
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch, moved: false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointerup', (e) => {
    const d = drag;
    drag = null;
    unlockVoice();
    if (!d || d.moved) return;
    // Did the tap land on her?
    const p = pointerToWorld(e.clientX, e.clientY, new THREE.Vector3());
    if (p && Math.abs(p.x) < 0.25 && p.y > 0.9 && p.y < 1.78 && !voice.speaking && !busy) {
      const r = [
        ['[laugh] Hehe, that tickles!', 'happy'],
        ["[wave] Hi! I'm right here.", 'happy'],
        ["[tilt] Yes? I'm all ears.", 'curious'],
        ['[peace] You found me!', 'playful'],
        ['[hairTuck] Oh! You startled me.', 'shy'],
      ][Math.floor(Math.random() * 5)];
      speak(r[0], { mood: r[1] });
    }
  });
  canvas.addEventListener('dblclick', () => { cam.yaw = 0; cam.pitch = 0; });

  window.addEventListener('keydown', (e) => {
    if (document.activeElement === msgEl) return;
    if (e.key === '/') { e.preventDefault(); msgEl.focus(); }
  });
}

/* Browsers keep speech silent until the page has been touched; the first
 * interaction re-speaks nothing, it just stops the voice counting as blocked. */
function unlockVoice() { voice.blocked = false; }

/* -- frame ------------------------------------------------------------------- */
function frame(dt) {
  clock += dt;
  const vis = voice.update(dt);
  face.viseme = { name: vis.name, k: vis.k };
  motion.energy += (vis.energy - motion.energy) * (1 - Math.exp(-10 * dt));

  // Eyes on the pointer while it moves, otherwise on the viewer.
  updateGazeHome();
  face.lookAt(clock - pointerAt < 2.5 ? gazePointer : gazeHome);

  motion.update(dt);
  face.update(dt);
  hair.update(dt, clock);
  cam.apply(dt, rect);
  renderer.render(scene, camera);
}

/* Offline stills for checking by eye: pose a gesture at a moment. */
window.__still = (o = {}) => {
  document.body.classList.toggle('bare', !!o.full);
  layout();
  cam.yaw = o.yaw || 0;
  cam.pitch = o.pitch || 0;
  cam.set(o.view || 'portrait', true);
  if (o.full) rect = { W: rect.W, H: rect.H, top: 0, bottom: rect.H };
  cam.set(o.view || 'portrait', true);
  face.setMood(o.mood || 'neutral');
  face.nextBlink = 99;
  face.blink = 0;
  face.speaking = !!o.viseme;
  face.viseme = o.viseme ? { name: o.viseme, k: 1 } : { name: 'rest', k: 0 };
  motion.layers = [];
  motion.nextIdle = 99;
  if (o.gesture) motion.layers.push({ name: o.gesture, g: GESTURES[o.gesture], t: o.t ?? 1.2 });
  motion.time = o.time || 0;
  face.lookAt(camera.position);
  // Settle the springs: a few frames with the clock held still.
  for (let i = 0; i < 30; i++) {
    cam.apply(0, rect);
    face.lookAt(o.gaze ? new THREE.Vector3().fromArray(o.gaze) : camera.position);
    motion.update(0, true);
    face.update(0.1);
  }
  hair.update(0.016, motion.time);
  cam.apply(0, rect);
  renderer.render(scene, camera);
};

/* CPU cost of one animation step, render excluded. */
window.__perf = (n = 120) => {
  motion.play('wave');
  voice.say('Hello there, how are you doing today?');
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    const vis = voice.update(1 / 60);
    face.viseme = { name: vis.name, k: vis.k };
    motion.update(1 / 60);
    face.update(1 / 60);
    hair.update(1 / 60, i / 60);
  }
  return `animation step: ${((performance.now() - t0) / n).toFixed(2)} ms/frame`;
};

/* The moment a gesture is fully formed, for stills. */
window.__peak = (name) => {
  const g = GESTURES[name];
  return g ? Math.min(g.dur - g.release - 0.05, g.attack + (g.dur - g.attack - g.release) * 0.45) : 0;
};

/* Contact sheets: draw successive stills into one labelled grid. */
window.__sheet = {
  init(cols, rows, cw, ch) {
    this.c = document.createElement('canvas');
    this.c.width = cols * cw; this.c.height = rows * ch;
    this.cols = cols; this.cw = cw; this.ch = ch;
    this.g = this.c.getContext('2d');
    this.g.fillStyle = '#000'; this.g.fillRect(0, 0, this.c.width, this.c.height);
  },
  grab(i, label) {
    const x = (i % this.cols) * this.cw, y = Math.floor(i / this.cols) * this.ch;
    const src = renderer.domElement;
    const s = Math.min(this.cw / src.width, this.ch / src.height);
    const w = src.width * s, h = src.height * s;
    this.g.drawImage(src, x + (this.cw - w) / 2, y + (this.ch - h) / 2, w, h);
    this.g.fillStyle = '#fff'; this.g.font = '600 15px sans-serif';
    this.g.fillText(label, x + 8, y + 20);
  },
  out() { return this.c.toDataURL('image/jpeg', 0.9); },
};

/* -- go ---------------------------------------------------------------------- */
window.addEventListener('resize', layout);
layout();
setView(FRAMES[PARAMS.get('view')] ? PARAMS.get('view') : 'portrait');
cam.set(cam.name, true);
document.getElementById('loading').classList.add('gone');

if (STILL) {
  captionEl.textContent = `Hi ${CONFIG.user}, how can I assist you?`;
  window.__still({});
} else {
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frame(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  setTimeout(greet, 900);
}
window.__ready = true;
