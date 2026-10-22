/* ---------------------------------------------------------------------------
 * motion.js — the body's animation, built fresh every frame from layers:
 *
 *   1. idle      breathing, a slow weight shift, relaxed arms
 *   2. gestures  each with its own clock and fade, solved with arm IK
 *   3. look-at   head and neck turn towards whatever her eyes are on
 *   4. speech    head beats and hand gestures while she talks
 *   5. feet      two-bone IK keeps them planted whatever the hips do
 * ------------------------------------------------------------------------- */

const BODY_PARTS = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'shoulderR'];

function envelope(g, t) {
  if (t < g.attack) return easeInOut(t / g.attack);
  if (t > g.dur - g.release) return 1 - easeInOut((t - (g.dur - g.release)) / g.release);
  return 1;
}

function mixShape(a, b, w) {
  return {
    curl: a.curl.map((c, i) => lerp(c, b.curl[i], w)),
    spread: lerp(a.spread, b.spread, w),
    thumb: [lerp(a.thumb[0], b.thumb[0], w), lerp(a.thumb[1], b.thumb[1], w)],
  };
}

class MotionController {
  constructor(rig, face) {
    this.rig = rig;
    this.B = rig.byName;
    this.face = face;
    this.time = 0;
    this.layers = [];
    this.state = 'idle';
    this.stateT = 0;
    this.energy = 0;
    this.look = { yaw: 0, pitch: 0 };
    this.rand = mulberry32(77);
    this.nextIdle = 7;
    this.nextBeat = 1.0;
    this.nextNod = 2.5;
    this.reduced = false;
    this.feet = {};
    for (const [S] of SIDES) {
      const f = this.B['foot' + S];
      f.updateMatrixWorld(true);
      this.feet[S] = new THREE.Vector3().setFromMatrixPosition(f.matrixWorld);
    }
    // Thumb flex axes, fixed in the thumb's rest frame.
    this.thumbAxis = {};
    for (const [S, k] of SIDES) {
      const d = rig.J[`thumb2${S}`].pos.clone().sub(rig.J[`thumb1${S}`].pos).normalize();
      this.thumbAxis[S] = new THREE.Vector3().crossVectors(d, new THREE.Vector3(-k, 0, 0)).normalize();
    }
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
  }

  /* Start a gesture. A new expressive gesture asks the current one to
   * start letting go, so they cross-fade instead of fighting. */
  play(name) {
    const g = GESTURES[name];
    if (!g) return false;
    if (!g.quiet) {
      for (const l of this.layers) {
        const relAt = l.g.dur - l.g.release;
        if (l.t < relAt) l.t = Math.max(l.t, relAt);
      }
    }
    this.layers.push({ name, g, t: 0 });
    return true;
  }

  get busy() { return this.layers.some((l) => !l.g.quiet && l.t < l.g.dur - l.g.release); }

  setState(s) {
    if (s === this.state) return;
    this.state = s;
    this.stateT = 0;
    if (s === 'speaking') this.nextBeat = 0.4;
    if (s === 'listening') this.nextNod = 1.8;
  }

