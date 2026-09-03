/* ---------------------------------------------------------------------------
 * shell.js — the built fabric: slabs, walls, openings, glazing, balcony,
 * plus the exterior context visible from the balcony.
 *
 * Walls are assembled from box segments around each opening rather than cut
 * with CSG — the plan only has rectangular openings, so piers and lintels are
 * exact and far cheaper to render.
 * ------------------------------------------------------------------------- */

function box(mat, w, h, d, cx, cy, cz) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(cx, cy, cz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function plane(mat, w, d, cx, cy, cz, rotX) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = rotX !== undefined ? rotX : -Math.PI / 2;
  m.position.set(cx, cy, cz);
  m.receiveShadow = true;
  return m;
}

/* A wall running along X (its length is in x, thickness in z). */
function wallX(mat, x0, x1, y0, y1, zc, t) {
  return box(mat, x1 - x0, y1 - y0, t, (x0 + x1) / 2, (y0 + y1) / 2, zc);
}

/* A wall running along Z (its length is in z, thickness in x). */
function wallZ(mat, z0, z1, y0, y1, xc, t) {
  return box(mat, t, y1 - y0, z1 - z0, xc, (y0 + y1) / 2, (z0 + z1) / 2);
}

function buildShell(scene, M, P) {
  const G = new THREE.Group();
  G.name = 'shell';

  const { W, D_INT, D_BAL, D_TOT, H, T_EXT, T_INT } = P;

  /* -- slabs -------------------------------------------------------------- */
  const floor = plane(M.floor, W, D_INT, W / 2, 0, D_INT / 2);
  floor.name = 'floor';
  G.add(floor);

  // Bath is tiled, laid slightly proud of the timber so the joint reads.
  const bathFloor = plane(M.tile, P.bath.x1 - P.bath.x0, P.bath.z1 - P.bath.z0,
                          (P.bath.x0 + P.bath.x1) / 2, 0.004, (P.bath.z0 + P.bath.z1) / 2);
  G.add(bathFloor);

  const balFloor = plane(M.marbleDark, W, D_BAL, W / 2, 0.01, D_INT + D_BAL / 2);
  G.add(balFloor);

  // Ceiling is a separate object so the doll-house shots can lift it away.
  const ceiling = plane(M.ceiling, W, D_INT, W / 2, H, D_INT / 2, Math.PI / 2);
  ceiling.name = 'ceiling';
  ceiling.receiveShadow = false;
  G.add(ceiling);

  const balSoffit = plane(M.ceiling, W, D_BAL, W / 2, P.H_BAL, D_INT + D_BAL / 2, Math.PI / 2);
  balSoffit.name = 'balconySoffit';
  G.add(balSoffit);

  /* -- north wall, with the entry door opening ---------------------------- */
  const zN = -T_EXT / 2;
  G.add(wallX(M.wall, 0, P.entry.x0, 0, H, zN, T_EXT));
  G.add(wallX(M.wall, P.entry.x1, W, 0, H, zN, T_EXT));
  G.add(wallX(M.wall, P.entry.x0, P.entry.x1, P.entry.h, H, zN, T_EXT));

  /* -- east and west exterior walls --------------------------------------- */
  G.add(wallZ(M.wall, 0, D_INT, 0, H, -T_EXT / 2, T_EXT));       // west
  G.add(wallZ(M.wall, 0, D_INT, 0, H, W + T_EXT / 2, T_EXT));    // east

  /* -- south elevation: sliding glazed doors onto the balcony ------------- */
  const sl = P.balcony.slider;
  const zS = D_INT + T_EXT / 2;
  G.add(wallX(M.wall, 0, sl.x0, 0, H, zS, T_EXT));
  G.add(wallX(M.wall, sl.x1, W, 0, H, zS, T_EXT));
  G.add(wallX(M.wall, sl.x0, sl.x1, sl.h, H, zS, T_EXT));

  // Two glazed leaves in an aluminium frame; the west leaf slides open.
  const glazing = new THREE.Group();
  const leafW = (sl.x1 - sl.x0) / 2;
  const mkLeaf = (cx, cz, open) => {
    const g = new THREE.Group();
    const glass = box(M.glass, leafW - 0.08, sl.h - 0.10, 0.012, 0, sl.h / 2, 0);
    glass.castShadow = false;
    g.add(glass);
    const f = M.metal;
    g.add(box(f, 0.05, sl.h, 0.05, -(leafW - 0.05) / 2, sl.h / 2, 0));
    g.add(box(f, 0.05, sl.h, 0.05, (leafW - 0.05) / 2, sl.h / 2, 0));
    g.add(box(f, leafW, 0.05, 0.05, 0, sl.h - 0.025, 0));
    g.add(box(f, leafW, 0.05, 0.05, 0, 0.025, 0));
    // The west leaf slides east to park behind the fixed one, so the opening
    // is on the west side of the aperture.
    g.position.set(cx + (open ? leafW * 0.94 : 0), 0, cz);
    return g;
  };
  glazing.add(mkLeaf(sl.x0 + leafW / 2, D_INT + 0.03, true));   // open leaf
  glazing.add(mkLeaf(sl.x0 + leafW * 1.5, D_INT - 0.03, false));
  glazing.name = 'glazing';
  G.add(glazing);

  // Track and threshold.
  G.add(box(M.metal, sl.x1 - sl.x0, 0.03, 0.16, (sl.x0 + sl.x1) / 2, 0.015, D_INT));

  /* -- balcony ------------------------------------------------------------ */
  G.add(wallZ(M.wall, D_INT, D_TOT, 0, P.H_BAL, -T_EXT / 2, T_EXT));
  G.add(wallZ(M.wall, D_INT, D_TOT, 0, P.H_BAL, W + T_EXT / 2, T_EXT));

  // Glass balustrade with a brushed handrail.
  const balus = box(M.glass, W, P.balcony.railH, 0.015, W / 2, P.balcony.railH / 2, D_TOT - 0.05);
  balus.castShadow = false;
  G.add(balus);
  G.add(box(M.metal, W, 0.05, 0.07, W / 2, P.balcony.railH, D_TOT - 0.05));
  G.add(box(M.marbleDark, W, 0.10, 0.14, W / 2, 0.05, D_TOT - 0.02));

  /* -- bath enclosure ----------------------------------------------------- */
  const B = P.bath;
  // East wall of the bath, with the door opening.
  G.add(wallZ(M.wall, B.z0, B.door.z0, 0, H, B.x1 + T_INT / 2, T_INT));
  G.add(wallZ(M.wall, B.door.z1, B.z1, 0, H, B.x1 + T_INT / 2, T_INT));
  G.add(wallZ(M.wall, B.door.z0, B.door.z1, B.doorH, H, B.x1 + T_INT / 2, T_INT));
  // South wall of the bath.
  G.add(wallX(M.wall, B.x0, B.x1 + T_INT, 0, H, B.z1 + T_INT / 2, T_INT));

  // Tiled linings inside the wet room.
  const tileLining = (w, h, d, cx, cy, cz) => {
    const m = box(M.marble, w, h, d, cx, cy, cz);
    return m;
  };
  G.add(tileLining(B.x1 - B.x0, 2.40, 0.012, (B.x0 + B.x1) / 2, 1.20, B.z0 + 0.008));
  G.add(tileLining(0.012, 2.40, B.z1 - B.z0, B.x0 + 0.008, 1.20, (B.z0 + B.z1) / 2));

  /* -- door leaves --------------------------------------------------------- */
  // Entry door, standing open into the foyer.
  const entryDoor = new THREE.Group();
  const edW = P.entry.x1 - P.entry.x0;
  const leaf = box(M.joinery, edW, P.entry.h, 0.045, edW / 2, P.entry.h / 2, 0);
  entryDoor.add(leaf);
  entryDoor.add(box(M.brass, 0.03, 0.03, 0.14, edW - 0.09, 1.05, 0.08));
  // Hinged on the west jamb and standing almost fully open against the bath
  // partition, matching the swing drawn on the plan.
  entryDoor.position.set(P.entry.x0, 0, 0.02);
  entryDoor.rotation.y = -Math.PI * 0.46;
  G.add(entryDoor);

  // Bath door, ajar.
  const bathDoor = new THREE.Group();
  const bdW = B.door.z1 - B.door.z0;
  bathDoor.add(box(M.joinery, 0.045, B.doorH, bdW, 0, B.doorH / 2, -bdW / 2));
  bathDoor.add(box(M.brass, 0.12, 0.03, 0.03, -0.08, 1.05, -bdW + 0.09));
  // Opens into the bath and parks flat against the partition stub, as drawn.
  bathDoor.position.set(B.x1, 0, B.door.z1);
  bathDoor.rotation.y = Math.PI * 0.5;
  G.add(bathDoor);

  // Door linings.
  const lining = M.joinery;
  G.add(box(lining, 0.06, P.entry.h + 0.06, T_EXT, P.entry.x0 - 0.03, (P.entry.h + 0.06) / 2, zN));
  G.add(box(lining, 0.06, P.entry.h + 0.06, T_EXT, P.entry.x1 + 0.03, (P.entry.h + 0.06) / 2, zN));
  G.add(box(lining, edW + 0.12, 0.06, T_EXT, (P.entry.x0 + P.entry.x1) / 2, P.entry.h + 0.03, zN));

  /* -- skirting ------------------------------------------------------------ */
  const sk = 0.09, skT = 0.018;
  G.add(wallZ(M.skirting, B.z1 + T_INT, D_INT, 0, sk, skT / 2, skT));            // west
  G.add(wallZ(M.skirting, 0, D_INT, 0, sk, W - skT / 2, skT));                   // east
  G.add(wallX(M.skirting, B.x1 + T_INT, W, 0, sk, skT / 2, skT));                // north (foyer)

  /* -- common corridor ----------------------------------------------------- */
  // A short stub of the lobby outside the front door, so the film has an
  // interior to approach the unit from rather than open sky.
  const corridor = new THREE.Group();
  corridor.name = 'corridor';
  const cD = 3.60, cW = 3.40, cH = 2.60;
  const cx0 = W / 2 - cW / 2, cz0 = -T_EXT - cD;
  corridor.add(plane(M.marbleDark, cW, cD, W / 2, 0.0, cz0 + cD / 2));
  corridor.add(plane(M.ceiling, cW, cD, W / 2, cH, cz0 + cD / 2, Math.PI / 2));
  corridor.add(wallZ(M.wall, cz0, -T_EXT, 0, cH, cx0 - 0.05, 0.10));
  corridor.add(wallZ(M.wall, cz0, -T_EXT, 0, cH, cx0 + cW + 0.05, 0.10));
  corridor.add(wallX(M.wall, cx0, cx0 + cW, 0, cH, cz0 - 0.05, 0.10));
  for (const x of [W / 2 - 1.0, W / 2 + 1.0]) {
    const e = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.01, 16), M.lampshade);
    e.position.set(x, cH - 0.012, cz0 + cD * 0.45);
    corridor.add(e);
  }
  corridor.add(box(M.marbleDark, 0.10, 2.30, 0.02, W / 2 + 0.72, 1.55, -T_EXT - 0.012));
  G.add(corridor);

  /* -- exterior context ---------------------------------------------------- */
  const ctx = buildContext(M, P);
  G.add(ctx);

  scene.add(G);
  return {
    group: G,
    ceiling,
    balconySoffit: balSoffit,
    corridor,
    context: ctx,
  };
}

