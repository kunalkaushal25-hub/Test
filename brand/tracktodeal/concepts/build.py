"""Generates the TrackToDeal concept SVGs and the comparison board."""
FONT = "Inter, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif"

def bg(c1, c2):
    return (f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
            f'<stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></linearGradient></defs>'
            f'<rect width="128" height="128" rx="30" fill="url(#g)"/>')

def stroke(d, color, w, extra=""):
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round" {extra}/>'

CONCEPTS = [
  dict(key="momentum", name="Momentum", idea="Pipeline stages moving forward into a closed deal.",
       bg=("#14366B", "#0A1F44"), ink="#0A1F44", accent="#22C55E", soft="#5B6B85",
       palette=[("Deal Navy", "#0A1F44"), ("Track Blue", "#14366B"), ("Closed Green", "#22C55E")],
       mark=lambda: stroke("M22 44 L40 64 L22 84", "#FFFFFF", 10, 'stroke-opacity="0.45"')
                  + stroke("M46 44 L64 64 L46 84", "#FFFFFF", 10)
                  + '<circle cx="93" cy="64" r="21" fill="#22C55E"/>'
                  + stroke("M83.5 64.5 L90.5 71.5 L103 57.5", "#FFFFFF", 6.5),
       word=("Track", "to", "Deal"), case="title"),
  dict(key="progress", name="Progress Ring", idea="A deal's journey as a progress ring that closes in green.",
       bg=("#4F46E5", "#312E81"), ink="#1E1B4B", accent="#34D399", soft="#6366F1",
       palette=[("Indigo", "#312E81"), ("Electric", "#4F46E5"), ("Mint", "#34D399")],
       mark=lambda: '<circle cx="64" cy="64" r="36" fill="none" stroke="#FFFFFF" stroke-opacity="0.18" stroke-width="12"/>'
                  + '<circle cx="64" cy="64" r="36" fill="none" stroke="#FFFFFF" stroke-width="12" stroke-linecap="round" stroke-dasharray="160 400" transform="rotate(-90 64 64)"/>'
                  + '<circle cx="64" cy="64" r="36" fill="none" stroke="#34D399" stroke-width="12" stroke-linecap="round" stroke-dasharray="34 400" stroke-dashoffset="-180" transform="rotate(-90 64 64)"/>'
                  + stroke("M50 65 L60 75 L79 55", "#FFFFFF", 9),
       word=("track", "to", "deal"), case="lower"),
  dict(key="monogram", name="TD Monogram", idea="T and D share one stroke: a compact, ownable lettermark.",
       bg=("#1F2937", "#0B0F17"), ink="#111827", accent="#FF6B35", soft="#6B7280",
       palette=[("Graphite", "#111827"), ("Steel", "#6B7280"), ("Signal Orange", "#FF6B35")],
       mark=lambda: stroke("M50 36 H66 A28 28 0 0 1 66 92 H50", "#FF6B35", 14)
                  + stroke("M24 36 H50 M50 36 V92", "#FFFFFF", 14),
       word=("Track", "to", "Deal"), case="title"),
  dict(key="pin", name="Deal Pin", idea="Location pin + check: tracking every property to a confirmed deal.",
       bg=("#0F766E", "#134E4A"), ink="#134E4A", accent="#F5B700", soft="#0F766E",
       palette=[("Deep Teal", "#134E4A"), ("Teal", "#0F766E"), ("Gold", "#F5B700")],
       mark=lambda: '<path d="M64 106 C64 106 32 78 32 56 A32 32 0 0 1 96 56 C96 78 64 106 64 106 Z" fill="#F5B700"/>'
                  + stroke("M49 56 L60 67 L80 46", "#134E4A", 9),
       word=("Track", "to", "Deal"), case="title"),
  dict(key="funnel", name="Funnel", idea="Leads narrow down the funnel; the last stage is the win.",
       bg=("#6D28D9", "#2E1065"), ink="#2E1065", accent="#A3E635", soft="#7C3AED",
       palette=[("Night Violet", "#2E1065"), ("Violet", "#6D28D9"), ("Lime", "#A3E635")],
       mark=lambda: '<rect x="26" y="32" width="76" height="16" rx="8" fill="#FFFFFF" fill-opacity="0.5"/>'
                  + '<rect x="38" y="56" width="52" height="16" rx="8" fill="#FFFFFF"/>'
                  + '<rect x="50" y="80" width="28" height="16" rx="8" fill="#A3E635"/>',
       word=("track", "to", "deal"), case="lower"),
  dict(key="home", name="Home Close", idea="A home with a check inside: premium real-estate deal tracking.",
       bg=("#13315C", "#0A1F44"), ink="#0A1F44", accent="#C9A24B", soft="#8A7444",
       palette=[("Royal Navy", "#0A1F44"), ("Harbour", "#13315C"), ("Champagne Gold", "#C9A24B")],
       mark=lambda: stroke("M28 60 L64 30 L100 60", "#C9A24B", 9)
                  + stroke("M38 54 V96 H90 V54", "#C9A24B", 9)
                  + stroke("M51 73 L60 82 L77 64", "#FFFFFF", 8),
       word=("TRACK", "TO", "DEAL"), case="upper"),
]

def icon_svg(c, size=512):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="{size}" height="{size}" role="img" aria-label="TrackToDeal">'
            f'{bg(*c["bg"])}{c["mark"]()}</svg>')

