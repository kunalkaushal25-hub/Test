/* ---------------------------------------------------------------------------
 * validate.js — camera sanity checks against the real geometry.
 *
 * Placing cameras by eye in a 3.9 m-wide plan goes wrong quietly: the lens
 * ends up inside the wardrobe, or 40 cm off a blank wall. Rather than guess,
 * walk the whole timeline and raycast the actual scene:
 *
 *   embedded  the camera is buried in geometry
 *   tight     the centre of frame is almost touching a surface
 *   cramped   most of the frame is a near surface, so the shot reads as mush
 *
 * Exposed as window.__validate() and run by `render.mjs --check`.
 * ------------------------------------------------------------------------- */

function buildValidator(scene, camera, film) {
  const ray = new THREE.Raycaster();
  ray.far = 60;

  // The sky dome and the distant context would swamp every measurement.
  const targets = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    if (o.name === 'sky') return;
    let p = o, skip = false;
    while (p) { if (p.name === 'context') { skip = true; break; } p = p.parent; }
    if (!skip) targets.push(o);
  });

  const DIRS = [
    new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
  ];

  function firstHit(origin, dir) {
    ray.set(origin, dir);
    const hits = ray.intersectObjects(targets, false);
    return hits.length ? hits[0].distance : Infinity;
  }

  /* Distance to the nearest surface in the six axis directions. */
  function proximity(pos) {
    let min = Infinity;
    for (const d of DIRS) min = Math.min(min, firstHit(pos, d));
    return min;
  }

  /* Sample a grid across the frustum and report the hit distances. */
  function frameDepths(cam) {
    const out = [];
    const v = new THREE.Vector3();
    for (const ny of [-0.55, 0, 0.55]) {        // within the scope crop
      for (const nx of [-0.8, -0.4, 0, 0.4, 0.8]) {
        v.set(nx, ny, 0.5).unproject(cam).sub(cam.position).normalize();
        out.push(firstHit(cam.position, v));
      }
    }
    return out;
  }

  const median = (a) => {
    const s = [...a].filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
    return s.length ? s[Math.floor(s.length / 2)] : Infinity;
  };

  /* Shots staged outside the building are exempt from the interior limits. */
  const EXTERIOR = new Set(['establish', 'hero']);

  return function validate(step) {
    step = step || 0.25;
    const issues = [];
    const stats = [];

    for (let t = 0; t <= film.FILM_DURATION; t += step) {
      const shot = film.apply(camera, t);
      camera.updateMatrixWorld(true);

      const near = proximity(camera.position);
      const depths = frameDepths(camera);
      const centre = depths[Math.floor(depths.length / 2)];
      const med = median(depths);

      stats.push({ t: +t.toFixed(2), shot: shot.id, near: +near.toFixed(2), centre: +centre.toFixed(2), med: +med.toFixed(2) });

      if (near < 0.22) {
        issues.push({ t: +t.toFixed(2), shot: shot.id, kind: 'embedded', near: +near.toFixed(2) });
        continue;   // an embedded camera makes the other numbers meaningless
      }
      if (EXTERIOR.has(shot.id)) continue;
      if (centre < 1.0) {
        issues.push({ t: +t.toFixed(2), shot: shot.id, kind: 'tight', centre: +centre.toFixed(2) });
      } else if (med < 1.3) {
        issues.push({ t: +t.toFixed(2), shot: shot.id, kind: 'cramped', med: +med.toFixed(2) });
      }
    }

    // Collapse runs of the same problem in the same shot into one entry.
    const merged = [];
    for (const i of issues) {
      const last = merged[merged.length - 1];
      if (last && last.shot === i.shot && last.kind === i.kind && i.t - last.t1 <= step * 1.5) {
        last.t1 = i.t;
        last.n++;
        last.worst = Math.min(last.worst, i.near ?? i.centre ?? i.med);
      } else {
        merged.push({ shot: i.shot, kind: i.kind, t0: i.t, t1: i.t, n: 1, worst: i.near ?? i.centre ?? i.med });
      }
    }

    return { issues: merged, stats };
  };
}
