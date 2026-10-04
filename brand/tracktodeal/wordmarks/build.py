"""Generates the TrackToDeal text-only logos (wordmark + lettermark icon) as outlined SVG.

Every letter is converted to a vector path, so the files render identically without fonts.
Requires: pip install fonttools uharfbuzz
"""
import os
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = {k: os.path.join(HERE, "fonts", f) for k, f in {
    "medium": "InterDisplay-Medium.ttf", "bold": "InterDisplay-Bold.ttf",
    "xbold": "InterDisplay-ExtraBold.ttf", "black": "InterDisplay-Black.ttf",
    "serif": "LiberationSerif-Bold.ttf"}.items()}
_cache = {}


def load(key):
    if key not in _cache:
        path = FONTS[key]
        face = hb.Face(hb.Blob.from_file_path(path))
        tt = TTFont(path)
        _cache[key] = (hb.Font(face), tt, tt.getGlyphSet(), tt.getGlyphOrder(), face.upem)
    return _cache[key]


def metrics(key, size):
    _, tt, _, _, upem = load(key)
    os2 = tt["OS/2"]
    return os2.sCapHeight * size / upem, os2.sxHeight * size / upem


def run(text, key, size, x, y, tracking=0.0, skew=0.0):
    """Shapes `text` (with kerning) and returns (svg path d, advance width, glyph boxes)."""
    font, _, gs, order, upem = load(key)
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(font, buf, {"kern": True, "liga": True})
    k = size / upem
    pen, cx, boxes = SVGPathPen(gs), x, []
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        name = order[info.codepoint]
        # x' = k*gx + skew*k*gy + cx ; y' = -k*gy + y   (skew > 0 leans right)
        gs[name].draw(TransformPen(pen, (k, 0, -skew * k, -k, cx, y)))
        adv = pos.x_advance * k
        boxes.append((cx, adv))
        cx += adv + tracking * size
    return pen.getCommands(), cx - x - tracking * size, boxes


def path(d, fill):
    return f'<path d="{d}" fill="{fill}"/>'


def line(spans, x, y, skew=0.0):
    """spans: list of (text, font, size, color, tracking, gap_after). Returns (svg, width, boxes per span)."""
    out, cx, allboxes = [], x, []
    for text, key, size, color, tr, gap in spans:
        d, w, boxes = run(text, key, size, cx, y, tr, skew)
        out.append(path(d, color))
        allboxes.append(boxes)
        cx += w + gap
    return "".join(out), cx - x, allboxes


def check(cx, cy, r, color, w):
    return (f'<path d="M{cx - r*0.5:.1f} {cy + r*0.02:.1f} L{cx - r*0.12:.1f} {cy + r*0.4:.1f} L{cx + r*0.55:.1f} {cy - r*0.35:.1f}" '
            f'fill="none" stroke="{color}" stroke-width="{w:.1f}" stroke-linecap="round" stroke-linejoin="round"/>')


# ---------------------------------------------------------------- concepts
# Each concept returns (wordmark svg body, width, height) for given ink colours,
# and (icon body) drawn inside a 128x128 tile.

def c_classic(ink, mid, acc):
    body, w, _ = line([("Track", "xbold", 72, ink, -0.02, 0), ("To", "xbold", 72, mid, -0.02, 0),
                       ("Deal", "xbold", 72, acc, -0.02, 0)], 0, 72)
    return body, w, 90


def i_classic(ink, acc):
    capd, _ = metrics("xbold", 70)
    _, w, _ = line([("TD", "xbold", 70, ink, -0.04, 0)], 0, 0)
    b, _, _ = line([("T", "xbold", 70, ink, -0.04, 0), ("D", "xbold", 70, acc, 0, 0)], 64 - w / 2, 64 + capd / 2)
    return b