def wordmark(c, x, y, size, ink, mid):
    a, b, d = c["word"]
    if c["case"] == "upper":
        return (f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size*0.62}" font-weight="700" letter-spacing="{size*0.07}">'
                f'<tspan fill="{ink}">{a}</tspan><tspan fill="{mid}" font-weight="400" dx="{size*0.05}">{b}</tspan>'
                f'<tspan fill="{c["accent"]}" dx="{size*0.05}">{d}</tspan></text>')
    if c["case"] == "lower":
        return (f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" font-weight="800" letter-spacing="{-size*0.03}">'
                f'<tspan fill="{ink}">{a}{b}</tspan><tspan fill="{c["accent"] if c["key"] != "funnel" else c["soft"]}">{d}</tspan></text>')
    return (f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" font-weight="800" letter-spacing="{-size*0.025}">'
            f'<tspan fill="{ink}">{a}</tspan><tspan fill="{mid}" font-weight="500" font-size="{size*0.68}" dx="{size*0.06}">{b}</tspan>'
            f'<tspan fill="{c["accent"]}" dx="{size*0.06}">{d}</tspan></text>')

def lockup_svg(c, dark=False):
    ink = "#FFFFFF" if dark else c["ink"]
    mid = "#AAB4C8" if dark else "#7A8499"
    back = f'<rect width="560" height="160" fill="{c["bg"][1]}"/>' if dark else ""
    inner = f'{bg(*c["bg"])}{c["mark"]()}'
    if dark:
        inner = inner.replace('fill="url(#g)"/>', 'fill="url(#g)" stroke="#FFFFFF" stroke-opacity="0.15" stroke-width="2"/>', 1)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 160" width="1120" height="320" role="img" aria-label="TrackToDeal">'
            f'{back}<g transform="translate(16 16)">{inner}</g>{wordmark(c, 168, 101, 62, ink, mid)}</svg>')

cards = []
for i, c in enumerate(CONCEPTS, 1):
    k = c["key"]
    open(f"{k}-icon.svg", "w").write(icon_svg(c))
    open(f"{k}-logo.svg", "w").write(lockup_svg(c))
    open(f"{k}-logo-dark.svg", "w").write(lockup_svg(c, dark=True))
    sw = "".join(f'<span style="background:{h}" title="{n} {h}"></span>' for n, h in c["palette"])
    cards.append(f'''
<section class="card" style="--ink:{c["ink"]};--bg1:{c["bg"][0]};--bg2:{c["bg"][1]};--acc:{c["accent"]}">
  <header><b>{i:02d}</b><div><h2>{c["name"]}</h2><p>{c["idea"]}</p></div><div class="sw">{sw}</div></header>
  <div class="stage"><img src="{k}-logo.svg" class="lock"></div>
  <div class="row">
    <div class="dark"><img src="{k}-logo-dark.svg"></div>
    <div class="phone"><img src="{k}-icon.svg"><small>TrackToDeal</small></div>
  </div>
  <div class="row">
    <div class="tab"><img src="{k}-icon.svg"><span>Pipeline · TrackToDeal</span><i>×</i></div>
    <div class="appbar"><img src="{k}-icon.svg"><span>Deals</span><span>Leads</span><span>Reports</span><em>+ New deal</em></div>
  </div>
</section>''')

open("board.html", "w").write(f'''<!doctype html><html><head><meta charset="utf-8"><title>TrackToDeal Concepts</title>
<style>
body{{margin:0;background:#E9EDF3;font-family:{FONT};color:#0F172A;padding:40px}}
h1{{font-size:28px;margin:0 0 6px}} .sub{{margin:0 0 28px;color:#5B6B85}}
.grid{{display:grid;grid-template-columns:1fr 1fr;gap:24px}}
.card{{background:#fff;border-radius:18px;padding:22px;display:flex;flex-direction:column;gap:14px}}
.card header{{display:flex;gap:14px;align-items:flex-start}} .card header b{{font-size:13px;color:#fff;background:var(--ink);border-radius:8px;padding:4px 8px}}
.card header div{{flex:1}} h2{{margin:0;font-size:18px}} .card p{{margin:2px 0 0;color:#5B6B85;font-size:13px}}
.sw{{display:flex;gap:4px;flex:none!important}} .sw span{{width:22px;height:22px;border-radius:6px;display:block}}
.stage{{background:#F7F9FC;border-radius:12px;display:flex;justify-content:center;padding:14px}} .lock{{width:440px}}
.row{{display:flex;gap:12px}} .dark{{flex:1;background:var(--bg2);border-radius:12px;display:flex;align-items:center;justify-content:center}} .dark img{{width:300px}}
.phone{{width:120px;background:linear-gradient(160deg,#cfd8e6,#9fb0c8);border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px 0;gap:4px}}
.phone img{{width:60px;border-radius:14px;box-shadow:0 4px 10px rgba(0,0,0,.25)}} .phone small{{font-size:10px;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.4)}}
.tab{{display:flex;align-items:center;gap:8px;background:#F1F3F6;border-radius:10px 10px 0 0;padding:9px 12px;font-size:12px;width:210px;border-bottom:2px solid var(--acc)}}
.tab img{{width:16px;height:16px}} .tab span{{flex:1;white-space:nowrap}} .tab i{{font-style:normal;color:#94a3b8}}
.appbar{{flex:1;display:flex;align-items:center;gap:16px;background:var(--ink);border-radius:10px;padding:8px 12px;font-size:12px;color:rgba(255,255,255,.75)}}
.appbar img{{width:26px;height:26px}} .appbar em{{margin-left:auto;font-style:normal;background:var(--acc);color:#0b0f17;font-weight:700;border-radius:7px;padding:5px 10px}}
</style></head><body>
<h1>TrackToDeal: brand concepts</h1><p class="sub">Six directions, each shown as logo, dark version, app icon, browser tab and product header.</p>
<div class="grid">{"".join(cards)}</div></body></html>''')
