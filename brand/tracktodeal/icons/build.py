"""Generates 12 TrackToDeal icon options and a comparison board."""
import math

NAVY, NAVY2, GREEN, W = "#0A1F44", "#14366B", "#22C55E", "#FFFFFF"
BG = (f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{NAVY2}"/>'
      f'<stop offset="1" stop-color="{NAVY}"/></linearGradient></defs><rect width="128" height="128" rx="30" fill="url(#g)"/>')

def s(d, c=W, w=7, extra=""):
    return f'<path d="{d}" fill="none" stroke="{c}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round" {extra}/>'

def seal_points(cx=64, cy=62, n=12, ro=40, ri=34):
    pts = []
    for i in range(n * 2):
        r = ro if i % 2 == 0 else ri
        a = math.pi * i / n - math.pi / 2
        pts.append(f"{cx + r*math.cos(a):.1f},{cy + r*math.sin(a):.1f}")
    return " ".join(pts)

ICONS = [
  ("skyline", "Skyline", "Towers rising to a closed deal",
   f'<rect x="24" y="66" width="22" height="38" rx="4" fill="{W}" fill-opacity="0.45"/>'
   f'<rect x="53" y="46" width="22" height="58" rx="4" fill="{W}"/>'
   f'<rect x="82" y="26" width="22" height="78" rx="4" fill="{GREEN}"/>'),
  ("units", "Unit Grid", "A building where every unit is tracked; one is sold",
   s("M34 104 V30 A6 6 0 0 1 40 24 H88 A6 6 0 0 1 94 30 V104 M26 104 H102", W, 6)
   + "".join(f'<rect x="{x}" y="{y}" width="11" height="11" rx="2" fill="{GREEN if (x, y) == (74, 34) else W}" fill-opacity="{1 if (x, y) == (74, 34) else 0.35}"/>'
             for y in (34, 51, 68, 85) for x in (43, 58.5, 74))),
  ("door", "Open Door", "The door opens: keys handed over",
   s("M40 104 V28 H88 V104", W, 7) + s("M26 104 H102", W, 7)
   + f'<path d="M40 28 L72 36 V98 L40 104 Z" fill="{GREEN}"/><circle cx="65" cy="68" r="4" fill="{NAVY}"/>'),
  ("homepin", "Home Pin", "Every property located and tracked",
   f'<path d="M64 108 C64 108 30 80 30 56 A34 34 0 0 1 98 56 C98 80 64 108 64 108 Z" fill="{W}"/>'
   f'<path d="M47 60 L64 45 L81 60 V75 H47 Z" fill="{GREEN}" stroke="{GREEN}" stroke-width="3" stroke-linejoin="round"/>'
   f'<rect x="59.5" y="63" width="9" height="13" rx="1.5" fill="{W}"/>'),
  ("seal", "Deal Seal", "A stamped, approved deal",
   f'<polygon points="{seal_points()}" fill="{GREEN}" stroke="{GREEN}" stroke-width="6" stroke-linejoin="round"/>'
   + s("M48 63 L59 74 L81 51", W, 9)),
  ("target", "Target", "Every lead aimed at a close",
   f'<circle cx="60" cy="68" r="36" fill="none" stroke="{W}" stroke-opacity="0.35" stroke-width="7"/>'
   f'<circle cx="60" cy="68" r="21" fill="none" stroke="{W}" stroke-width="7"/><circle cx="60" cy="68" r="7" fill="{GREEN}"/>'
   + s("M62 66 L92 36", GREEN, 7) + s("M83 31 V45 H97", GREEN, 7)),
  ("kanban", "Pipeline Board", "Cards moving across stages",
   "".join(f'<rect x="24" y="{y}" width="24" height="18" rx="5" fill="{W}" fill-opacity="0.35"/>' for y in (30, 55, 80))
   + "".join(f'<rect x="52" y="{y}" width="24" height="18" rx="5" fill="{W}" fill-opacity="0.75"/>' for y in (30, 55))
   + f'<rect x="80" y="30" width="24" height="43" rx="6" fill="{GREEN}"/>' + s("M86 52 L90.5 56.5 L98 48", W, 5)),
  ("summit", "Summit", "Step by step to the top",
   f'<polygon points="22,104 22,88 44,88 44,72 66,72 66,56 88,56 88,104" fill="{W}" stroke="{W}" stroke-width="4" stroke-linejoin="round"/>'
   + s("M80 56 V24", W, 5) + f'<path d="M80 24 L104 32 L80 40 Z" fill="{GREEN}" stroke="{GREEN}" stroke-width="3" stroke-linejoin="round"/>'),
  ("agreed", "Agreed", "Conversation to confirmation",
   f'<path d="M40 28 H88 A16 16 0 0 1 104 44 V70 A16 16 0 0 1 88 86 H58 L40 102 V86 A16 16 0 0 1 24 70 V44 A16 16 0 0 1 40 28 Z" fill="{GREEN}"/>'
   + s("M48 57 L59 68 L80 46", W, 9)),
  ("link", "Connect", "Buyer and seller linked",
   f'<g transform="rotate(-45 64 64)"><rect x="20" y="48" width="52" height="32" rx="16" fill="none" stroke="{W}" stroke-width="9"/>'
   f'<rect x="56" y="48" width="52" height="32" rx="16" fill="none" stroke="{GREEN}" stroke-width="9"/></g>'),
  ("compass", "Compass", "Always know where each deal is heading",
   f'<circle cx="64" cy="64" r="40" fill="none" stroke="{W}" stroke-opacity="0.35" stroke-width="6"/>'
   f'<polygon points="92,36 72,72 56,56" fill="{GREEN}" stroke="{GREEN}" stroke-width="3" stroke-linejoin="round"/>'
   f'<polygon points="36,92 56,56 72,72" fill="{W}" stroke="{W}" stroke-width="3" stroke-linejoin="round"/><circle cx="64" cy="64" r="4" fill="{NAVY}"/>'),
  ("contract", "Signed", "The contract, signed and approved",
   f'<rect x="30" y="20" width="56" height="78" rx="8" fill="{W}"/>'
   + "".join(s(f"M41 {y} H{x}", NAVY, 5, 'stroke-opacity="0.25"') for y, x in ((38, 75), (50, 75), (62, 63)))
   + s("M41 80 C46 72 50 86 55 78", NAVY, 4, 'stroke-opacity="0.6"')
   + f'<circle cx="88" cy="90" r="20" fill="{GREEN}" stroke="{NAVY}" stroke-width="5"/>' + s("M79 90.5 L85.5 97 L97 84.5", W, 6)),
]

