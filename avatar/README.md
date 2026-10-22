# Aisha: a 3D AI assistant avatar

A real-time 3D avatar for an AI personal assistant. She has long, wavy honey-blonde hair and blue-grey eyes, and wears a beige blazer over a cream top. She talks with lip-sync, blinks, follows your pointer with her eyes, and has sixteen gestures. She runs in any modern browser as one self-contained HTML file.

Like the walkthrough in this repo, everything is generated in code: the face, body, clothes, hair, textures and lighting. There are no model files, image files or CDN dependencies, so the page works offline. The one exception is the Montserrat webfont, which falls back to system fonts when offline.

## Quick start

```bash
npm install
npm run build:avatar        # -> public/avatar.html
```

Open `public/avatar.html` in a browser. Any static server works too, for example `npx serve public`.

To give her a real AI brain (Claude), run the bundled server:

```bash
ANTHROPIC_API_KEY=sk-ant-... node tools/assistant-server.mjs     # or `ant auth login` first
# open http://localhost:8787
```

## What she does

| | |
|---|---|
| **Talks** | Replies are spoken with the browser's speech synthesiser and shown as a caption. Her mouth follows a viseme track built from the text, re-synced on every word the voice reports. If speech is muted or blocked, she still mouths the words. |
| **Gestures** | Wave, nod, no, think (hand to chin), explain, shrug, laugh, clap, thumbs up, peace (with a wink), point, hair tuck, welcome, greet (a small bow), curious head tilt, thanks. Tap a chip, or tag a reply: `"[wave] Hi!"`. |
| **Expressions** | Moods: neutral, warm, happy, laugh, surprise, think, curious, concern, shy, playful, listen. Each sets smile, eye squint, brows, lids and jaw. |
| **Feels alive** | She breathes, shifts her weight, blinks (sometimes twice), makes small eye movements, and looks at your pointer or at you. Her hair swings when she turns her head. |
| **Reacts** | She listens and nods while you type, thinks while waiting for a reply, adds hand gestures while speaking, and does something on her own when left idle. Tap her and she reacts. |
| **Framing** | Portrait (as in the product mock), half body, and full body. Drag to turn her, double-click to reset. |

## Connecting your assistant

The page needs one thing from your backend: a reply to the user's message.

**Option 1: an endpoint.** Load the page with `?endpoint=https://your-server/chat`. For every message the page sends:

```json
POST { "message": "What's on today?", "history": [{ "role": "user", "content": "..." }, ...], "user": "John" }
```

It expects `{ "reply": "...", "mood"?: "happy", "gesture"?: "wave" }` back. The reply can carry inline tags such as `[wave]` or `[happy]`; she acts on each one when the speech reaches it. If the endpoint fails, she falls back to her built-in demo replies. `tools/assistant-server.mjs` is a complete example built on the Claude API. Its system prompt tells the model which tags exist.

**Option 2: JavaScript.** The page exposes `window.Aisha`:

```js
Aisha.respond = async (message) => ({ text: '[nod] Sure, here you go.', mood: 'warm' });  // replace the brain
Aisha.say('[wave] Welcome back!', { mood: 'happy' });   // make her speak now
Aisha.gesture('thumbsUp');                               // play a gesture
Aisha.mood('playful');                                   // set her expression
Aisha.view('half');                                      // portrait | half | full
Aisha.gestures();                                        // list of gesture names
```

## URL options

| Parameter | Effect |
|---|---|
| `?user=John` | The name she greets you by (default John) |
| `?endpoint=URL` | Where to send messages (see above) |
| `?view=half` | Initial framing: `portrait`, `half` or `full` |
| `?q=low` / `?q=high` | Lighter hair and no shadows, or full detail. Small touch devices get `low` automatically. |

## Changing her look

| To change | Edit |
|---|---|
| Skin, lips, eyes, hair, outfit colours | `PALETTE` in `src/materials.js`, `HAIR` in `src/hair.js` |
| Face shape | The profile tables and `faceDisp()` in `src/head.js` |
| Eye size, spacing, tilt | `FACE` in `src/head.js` |
| Hair length, waves, volume | `HAIR`, `endY`, `amp` and `lambda` in `src/hair.js` |
| A gesture | Its entry in `GESTURES` in `src/gestures.js`. Hands are placed in chest space and solved with IK, so a gesture is mostly a few positions and directions. |
| Her name, greeting, demo replies | `CONFIG` in `src/app.js`, `localReply()` in `src/voice.js` |

## Previewing changes without a GPU

`tools/avatar-shot.mjs` renders stills through headless Chromium. It is slow, because rendering runs on the CPU, but it is exact:

```bash
npm run avatar:shots                                                  # every gesture -> out/avatar/sheet.jpg
node tools/avatar-shot.mjs '{"name":"face","view":"face","full":1}'   # one still -> out/avatar/face.png
node tools/avatar-shot.mjs '{"name":"smile","view":"portrait","mood":"happy","viseme":"aa"}'
```

## How it's built

```
src/util.js       maths helpers, seeded noise
src/geometry.js   lofted tubes on an (s, θ) grid, skin weights, the mesh builder
src/rig.js        the skeleton (fingers included), two-bone IK, hand orientation
src/materials.js  skin with a soft red terminator, eyes, lashes, brows, fabric
src/body.js       neck, arms and hands; knit top; blazer with lapels and collar; trousers
src/head.js       the sculpted head, eyes and lids, per-frame lips, mouth, teeth and brows
src/hair.js       grown hair strands, colliders, the hair shader
src/face.js       moods, blinking, gaze, visemes
src/gestures.js   the gesture library
src/motion.js     idle, gesture layers, look-at, speech beats, planted feet
src/voice.js      speech, lip-sync track, built-in replies
src/stage.js      lights, studio reflections, screen-fitted camera framings
src/app.js        assembly, UI, the window.Aisha API
```

Some details:

- **The face** is a dense sphere ray-cast against a table of horizontal skull sections. The features are sculpted onto it as smooth bumps and hollows. Each eye sits in a socket shaped so that the skin lies behind the eyeball inside the opening and just behind the lid shells around it; that is where the lid crease comes from.
- **The lips, mouth interior, teeth and brows** are small meshes rebuilt every frame from expression parameters, then laid onto the skin through a height table. The jaw and smile fields that move the skin also move the lips, so the two never separate.
- **The body and clothes** are lofts from one section table, sampled at increasing offsets with identical skin weights. That way the knit top and blazer deform exactly with the body and never poke through.
- **The hair** is about 2,600 ribbon strands grown from the scalp in layers (centre part, hairline, back, fill). Each strand is combed, pulled by gravity and pushed out of colliders for the head, a keep-out oval in front of the face, the neck, the blazer and the arms. Neighbouring locks share a wave. In the vertex shader, the lower lengths follow the chest rather than the head.
- **Arms** are solved with two-bone IK towards hand targets given in chest space. The hand's roll is shared with the forearm, so the wrist doesn't twist like a candy wrapper.

## Limits

- She is high-quality real-time CG, not a photograph. A photoreal likeness needs scanned assets, for example a MetaHuman in Unreal, or a video-avatar service. The interaction layer here (captions, gestures, the `Aisha` API, the endpoint contract) would carry over to either.
- Browsers keep speech silent until the page has been tapped or clicked. Before that she mouths her greeting without sound.
- Voice input uses the browser's speech recognition where it exists; the mic button is hidden otherwise.
- Gestures that bring a hand to the face can pass through the hair: the hair does not react to the hands.
