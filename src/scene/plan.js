/* ---------------------------------------------------------------------------
 * plan.js — metric floor plan for Serenz, Apartment A 922, Type: STUDIO
 *
 * This is the single source of truth for the model. Every wall, opening and
 * piece of furniture is derived from the numbers below, so correcting a
 * dimension here corrects the whole build.
 *
 * Coordinate system (right-handed, metres):
 *   +X  east   — across the unit, 0 at the west (left) inner wall face
 *   +Z  south  — down the plan, 0 at the north (entry) inner wall face
 *   +Y  up     — 0 at finished floor level
 *
 * The supplied drawing carries no printed dimensions, so the overall envelope
 * was scaled from the drawing's own proportions (270 x 692 px at the unit
 * outline) against a typical Danube studio envelope. That gives 3.90 m x
 * 10.00 m overall — about 420 sqft with the balcony, 336 sqft internal.
 * ------------------------------------------------------------------------- */

const PLAN = {
  meta: {
    project: 'Serenz',
    unit: 'A 922',
    type: 'Studio',
  },

  // ---- overall envelope ---------------------------------------------------
  W: 3.90,        // interior width  (x: 0 .. W)
  D_INT: 8.00,    // interior depth  (z: 0 .. D_INT), glazing line at D_INT
  D_BAL: 2.00,    // balcony depth   (z: D_INT .. D_INT + D_BAL)
  H: 2.90,        // finished ceiling height
  H_BAL: 2.90,    // balcony soffit height

  T_EXT: 0.20,    // exterior wall thickness
  T_INT: 0.10,    // interior partition thickness
  T_SLAB: 0.30,   // slab thickness shown on the cutaway

  // ---- bath (north-west) --------------------------------------------------
  // Drawing: x 262..395 px, y 355..490 px  ->  1.92 m x 1.95 m
  bath: {
    x0: 0.00, x1: 1.92,
    z0: 0.00, z1: 1.95,
    door: { z0: 0.90, z1: 1.70 },   // opening in the bath's east wall (x = x1)
    doorH: 2.10,
  },

  // ---- entry (north wall) -------------------------------------------------
  // Drawing: door leaf x 400..465 px -> 2.00 .. 2.90 m
  entry: {
    x0: 2.00, x1: 2.90,
    h: 2.10,
  },

  // ---- pantry / kitchen (north-east, galley run against the east wall) ----
  // Drawing: counter run x 470..520 px, y 355..578 px
  kitchen: {
    depth: 0.60,                    // counter depth off the east wall
    counterH: 0.90,
    counterT: 0.04,
    z0: 0.15, z1: 2.55,             // worktop run
    sink:   { z0: 0.30, z1: 1.00 },
    cooker: { z0: 1.20, z1: 1.80 },
    hood:   { y0: 1.60, y1: 2.05 },
    washer: { z0: 1.95, z1: 2.55 }, // washer/dryer, under the continued worktop
    fridge: { z0: 2.60, z1: 3.30, w: 0.70, h: 1.80 },
    micro:  { z0: 0.30, z1: 0.85, y: 1.45 },  // microwave on an open shelf
    upperY: { y0: 1.50, y1: 2.30 },
  },

  // ---- wardrobe (west wall, south of the bath) ---------------------------
  // Drawing: x 272..390 px, y 538..578 px -> 1.71 m x 0.58 m
  wardrobe: {
    x0: 0.05, x1: 1.75,
    z0: 2.70, z1: 3.28,
    h: 2.40,
  },

  // ---- furnishing package placement --------------------------------------
  // Every item below appears on page 2 of the supplied schedule.
  bed:        { x0: 0.10, x1: 2.10, z0: 3.90, z1: 5.40, h: 0.30 }, // 2.0 x 1.5 double
  nightstand: { x0: 0.10, x1: 0.55, z0: 5.52, z1: 5.97, h: 0.52 },
  dining:     { cx: 2.78, cz: 4.28, w: 0.90, d: 0.70, h: 0.74 },   // + 2 chairs
  sofa:       { x0: 0.10, x1: 0.95, z0: 6.15, z1: 7.90 },          // faces east
  centerTable:{ x0: 1.25, x1: 1.95, z0: 6.45, z1: 7.35, h: 0.40 },
  tvUnit:     { z0: 5.70, z1: 7.30, depth: 0.45, h: 0.45 },        // east wall
  tv:         { z0: 6.05, z1: 6.95, y0: 0.95, y1: 1.48 },
  chandelier: { x: 1.95, z: 6.85, drop: 0.70 },
  curtain:    { z: 7.82 },

  // ---- balcony ------------------------------------------------------------
  balcony: {
    railH: 1.10,
    slider: { x0: 0.35, x1: 3.55, h: 2.35 },  // glazed sliding doors at z = D_INT
  },
};

// Derived helpers used all over the build.
PLAN.D_TOT = PLAN.D_INT + PLAN.D_BAL;          // 10.00
PLAN.CX = PLAN.W / 2;                          // centre line of the unit
PLAN.areaInternal = PLAN.W * PLAN.D_INT;       // 31.2 m2  (336 sqft)
PLAN.areaBalcony = PLAN.W * PLAN.D_BAL;        //  7.8 m2  ( 84 sqft)
PLAN.areaTotal = PLAN.areaInternal + PLAN.areaBalcony;
