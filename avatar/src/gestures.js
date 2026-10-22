/* ---------------------------------------------------------------------------
 * gestures.js — the gesture library.
 *
 * A gesture is a function of its own clock that fills in a pose: hand
 * targets in chest space (metres from the chest joint at rest, so they ride
 * along when she leans or turns), finger shapes, head and spine offsets, a
 * face, and where to look. The motion controller solves the arms with IK and
 * fades each gesture in and out over its envelope.
 *
 * Chest space: +X her left, +Y up, +Z forward; the chest joint is at
 * (0, 1.24, -0.014), her shoulders at (±0.163, +0.144, -0.018).
 * ------------------------------------------------------------------------- */

/* Finger shapes: curl per finger [index, middle, ring, pinky] (radians at
 * each joint, roughly), spread, and the thumb as [swing, flex]. */
const HAND_SHAPES = {
  relaxed:  { curl: [0.22, 0.28, 0.34, 0.40], spread: 0.04, thumb: [0.10, 0.20] },
  open:     { curl: [0.03, 0.03, 0.05, 0.07], spread: 0.20, thumb: [-0.20, 0.0] },
  flat:     { curl: [0.02, 0.02, 0.03, 0.03], spread: 0.03, thumb: [0.05, 0.05] },
  soft:     { curl: [0.40, 0.48, 0.56, 0.64], spread: 0.06, thumb: [0.20, 0.35] },
  cup:      { curl: [0.55, 0.60, 0.66, 0.72], spread: 0.08, thumb: [0.25, 0.45] },
  fist:     { curl: [1.30, 1.38, 1.40, 1.42], spread: 0.0, thumb: [0.55, 0.95] },
  point:    { curl: [0.02, 1.32, 1.40, 1.42], spread: 0.02, thumb: [0.55, 0.85] },
  thumbsUp: { curl: [1.30, 1.38, 1.40, 1.42], spread: 0.0, thumb: [-0.75, -0.05] },
  peace:    { curl: [0.0, 0.0, 1.38, 1.42], spread: 0.30, thumb: [0.6, 0.95] },
};

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/* Small helpers for authoring. */
const osc = (t, hz, ph = 0) => Math.sin(TAU * hz * t + ph);
const ramp = (t, a, b) => smooth(a, b, t);

