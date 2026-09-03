/* ---------------------------------------------------------------------------
 * overlay.js — the 2D layer drawn over the render: letterbox bars, title and
 * end cards, and the room captions.
 *
 * Everything is a pure function of film time, so any frame can be drawn on
 * demand and the offline render matches the live playback exactly.
 * ------------------------------------------------------------------------- */

const SANS = '"Helvetica Neue", Helvetica, Arial, "DejaVu Sans", sans-serif';
const SERIF = 'Georgia, "Times New Roman", "DejaVu Serif", serif';

const ASPECT = 2.39;               // letterbox the 16:9 frame to scope

/* Ramps 0 -> 1 over [a, a+d]. */
function rampIn(t, a, d) {
  return Math.min(1, Math.max(0, (t - a) / d));
}
/* A soft on/off window: fades up over `f` after `a`, down over `f` before `b`. */
function windowed(t, a, b, f) {
  if (t <= a || t >= b) return 0;
  const up = Math.min(1, (t - a) / f);
  const dn = Math.min(1, (b - t) / f);
  const v = Math.min(up, dn);
  return v * v * (3 - 2 * v);       // smoothstep the ends
}

function letterboxBar(H) {
  return Math.round((H - (H * 16 / 9) / ASPECT) / 2);
}

function trackedText(g, text, x, y, spacing) {
  let cx = x;
  for (const ch of text) {
    g.fillText(ch, cx, y);
    cx += g.measureText(ch).width + spacing;
  }
  return cx - spacing - x;
}

function trackedWidth(g, text, spacing) {
  let w = 0;
  for (const ch of text) w += g.measureText(ch).width + spacing;
  return w - spacing;
}

function centredTracked(g, text, cx, y, spacing) {
  const w = trackedWidth(g, text, spacing);
  trackedText(g, text, cx - w / 2, y, spacing);
}

const PACKAGE = {
  Kitchen: ['Refrigerator', 'Microwave', 'Cooker', 'Washer / Dryer', 'Exhaust Hood'],
  'Living / Bedroom': [
    'Sofa', 'Center Table', 'Dining Table with 2 chairs', 'TV Cabinet',
    'Double Bed', 'Mattress', 'Window Curtain',
    'Decorative Chandelier / Light Fittings', 'Nightstand',
  ],
};

