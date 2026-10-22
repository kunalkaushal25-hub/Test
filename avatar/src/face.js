/* ---------------------------------------------------------------------------
 * face.js — expressions, blinking, gaze and visemes.
 *
 * Every channel is a target the controller eases towards, so moods,
 * gestures and speech can all write to the face at once without popping:
 * the mood sets a baseline, a gesture adds on top, and the mouth shapes of
 * speech override the jaw and lips.
 * ------------------------------------------------------------------------- */

const MOODS = {
  neutral:  { smile: 0.45, squint: 0.05 },
  warm:     { smile: 0.65, squint: 0.15 },
  happy:    { smile: 0.85, squint: 0.35, browUp: 0.12 },
  laugh:    { smile: 1.0, squint: 0.75, browUp: 0.2, jaw: 0.32 },
  surprise: { smile: 0.15, wide: 0.7, browUp: 0.85, jaw: 0.25 },
  think:    { smile: 0.12, furrow: 0.35, browL: 0.45, browR: -0.05, smirk: 0.5 },
  curious:  { smile: 0.35, browL: 0.6, browR: 0.1 },
  concern:  { smile: 0.0, browInner: 0.75, furrow: 0.2 },
  shy:      { smile: 0.5, squint: 0.25 },
  playful:  { smile: 0.75, squint: 0.2, smirk: 0.6, browL: 0.25 },
  listen:   { smile: 0.32, browUp: 0.12 },
};

/* Mouth shapes: [jaw, narrow, wide] */
const VISEMES = {
  rest: [0.0, 0.0, 0.0],
  aa:   [0.62, 0.0, 0.15],
  ee:   [0.22, 0.0, 0.62],
  ih:   [0.30, 0.0, 0.35],
  oh:   [0.45, 0.55, 0.0],
  oo:   [0.18, 0.95, 0.0],
  mbp:  [0.0, 0.10, 0.0],
  fv:   [0.10, 0.0, 0.20],
  ss:   [0.14, 0.0, 0.38],
  ll:   [0.28, 0.0, 0.15],
};

const FACE_CHANNELS = ['smile', 'squint', 'wide', 'browUp', 'browL', 'browR', 'browInner',
  'furrow', 'smirk', 'jaw', 'narrow', 'mwide', 'winkL', 'winkR'];

class FaceController {
  constructor(head) {
    this.head = head;
    this.cur = {};
    this.mood = 'neutral';
    this.over = {};          // gesture overrides, already weighted
    for (const k of FACE_CHANNELS) this.cur[k] = 0;
    this.viseme = { name: 'rest', k: 0 };
    this.mouthCur = [0, 0, 0];
    this.blink = 0;
    this.nextBlink = 1.2;
    this.blinkT = -1;
    this.doubleBlink = false;
    this.gaze = new THREE.Vector3(0, 1.6, 2);
    this.gazeCur = new THREE.Vector3(0, 1.6, 2);
    this.saccade = new THREE.Vector2();
    this.nextSaccade = 0.6;
    this.gazeOverride = null;
    this.rand = mulberry32(31);
    this.time = 0;
    this.speaking = false;
  }

  setMood(name) { if (MOODS[name]) this.mood = name; }

  /* Look at a world point; the eyes do the work, the head follows. */
  lookAt(v) { this.gaze.copy(v); }

  update(dt, ctx = {}) {
    this.time += dt;
    const base = MOODS[this.mood] || MOODS.neutral;
    const target = {};
    for (const k of FACE_CHANNELS) target[k] = (base[k] || 0) + (this.over[k] || 0);
    if (this.speaking) target.smile = Math.max(0, target.smile - 0.1);

    // Ease each channel; faces move fast in, a little slower out.
    for (const k of FACE_CHANNELS) {
      const a = target[k] > this.cur[k] ? 12 : 7;
      this.cur[k] += (target[k] - this.cur[k]) * (1 - Math.exp(-a * dt));
    }

    // Visemes blend over the mood's own jaw.
    const v = VISEMES[this.viseme.name] || VISEMES.rest;
    for (let i = 0; i < 3; i++) {
      const tgt = v[i] * this.viseme.k;
      this.mouthCur[i] += (tgt - this.mouthCur[i]) * (1 - Math.exp(-22 * dt));
    }

    this.updateBlink(dt);
    this.updateGaze(dt, ctx);
    this.apply();
  }