def c_checko(ink, mid, acc):
    size = 76
    _, xh = metrics("bold", size)
    body, w, boxes = line([("track", "bold", size, ink, -0.025, 0), ("t", "bold", size, mid, -0.025, 0),
                           ("o", "bold", size, "none", -0.025, 0), ("deal", "bold", size, acc, -0.025, 0)], 0, 76)
    ox, oadv = boxes[2][0]
    cx, cy, r = ox + oadv / 2, 76 - xh / 2, xh / 2 + 1
    ring = (f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{acc}"/>' + check(cx, cy, r * 0.95, "#FFFFFF", r * 0.32))
    return body + ring, w, 96


def i_checko(ink, acc):
    size = 64
    _, xh = metrics("bold", size)
    _, w, _ = line([("t", "bold", size, ink, -0.02, 0), ("o", "bold", size, ink, -0.02, 0), ("d", "bold", size, ink, 0, 0)], 0, 0)
    base = 64 + xh / 2 + 4
    b, _, boxes = line([("t", "bold", size, ink, -0.02, 0), ("o", "bold", size, "none", -0.02, 0), ("d", "bold", size, ink, 0, 0)], 64 - w / 2, base)
    ox, oadv = boxes[1][0]
    cx, cy, r = ox + oadv / 2, base - xh / 2, xh / 2 + 1
    return b + f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="{acc}"/>' + check(cx, cy, r * 0.95, "#FFFFFF", r * 0.32)


def c_arrow(ink, mid, acc):
    body, w, _ = line([("TRACK", "black", 64, ink, 0.04, 18), ("→", "black", 64, acc, 0, 18),
                       ("DEAL", "black", 64, ink, 0.04, 0)], 0, 70)
    return body, w, 86


def i_arrow(ink, acc):
    size = 44
    cap, _ = metrics("black", size)
    spans = lambda: [("T", "black", size, ink, 0, 2), ("→", "black", size, acc, 0, 2), ("D", "black", size, ink, 0, 0)]
    _, w, _ = line(spans(), 0, 0)
    b, _, _ = line(spans(), 64 - w / 2, 64 + cap / 2)
    return b


def c_stack(ink, mid, acc):
    size, lead = 50, 48
    a, w1, _ = line([("Track", "black", size, ink, -0.03, 0)], 0, 42)
    b, w2, _ = line([("to", "black", size, mid, -0.03, 0)], 0, 42 + lead)
    c, w3, _ = line([("Deal", "black", size, acc, -0.03, 2), (".", "black", size, ink, 0, 0)], 0, 42 + 2 * lead)
    return a + b + c, max(w1, w2, w3), 42 + 2 * lead + 12


def i_stack(ink, acc):
    size, lead = 30, 27
    _, w, _ = line([("Track", "black", size, ink, -0.03, 0)], 0, 0)
    x, top = 64 - w / 2, 64 - lead + 11
    a, _, _ = line([("Track", "black", size, ink, -0.03, 0)], x, top)
    b, _, _ = line([("to", "black", size, ink, -0.03, 0)], x, top + lead)
    c, _, _ = line([("Deal", "black", size, acc, -0.03, 1), (".", "black", size, ink, 0, 0)], x, top + 2 * lead)
    return a + b + c


def c_underline(ink, mid, acc):
    body, w, boxes = line([("Track", "xbold", 72, ink, -0.02, 0), ("To", "xbold", 72, mid, -0.02, 0),
                           ("Deal", "xbold", 72, acc, -0.02, 0)], 0, 70)
    t0 = boxes[0][0][0]
    d0 = boxes[2][0][0]
    bars = (f'<rect x="{t0:.1f}" y="86" width="{d0 - t0 - 10:.1f}" height="7" rx="3.5" fill="{mid}" fill-opacity="0.35"/>'
            f'<rect x="{d0:.1f}" y="84" width="{w - d0:.1f}" height="11" rx="5.5" fill="{acc}"/>')
    return body + bars, w, 98


def i_underline(ink, acc):
    capd, _ = metrics("xbold", 64)
    _, w, _ = line([("TD", "xbold", 64, ink, -0.04, 0)], 0, 0)
    x = 64 - w / 2
    b, _, boxes = line([("T", "xbold", 64, ink, -0.04, 0), ("D", "xbold", 64, ink, 0, 0)], x, 58 + capd / 2)
    dx, dadv = boxes[1][0]
    return (b + f'<rect x="{x:.1f}" y="{58 + capd/2 + 10:.1f}" width="{dx - x - 6:.1f}" height="6" rx="3" fill="{ink}" fill-opacity="0.35"/>'
            f'<rect x="{dx:.1f}" y="{58 + capd/2 + 8:.1f}" width="{dadv - 3:.1f}" height="9" rx="4.5" fill="{acc}"/>')


def c_period(ink, mid, acc):
    size = 80
    body, w, boxes = line([("tracktodeal", "black", size, ink, -0.035, 0)], 0, 76)
    # green full stop sized to the letter stems
    dot = f'<circle cx="{w + 15:.1f}" cy="65" r="11" fill="{acc}"/>'
    return body + dot, w + 27, 96


def i_period(ink, acc):
    size = 66
    _, xh = metrics("black", size)
    _, w, _ = line([("td", "black", size, ink, -0.03, 0)], 0, 0)
    x = 64 - (w + 20) / 2
    b, _, _ = line([("td", "black", size, ink, -0.03, 0)], x, 64 + xh / 2 + 6)
    return b + f'<circle cx="{x + w + 12:.1f}" cy="{64 + xh/2 - 3:.1f}" r="9" fill="{acc}"/>'


def c_serif(ink, mid, acc):
    body, w, _ = line([("TRACK", "serif", 56, ink, 0.16, 14), ("TO", "serif", 30, mid, 0.2, 16),
                       ("DEAL", "serif", 56, acc, 0.16, 0)], 0, 60)
    rule_y = 80
    rules = (f'<rect x="0" y="{rule_y}" width="{w:.1f}" height="1.5" fill="{acc}" fill-opacity="0.6"/>')
    return body + rules, w, 88


def i_serif(ink, acc):
    capd, _ = metrics("serif", 62)
    _, w, _ = line([("T", "serif", 62, ink, 0, -6), ("D", "serif", 62, acc, 0, 0)], 0, 0)
    b, _, _ = line([("T", "serif", 62, ink, 0, -6), ("D", "serif", 62, acc, 0, 0)], 64 - w / 2, 64 + capd / 2)
    frame = f'<rect x="16" y="16" width="96" height="96" rx="18" fill="none" stroke="{acc}" stroke-opacity="0.55" stroke-width="2"/>'
    return frame + b


def c_italic(ink, mid, acc):
    body, w, _ = line([("TRACK", "black", 70, ink, -0.01, 6), ("TO", "black", 40, acc, 0, 8),
                       ("DEAL", "black", 70, ink, -0.01, 0)], 4, 70, skew=0.2)
    return body, w + 16, 86


def i_italic(ink, acc):
    capd, _ = metrics("black", 66)
    _, w, _ = line([("T", "black", 66, ink, 0, -2), ("D", "black", 66, acc, 0, 0)], 0, 0, skew=0.2)
    b, _, _ = line([("T", "black", 66, ink, 0, -2), ("D", "black", 66, acc, 0, 0)], 64 - w / 2 - 6, 64 + capd / 2, skew=0.2)
    return b


CONCEPTS = [
    # key, name, note, wordmark fn, icon fn, light ink, mid, accent, dark bg
    ("classic", "Bold Classic", "Confident, simple, product-ready.", c_classic, i_classic, "#0A1F44", "#5B6B85", "#16A34A", "#0A1F44"),
    ("check-o", "Check O", "The “o” in “to” becomes a green check.", c_checko, i_checko, "#0A1F44", "#5B6B85", "#22C55E", "#0A1F44"),
    ("arrow", "Track → Deal", "The name reads as the journey.", c_arrow, i_arrow, "#111827", "#6B7280", "#FF6B35", "#111827"),
    ("stacked", "Stacked", "Three lines; the full stop closes the deal.", c_stack, i_stack, "#1E1B4B", "#6366F1", "#10B981", "#1E1B4B"),
    ("progress", "Progress Bar", "An underline that fills up to “Deal”.", c_underline, i_underline, "#0A1F44", "#5B6B85", "#22C55E", "#0A1F44"),
    ("full-stop", "Full Stop", "Lowercase and friendly. Deal done, full stop.", c_period, i_period, "#0B0F17", "#6B7280", "#22C55E", "#0B0F17"),
    ("serif", "Premium Serif", "Spaced capitals in gold, for upmarket property.", c_serif, i_serif, "#0A1F44", "#8A7444", "#B8913A", "#0A1F44"),
    ("italic", "Fast Italic", "Slanted heavy capitals: speed and sales energy.", c_italic, i_italic, "#2E1065", "#7C3AED", "#7C3AED", "#2E1065"),
]

DARK_ACC = {"#16A34A": "#22C55E", "#B8913A": "#D4AF5E", "#7C3AED": "#A3E635"}


def svg(w, h, body, bg=None, scale=2):
    back = f'<rect width="{w:.0f}" height="{h:.0f}" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w*scale:.0f}" height="{h*scale:.0f}" '
            f'role="img" aria-label="TrackToDeal">{back}{body}</svg>')