  /* settle: jump the look-at springs to their targets (for stills). */
  update(dt, settle = false) {
    this.time += dt;
    this.stateT += dt;
    const t = this.time;
    const B = this.B;

    /* -- automatic behaviour by state ------------------------------------ */
    if (this.state === 'speaking') {
      this.nextBeat -= dt;
      if (this.nextBeat <= 0 && !this.busy) {
        this.play(BEAT_GESTURES[Math.floor(this.rand() * BEAT_GESTURES.length)]);
        this.nextBeat = 1.6 + this.rand() * 1.8;
      }
    } else if (this.state === 'listening') {
      this.nextNod -= dt;
      if (this.nextNod <= 0 && !this.busy) { this.play('nod'); this.nextNod = 3.5 + this.rand() * 3; }
    } else if (this.state === 'idle' && !this.reduced) {
      this.nextIdle -= dt;
      if (this.nextIdle <= 0 && !this.busy) {
        this.play(IDLE_GESTURES[Math.floor(this.rand() * IDLE_GESTURES.length)]);
        this.nextIdle = 7 + this.rand() * 8;
      }
    }

    /* -- advance gesture layers ------------------------------------------ */
    const active = [];
    for (const l of this.layers) {
      l.t += dt;
      if (l.t >= l.g.dur) continue;
      const p = {};
      l.g.fn(l.t, p);
      active.push({ l, p, w: envelope(l.g, l.t) });
    }
    this.layers = this.layers.filter((l) => l.t < l.g.dur);

    /* -- body offsets ----------------------------------------------------- */
    for (const b of this.rig.bones) {
      b.quaternion.identity();
      b.position.copy(b.userData.rest);
    }
    const rot = {};
    for (const k of BODY_PARTS) rot[k] = [0, 0, 0];
    const add = (k, v, w = 1) => { rot[k][0] += v[0] * w; rot[k][1] += v[1] * w; rot[k][2] += v[2] * w; };

    // Idle: breathing and a slow, never-quite-repeating sway.
    const breath = Math.sin((TAU * t) / 4.4);
    const sway = fbm1(t * 0.12, 3);
    const twist = fbm1(t * 0.09, 5);
    B.hips.position.x += 0.011 * sway;
    B.hips.position.y -= 0.006;
    add('hips', [0, 0.04 * twist, 0.022 * sway]);
    add('spine', [0.004 * breath, -0.018 * twist, -0.016 * sway]);
    add('chest', [-0.010 * breath, -0.012 * twist, -0.008 * sway]);
    add('shoulderL', [0, 0, 0.012 * breath]);
    add('shoulderR', [0, 0, -0.012 * breath]);
    add('head', [0.03 * fbm1(t * 0.21, 8), 0.04 * fbm1(t * 0.17, 9), 0.025 * fbm1(t * 0.15, 10)]);

    if (this.state === 'listening') {
      const k = smooth(0, 0.6, this.stateT);
      add('chest', [0.03, 0, 0], k);
      add('head', [0.03, 0, 0.07], k);
    }
    if (this.state === 'speaking') {
      add('head', [0.035 * this.energy * Math.sin(t * 7.0), 0.02 * Math.sin(t * 2.3), 0.015 * Math.sin(t * 1.7)]);
    }

    let gazeOverride = null, gazeW = 0;
    const faceOver = {};
    for (const { p, w } of active) {
      for (const k of BODY_PARTS) if (p[k]) add(k, p[k], w);
      if (p.hipsPos) {
        B.hips.position.x += p.hipsPos[0] * w; B.hips.position.y += p.hipsPos[1] * w; B.hips.position.z += p.hipsPos[2] * w;
      }
      if (p.face) for (const k in p.face) faceOver[k] = (faceOver[k] || 0) + p.face[k] * w;
      if (p.gaze && w > gazeW) { gazeOverride = p.gaze; gazeW = w; }
      // Raising a hand above the shoulder lifts the shoulder with it.
      for (const [S, k] of SIDES) {
        const arm = p['arm' + S];
        if (arm) add('shoulder' + S, [0, 0, k * clamp((arm.pos.y - 0.12) * 0.55, 0, 0.09)], w);
      }
    }
    this.face.over = faceOver;
    this.face.gazeOverride = gazeW > 0.5 ? gazeOverride : null;

    // Look-at: the head turns part of the way towards where the eyes go.
    const gz = this.face.gazeOverride || this.face.gaze;
    const hx = gz.x, hy = gz.y - 1.6, hz = Math.max(0.3, gz.z);
    const yawT = clamp(Math.atan2(hx, hz), -0.9, 0.9) * 0.55;
    const pitchT = clamp(-Math.atan2(hy, Math.hypot(hx, hz)), -0.5, 0.5) * 0.5;
    const lk = settle ? 1 : 1 - Math.exp(-5 * dt);
    this.look.yaw += (yawT - this.look.yaw) * lk;
    this.look.pitch += (pitchT - this.look.pitch) * lk;
    add('neck', [this.look.pitch * 0.4, this.look.yaw * 0.4, 0]);
    add('head', [this.look.pitch * 0.6, this.look.yaw * 0.6, 0]);

    for (const k of BODY_PARTS) {
      const r = rot[k];
      B[k].rotation.set(r[0], r[1], r[2], k === 'head' || k === 'neck' ? 'YXZ' : 'XYZ');
    }
    this.rig.root.updateMatrixWorld(true);

    /* -- arms -------------------------------------------------------------- */
    const chestQ = B.chest.getWorldQuaternion(new THREE.Quaternion());
    for (const [S, k] of SIDES) {
      const ua = B['upperArm' + S], fa = B['forearm' + S], hd = B['hand' + S];
      // Relaxed: hanging just off the hip, elbow soft, palm to the thigh.
      ua.rotation.set(-0.05 + 0.012 * breath, 0.0, k * (0.085 + 0.01 * sway * k));
      fa.rotation.set(-0.26, k * 0.20, 0);
      hd.rotation.set(0.05, 0, k * 0.06);
      ua.updateMatrixWorld(true);
      const base = [ua.quaternion.clone(), fa.quaternion.clone(), hd.quaternion.clone()];
      const cur = base.map((q) => q.clone());
      let shape = HAND_SHAPES.relaxed;

      for (const { p, w } of active) {
        const arm = p['arm' + S];
        if (!arm) continue;
        ua.quaternion.copy(base[0]); fa.quaternion.copy(base[1]); hd.quaternion.copy(base[2]);
        ua.updateMatrixWorld(true);
        const target = B.chest.localToWorld(arm.pos.clone());
        const shoulder = new THREE.Vector3().setFromMatrixPosition(ua.matrixWorld);
        const pole = shoulder.clone().add(arm.pole.clone().applyQuaternion(chestQ));
        solveTwoBone(ua, fa, hd, target, pole);
        const handQ = chestQ.clone().multiply(basisQuat(arm.fingers, arm.palm, k));
        orientHand(fa, hd, handQ, arm.twist ?? 0.7);
        cur[0].slerp(ua.quaternion, w);
        cur[1].slerp(fa.quaternion, w);
        cur[2].slerp(hd.quaternion, w);
        shape = mixShape(shape, HAND_SHAPES[arm.hand] || HAND_SHAPES.relaxed, w);
      }
      ua.quaternion.copy(cur[0]); fa.quaternion.copy(cur[1]); hd.quaternion.copy(cur[2]);
      this.applyHand(S, k, shape);
    }

    /* -- feet stay where they are ------------------------------------------ */
    this.rig.root.updateMatrixWorld(true);
    for (const [S] of SIDES) {
      const ul = B['upperLeg' + S], ll = B['lowerLeg' + S], ft = B['foot' + S];
      const hip = new THREE.Vector3().setFromMatrixPosition(ul.matrixWorld);
      solveTwoBone(ul, ll, ft, this.feet[S], hip.clone().add(new THREE.Vector3(0, -0.25, 0.5)));
      ll.getWorldQuaternion(this._q);
      ft.quaternion.copy(this._q.invert());
    }
    this.rig.root.updateMatrixWorld(true);
  }

  applyHand(S, k, shape) {
    const B = this.B;
    FINGERS.forEach((f, i) => {
      const c = shape.curl[i];
      const sp = [1, 0.3, -0.35, -1][i] * shape.spread;
      B[`${f}1${S}`].rotation.set(-sp, 0, -k * c * 0.95);
      B[`${f}2${S}`].rotation.set(0, 0, -k * c * 1.15);
      B[`${f}3${S}`].rotation.set(0, 0, -k * c * 0.75);
    });
    const [swing, flex] = shape.thumb;
    const ax = this.thumbAxis[S];
    const t1 = B[`thumb1${S}`], t2 = B[`thumb2${S}`], t3 = B[`thumb3${S}`];
    t1.rotation.set(swing, 0, 0);
    t1.quaternion.multiply(this._q.setFromAxisAngle(ax, flex * 0.35));
    t2.quaternion.setFromAxisAngle(ax, flex * 0.7);
    t3.quaternion.setFromAxisAngle(ax, flex * 0.6);
  }
}
