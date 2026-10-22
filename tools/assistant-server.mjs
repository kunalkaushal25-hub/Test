/* ---------------------------------------------------------------------------
 * assistant-server.mjs — give Aisha a real AI brain.
 *
 * Serves public/avatar.html and answers its chat requests with Claude. The
 * page already knows how to act on gesture and mood tags in a reply
 * ("[wave] Hello!"), so the model is simply told which tags exist and
 * writes them inline; nothing else needs to change in the page.
 *
 *   npm run build:avatar
 *   ANTHROPIC_API_KEY=... node tools/assistant-server.mjs     (or `ant auth login`)
 *   open http://localhost:8787
 *
 * Options: PORT (default 8787), AISHA_USER (the name she greets).
 * The API key stays on this server; the browser never sees it.
 * ------------------------------------------------------------------------- */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = path.join(ROOT, 'public/avatar.html');
const PORT = Number(process.env.PORT || 8787);
const USER = process.env.AISHA_USER || 'John';

const GESTURE_TAGS = ['wave', 'nod', 'shake', 'think', 'explain', 'shrug', 'laugh', 'clap',
  'thumbsUp', 'peace', 'point', 'hairTuck', 'welcome', 'bow', 'tilt', 'thanks'];
const MOOD_TAGS = ['warm', 'happy', 'surprise', 'think', 'curious', 'concern', 'shy', 'playful'];

const SYSTEM = `You are Aisha, a warm, upbeat personal AI assistant who appears to the user as a 3D avatar and speaks every reply aloud. The user's name is ${USER}.

Your words are read out by a speech synthesiser and shown as a one-line caption, so reply the way you would speak: usually one to three short sentences, plain text, no markdown, lists, emoji or URLs. If something needs more detail, give the essential answer and offer to go further.

You can move while you talk. Put a tag in square brackets where the movement should happen, at most two per reply, and only when it suits what you are saying:
gestures: ${GESTURE_TAGS.map((t) => `[${t}]`).join(' ')}
moods (set your facial expression): ${MOOD_TAGS.map((t) => `[${t}]`).join(' ')}
For example: "[wave] Good morning! [happy] You've got a clear calendar today."

You have no access to the user's accounts, calendar, email, the web or the current date unless they tell you; say so plainly rather than inventing it.`;

const client = new Anthropic();

/* The page sends the last few turns, ending with the new message. The API
 * wants the conversation to open with the user, so the greeting is dropped. */
function toMessages(body) {
  const turns = Array.isArray(body.history) ? body.history : [];
  const messages = turns
    .filter((t) => (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string' && t.content.trim())
    .map((t) => ({ role: t.role, content: t.content.slice(0, 4000) }));
  while (messages.length && messages[0].role !== 'user') messages.shift();
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user' || last.content !== body.message) {
    messages.push({ role: 'user', content: String(body.message || '').slice(0, 4000) });
  }
  return messages;
}

async function reply(body) {
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    // Conversation, not hard reasoning: keep latency low.
    output_config: { effort: 'low' },
    // If a request is declined, let the API retry it on its recommended
    // fallback model instead of returning the refusal.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    messages: toMessages(body),
  });
  if (response.stop_reason === 'refusal') {
    return { reply: "[concern] I'm sorry, that's not something I can help with.", mood: 'concern' };
  }
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
  return { reply: text || "[shrug] Sorry, I lost my train of thought. Could you say that again?" };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/') {
    // Point the page at this server unless it was told otherwise.
    if (!url.searchParams.has('endpoint')) {
      url.searchParams.set('endpoint', '/api/chat');
      if (!url.searchParams.has('user')) url.searchParams.set('user', USER);
      res.writeHead(302, { Location: `/?${url.searchParams}` });
      return res.end();
    }
    if (!fs.existsSync(PAGE)) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      return res.end('public/avatar.html is missing: run `npm run build:avatar` first.');
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(PAGE).pipe(res);
  }

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 100000) { res.writeHead(413); return res.end(); }
    }
    let body;
    try { body = JSON.parse(raw); } catch { res.writeHead(400); return res.end(); }
    try {
      const out = await reply(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(out));
    } catch (err) {
      // The page falls back to its built-in replies on any non-OK answer.
      if (err instanceof Anthropic.AuthenticationError) {
        console.error('Claude API: not authenticated. Set ANTHROPIC_API_KEY or run `ant auth login`.');
      } else if (err instanceof Anthropic.RateLimitError) {
        console.error('Claude API: rate limited, try again shortly.');
      } else if (err instanceof Anthropic.APIError) {
        console.error(`Claude API error ${err.status}: ${err.message}`);
      } else {
        console.error(err);
      }
      res.writeHead(502, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'assistant unavailable' }));
    }
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`Aisha is listening on http://localhost:${PORT}`);
});
