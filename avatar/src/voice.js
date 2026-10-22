/* ---------------------------------------------------------------------------
 * voice.js — speech, lip-sync and a small built-in conversation.
 *
 * Speech uses the browser's own synthesiser. Lip-sync can't come from it —
 * the Web Speech API reports word boundaries, not phonemes — so each line
 * is turned into a viseme track from its spelling, timed at a speaking rate,
 * and re-anchored on every word boundary the synthesiser reports. Without a
 * voice (muted, unsupported, or blocked until the first tap) the same track
 * plays silently, so her mouth still moves with the caption.
 *
 * Replies may carry gesture tags — "[wave] Hello!" — which fire as the
 * speech reaches them.
 * ------------------------------------------------------------------------- */

const SECONDS_PER_CHAR = 0.066;

function letterViseme(ch, next) {
  if ('aá'.includes(ch)) return ['aa', 1];
  if (ch === 'e') return next && /[a-z]/.test(next) ? ['ee', 0.9] : ['ee', 0.5];
  if ('iy'.includes(ch)) return ['ih', 0.9];
  if (ch === 'o') return next === 'o' ? ['oo', 1] : ['oh', 1];
  if ('uw'.includes(ch)) return ['oo', 0.9];
  if ('mbp'.includes(ch)) return ['mbp', 1];
  if ('fv'.includes(ch)) return ['fv', 0.9];
  if ('lr'.includes(ch)) return ['ll', 0.7];
  if (/[a-z0-9]/.test(ch)) return ['ss', 0.65];
  return ['rest', 0];
}

/* Build a viseme track: entries { t0, t1, v, k, i } at rate 1. */
function visemeTrack(text) {
  const s = text.toLowerCase();
  const track = [];
  let t = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    let d = SECONDS_PER_CHAR;
    let [v, k] = letterViseme(ch, s[i + 1]);
    if (ch === ' ') { d = 0.04; v = 'rest'; k = 0; }
    else if (/[,;:]/.test(ch)) { d = 0.20; v = 'rest'; k = 0; }
    else if (/[.!?]/.test(ch)) { d = 0.34; v = 'rest'; k = 0; }
    else if (v === 'ss' && i > 0 && /[bcdfghjklmnpqrstvwxz]/.test(s[i - 1])) d *= 0.7;
    track.push({ t0: t, t1: t + d, v, k, i });
    t += d;
  }
  return { track, dur: t };
}

/* "[wave] Hello! [laugh] Ha" -> { text, cues: [{ at: charIndex, name }] } */
function parseCues(raw) {
  const cues = [];
  let text = '';
  const re = /\[([a-zA-Z]+)\]\s*/g;
  let last = 0, m;
  while ((m = re.exec(raw))) {
    text += raw.slice(last, m.index);
    cues.push({ at: text.length, name: m[1] });
    last = re.lastIndex;
  }
  text += raw.slice(last);
  return { text: text.replace(/\s+/g, ' ').trim(), cues };
}

class Voice {
  constructor() {
    this.enabled = true;
    this.synth = window.speechSynthesis || null;
    this.voice = null;
    this.cur = null;            // { track, dur, t, cues, onCue, onEnd, i }
    this.blocked = false;
    if (this.synth) {
      const pick = () => { this.voice = this.pickVoice(); };
      pick();
      if (this.synth.addEventListener) this.synth.addEventListener('voiceschanged', pick);
    }
  }

  pickVoice() {
    const vs = this.synth ? this.synth.getVoices() : [];
    if (!vs.length) return null;
    const prefer = ['Google UK English Female', 'Microsoft Sonia', 'Microsoft Libby', 'Microsoft Aria',
      'Microsoft Jenny', 'Serena', 'Kate', 'Samantha', 'Victoria', 'Karen', 'Moira', 'Tessa',
      'Fiona', 'Microsoft Zira', 'Google US English', 'Female'];
    for (const name of prefer) {
      const v = vs.find((x) => x.name.includes(name) && /^en/i.test(x.lang));
      if (v) return v;
    }
    return vs.find((x) => /^en/i.test(x.lang)) || vs[0];
  }

  get speaking() { return !!this.cur; }

  stop() {
    if (this.synth) this.synth.cancel();
    if (this.cur) { const end = this.cur.onEnd; this.cur = null; if (end) end(); }
  }

  /* Speak one line. onCue(name) fires at each gesture tag. */
  say(raw, { onCue, onEnd, onWord } = {}) {
    if (this.synth) this.synth.cancel();
    const { text, cues } = parseCues(raw);
    const { track, dur } = visemeTrack(text);
    const cur = { text, track, dur, t: 0, cues: cues.slice(), onCue, onEnd, onWord, rate: 1, audio: false };
    this.cur = cur;
    this.fireCues(cur);

    if (this.enabled && this.synth && !this.blocked && text) {
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.rate = 1.0;
      u.pitch = 1.08;
      u.onstart = () => { cur.audio = true; cur.t = 0; };
      u.onboundary = (e) => {
        // Re-anchor the track on the synthesiser's own clock.
        const entry = track.find((q) => q.i >= e.charIndex);
        if (entry && this.cur === cur) {
          if (Math.abs(entry.t0 - cur.t) > 0.06) cur.t = lerp(cur.t, entry.t0, 0.8);
          if (onWord) onWord(e.charIndex);
        }
      };
      u.onend = () => { if (this.cur === cur) this.finish(); };
      u.onerror = (e) => {
        if (e.error === 'not-allowed') this.blocked = true;
        cur.audio = false;
      };
      this.synth.speak(u);
    }
    return text;
  }