function drawOverlay(g, W, H, t, shot, duration) {
  const s = H / 1080;                 // scale everything off a 1080p baseline
  const bar = letterboxBar(H);

  g.clearRect(0, 0, W, H);

  /* -- title card --------------------------------------------------------- */
  const titleA = windowed(t, 0.4, 8.2, 1.6);
  if (titleA > 0.001) {
    // Sink the frame slightly so the type reads over the render.
    g.fillStyle = `rgba(8,10,12,${0.50 * titleA})`;
    g.fillRect(0, 0, W, H);

    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';

    g.fillStyle = `rgba(255,252,246,${titleA})`;
    g.font = `300 ${Math.round(104 * s)}px ${SERIF}`;
    centredTracked(g, 'SERENZ', W / 2, H / 2 - 6 * s, 14 * s);

    g.strokeStyle = `rgba(201,161,90,${0.85 * titleA})`;
    g.lineWidth = Math.max(1, 1.4 * s);
    g.beginPath();
    g.moveTo(W / 2 - 92 * s, H / 2 + 34 * s);
    g.lineTo(W / 2 + 92 * s, H / 2 + 34 * s);
    g.stroke();

    g.fillStyle = `rgba(236,231,222,${0.92 * titleA})`;
    g.font = `400 ${Math.round(24 * s)}px ${SANS}`;
    centredTracked(g, 'APARTMENT A 922   ·   STUDIO', W / 2, H / 2 + 80 * s, 5.5 * s);

    g.fillStyle = `rgba(201,161,90,${0.75 * titleA})`;
    g.font = `400 ${Math.round(15 * s)}px ${SANS}`;
    centredTracked(g, '3D WALKTHROUGH', W / 2, H / 2 + 120 * s, 4.2 * s);
  }

  /* -- room captions ------------------------------------------------------ */
  if (shot && (shot.caption || shot.captionNote) && t > 8.4) {
    const a = windowed(t, shot.t0 + 0.5, Math.min(shot.t1, shot.t0 + 6.4), 0.9);
    if (a > 0.001) {
      const x = Math.round(96 * s);
      const yBase = H - bar - Math.round(58 * s);
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';

      if (shot.caption) {
        g.strokeStyle = `rgba(201,161,90,${0.9 * a})`;
        g.lineWidth = Math.max(1, 2 * s);
        g.beginPath();
        g.moveTo(x, yBase - 62 * s);
        g.lineTo(x, yBase + 6 * s);
        g.stroke();

        g.fillStyle = `rgba(255,253,249,${a})`;
        g.font = `300 ${Math.round(40 * s)}px ${SERIF}`;
        g.fillText(shot.caption, x + 22 * s, yBase - 24 * s);

        if (shot.captionNote) {
          g.fillStyle = `rgba(226,220,210,${0.82 * a})`;
          g.font = `400 ${Math.round(16 * s)}px ${SANS}`;
          trackedText(g, shot.captionNote, x + 24 * s, yBase + 2 * s, 1.1 * s);
        }
      } else {
        g.fillStyle = `rgba(226,220,210,${0.82 * a})`;
        g.font = `400 ${Math.round(16 * s)}px ${SANS}`;
        g.fillStyle = `rgba(201,161,90,${0.9 * a})`;
        g.fillRect(x, yBase - 9 * s, 16 * s, Math.max(1, 2 * s));
        g.fillStyle = `rgba(232,227,218,${0.88 * a})`;
        trackedText(g, shot.captionNote, x + 28 * s, yBase - 3 * s, 1.1 * s);
      }
    }
  }

  /* -- end card ----------------------------------------------------------- */
  const endA = rampIn(t, duration - 6.0, 1.8);
  if (endA > 0.001) {
    g.fillStyle = `rgba(10,11,13,${0.80 * endA})`;
    g.fillRect(0, 0, W, H);

    g.textAlign = 'left';
    g.fillStyle = `rgba(255,252,246,${endA})`;
    g.font = `300 ${Math.round(46 * s)}px ${SERIF}`;
    centredTracked(g, 'FURNISHING PACKAGE', W / 2, bar + 132 * s, 7 * s);

    g.strokeStyle = `rgba(201,161,90,${0.8 * endA})`;
    g.lineWidth = Math.max(1, 1.2 * s);
    g.beginPath();
    g.moveTo(W / 2 - 70 * s, bar + 160 * s);
    g.lineTo(W / 2 + 70 * s, bar + 160 * s);
    g.stroke();

    const colX = [W / 2 - 380 * s, W / 2 + 40 * s];
    let i = 0;
    for (const [heading, items] of Object.entries(PACKAGE)) {
      let y = bar + 224 * s;
      g.fillStyle = `rgba(201,161,90,${0.95 * endA})`;
      g.font = `600 ${Math.round(15 * s)}px ${SANS}`;
      trackedText(g, heading.toUpperCase(), colX[i], y, 3.4 * s);
      y += 34 * s;
      g.fillStyle = `rgba(233,229,221,${0.9 * endA})`;
      g.font = `400 ${Math.round(19 * s)}px ${SANS}`;
      for (const it of items) {
        g.fillText(it, colX[i], y);
        y += 30 * s;
      }
      i++;
    }

    g.fillStyle = `rgba(180,174,166,${0.7 * endA})`;
    g.font = `400 ${Math.round(13 * s)}px ${SANS}`;
    centredTracked(
      g,
      'INDICATIVE 3D VISUALISATION  ·  FURNISHINGS SUBJECT TO AVAILABILITY AND FINAL SPECIFICATION',
      W / 2, H - bar - 42 * s, 2.2 * s
    );
  }

  /* -- persistent slate --------------------------------------------------- */
  const slateA = t > 9.0 && endA < 0.5 ? (1 - endA * 2) * 0.62 : 0;
  if (slateA > 0.001) {
    g.textAlign = 'right';
    g.fillStyle = `rgba(240,236,228,${slateA})`;
    g.font = `400 ${Math.round(14 * s)}px ${SANS}`;
    const label = 'SERENZ  ·  A 922  ·  STUDIO';
    const w = trackedWidth(g, label, 3 * s);
    g.textAlign = 'left';
    trackedText(g, label, W - 96 * s - w, H - bar - 34 * s, 3 * s);
  }

  /* -- letterbox ---------------------------------------------------------- */
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, bar);
  g.fillRect(0, H - bar, W, bar);

  /* -- open and close on black -------------------------------------------- */
  const inBlack = 1 - rampIn(t, 0.0, 1.2);
  const outBlack = rampIn(t, duration - 1.6, 1.5);
  const black = Math.max(inBlack, outBlack);
  if (black > 0.001) {
    g.fillStyle = `rgba(0,0,0,${Math.min(1, black)})`;
    g.fillRect(0, 0, W, H);
  }
}