  updateBlink(dt) {
    this.nextBlink -= dt;
    if (this.blinkT < 0 && this.nextBlink <= 0) {
      this.blinkT = 0;
      this.doubleBlink = this.rand() < 0.15;
      this.nextBlink = 2.0 + this.rand() * 3.8;
    }
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const close = 0.07, hold = 0.03, open = 0.10;
      const t = this.blinkT;
      if (t < close) this.blink = easeInOut(t / close);
      else if (t < close + hold) this.blink = 1;
      else if (t < close + hold + open) this.blink = 1 - easeInOut((t - close - hold) / open);
      else {
        this.blink = 0;
        this.blinkT = -1;
        if (this.doubleBlink) { this.doubleBlink = false; this.nextBlink = 0.12; }
      }
    }
  }

  /* Trigger a blink now (used on big gaze shifts, as people do). */
  blinkNow() { if (this.blinkT < 0) { this.nextBlink = 0; } }

  updateGaze(dt, ctx) {
    this.nextSaccade -= dt;
    if (this.nextSaccade <= 0) {
      // Small fixational jumps keep the eyes alive.
      this.saccade.set((this.rand() - 0.5) * 0.012, (this.rand() - 0.5) * 0.008);
      this.nextSaccade = 0.4 + this.rand() * 1.8;
    }
    const goal = this.gazeOverride || this.gaze;
    const k = 1 - Math.exp(-(ctx.fastGaze ? 30 : 18) * dt);
    this.gazeCur.lerp(goal, k);
  }

  apply() {
    const c = this.cur;
    const h = this.head;
    const [vj, vn, vw] = this.mouthCur;
    const jaw = clamp(Math.max(c.jaw, vj) + Math.min(c.jaw, vj) * 0.3, 0, 1);
    updateMouth(h, {
      jaw,
      smile: clamp(c.smile * (1 - 0.6 * vn), 0, 1.1),
      narrow: clamp(vn + c.narrow, 0, 1),
      wide: clamp(vw + c.mwide + c.wide * 0.2, 0, 1),
      smirk: c.smirk,
    });
    updateBrows(h, {
      up: [c.browUp + c.browL, c.browUp + c.browR],
      inner: [c.browInner, c.browInner],
      furrow: c.furrow,
    });

    // Eyes: aim each ball at the gaze point, lids follow.
    const tmp = new THREE.Vector3();
    h.eyes.forEach((e, i) => {
      e.grp.updateMatrixWorld(true);
      tmp.copy(this.gazeCur);
      e.grp.worldToLocal(tmp);
      let yaw = Math.atan2(tmp.x, tmp.z) + this.saccade.x;
      let pitch = Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)) + this.saccade.y;
      yaw = clamp(yaw, -0.5, 0.5);
      pitch = clamp(pitch, -0.38, 0.32);
      e.ball.rotation.set(-pitch, yaw, 0, 'YXZ');

      const wink = i === 0 ? c.winkL : c.winkR;
      const shut = clamp(Math.max(this.blink, wink), 0, 1);
      const squint = clamp(c.squint + 0.35 * c.smile * c.smile, 0, 1);
      let up = 0.33 + 0.22 * c.wide - 0.10 * squint + 0.55 * pitch;
      let low = 0.44 - 0.20 * squint + 0.16 * c.wide + 0.25 * Math.max(0, -pitch);
      up = clamp(up, 0.05, LID_OPEN_MAX.up - 0.02);
      low = clamp(low, 0.12, LID_OPEN_MAX.low - 0.02);
      e.upper.rotation.x = -lerp(up, -0.16, shut);
      e.lower.rotation.x = lerp(low, 0.24, shut);
    });
  }
}