const GESTURES = {
  /* Hello: right hand up by her head, palm out, a few easy waves. */
  wave: {
    dur: 2.8, attack: 0.45, release: 0.55, label: 'Wave', icon: '👋',
    fn(t, p) {
      const w = ramp(t, 0.35, 0.6) * (1 - ramp(t, 2.2, 2.6));
      const a = osc(t, 2.1) * w;
      p.armR = {
        pos: V3(-0.225 - 0.012 * a, 0.255, 0.115),
        fingers: V3(-0.12 + 0.42 * a, 1, 0.05), palm: V3(0.05, 0, 1),
        pole: V3(-0.20, -0.65, 0.05), hand: 'open',
      };
      p.head = [0.02, -0.06, -0.07];
      p.chest = [0, -0.05, -0.02];
      p.face = { smile: 0.55, squint: 0.2, browUp: 0.18 };
    },
  },

  nod: {
    dur: 1.5, attack: 0.15, release: 0.3, label: 'Nod', icon: '🙂',
    fn(t, p) {
      const n = Math.max(0, osc(t, 1.6, -Math.PI / 2) * 0.5 + 0.5) * (1 - ramp(t, 1.0, 1.4));
      p.head = [0.16 * n, 0, 0];
      p.neck = [0.05 * n, 0, 0];
      p.face = { smile: 0.4, squint: 0.15 };
    },
  },

  shake: {
    dur: 1.6, attack: 0.15, release: 0.35, label: 'No', icon: '🙅‍♀️',
    fn(t, p) {
      const s = osc(t, 2.2) * (1 - ramp(t, 1.0, 1.45));
      p.head = [0.02, 0.17 * s, 0];
      p.neck = [0, 0.06 * s, 0];
      p.face = { browInner: 0.35, smile: -0.15 };
    },
  },

  /* Thinking: right knuckles to her chin, left forearm across her waist
   * holding the right elbow; eyes drift up and away. */
  think: {
    dur: 3.4, attack: 0.6, release: 0.6, label: 'Think', icon: '🤔',
    fn(t, p) {
      const tap = osc(t, 0.9) * ramp(t, 0.8, 1.2);
      p.armR = {
        pos: V3(-0.040, 0.150 + 0.004 * tap, 0.150),
        fingers: V3(0.30, 0.92, -0.15), palm: V3(0.80, 0.0, -0.60),
        pole: V3(-0.20, -0.45, 0.10), hand: 'soft', twist: 0.5,
      };
      p.armL = {
        pos: V3(-0.060, -0.085, 0.150),
        fingers: V3(-1, 0.05, 0.25), palm: V3(0, 1, 0.1),
        pole: V3(0.30, -0.40, -0.05), hand: 'relaxed',
      };
      p.head = [-0.08, 0.10, -0.10];
      p.gaze = V3(-0.35, 1.95, 1.4);
      p.face = { smile: 0.10, furrow: 0.25, browL: 0.35, smirk: 0.45 };
    },
  },

  /* Talking with her hands: palms up, opening outwards in beats. */
  explain: {
    dur: 2.6, attack: 0.45, release: 0.5, label: 'Explain', icon: '🙌',
    fn(t, p) {
      const b = 0.5 + 0.5 * osc(t, 1.2, -Math.PI / 2);
      for (const [k, key] of [[1, 'armL'], [-1, 'armR']]) {
        p[key] = {
          pos: V3(k * (0.13 + 0.06 * b), -0.105 + 0.01 * b, 0.24),
          fingers: V3(k * (0.35 + 0.25 * b), 0.10, 1), palm: V3(-k * 0.35, 1, 0.1),
          pole: V3(k * 0.35, -0.5, -0.25), hand: 'open',
        };
      }
      p.head = [0.04 * b, 0, 0.03];
      p.face = { smile: 0.4, browUp: 0.2 * b };
    },
  },

  shrug: {
    dur: 2.0, attack: 0.35, release: 0.55, label: 'Shrug', icon: '🤷‍♀️',
    fn(t, p) {
      for (const [k, key] of [[1, 'armL'], [-1, 'armR']]) {
        p[key] = {
          pos: V3(k * 0.235, -0.115, 0.165),
          fingers: V3(k * 0.85, 0.05, 0.55), palm: V3(-k * 0.15, 1, 0.1),
          pole: V3(k * 0.30, -0.50, -0.30), hand: 'open',
        };
      }
      p.shoulderL = [0, 0, 0.13];
      p.shoulderR = [0, 0, -0.13];
      p.head = [0.04, 0, 0.14];
      p.face = { smile: 0.35, browUp: 0.55, smirk: 0.5 };
    },
  },

  laugh: {
    dur: 2.6, attack: 0.25, release: 0.7, label: 'Laugh', icon: '😄',
    fn(t, p) {
      const k = 1 - ramp(t, 1.7, 2.4);
      const bob = Math.abs(osc(t, 3.6)) * k;
      p.armL = {
        pos: V3(0.025, 0.045, 0.125),
        fingers: V3(-0.35, 1, 0.05), palm: V3(0.05, -0.1, -1),
        pole: V3(0.30, -0.35, -0.10), hand: 'flat',
      };
      p.chest = [-0.06 * k + 0.03 * bob, 0, 0];
      p.head = [-0.10 * k + 0.05 * bob, 0.05, 0.06];
      p.shoulderL = [0, 0, 0.04 * bob];
      p.shoulderR = [0, 0, -0.04 * bob];
      p.face = { smile: 1.0, squint: 0.8, jaw: 0.30 + 0.15 * bob, browUp: 0.2 };
    },
  },

  clap: {
    dur: 2.4, attack: 0.4, release: 0.5, label: 'Clap', icon: '👏',
    fn(t, p) {
      const c = ramp(t, 0.4, 0.55) * (1 - ramp(t, 1.9, 2.1));
      const open = 0.5 + 0.5 * Math.cos(TAU * 2.6 * (t - 0.4));
      const gap = lerp(0.07, 0.012 + 0.07 * open, c);
      for (const [k, key] of [[1, 'armL'], [-1, 'armR']]) {
        p[key] = {
          pos: V3(k * gap, 0.035, 0.245),
          fingers: V3(k * 0.05, 0.80, 0.6), palm: V3(-k, 0, 0),
          pole: V3(k * 0.35, -0.55, -0.10), hand: 'flat',
        };
      }
      p.face = { smile: 0.95, squint: 0.45, jaw: 0.12, browUp: 0.25 };
      p.head = [0, 0, 0.03];
    },
  },

  thumbsUp: {
    dur: 2.2, attack: 0.4, release: 0.5, label: 'Thumbs up', icon: '👍',
    fn(t, p) {
      const pump = ramp(t, 0.45, 0.6) * (1 - ramp(t, 0.75, 0.95));
      p.armR = {
        pos: V3(-0.120, 0.035 + 0.02 * pump, 0.235),
        fingers: V3(0.30, 0.05, 1), palm: V3(1, 0, -0.2),
        pole: V3(-0.40, -0.40, -0.10), hand: 'thumbsUp',
      };
      p.head = [0.02, -0.04, -0.06];
      p.face = { smile: 0.85, squint: 0.3, winkL: ramp(t, 0.6, 0.75) * (1 - ramp(t, 1.05, 1.2)) };
    },
  },

  peace: {
    dur: 2.4, attack: 0.45, release: 0.5, label: 'Peace', icon: '✌️',
    fn(t, p) {
      p.armR = {
        pos: V3(-0.145, 0.275, 0.165),
        fingers: V3(-0.12, 1, 0.12), palm: V3(0.05, 0, 1),
        pole: V3(-0.15, -0.70, 0.15), hand: 'peace',
      };
      p.head = [0.02, -0.08, -0.13];
      p.face = { smile: 0.9, squint: 0.3, winkL: ramp(t, 0.55, 0.7) * (1 - ramp(t, 1.4, 1.6)), smirk: 0.3 };
    },
  },

  /* "Have a look at this": points off to her right, glances, back to you. */
  point: {
    dur: 2.6, attack: 0.45, release: 0.55, label: 'Point', icon: '👉',
    fn(t, p) {
      p.armR = {
        pos: V3(-0.345, 0.060, 0.225),
        fingers: V3(-0.70, 0.18, 0.70), palm: V3(0.1, -1, 0.1),
        pole: V3(-0.30, -0.55, -0.20), hand: 'point',
      };
      const away = ramp(t, 0.3, 0.6) * (1 - ramp(t, 1.5, 1.8));
      p.gaze = away > 0.5 ? V3(-1.6, 1.55, 1.6) : null;
      p.head = [0, -0.22 * away, 0.0];
      p.chest = [0, -0.07, 0];
      p.face = { smile: 0.5, browUp: 0.3 };
    },
  },

  /* Tucks her hair behind her left ear, glancing down then back up. */
  hairTuck: {
    dur: 2.6, attack: 0.55, release: 0.7, label: 'Hair', icon: '💁‍♀️',
    fn(t, p) {
      const s = ramp(t, 0.45, 1.25);
      p.armL = {
        pos: V3(lerp(0.098, 0.090, s), lerp(0.300, 0.325, s), lerp(0.095, 0.035, s)),
        fingers: V3(-0.05, lerp(0.85, 0.65, s), lerp(-0.05, -0.75, s)), palm: V3(-1, 0, 0.15),
        pole: V3(0.15, -0.55, 0.55), hand: 'flat', twist: 0.5,
      };
      const down = ramp(t, 0.2, 0.5) * (1 - ramp(t, 1.3, 1.7));
      p.head = [0.12 * down, 0.04, 0.10];
      p.gaze = down > 0.5 ? V3(0.2, 0.9, 1.8) : null;
      p.face = { smile: 0.6, squint: 0.25 };
    },
  },

  /* Open arms, palms up: "welcome". */
  welcome: {
    dur: 2.6, attack: 0.55, release: 0.6, label: 'Welcome', icon: '🤗',
    fn(t, p) {
      for (const [k, key] of [[1, 'armL'], [-1, 'armR']]) {
        p[key] = {
          pos: V3(k * 0.315, -0.040, 0.165),
          fingers: V3(k * 0.95, 0.25, 0.55), palm: V3(-k * 0.1, 0.85, 0.5),
          pole: V3(k * 0.30, -0.55, -0.30), hand: 'open',
        };
      }
      p.chest = [-0.04, 0, 0];
      p.head = [-0.03, 0, 0.06];
      p.face = { smile: 0.85, squint: 0.25, browUp: 0.25 };
    },
  },

  /* A small, polite bow with her hands together at the waist. */
  bow: {
    dur: 2.4, attack: 0.5, release: 0.6, label: 'Greet', icon: '🙇‍♀️',
    fn(t, p) {
      const b = ramp(t, 0.35, 0.9) * (1 - ramp(t, 1.4, 1.95));
      for (const [k, key] of [[1, 'armL'], [-1, 'armR']]) {
        p[key] = {
          pos: V3(k * 0.035, -0.285, 0.135),
          fingers: V3(-k * 0.35, -1, 0.35), palm: V3(-k * 0.3, 0, -1),
          pole: V3(k * 0.3, -0.4, -0.2), hand: 'flat',
        };
      }
      p.spine = [0.10 * b, 0, 0];
      p.chest = [0.12 * b, 0, 0];
      p.head = [0.06 * b, 0, 0];
      p.gaze = b > 0.6 ? V3(0, 0.6, 1.5) : null;
      p.face = { smile: 0.6, squint: 0.2 };
    },
  },

  /* Curious head tilt. */
  tilt: {
    dur: 1.8, attack: 0.35, release: 0.45, label: 'Curious', icon: '🧐',
    fn(t, p) {
      p.head = [-0.02, 0.05, 0.17];
      p.neck = [0, 0.02, 0.05];
      p.face = { smile: 0.45, browL: 0.5, browR: 0.1 };
    },
  },

  /* Hands together over her heart: "thank you". */
  thanks: {
    dur: 2.4, attack: 0.5, release: 0.55, label: 'Thanks', icon: '🙏',
    fn(t, p) {
      const b = ramp(t, 0.5, 0.9) * (1 - ramp(t, 1.5, 1.9));
      for (const [k, key] of [[1, 'armL'], [-1, 'armR']]) {
        p[key] = {
          pos: V3(k * 0.012 + 0.03, 0.030, 0.165),
          fingers: V3(-k * 0.08, 1, 0.12), palm: V3(-k, 0, 0),
          pole: V3(k * 0.30, -0.50, -0.15), hand: 'flat',
        };
      }
      p.head = [0.10 * b, 0, 0.04];
      p.chest = [0.04 * b, 0, 0];
      p.face = { smile: 0.75, squint: 0.35 };
    },
  },

  /* -- quieter ones the controller uses on its own ------------------------ */

  beatR: {
    dur: 1.4, attack: 0.35, release: 0.45, quiet: true,
    fn(t, p) {
      const b = 0.5 + 0.5 * osc(t, 1.4, -Math.PI / 2);
      p.armR = {
        pos: V3(-0.135 - 0.03 * b, -0.130 + 0.02 * b, 0.215),
        fingers: V3(-0.35, 0.15, 1), palm: V3(0.45, 1, 0),
        pole: V3(-0.35, -0.5, -0.25), hand: 'open',
      };
    },
  },
  beatL: {
    dur: 1.4, attack: 0.35, release: 0.45, quiet: true,
    fn(t, p) {
      const b = 0.5 + 0.5 * osc(t, 1.4, -Math.PI / 2);
      p.armL = {
        pos: V3(0.135 + 0.03 * b, -0.130 + 0.02 * b, 0.215),
        fingers: V3(0.35, 0.15, 1), palm: V3(-0.45, 1, 0),
        pole: V3(0.35, -0.5, -0.25), hand: 'open',
      };
    },
  },
  lookAround: {
    dur: 3.2, attack: 0.4, release: 0.6, quiet: true,
    fn(t, p) {
      const side = t < 1.5 ? 1 : -1;
      p.gaze = V3(side * 1.4, 1.75, 1.2);
      p.head = [0, 0.14 * side * ramp(t, 0.2, 0.6), 0.03 * side];
    },
  },
  shift: {
    dur: 3.0, attack: 0.9, release: 0.9, quiet: true,
    fn(t, p) {
      p.hipsPos = [0.018, -0.004, 0];
      p.hips = [0, 0.03, 0.035];
      p.spine = [0, -0.015, -0.03];
      p.head = [0, 0, -0.04];
    },
  },
};

/* What the controller plays by itself, by situation. */
const IDLE_GESTURES = ['lookAround', 'tilt', 'shift', 'hairTuck', 'shift', 'lookAround'];
const BEAT_GESTURES = ['beatR', 'beatL', 'explain', 'beatR', 'nod'];