def main():
    os.chdir(HERE)
    cards = []
    for i, (key, name, note, cw, ci, ink, mid, acc, dark) in enumerate(CONCEPTS, 1):
        pad = 24
        body, w, h = cw(ink, mid, acc)
        W, H = w + 2 * pad, h + 2 * pad
        open(f"{i:02d}-{key}-logo.svg", "w").write(svg(W, H, f'<g transform="translate({pad} {pad})">{body}</g>'))
        dacc = DARK_ACC.get(acc, acc)
        body, w, h = cw("#FFFFFF", "#AAB4C8", dacc)
        open(f"{i:02d}-{key}-logo-dark.svg", "w").write(svg(W, H, f'<g transform="translate({pad} {pad})">{body}</g>', dark))
        icon = f'<rect width="128" height="128" rx="30" fill="{dark}"/>{ci("#FFFFFF", dacc)}'
        open(f"{i:02d}-{key}-icon.svg", "w").write(svg(128, 128, icon, scale=4))
        p = f"{i:02d}-{key}"
        cards.append(f'''<section class="card" style="--dark:{dark};--acc:{dacc}">
  <header><b>{i:02d}</b><h2>{name}</h2><p>{note}</p></header>
  <div class="light"><img src="{p}-logo.svg"></div>
  <div class="row"><div class="dark"><img src="{p}-logo-dark.svg"></div>
    <div class="ic"><img src="{p}-icon.svg" width="72"><img src="{p}-icon.svg" width="40"><img src="{p}-icon.svg" width="20"></div></div>
  <div class="bar"><img src="{p}-icon.svg"><img src="{p}-logo-dark.svg" class="wm"><span>Deals</span><span>Leads</span><em>+ New deal</em></div>
</section>''')
    open("board.html", "w").write('''<!doctype html><html><head><meta charset="utf-8"><title>TrackToDeal Wordmarks</title><style>
body{margin:0;background:#E9EDF3;font-family:Inter,'Segoe UI',Arial,sans-serif;color:#0A1F44;padding:40px}
h1{margin:0 0 6px;font-size:28px}.sub{margin:0 0 28px;color:#5B6B85}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:22px}
.card{background:#fff;border-radius:18px;padding:22px;display:flex;flex-direction:column;gap:12px}
header{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}header b{font-size:11px;color:#fff;background:#0A1F44;border-radius:6px;padding:3px 7px}
h2{margin:0;font-size:18px}header p{margin:0;color:#5B6B85;font-size:13px}
.light{background:#F7F9FC;border-radius:12px;height:150px;display:flex;align-items:center;justify-content:center}.light img{max-width:86%;max-height:110px}
.row{display:flex;gap:12px}.dark{flex:1;background:var(--dark);border-radius:12px;height:110px;display:flex;align-items:center;justify-content:center}.dark img{max-width:80%;max-height:76px}
.ic{display:flex;gap:10px;align-items:flex-end;background:#F1F4F8;border-radius:12px;padding:12px 14px}
.bar{display:flex;align-items:center;gap:14px;background:var(--dark);border-radius:10px;padding:8px 12px;font-size:12px;color:rgba(255,255,255,.75)}
.bar img{height:26px}.bar .wm{height:22px;margin-right:8px}.bar em{margin-left:auto;font-style:normal;background:var(--acc);color:#0b0f17;font-weight:700;border-radius:7px;padding:5px 10px}
</style></head><body><h1>TrackToDeal: text-only logos</h1><p class="sub">Eight logos made only from lettering, each with a matching letter icon. All text is outlined, so the files need no fonts.</p>
<div class="grid">''' + "".join(cards) + "</div></body></html>")


if __name__ == "__main__":
    main()
