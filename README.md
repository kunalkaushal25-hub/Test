# Serenz A 922 — Cinematic 3D Studio Walkthrough

A 99-second cinematic walkthrough of **Serenz, Apartment A 922 (Studio)**, modelled from the
supplied floor plan and furnishing schedule, rendered to a real H.264 MP4, and playable
interactively in the browser.

The whole thing is procedural — no external 3D assets, no texture files, no CDN. Geometry,
materials and the audio bed are all generated from code.

## Output

| | |
|---|---|
| Film | `out/serenz-a922-studio-walkthrough.mp4` — 1280×720, 30 fps, H.264, AAC |
| Interactive | `public/index.html` — one self-contained file, plays the same film and lets you explore the model freely |

Both are built from the same source, so what you watch and what you steer can't drift apart.

## Quick start

```bash
npm install
npm run build                       # -> public/index.html
python3 tools/music.py out/ambient.wav 99   # ambient bed (optional; muxed if present)
node tools/render.mjs --width 1280 --height 720
```

Other useful commands:

```bash
node tools/render.mjs --check       # camera sanity check across the whole timeline
node tools/render.mjs --preview     # a still at the middle of every shot
node tools/render.mjs --at 38.1     # one still at a given film time
node tools/render.mjs --bench 20    # ms/frame at the current settings
node tools/render.mjs --no-aa       # drop multisampling for a draft
```

## The model

The drawing carries no printed dimensions, so the envelope was scaled from the drawing's own
proportions (the unit outline measures 270 × 692 px) against a typical Danube studio. That gives
**3.90 m × 10.00 m** overall — about 420 sqft with the balcony, 336 sqft internal, at a 2.90 m
ceiling.

| Zone | Size |
|---|---|
| Bath | 1.90 × 1.95 m |
| Pantry / kitchen | 0.60 m counter depth, 2.55 m run |
| Wardrobe | 1.70 × 0.58 m |
| Studio | 3.90 × 5.40 m |
| Balcony | 3.90 × 2.00 m |

Every one of those numbers lives in `src/scene/plan.js` and nowhere else. Walls, openings and
furniture placement all derive from it, so correcting a dimension corrects the whole build.

## Furnishing package

Every item on page 2 of the schedule is modelled and appears in the film:

- **Kitchen** — refrigerator, microwave, cooker, washer/dryer, exhaust hood
- **Living / Bedroom** — sofa, center table, dining table with 2 chairs, TV cabinet, double bed,
  mattress, window curtain, decorative chandelier and light fittings, nightstand

Sanitaryware and the wardrobe aren't part of the package, but the plan shows them, so they're
modelled too.

## Layout

```
src/scene/plan.js        metric floor plan — the single source of truth
src/scene/materials.js   procedural canvas textures (oak, marble, tile, fabric, paint)
src/scene/shell.js       slabs, walls, openings, glazing, balcony, corridor, city backdrop
src/scene/furniture.js   the furnishing package, item by item
src/scene/lighting.js    sky, sun, practicals, and the day-to-dusk grade
src/camera/shots.js      the shot list and the Catmull-Rom camera
src/overlay.js           letterbox, title card, room captions, end card
src/validate.js          camera sanity checks (see below)
src/app.js               assembles the scene; renderFrame(t) plus the live transport
tools/build.mjs          concatenates src/ + inlined three.js into one HTML file
tools/render.mjs         Playwright frame capture piped into ffmpeg
tools/music.py           the ambient bed, Python standard library only
```

## How it's put together

**One self-contained page.** three.js r160 ships no usable UMD build (`three.min.js` is just a
deprecation stub), and the page must not depend on a CDN. `tools/build.mjs` takes the
self-contained ES module build and rewrites its single trailing `export { A as B, … }` clause
into `window.THREE = { B: A, … }`, turning it into a classic script. The result is one HTML file
with no imports, no import map and no network requests.

**Deterministic capture.** `render.mjs` steps film time by hand and calls `window.__renderFrame(t)`
per frame, so output is frame-exact no matter how slowly the software rasteriser runs. Frames are
screenshotted as JPEG and piped straight into ffmpeg — no intermediate files.

**Camera validation.** Placing cameras by eye in a 3.9 m-wide plan goes wrong quietly: the lens
ends up inside the wardrobe, or 40 cm off a blank wall. `--check` walks the timeline and raycasts
the real scene, reporting three failures — `embedded` (buried in geometry), `tight` (centre of
frame almost touching a surface) and `cramped` (most of the frame is a near surface). It caught 22
problems on the first pass. The remaining `cramped` windows are threshold moments — passing
through the entry door, the slider, and the 1.9 m bathroom — where a tight frame is correct.

## Rendering notes

There's no GPU here: Chromium runs WebGL through ANGLE's SwiftShader software rasteriser on four
cores, so the render is fill-rate bound and every pixel is expensive.

Measuring with `--bench` split the per-frame cost in a lopsided way:

| | ms/frame at 1080p |
|---|---|
| WebGL render | 5 |
| `page.screenshot()` | 2947 |

Playwright's screenshot drives the whole compositor and surface-capture path. Flattening the GL
and overlay canvases into one 2D canvas in-page and encoding with `toDataURL` does the same job
for a fraction of that, and still forces the buffer to rasterise — the capture is now inside
`window.__captureFrame()` in `src/app.js`.

What remained was genuine shading cost, and three things dominated it:

- **`transmission` on the glass.** three.js re-renders the entire scene into a transmission target
  every frame for it. Env-mapped transparency is indistinguishable at this scale and costs nothing.
- **Light count.** Every light is evaluated per fragment whether or not its intensity is zero, so
  dimming a light to zero saves nothing. Nine slots went to six: the doll-house fill is added to
  and removed from the scene rather than dimmed, and the balcony bounce is folded into the
  hemisphere light.
- **Shadow filtering.** `PCFSoftShadowMap` takes many more taps per fragment than `PCFShadowMap`.

Multisampling, by contrast, turned out to cost only ~7% — so it stays on.

After that the film renders at roughly 0.6 s/frame at 720p, about half an hour for the whole
thing. 1080p is about 2.2 s/frame, or two hours, which is why the delivered film is 720p.

The ffmpeg bundled with Playwright is stripped to VP8/WebM only, so the build uses
`@ffmpeg-installer/ffmpeg` from npm for libx264 and the MP4 muxer.

## Caveats

The film is an indicative visualisation. Dimensions are scaled from the drawing's proportions
rather than printed figures, and finishes are a plausible interpretation, not a specification —
the schedule itself notes that the furniture package supersedes any marketing renders and is
subject to availability and the seller's discretion.
