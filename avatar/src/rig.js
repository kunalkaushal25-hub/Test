/* ---------------------------------------------------------------------------
 * rig.js — the skeleton, and the two-bone IK the gestures are authored in.
 *
 * The character stands at the origin facing +Z, 1.70 m tall, in a relaxed
 * A-pose. Every bone's rest rotation is the identity, so a bone's local axes
 * are the world axes at rest: rotating an arm about Z swings it out to the
 * side, about X swings it forwards. Her left is +X.
 * ------------------------------------------------------------------------- */

const SIDES = [['L', 1], ['R', -1]];
const FINGERS = ['index', 'middle', 'ring', 'pinky'];

/* Finger layout relative to the wrist, for the left hand (mirror x for the
 * right). At rest the hand hangs with the palm facing the thigh (-X) and the
 * thumb forwards (+Z). [z offset, knuckle drop, phalanx lengths, radius] */
const FINGER_LAYOUT = {
  index:  { z: 0.0235, y: -0.086, len: [0.037, 0.022, 0.019], r: 0.0082 },
  middle: { z: 0.0075, y: -0.089, len: [0.040, 0.025, 0.020], r: 0.0085 },
  ring:   { z: -0.0085, y: -0.086, len: [0.037, 0.024, 0.019], r: 0.0079 },
  pinky:  { z: -0.0235, y: -0.079, len: [0.029, 0.018, 0.017], r: 0.0069 },
};

/* Thumb chain from the wrist: CMC, MCP, IP and the tip (left hand). */
const THUMB_LAYOUT = [
  [-0.0075, -0.022, 0.016],
  [-0.0140, -0.047, 0.033],
  [-0.0170, -0.067, 0.041],
  [-0.0185, -0.086, 0.047],
];

function jointTable() {
  const J = {};
  const add = (name, parent, x, y, z) => {
    J[name] = { name, parent, pos: new THREE.Vector3(x, y, z) };
    return J[name];
  };
  add('hips', null, 0, 0.98, 0);
  add('spine', 'hips', 0, 1.09, -0.006);
  add('chest', 'spine', 0, 1.24, -0.014);
  add('neck', 'chest', 0, 1.432, -0.03);
  add('head', 'neck', 0, 1.527, -0.014);

  for (const [S, k] of SIDES) {
    add('shoulder' + S, 'chest', 0.024 * k, 1.405, -0.022);
    add('upperArm' + S, 'shoulder' + S, 0.163 * k, 1.384, -0.032);
    add('forearm' + S, 'upperArm' + S, 0.193 * k, 1.118, -0.048);
    const w = add('hand' + S, 'forearm' + S, 0.210 * k, 0.884, -0.024).pos;

    for (const f of FINGERS) {
      const L = FINGER_LAYOUT[f];
      let y = w.y + L.y;
      let parent = 'hand' + S;
      for (let i = 0; i < 3; i++) {
        add(`${f}${i + 1}${S}`, parent, w.x, y, w.z + L.z);
        parent = `${f}${i + 1}${S}`;
        y -= L.len[i];
      }
    }
    let parent = 'hand' + S;
    for (let i = 0; i < 3; i++) {
      const o = THUMB_LAYOUT[i];
      add(`thumb${i + 1}${S}`, parent, w.x + o[0] * k, w.y + o[1], w.z + o[2]);
      parent = `thumb${i + 1}${S}`;
    }

    add('upperLeg' + S, 'hips', 0.088 * k, 0.93, 0.0);
    add('lowerLeg' + S, 'upperLeg' + S, 0.092 * k, 0.505, 0.008);
    add('foot' + S, 'lowerLeg' + S, 0.095 * k, 0.082, -0.026);
    add('toes' + S, 'foot' + S, 0.100 * k, 0.018, 0.104);
  }
  return J;
}

/* Fingertip positions (not bones) for the geometry. */
function fingerTip(J, f, S) {
  const L = FINGER_LAYOUT[f];
  const p = J[`${f}3${S}`].pos.clone();
  p.y -= L.len[2];
  return p;
}

function thumbTip(J, S) {
  const k = S === 'L' ? 1 : -1;
  const w = J['hand' + S].pos;
  const o = THUMB_LAYOUT[3];
  return new THREE.Vector3(w.x + o[0] * k, w.y + o[1], w.z + o[2]);
}

function buildSkeleton() {
  const J = jointTable();
  const names = Object.keys(J);
  const bones = [];
  const byName = {};
  const index = {};
  for (const name of names) {
    const b = new THREE.Bone();
    b.name = name;
    byName[name] = b;
    index[name] = bones.length;
    bones.push(b);
  }
  for (const name of names) {
    const j = J[name];
    const b = byName[name];
    if (j.parent) {
      b.position.copy(j.pos).sub(J[j.parent].pos);
      byName[j.parent].add(b);
    } else {
      b.position.copy(j.pos);
    }
    b.userData.rest = b.position.clone();
  }
  const root = byName.hips;
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  return { J, bones, byName, index, root, skeleton };
}

