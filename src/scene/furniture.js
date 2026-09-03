/* ---------------------------------------------------------------------------
 * furniture.js — the furnishing package from page 2 of the schedule.
 *
 *   Kitchen        refrigerator, microwave, cooker, washer/dryer, exhaust hood
 *   Living/Bedroom sofa, center table, dining table with 2 chairs, TV cabinet,
 *                  double bed, mattress, window curtain, decorative chandelier
 *                  and light fittings, nightstand
 *
 * Sanitaryware and joinery (WC, vanity, shower, wardrobe) are part of the
 * built fabric rather than the package, but the plan shows them so they are
 * modelled here too.
 * ------------------------------------------------------------------------- */

function cyl(mat, r, h, cx, cy, cz, seg) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg || 20), mat);
  m.position.set(cx, cy, cz);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function sphere(mat, r, cx, cy, cz, seg) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg || 20, (seg || 20) / 2), mat);
  m.position.set(cx, cy, cz);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/* A soft pillow / cushion: a sphere squashed into a slab. */
function cushion(mat, w, h, d, cx, cy, cz) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 12), mat);
  m.scale.set(w, h, d);
  m.position.set(cx, cy, cz);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/* A hanging drape with sine folds. */
function curtainPanel(mat, x0, x1, yTop, z, folds, amp) {
  const w = x1 - x0;
  const g = new THREE.PlaneGeometry(w, yTop, Math.max(12, Math.round(folds * 6)), 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    // Folds relax slightly towards the rail.
    const taper = 0.35 + 0.65 * ((yTop / 2 - y) / yTop + 0.5);
    p.setZ(i, Math.sin((x / w) * Math.PI * 2 * folds) * amp * taper);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.position.set((x0 + x1) / 2, yTop / 2, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function buildFurniture(scene, M, P) {
  const G = new THREE.Group();
  G.name = 'furniture';
  const parts = {};
  const add = (name, obj) => { parts[name] = obj; G.add(obj); return obj; };

  const { W, D_INT, H } = P;

  /* =====================================================================
   * KITCHEN — the galley run against the east wall
   * ===================================================================== */
  const K = P.kitchen;
  const kitchen = new THREE.Group();
  const kx = W - K.depth;                       // front face of the run
  const kcx = W - K.depth / 2;                  // centre of the run in x

  // Base carcasses and worktop.
  const baseH = K.counterH - K.counterT;
  kitchen.add(box(M.joinery, K.depth, baseH, K.washer.z1 - K.z0,
                  kcx, baseH / 2, (K.z0 + K.washer.z1) / 2));
  kitchen.add(box(M.marble, K.depth + 0.02, K.counterT, K.washer.z1 - K.z0 + 0.02,
                  kcx - 0.01, K.counterH - K.counterT / 2, (K.z0 + K.washer.z1) / 2));

  // Splashback.
  kitchen.add(box(M.marble, 0.012, 0.60, K.washer.z1 - K.z0,
                  W - 0.008, K.counterH + 0.30, (K.z0 + K.washer.z1) / 2));

  // Cabinet door lines, so the run does not read as one solid block.
  for (let z = K.z0 + 0.02; z < K.washer.z0 - 0.05; z += 0.55) {
    const dz = Math.min(0.52, K.washer.z0 - 0.05 - z);
    if (dz < 0.16) break;
    kitchen.add(box(M.joinery, 0.018, baseH - 0.10, dz, kx - 0.008, baseH / 2, z + dz / 2));
    kitchen.add(box(M.metal, 0.02, 0.02, dz * 0.45, kx - 0.03, baseH - 0.14, z + dz / 2));
  }

  // Sink: a recessed basin, drainer grooves and a gooseneck mixer.
  const sinkZ = (K.sink.z0 + K.sink.z1) / 2;
  kitchen.add(box(M.metal, 0.42, 0.16, K.sink.z1 - K.sink.z0 - 0.10,
                  kcx - 0.02, K.counterH - 0.09, sinkZ));
  kitchen.add(box(M.black, 0.38, 0.02, K.sink.z1 - K.sink.z0 - 0.16,
                  kcx - 0.02, K.counterH - 0.16, sinkZ));
  kitchen.add(cyl(M.metal, 0.018, 0.28, W - 0.10, K.counterH + 0.14, sinkZ));
  const spout = cyl(M.metal, 0.015, 0.20, W - 0.19, K.counterH + 0.27, sinkZ);
  spout.rotation.z = Math.PI / 2;
  kitchen.add(spout);

  // Cooker: black glass hob with four burners, and the oven below.
  const hobZ = (K.cooker.z0 + K.cooker.z1) / 2;
  kitchen.add(box(M.screen, 0.52, 0.015, K.cooker.z1 - K.cooker.z0,
                  kcx, K.counterH + 0.008, hobZ));
  for (let a = 0; a < 4; a++) {
    const ox = (a % 2 ? 0.12 : -0.12), oz = (a < 2 ? -0.14 : 0.14);
    kitchen.add(cyl(M.black, 0.075, 0.012, kcx + ox, K.counterH + 0.02, hobZ + oz, 24));
    kitchen.add(cyl(M.metal, 0.052, 0.016, kcx + ox, K.counterH + 0.025, hobZ + oz, 6));
  }
  // Oven front.
  kitchen.add(box(M.black, 0.02, 0.56, K.cooker.z1 - K.cooker.z0 - 0.04,
                  kx - 0.012, 0.44, hobZ));
  kitchen.add(box(M.screen, 0.014, 0.34, K.cooker.z1 - K.cooker.z0 - 0.16,
                  kx - 0.022, 0.44, hobZ));
  kitchen.add(box(M.metal, 0.03, 0.03, K.cooker.z1 - K.cooker.z0 - 0.10,
                  kx - 0.035, 0.76, hobZ));

  // Exhaust hood over the cooker, with a chimney up to the ceiling.
  const hood = new THREE.Group();
  const hoodD = K.cooker.z1 - K.cooker.z0 + 0.06;
  hood.add(box(M.metal, K.depth - 0.06, 0.10, hoodD, kcx, K.hood.y0 + 0.05, hobZ));
  // Canopy, stepped back towards the chimney.
  hood.add(box(M.metal, K.depth - 0.20, 0.18, hoodD - 0.14, kcx + 0.03, K.hood.y0 + 0.19, hobZ));
  hood.add(box(M.metal, 0.24, K.hood.y1 - K.hood.y0 - 0.28 + (H - K.hood.y1),
               0.24, W - 0.16, (K.hood.y0 + 0.28 + H) / 2, hobZ));
  hood.add(box(M.screen, K.depth - 0.10, 0.012, hoodD - 0.06, kcx, K.hood.y0 - 0.004, hobZ));
  add('hood', hood);
  kitchen.add(hood);

  // Washer/dryer under the worktop, with a glass door.
  const wz = (K.washer.z0 + K.washer.z1) / 2;
  kitchen.add(box(M.joinery, 0.02, baseH - 0.06, K.washer.z1 - K.washer.z0 - 0.04,
                  kx - 0.012, baseH / 2, wz));
  const wdoor = cyl(M.screen, 0.17, 0.03, kx - 0.028, baseH / 2, wz, 28);
  wdoor.rotation.z = Math.PI / 2;
  kitchen.add(wdoor);
  const wring = cyl(M.metal, 0.20, 0.02, kx - 0.022, baseH / 2, wz, 28);
  wring.rotation.z = Math.PI / 2;
  kitchen.add(wring);
  kitchen.add(box(M.black, 0.014, 0.05, 0.22, kx - 0.02, baseH - 0.10, wz));
  add('washer', wdoor);

  // Refrigerator, freestanding at the end of the run.
  const fridge = new THREE.Group();
  const F = K.fridge;
  const fcx = W - F.w / 2;
  fridge.add(box(M.metal, F.w, F.h, F.z1 - F.z0, fcx, F.h / 2, (F.z0 + F.z1) / 2));
  // Door split and handles.
  fridge.add(box(M.black, 0.012, 0.02, F.z1 - F.z0, fcx - F.w / 2 - 0.004, F.h * 0.62, (F.z0 + F.z1) / 2));
  fridge.add(box(M.metal, 0.03, 0.60, 0.03, fcx - F.w / 2 - 0.03, F.h * 0.80, F.z0 + 0.10));
  fridge.add(box(M.metal, 0.03, 0.40, 0.03, fcx - F.w / 2 - 0.03, F.h * 0.40, F.z0 + 0.10));
  add('fridge', fridge);
  kitchen.add(fridge);

  // Upper cabinets, clear of the hood.
  kitchen.add(box(M.joinery, 0.34, K.upperY.y1 - K.upperY.y0, K.washer.z1 - K.cooker.z1 - 0.08,
                  W - 0.17, (K.upperY.y0 + K.upperY.y1) / 2, (K.cooker.z1 + K.washer.z1) / 2 + 0.04));

  // Microwave, on an open shelf.
  const micro = new THREE.Group();
  const mz = (K.micro.z0 + K.micro.z1) / 2;
  micro.add(box(M.joinery, 0.36, 0.025, K.micro.z1 - K.micro.z0 + 0.12, W - 0.18, K.micro.y - 0.013, mz));
  micro.add(box(M.black, 0.32, 0.29, K.micro.z1 - K.micro.z0, W - 0.16, K.micro.y + 0.145, mz));
  micro.add(box(M.screen, 0.014, 0.20, K.micro.z1 - K.micro.z0 - 0.16, W - 0.32, K.micro.y + 0.15, mz - 0.03));
  micro.add(box(M.metal, 0.016, 0.03, 0.10, W - 0.325, K.micro.y + 0.15, mz + 0.18));
  add('microwave', micro);
  kitchen.add(micro);

  add('kitchen', kitchen);

  /* =====================================================================
   * BATH — WC, vanity, shower
   * ===================================================================== */
  const B = P.bath;
  const bath = new THREE.Group();

  // WC in the north-west corner.
  bath.add(box(M.porcelain, 0.43, 0.62, 0.18, 0.365, 0.31, B.z0 + 0.11));     // cistern
  bath.add(box(M.porcelain, 0.38, 0.34, 0.52, 0.365, 0.19, B.z0 + 0.46));     // pan
  bath.add(cushion(M.porcelain, 0.36, 0.06, 0.48, 0.365, 0.39, B.z0 + 0.48)); // seat
  bath.add(box(M.metal, 0.11, 0.02, 0.06, 0.365, 0.60, B.z0 + 0.21));         // flush plate

  // Vanity along the north wall, with a basin and a mirror above.
  bath.add(box(M.walnut, 0.76, 0.52, 0.54, 1.10, 0.29, B.z0 + 0.30));
  bath.add(box(M.marble, 0.80, 0.04, 0.58, 1.10, 0.57, B.z0 + 0.30));
  bath.add(cushion(M.porcelain, 0.44, 0.20, 0.34, 1.10, 0.585, B.z0 + 0.32));
  bath.add(cyl(M.metal, 0.016, 0.22, 1.10, 0.70, B.z0 + 0.09));
  const vSpout = cyl(M.metal, 0.013, 0.16, 1.10, 0.80, B.z0 + 0.17);
  vSpout.rotation.x = Math.PI / 2;
  bath.add(vSpout);
  bath.add(box(M.mirror, 0.72, 0.86, 0.02, 1.10, 1.48, B.z0 + 0.021));
  bath.add(box(M.lampshade, 0.46, 0.05, 0.06, 1.10, 1.99, B.z0 + 0.06));

  // Walk-in shower in the south-west, screened with a frameless glass panel.
  const sh = { x0: 0.02, x1: 0.94, z0: 1.02, z1: B.z1 - 0.03 };
  const shcx = (sh.x0 + sh.x1) / 2, shcz = (sh.z0 + sh.z1) / 2;
  bath.add(box(M.marble, sh.x1 - sh.x0, 0.05, sh.z1 - sh.z0, shcx, 0.025, shcz));
  const screen = box(M.glass, 0.016, 2.05, sh.z1 - sh.z0, sh.x1, 1.025, shcz);
  screen.castShadow = false;
  bath.add(screen);
  bath.add(box(M.metal, 0.03, 2.05, 0.035, sh.x1, 1.025, sh.z0));
  bath.add(box(M.metal, 0.035, 0.03, 0.30, sh.x1, 2.03, sh.z0 + 0.20));
  // Rain head on an arm off the west wall.
  const armS = cyl(M.metal, 0.014, 0.30, sh.x0 + 0.16, 2.12, shcz);
  armS.rotation.z = Math.PI / 2;
  bath.add(armS);
  bath.add(cyl(M.metal, 0.11, 0.025, sh.x0 + 0.30, 2.10, shcz, 24));
  bath.add(cyl(M.metal, 0.022, 0.85, sh.x0 + 0.05, 1.15, shcz - 0.28));
  add('bath', bath);

  /* =====================================================================
   * WARDROBE
   * ===================================================================== */
  const Wd = P.wardrobe;
  const wardrobe = new THREE.Group();
  const wdD = Wd.z1 - Wd.z0, wdW = Wd.x1 - Wd.x0;
  wardrobe.add(box(M.walnut, wdW, Wd.h, wdD, (Wd.x0 + Wd.x1) / 2, Wd.h / 2, (Wd.z0 + Wd.z1) / 2));
  // Three full-height fronts facing east, split by shadow gaps. The centre
  // panel is mirrored — dark fronts read as stripes at walk-past distance.
  for (let i = 0; i < 3; i++) {
    const zz = Wd.z0 + 0.03 + (wdD - 0.06) * (i + 0.5) / 3;
    const pd = (wdD - 0.06) / 3 - 0.018;
    wardrobe.add(box(i === 1 ? M.mirror : M.walnut,
                     0.022, Wd.h - 0.08, pd, Wd.x1 + 0.012, Wd.h / 2, zz));
    wardrobe.add(box(M.metal, 0.016, 1.05, 0.016, Wd.x1 + 0.032, 1.30, zz + pd / 2 - 0.05));
  }
  add('wardrobe', wardrobe);

  /* =====================================================================
   * DOUBLE BED + MATTRESS + NIGHTSTAND
   * ===================================================================== */
  const Bd = P.bed;
  const bed = new THREE.Group();
  const bw = Bd.x1 - Bd.x0, bd = Bd.z1 - Bd.z0;
  const bcx = (Bd.x0 + Bd.x1) / 2, bcz = (Bd.z0 + Bd.z1) / 2;

  bed.add(box(M.joineryDark, bw, Bd.h, bd, bcx, Bd.h / 2, bcz));                // base
  bed.add(box(M.walnut, 0.06, 1.05, bd + 0.10, Bd.x0 - 0.03, 0.525, bcz));      // headboard
  const mattress = box(M.bedding, bw - 0.16, 0.26, bd - 0.06, bcx + 0.06, Bd.h + 0.13, bcz);
  bed.add(mattress);
  add('mattress', mattress);
  // Duvet folded back over the foot.
  bed.add(box(M.bedding, bw * 0.60, 0.10, bd - 0.04, Bd.x1 - bw * 0.30, Bd.h + 0.31, bcz));
  bed.add(box(M.throw, 0.42, 0.06, bd - 0.04, Bd.x1 - 0.30, Bd.h + 0.36, bcz));
  // Pillows.
  bed.add(cushion(M.bedding, 0.52, 0.15, 0.40, Bd.x0 + 0.36, Bd.h + 0.31, bcz - 0.32));
  bed.add(cushion(M.bedding, 0.52, 0.15, 0.40, Bd.x0 + 0.36, Bd.h + 0.31, bcz + 0.32));
  add('bed', bed);

  const N = P.nightstand;
  const nightstand = new THREE.Group();
  const ncx = (N.x0 + N.x1) / 2, ncz = (N.z0 + N.z1) / 2;
  nightstand.add(box(M.walnut, N.x1 - N.x0, N.h, N.z1 - N.z0, ncx, N.h / 2, ncz));
  nightstand.add(box(M.metal, 0.02, 0.02, 0.16, N.x1 + 0.008, N.h * 0.62, ncz));
  // Table lamp.
  nightstand.add(cyl(M.brass, 0.05, 0.02, ncx, N.h + 0.01, ncz, 18));
  nightstand.add(cyl(M.brass, 0.012, 0.22, ncx, N.h + 0.12, ncz));
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.10, 0.13, 0.16, 24, 1, true), M.lampshade
  );
  shade.position.set(ncx, N.h + 0.30, ncz);
  nightstand.add(shade);
  add('nightstand', nightstand);

  /* =====================================================================
   * SOFA + CENTER TABLE + RUG
   * ===================================================================== */
  // Built as a real sofa would be: plinth, back, two arms, then loose seat
  // and back cushions. Blobby squashed spheres read as lumps at this scale.
  const S = P.sofa;
  const sofa = new THREE.Group();
  const sd = S.z1 - S.z0;
  const scz = (S.z0 + S.z1) / 2;
  const armT = 0.18, backT = 0.20, seatY = 0.40;

  sofa.add(box(M.sofa, S.x1 - S.x0, seatY - 0.09, sd,
               (S.x0 + S.x1) / 2, (seatY + 0.09) / 2, scz));                  // plinth
  sofa.add(box(M.sofa, backT, 0.48, sd,
               S.x0 + backT / 2, seatY + 0.24, scz));                         // back
  for (const az of [S.z0 + armT / 2, S.z1 - armT / 2]) {                      // arms
    sofa.add(box(M.sofa, S.x1 - S.x0 - backT, 0.22, armT,
                 S.x0 + backT + (S.x1 - S.x0 - backT) / 2, seatY + 0.11, az));
  }

  const seatX0 = S.x0 + backT + 0.02, seatX1 = S.x1 - 0.02;
  const cz0 = S.z0 + armT + 0.02, cz1 = S.z1 - armT - 0.02;
  const cw = (cz1 - cz0 - 0.02) / 2;
  for (let i = 0; i < 2; i++) {
    const zz = cz0 + cw / 2 + i * (cw + 0.02);
    sofa.add(box(M.sofa, seatX1 - seatX0, 0.15, cw,
                 (seatX0 + seatX1) / 2, seatY + 0.075, zz));                  // seat
    sofa.add(box(M.sofa, 0.19, 0.30, cw,
                 S.x0 + backT + 0.10, seatY + 0.30, zz));                     // back cushion
  }

  // Two scatter cushions, set on the diagonal.
  for (const [zz, rot] of [[cz0 + 0.30, 0.42], [cz1 - 0.30, -0.38]]) {
    const c = box(M.throw, 0.10, 0.30, 0.30, S.x0 + backT + 0.20, seatY + 0.24, zz);
    c.rotation.set(0, 0, rot);
    sofa.add(c);
  }

  for (const ox of [0.14, S.x1 - S.x0 - 0.14]) {
    for (const oz of [0.14, sd - 0.14]) {
      sofa.add(cyl(M.brass, 0.018, 0.09, S.x0 + ox, 0.045, S.z0 + oz, 10));
    }
  }
  add('sofa', sofa);

  const C = P.centerTable;
  const centerTable = new THREE.Group();
  const ccx = (C.x0 + C.x1) / 2, ccz = (C.z0 + C.z1) / 2;
  centerTable.add(box(M.marble, C.x1 - C.x0, 0.04, C.z1 - C.z0, ccx, C.h, ccz));
  centerTable.add(box(M.brass, C.x1 - C.x0 - 0.16, 0.03, 0.03, ccx, C.h - 0.30, C.z0 + 0.10));
  centerTable.add(box(M.brass, C.x1 - C.x0 - 0.16, 0.03, 0.03, ccx, C.h - 0.30, C.z1 - 0.10));
  for (const [ox, oz] of [[0.08, 0.08], [0.08, -0.08], [-0.08, 0.08], [-0.08, -0.08]]) {
    centerTable.add(cyl(M.brass, 0.014, C.h - 0.02,
      ccx + (C.x1 - C.x0) / 2 * Math.sign(ox) - ox, (C.h - 0.02) / 2,
      ccz + (C.z1 - C.z0) / 2 * Math.sign(oz) - oz));
  }
  // A low bowl, to break up the tabletop.
  const bowl = new THREE.Mesh(
    new THREE.SphereGeometry(0.10, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.brass
  );
  bowl.rotation.x = Math.PI;
  bowl.position.set(ccx, C.h + 0.11, ccz);
  bowl.castShadow = true;
  centerTable.add(bowl);
  add('centerTable', centerTable);

  const rug = plane(M.rug, 2.20, 1.90, 1.95, 0.006, 6.85);
  add('rug', rug);

  /* =====================================================================
   * TV CABINET + TV
   * ===================================================================== */
  const T = P.tvUnit;
  const tvUnit = new THREE.Group();
  const tcx = W - T.depth / 2, tcz = (T.z0 + T.z1) / 2;
  tvUnit.add(box(M.walnut, T.depth, T.h, T.z1 - T.z0, tcx, T.h / 2 + 0.12, tcz));
  tvUnit.add(box(M.joineryDark, 0.018, T.h - 0.10, (T.z1 - T.z0) / 2 - 0.04,
                 W - T.depth - 0.006, T.h / 2 + 0.12, tcz - (T.z1 - T.z0) / 4));
  tvUnit.add(box(M.joineryDark, 0.018, T.h - 0.10, (T.z1 - T.z0) / 2 - 0.04,
                 W - T.depth - 0.006, T.h / 2 + 0.12, tcz + (T.z1 - T.z0) / 4));
  tvUnit.add(box(M.metal, 0.02, 0.02, 0.24, W - T.depth - 0.02, T.h / 2 + 0.12, tcz - (T.z1 - T.z0) / 4));
  tvUnit.add(box(M.metal, 0.02, 0.02, 0.24, W - T.depth - 0.02, T.h / 2 + 0.12, tcz + (T.z1 - T.z0) / 4));
  for (const oz of [T.z0 + 0.12, T.z1 - 0.12]) {
    tvUnit.add(cyl(M.brass, 0.016, 0.12, tcx, 0.06, oz, 10));
  }
  // Wall-mounted screen above.
  const Tv = P.tv;
  tvUnit.add(box(M.black, 0.05, Tv.y1 - Tv.y0, Tv.z1 - Tv.z0, W - 0.035, (Tv.y0 + Tv.y1) / 2 + 0.35, (Tv.z0 + Tv.z1) / 2));
  tvUnit.add(box(M.screen, 0.012, Tv.y1 - Tv.y0 - 0.04, Tv.z1 - Tv.z0 - 0.04,
                 W - 0.065, (Tv.y0 + Tv.y1) / 2 + 0.35, (Tv.z0 + Tv.z1) / 2));
  add('tvUnit', tvUnit);

  /* =====================================================================
   * DINING TABLE WITH 2 CHAIRS
   * ===================================================================== */
  const Dn = P.dining;
  const dining = new THREE.Group();
  dining.add(box(M.walnut, Dn.w, 0.04, Dn.d, Dn.cx, Dn.h, Dn.cz));
  for (const ox of [-Dn.w / 2 + 0.07, Dn.w / 2 - 0.07]) {
    for (const oz of [-Dn.d / 2 + 0.07, Dn.d / 2 - 0.07]) {
      dining.add(cyl(M.black, 0.018, Dn.h - 0.02, Dn.cx + ox, (Dn.h - 0.02) / 2, Dn.cz + oz, 10));
    }
  }
  const chair = (cz, facing) => {
    const g = new THREE.Group();
    g.add(box(M.joineryDark, 0.44, 0.04, 0.42, 0, 0.45, 0));
    g.add(box(M.joineryDark, 0.44, 0.46, 0.04, 0, 0.68, -0.19));
    for (const ox of [-0.18, 0.18]) for (const oz of [-0.17, 0.17]) {
      g.add(cyl(M.black, 0.014, 0.44, ox, 0.22, oz, 10));
    }
    g.position.set(Dn.cx, 0, cz);
    g.rotation.y = facing;
    return g;
  };
  // Backs face away from the table: the north chair looks south, and vice versa.
  dining.add(chair(Dn.cz - Dn.d / 2 - 0.30, 0));
  dining.add(chair(Dn.cz + Dn.d / 2 + 0.30, Math.PI));
  add('dining', dining);

  /* =====================================================================
   * WINDOW CURTAIN
   * ===================================================================== */
  const curtain = new THREE.Group();
  const cz2 = P.curtain.z;
  curtain.add(curtainPanel(M.curtain, 0.06, 1.00, 2.62, cz2, 5, 0.055));
  curtain.add(curtainPanel(M.curtain, W - 1.00, W - 0.06, 2.62, cz2, 5, 0.055));
  curtain.add(box(M.metal, W - 0.10, 0.03, 0.03, W / 2, 2.66, cz2));
  add('curtain', curtain);

  /* =====================================================================
   * DECORATIVE CHANDELIER + CEILING LIGHT FITTINGS
   * ===================================================================== */
  const Ch = P.chandelier;
  const chandelier = new THREE.Group();
  chandelier.add(cyl(M.brass, 0.13, 0.02, Ch.x, H - 0.01, Ch.z, 24));
  const globes = [
    [0.00, 0.00, 0.70], [0.26, 0.16, 0.50], [-0.24, 0.20, 0.58],
    [0.14, -0.28, 0.40], [-0.18, -0.24, 0.64], [0.30, -0.10, 0.32],
  ];
  for (const [ox, oz, drop] of globes) {
    chandelier.add(cyl(M.brass, 0.004, drop, Ch.x + ox, H - drop / 2, Ch.z + oz, 6));
    const gl = sphere(M.lampshade, 0.065, Ch.x + ox, H - drop - 0.05, Ch.z + oz, 18);
    gl.castShadow = false;
    chandelier.add(gl);
  }
  add('chandelier', chandelier);

  // Recessed downlights.
  const downlights = new THREE.Group();
  const dlPos = [
    [1.20, 1.10], [2.90, 1.10], [1.20, 3.00], [3.10, 3.60],
    [0.90, 4.60], [2.60, 5.40], [1.00, 7.30], [3.10, 7.40], [2.00, 2.20],
  ];
  for (const [x, z] of dlPos) {
    const r = cyl(M.metal, 0.055, 0.02, x, H - 0.012, z, 18);
    r.castShadow = false;
    downlights.add(r);
    const e = cyl(M.lampshade, 0.044, 0.008, x, H - 0.020, z, 18);
    e.castShadow = false;
    downlights.add(e);
  }
  // Balcony soffit lights.
  for (const [x, z] of [[0.90, D_INT + 0.80], [3.00, D_INT + 0.80]]) {
    const e = cyl(M.lampshade, 0.05, 0.01, x, P.H_BAL - 0.015, z, 16);
    e.castShadow = false;
    downlights.add(e);
  }
  add('downlights', downlights);

  /* =====================================================================
   * DRESSING — a couple of small pieces so the rooms read as lived in.
   * ===================================================================== */
  const dressing = new THREE.Group();
  // Planter by the glazing.
  dressing.add(cyl(M.marbleDark, 0.17, 0.36, 3.45, 0.18, 7.55, 20));
  dressing.add(cyl(M.soil, 0.15, 0.04, 3.45, 0.37, 7.55, 16));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, r = 0.10 + (i % 3) * 0.06;
    const bl = new THREE.Mesh(new THREE.PlaneGeometry(0.10, 0.44), M.plant);
    bl.position.set(3.45 + Math.cos(a) * r, 0.62 + (i % 4) * 0.09, 7.55 + Math.sin(a) * r);
    bl.rotation.set(-0.5 + (i % 3) * 0.25, a, 0.3);
    bl.castShadow = true;
    dressing.add(bl);
  }
  // Books on the center table and a tray on the kitchen worktop.
  dressing.add(box(M.throw, 0.22, 0.035, 0.28, ccx - 0.16, C.h + 0.038, ccz + 0.14));
  dressing.add(box(M.joineryDark, 0.20, 0.03, 0.26, ccx - 0.16, C.h + 0.072, ccz + 0.14));
  dressing.add(box(M.walnut, 0.30, 0.02, 0.22, W - 0.32, K.counterH + 0.02, 1.05));
  add('dressing', dressing);

  scene.add(G);
  return { group: G, parts };
}