  fireCues(cur) {
    const at = cur.track.find((q) => q.t1 > cur.t);
    const idx = at ? at.i : cur.text.length;
    while (cur.cues.length && cur.cues[0].at <= idx) {
      const c = cur.cues.shift();
      if (cur.onCue) cur.onCue(c.name);
    }
  }

  finish() {
    const cur = this.cur;
    this.cur = null;
    if (cur && cur.onEnd) cur.onEnd();
  }

  /* Advance the track; returns the current viseme and an "energy" for head
   * beats. When audio is playing its end event closes the line; silently,
   * the track's own length does. */
  update(dt) {
    const cur = this.cur;
    if (!cur) return { name: 'rest', k: 0, energy: 0 };
    cur.t += dt;
    this.fireCues(cur);
    if (cur.t > cur.dur + (cur.audio ? 1.5 : 0.1)) { this.finish(); return { name: 'rest', k: 0, energy: 0 }; }
    const e = cur.track.find((q) => cur.t >= q.t0 && cur.t < q.t1);
    if (!e) return { name: 'rest', k: 0, energy: 0 };
    return { name: e.v, k: e.k, energy: e.v === 'aa' || e.v === 'oh' ? 1 : e.k * 0.6 };
  }
}

/* -------------------------------------------------------------------------
 * The built-in conversation: enough to show her off without a backend.
 * Connect a real assistant with ?endpoint=… (see README) or by replacing
 * window.Aisha.respond.
 * ---------------------------------------------------------------------- */
const JOKES = [
  "Why don't scientists trust atoms? Because they make up everything! [laugh]",
  "I told my computer I needed a break, and it said: no problem, I'll go to sleep. [laugh]",
  "What do you call a fake noodle? An impasta! [laugh]",
  "Why did the scarecrow win an award? Because he was outstanding in his field! [laugh]",
];

function localReply(msg, user) {
  const m = msg.toLowerCase();
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const name = user ? `, ${user}` : '';
  const rules = [
    [/\b(hi|hello|hey|hiya|good (morning|afternoon|evening))\b/, () => ({ text: `[wave] Hello${name}! It's lovely to see you. What can I do for you today?`, mood: 'happy' })],
    [/how are you|how's it going|how do you do/, () => ({ text: "[tilt] I'm wonderful, thank you for asking! How are you doing today?", mood: 'warm' })],
    [/your name|who are you|introduce/, () => ({ text: "[bow] I'm Aisha, your personal AI assistant. I'm here to answer questions, help you get things done, and keep you company.", mood: 'warm' })],
    [/what time|the time\b/, () => ({ text: `[point] It's ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} right now.`, mood: 'warm' })],
    [/date|what day|today/, () => ({ text: `Today is ${new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}. [thumbsUp]`, mood: 'warm' })],
    [/joke|funny|make me laugh/, () => ({ text: pick(JOKES), mood: 'happy' })],
    [/thank/, () => ({ text: "[thanks] You're very welcome! I'm always happy to help.", mood: 'happy' })],
    [/\b(bye|goodbye|see you|good night)\b/, () => ({ text: `[wave] Goodbye${name}! Come back any time, I'll be right here.`, mood: 'warm' })],
    [/beautiful|pretty|cute|gorgeous|lovely|nice hair|you look/, () => ({ text: "[hairTuck] Oh, that's so sweet of you. Thank you!", mood: 'shy' })],
    [/weather|forecast|rain/, () => ({ text: "[think] I'd love to check that for you. Once I'm connected to a weather service, I can give you the live forecast.", mood: 'think' })],
    [/help|what can you do|features/, () => ({ text: "[explain] I can chat with you, answer questions, tell you the time and date, share a joke, and react with all kinds of gestures. Try asking me to wave, clap, or strike a pose!", mood: 'warm' })],
    [/clap|celebrate|congrat|great news|i did it|passed/, () => ({ text: "[clap] That's fantastic! Congratulations, I'm so happy for you!", mood: 'happy' })],
    [/sad|tired|stress|bad day|upset/, () => ({ text: "[thanks] I'm sorry you're feeling that way. Take a deep breath. I'm here, and we can take things one step at a time.", mood: 'concern' })],
    [/love you|marry|date me/, () => ({ text: "[laugh] You're very kind! I'm happiest being your helpful assistant, though.", mood: 'playful' })],
    [/peace|selfie|pose/, () => ({ text: "[peace] How's this for a pose?", mood: 'playful' })],
    [/shrug|don't know|no idea/, () => ({ text: "[shrug] Honestly? Your guess is as good as mine!", mood: 'playful' })],
    [/wave/, () => ({ text: '[wave] Hi there!', mood: 'happy' })],
    [/nod|agree|yes/, () => ({ text: "[nod] Absolutely, I'm with you on that.", mood: 'warm' })],
    [/\bno\b|disagree/, () => ({ text: "[shake] Hmm, I'm not so sure about that one.", mood: 'think' })],
    [/think|idea|wonder/, () => ({ text: "[think] Let me think about that for a moment... I think the best answer depends on what matters most to you.", mood: 'think' })],
    [/welcome|hug/, () => ({ text: "[welcome] Come on in, you're always welcome here!", mood: 'happy' })],
    [/point|show me|look/, () => ({ text: "[point] Have a look over there!", mood: 'warm' })],
  ];
  for (const [re, fn] of rules) if (re.test(m)) return fn();
  return pick([
    { text: "[think] That's a really good question. Once I'm connected to my full AI brain I'll be able to answer it properly. In the meantime, would you like to hear a joke?", mood: 'think' },
    { text: "[tilt] Interesting! Tell me a little more about that?", mood: 'curious' },
    { text: "[explain] I'm running in demo mode right now, so my answers are limited, but I'd love to keep chatting!", mood: 'warm' },
  ]);
}