/* -------------------------------------------------------------------------
 * Two-bone IK
 *
 * Solves upper/lower so the end joint reaches `target` (world), bending
 * towards `pole`. Rotations are applied as swings from each bone's current
 * orientation, which keeps the twist the parent hands down — the natural
 * choice for arms that start from an authored pose.
 * ---------------------------------------------------------------------- */
const _ik = {
  s: new THREE.Vector3(), e: new THREE.Vector3(), w: new THREE.Vector3(),
  d: new THREE.Vector3(), m: new THREE.Vector3(), el: new THREE.Vector3(),
  cur: new THREE.Vector3(), want: new THREE.Vector3(),
  q: new THREE.Quaternion(), pq: new THREE.Quaternion(), pqi: new THREE.Quaternion(),
};

function swingBoneTo(bone, childWorld, wantDir) {
  const { cur, q, pq, pqi } = _ik;
  bone.updateMatrixWorld(true);
  const bw = new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
  cur.copy(childWorld).sub(bw).normalize();
  q.setFromUnitVectors(cur, wantDir);
  // world swing -> local: q_local' = parent^-1 * q * parent * q_local
  bone.parent.getWorldQuaternion(pq);
  pqi.copy(pq).invert();
  bone.quaternion.premultiply(pq).premultiply(q).premultiply(pqi);
  bone.updateMatrixWorld(true);
}

function solveTwoBone(upper, lower, end, target, pole) {
  const { s, e, w, d, m, el, want } = _ik;
  upper.updateMatrixWorld(true);
  s.setFromMatrixPosition(upper.matrixWorld);
  e.setFromMatrixPosition(lower.matrixWorld);
  w.setFromMatrixPosition(end.matrixWorld);
  const a = s.distanceTo(e);
  const b = e.distanceTo(w);

  d.copy(target).sub(s);
  let dist = d.length();
  dist = clamp(dist, Math.abs(a - b) + 1e-4, (a + b) * 0.9995);
  d.normalize();

  // Elbow: on the circle around d, on the pole's side.
  const cosA = clamp((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  m.copy(pole).sub(s);
  m.addScaledVector(d, -m.dot(d));
  if (m.lengthSq() < 1e-10) m.set(0, 0, -1).addScaledVector(d, -d.z);
  m.normalize();
  el.copy(s).addScaledVector(d, a * cosA).addScaledVector(m, a * sinA);

  swingBoneTo(upper, e, want.copy(el).sub(s).normalize());
  e.setFromMatrixPosition(lower.matrixWorld);
  w.setFromMatrixPosition(end.matrixWorld);
  const tgt = new THREE.Vector3().copy(s).addScaledVector(d, dist);
  swingBoneTo(lower, w, want.copy(tgt).sub(e).normalize());
}

/* Rotate `bone` so that, in world space, its hand basis matches the wanted
 * one. Rest basis for the hand: fingers -Y, palm normal -X*side (inwards),
 * thumb side +Z. */
function handRestBasis(side) {
  const fingers = new THREE.Vector3(0, -1, 0);
  const palm = new THREE.Vector3(-side, 0, 0);
  const thumb = new THREE.Vector3().crossVectors(palm, fingers).multiplyScalar(side);
  return new THREE.Matrix4().makeBasis(fingers, palm, thumb);
}

function basisQuat(fingers, palm, side) {
  const f = fingers.clone().normalize();
  const p = palm.clone().addScaledVector(f, -palm.dot(f)).normalize();
  const t = new THREE.Vector3().crossVectors(p, f).multiplyScalar(side);
  const m = new THREE.Matrix4().makeBasis(f, p, t);
  const r = handRestBasis(side);
  // world = m * r^-1  (r is orthonormal, so its inverse is its transpose)
  m.multiply(r.clone().transpose());
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

const _tw = {
  fq: new THREE.Quaternion(), rel: new THREE.Quaternion(), tw: new THREE.Quaternion(),
  ax: new THREE.Vector3(),
};

/* Point the hand at a world orientation, handing `twistShare` of the roll to
 * the forearm so the wrist doesn't wring like a candy wrapper. */
function orientHand(forearm, hand, worldQ, twistShare = 0.7) {
  const { fq, rel, tw, ax } = _tw;
  forearm.updateMatrixWorld(true);
  forearm.getWorldQuaternion(fq);
  rel.copy(fq).invert().multiply(worldQ);
  ax.copy(hand.userData.rest).normalize();
  const proj = rel.x * ax.x + rel.y * ax.y + rel.z * ax.z;
  tw.set(ax.x * proj, ax.y * proj, ax.z * proj, rel.w);
  if (tw.lengthSq() < 1e-12) tw.identity(); else tw.normalize();
  tw.slerp(_qI, 1 - twistShare);
  forearm.quaternion.multiply(tw);
  forearm.updateMatrixWorld(true);
  forearm.getWorldQuaternion(fq);
  hand.quaternion.copy(fq).invert().multiply(worldQ);
  hand.updateMatrixWorld(true);
}

const _qI = new THREE.Quaternion();