tiles = []
for i, (key, name, idea, body) in enumerate(ICONS, 1):
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="512" height="512" role="img" aria-label="TrackToDeal">{BG}{body}</svg>'
    open(f"{i:02d}-{key}.svg", "w").write(svg)
    f = f"{i:02d}-{key}.svg"
    tiles.append(f'<div class="t"><img src="{f}" class="big"><div class="sizes"><img src="{f}" width="48"><img src="{f}" width="32"><img src="{f}" width="16"></div>'
                 f'<h3><b>{i:02d}</b> {name}</h3><p>{idea}</p></div>')

open("board.html", "w").write('''<!doctype html><html><head><meta charset="utf-8"><title>TrackToDeal Icons</title><style>
body{margin:0;background:#E9EDF3;font-family:Inter,'Segoe UI',Arial,sans-serif;color:#0A1F44;padding:40px}
h1{margin:0 0 6px;font-size:28px}.sub{margin:0 0 28px;color:#5B6B85}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:20px}
.t{background:#fff;border-radius:18px;padding:22px;display:flex;flex-direction:column;align-items:center;text-align:center}
.big{width:140px;filter:drop-shadow(0 6px 14px rgba(10,31,68,.25))}
.sizes{display:flex;gap:14px;align-items:flex-end;margin:16px 0 10px;padding:8px 14px;background:#F1F4F8;border-radius:10px}
h3{margin:4px 0 2px;font-size:16px}h3 b{font-size:11px;color:#fff;background:#0A1F44;border-radius:6px;padding:2px 6px;vertical-align:2px}
p{margin:0;font-size:13px;color:#5B6B85}
</style></head><body><h1>TrackToDeal: icon options</h1><p class="sub">Twelve symbols in the same navy and green, shown at app-icon size and at 48, 32 and 16 px.</p>
<div class="grid">''' + "".join(tiles) + "</div></body></html>")