/* The world outside the balcony: a haze-graded ground plane and a scatter of
 * towers, kept deliberately simple — it only ever reads as a soft backdrop. */
function buildContext(M, P) {
  const g = new THREE.Group();
  g.name = 'context';

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshStandardMaterial({ color: 0x8e8578, roughness: 1.0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(P.W / 2, -34, P.D_TOT + 120);
  g.add(ground);

  // Deterministic scatter so every render of the film is identical.
  let seed = 20922;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

  const towerMat = new THREE.MeshStandardMaterial({ color: 0xaab2ba, roughness: 0.55, metalness: 0.15 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x8598a8, roughness: 0.15, metalness: 0.6,
    emissive: 0x203040, emissiveIntensity: 0.35,
  });

  for (let i = 0; i < 46; i++) {
    const h = 18 + rnd() * 92;
    const w = 8 + rnd() * 16;
    const d = 8 + rnd() * 16;
    const ang = (rnd() - 0.5) * 2.2;
    const dist = 95 + rnd() * 380;
    const x = P.W / 2 + Math.sin(ang) * dist;
    const z = P.D_TOT + Math.cos(ang) * dist;
    const t = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), rnd() > 0.45 ? glassMat : towerMat);
    t.position.set(x, h / 2 - 34, z);
    g.add(t);
  }

  return g;
}
