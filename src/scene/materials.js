/* ---------------------------------------------------------------------------
 * materials.js — procedural materials.
 *
 * Every texture is drawn on a 2D canvas at runtime, so the build has no
 * external asset files and the published page makes no network requests.
 * ------------------------------------------------------------------------- */

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}

// A linear (non-colour) companion map — roughness, bump and so on.
function dataTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}

function noise(ctx, w, h, amount, alpha) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
    if (alpha !== undefined) d[i + 3] = alpha;
  }
  ctx.putImageData(img, 0, 0);
}

/* -- oak plank flooring ---------------------------------------------------- */
function oakFloorTextures() {
  const map = canvasTex(1024, 1024, (g, w, h) => {
    const rows = 8, plankH = h / rows;
    for (let r = 0; r < rows; r++) {
      // Stagger the joints row by row so the bond reads as a real floor.
      const offset = (r % 3) * (w / 3) + (r * 47) % 90;
      const cols = 3, plankW = w / cols;
      for (let c = -1; c <= cols; c++) {
        const x = c * plankW + offset;
        const y = r * plankH;
        const base = 150 + Math.random() * 34;
        g.fillStyle = `rgb(${base | 0},${(base * 0.76) | 0},${(base * 0.52) | 0})`;
        g.fillRect(x, y, plankW, plankH);
        // grain
        g.save();
        g.beginPath(); g.rect(x, y, plankW, plankH); g.clip();
        for (let i = 0; i < 26; i++) {
          g.strokeStyle = `rgba(${(base * 0.6) | 0},${(base * 0.44) | 0},${(base * 0.3) | 0},${0.05 + Math.random() * 0.12})`;
          g.lineWidth = 0.6 + Math.random() * 1.6;
          g.beginPath();
          const gy = y + Math.random() * plankH;
          g.moveTo(x, gy);
          g.bezierCurveTo(x + plankW * 0.3, gy + (Math.random() - 0.5) * 8,
                          x + plankW * 0.7, gy + (Math.random() - 0.5) * 8,
                          x + plankW, gy + (Math.random() - 0.5) * 4);
          g.stroke();
        }
        g.restore();
        // joint shadow
        g.fillStyle = 'rgba(60,40,25,0.45)';
        g.fillRect(x, y, 1.5, plankH);
        g.fillRect(x, y, plankW, 1.5);
      }
    }
    noise(g, w, h, 14);
  }, [4, 9]);

  const rough = dataTex(512, 512, (g, w, h) => {
    g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.15})`;
      g.fillRect(Math.random() * w, Math.random() * h, Math.random() * 40, 1.5);
    }
    noise(g, w, h, 22);
  }, [4, 9]);

  return { map, rough };
}

/* -- large-format marble (bathroom + kitchen splashback) ------------------- */
function marbleTexture(light) {
  return canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = light ? '#efeeea' : '#d9d7d1';
    g.fillRect(0, 0, w, h);
    // Veining: a few primary veins with recursive feathering.
    const vein = (x0, y0, x1, y1, width, alpha, depth) => {
      g.strokeStyle = `rgba(158,156,150,${alpha})`;
      g.lineWidth = width;
      g.beginPath();
      g.moveTo(x0, y0);
      const mx = (x0 + x1) / 2 + (Math.random() - 0.5) * 220;
      const my = (y0 + y1) / 2 + (Math.random() - 0.5) * 220;
      g.quadraticCurveTo(mx, my, x1, y1);
      g.stroke();
      if (depth > 0) {
        for (let i = 0; i < 2; i++) {
          const t = 0.3 + Math.random() * 0.5;
          const sx = x0 + (x1 - x0) * t, sy = y0 + (y1 - y0) * t;
          vein(sx, sy, sx + (Math.random() - 0.5) * 300, sy + (Math.random() - 0.5) * 300,
               width * 0.45, alpha * 0.7, depth - 1);
        }
      }
    };
    for (let i = 0; i < 5; i++) {
      vein(Math.random() * w, -20, Math.random() * w, h + 20, 2 + Math.random() * 3, 0.20, 1);
    }
    noise(g, w, h, 8);
  });
}

/* -- bathroom floor tile --------------------------------------------------- */
function tileTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    const n = 2, s = w / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = 196 + Math.random() * 14;
      g.fillStyle = `rgb(${v | 0},${(v - 4) | 0},${(v - 10) | 0})`;
      g.fillRect(x * s, y * s, s, s);
      g.save();
      g.beginPath(); g.rect(x * s, y * s, s, s); g.clip();
      for (let i = 0; i < 10; i++) {
        g.strokeStyle = `rgba(150,148,144,${0.06 + Math.random() * 0.1})`;
        g.lineWidth = 1 + Math.random() * 3;
        g.beginPath();
        g.moveTo(x * s + Math.random() * s, y * s);
        g.lineTo(x * s + Math.random() * s, y * s + s);
        g.stroke();
      }
      g.restore();
      g.strokeStyle = '#b6b2ab'; g.lineWidth = 3;
      g.strokeRect(x * s, y * s, s, s);
    }
    noise(g, w, h, 6);
  }, [3, 3]);
}

/* -- woven upholstery ------------------------------------------------------ */
function fabricTexture(r, gg, b) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = `rgb(${r},${gg},${b})`;
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) {
      g.fillStyle = `rgba(255,255,255,0.05)`; g.fillRect(0, y, w, 1);
      g.fillStyle = `rgba(0,0,0,0.06)`; g.fillRect(0, y + 1, w, 1);
    }
    for (let x = 0; x < w; x += 3) {
      g.fillStyle = `rgba(0,0,0,0.05)`; g.fillRect(x, 0, 1, h);
    }
    noise(g, w, h, 16);
  }, [3, 3]);
}

/* -- painted wall ---------------------------------------------------------- */
function paintTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#efece6'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 7);
  }, [4, 4]);
}

function buildMaterials() {
  const oak = oakFloorTextures();

  const M = {
    floor: new THREE.MeshStandardMaterial({
      map: oak.map, roughnessMap: oak.rough, roughness: 0.62, metalness: 0.0,
    }),
    wall: new THREE.MeshStandardMaterial({
      map: paintTexture(), color: 0xe4e0d8, roughness: 0.94, metalness: 0.0,
    }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0xf6f4f0, roughness: 0.97 }),
    skirting: new THREE.MeshStandardMaterial({ color: 0xf2efe9, roughness: 0.5 }),

    marble: new THREE.MeshStandardMaterial({
      map: marbleTexture(true), roughness: 0.18, metalness: 0.0,
    }),
    marbleDark: new THREE.MeshStandardMaterial({
      map: marbleTexture(false), color: 0x8b8078, roughness: 0.42, metalness: 0.0,
    }),
    tile: new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.28 }),

    joinery: new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.45 }),
    joineryDark: new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.5 }),
    walnut: new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 0.42 }),

    metal: new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.22, metalness: 0.95 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a15a, roughness: 0.28, metalness: 0.9 }),
    black: new THREE.MeshStandardMaterial({ color: 0x1b1b1e, roughness: 0.45 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x07080c, roughness: 0.12, metalness: 0.2 }),

    sofa: new THREE.MeshStandardMaterial({ map: fabricTexture(126, 128, 132), roughness: 0.92 }),
    bedding: new THREE.MeshStandardMaterial({ map: fabricTexture(238, 236, 230), roughness: 0.9 }),
    throw: new THREE.MeshStandardMaterial({ map: fabricTexture(146, 118, 96), roughness: 0.90 }),
    rug: new THREE.MeshStandardMaterial({ map: fabricTexture(196, 186, 172), roughness: 0.95 }),

    curtain: new THREE.MeshStandardMaterial({
      map: fabricTexture(226, 220, 208), roughness: 0.95,
      transparent: true, opacity: 0.94, side: THREE.DoubleSide,
    }),

    glass: new THREE.MeshPhysicalMaterial({
      color: 0xdff0f4, roughness: 0.02, metalness: 0.0,
      transmission: 0.94, thickness: 0.01, transparent: true, opacity: 0.32,
      side: THREE.DoubleSide,
    }),
    mirror: new THREE.MeshStandardMaterial({
      color: 0xcfd8dd, roughness: 0.04, metalness: 1.0,
    }),
    porcelain: new THREE.MeshStandardMaterial({ color: 0xfbfbfb, roughness: 0.08 }),
    plant: new THREE.MeshStandardMaterial({ color: 0x3e6b3a, roughness: 0.75, side: THREE.DoubleSide }),
    soil: new THREE.MeshStandardMaterial({ color: 0x2e2620, roughness: 0.95 }),
    lampshade: new THREE.MeshStandardMaterial({
      color: 0xfff2d8, roughness: 0.6, emissive: 0xffdca8, emissiveIntensity: 1.4,
      side: THREE.DoubleSide,
    }),
  };

  return M;
}
