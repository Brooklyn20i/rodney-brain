#!/usr/bin/env python3
"""Draw a high-fidelity mockup of Cadence on an iPad canvas."""
from PIL import Image, ImageDraw, ImageFont
import os, math

# ── Canvas (iPad Pro 11" landscape proportion) ──────────────────────────────
W, H = 1366, 1024
PAD = 0

# ── Colour palette ───────────────────────────────────────────────────────────
BG        = (242, 242, 247)
BG2       = (255, 255, 255)
BG3       = (242, 242, 247)
ACCENT    = (56,  96, 140)
ACCENT_LT = (74, 122, 174)
LABEL     = (28,  28,  30)
LABEL2    = (140, 140, 150)
LABEL3    = (200, 200, 210)
SEP       = (210, 210, 218)
RED       = (255,  59,  48)
ORANGE    = (255, 149,   0)
GREEN     = ( 52, 199,  89)
BLUE      = (  0, 122, 255)
PURPLE    = (175,  82, 222)
TEAL      = ( 48, 176, 199)
INDIGO    = ( 88,  86, 214)

# ── Font helpers ──────────────────────────────────────────────────────────────
def load(size, bold=False):
    paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf" if bold else "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    ]
    for p in paths:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

F10  = load(10)
F11  = load(11)
F12  = load(12)
F13  = load(13)
F14  = load(14)
F15  = load(15)
F16  = load(16)
F13B = load(13, bold=True)
F14B = load(14, bold=True)
F15B = load(15, bold=True)
F16B = load(16, bold=True)
F18B = load(18, bold=True)
F20B = load(20, bold=True)
F24B = load(24, bold=True)
F28B = load(28, bold=True)

# ── Drawing helpers ───────────────────────────────────────────────────────────
img = Image.new("RGB", (W, H), BG2)
d   = ImageDraw.Draw(img)

def rect(x, y, w, h, fill, r=0):
    if r == 0:
        d.rectangle([x, y, x+w, y+h], fill=fill)
    else:
        d.rounded_rectangle([x, y, x+w, y+h], radius=r, fill=fill)

def line(x1, y1, x2, y2, fill=SEP, w=1):
    d.line([x1, y1, x2, y2], fill=fill, width=w)

def text(s, x, y, font=F14, fill=LABEL, anchor="la"):
    d.text((x, y), s, font=font, fill=fill, anchor=anchor)

def badge(s, x, y, bg, fg=BG2, r=10):
    bw, bh = d.textlength(s, font=F12) + 16, 20
    rect(x, y, bw, bh, bg, r=r)
    text(s, x + bw//2, y + bh//2, F12, fg, anchor="mm")
    return bw

def tag(s, x, y, fill_col, text_col):
    bw = d.textlength(s, font=F12) + 16
    r_img = Image.new("RGB", (int(bw)+2, 22), BG2)
    rd = ImageDraw.Draw(r_img)
    rd.rounded_rectangle([0, 0, int(bw)+1, 21], radius=11,
                          fill=(*fill_col, 30) if len(fill_col)==3 else fill_col,
                          outline=(*fill_col, 60) if len(fill_col)==3 else fill_col)
    # merge — just draw directly
    faded = tuple(min(255, int(c + (255-c)*0.85)) for c in fill_col)
    rect(x, y, int(bw)+2, 22, faded, r=11)
    text(s, x+int(bw)//2+1, y+11, F12, text_col, anchor="mm")
    return int(bw)+4

def shadow_rect(x, y, w, h, fill=BG2, r=12):
    # soft shadow
    for i in range(4, 0, -1):
        alpha = 8 + i*4
        sh = tuple(max(0, c - alpha) for c in BG)
        d.rounded_rectangle([x+i, y+i, x+w+i, y+h+i], radius=r, fill=sh)
    rect(x, y, w, h, fill, r=r)

# ══════════════════════════════════════════════════════════════════════════════
# LAYOUT
# ══════════════════════════════════════════════════════════════════════════════
SIDEBAR_W = 230
DETAIL_X  = SIDEBAR_W
DETAIL_W  = W - SIDEBAR_W

# ── Background ────────────────────────────────────────────────────────────────
rect(0, 0, W, H, BG)

# ══════════════════════════════════════════════════════════════════════════════
# SIDEBAR
# ══════════════════════════════════════════════════════════════════════════════
rect(0, 0, SIDEBAR_W, H, BG2)
line(SIDEBAR_W, 0, SIDEBAR_W, H)

# App title
text("Cadence", 20, 24, F24B, LABEL)

# Nav items
nav = [
    ("☀", "Today",     True),
    ("⊡", "Capture",   False),
    ("↓", "Inbox",     False, 7),
    None,
    ("▤", "Projects",  False),
    ("✦", "People",    False, 2),
    ("⚖", "Decisions", False),
    None,
    ("✓", "Review",    False),
    ("⌕", "Search",    False),
    ("⚙", "Settings",  False),
]

ny = 70
for item in nav:
    if item is None:
        line(16, ny+4, SIDEBAR_W-16, ny+4)
        ny += 16
        continue
    icon, label = item[0], item[1]
    active = item[2] if len(item) > 2 else False
    badge_n = item[3] if len(item) > 3 else None

    if active:
        rect(8, ny, SIDEBAR_W-16, 38, ACCENT, r=10)
        text(icon, 24, ny+19, F16, BG2, anchor="mm")
        text(label, 44, ny+19, F15B, BG2, anchor="lm")
    else:
        text(icon, 24, ny+19, F16, ACCENT, anchor="mm")
        text(label, 44, ny+19, F15, LABEL, anchor="lm")

    if badge_n:
        bx = SIDEBAR_W - 40
        col = BG2 if active else RED
        tc  = RED if not active else BG2
        if active: tc = BG2; col = (255, 255, 255, 80)
        badge(str(badge_n), bx, ny+9, RED if not active else (255,255,255,60), BG2 if not active else ACCENT)

    ny += 42

# ══════════════════════════════════════════════════════════════════════════════
# TODAY SCREEN
# ══════════════════════════════════════════════════════════════════════════════
DX = DETAIL_X + 24
DY = 0

# Nav bar
rect(DETAIL_X, 0, DETAIL_W, 72, BG2)
line(DETAIL_X, 72, W, 72)
text("Today",          DX, 20, F28B, LABEL)
text("Monday, 9 June 2026", DX, 50, F14, LABEL2)

# Quick capture button
qcx = W - 180
rect(qcx, 18, 156, 36, ACCENT, r=18)
text("Quick Capture", qcx+78, 36, F14B, BG2, anchor="mm")

y = 88

# Focus block
rect(DX, y, DETAIL_W-48, 54, (230, 238, 248), r=12)
d.rounded_rectangle([DX, y, DX+DETAIL_W-48, y+54], radius=12,
                    fill=(230, 238, 248), outline=(180, 210, 240), width=1)
text("SUGGESTED FOCUS", DX+52, y+14, F11, ACCENT)
text("Prepare board presentation materials", DX+52, y+32, F15B, LABEL)
text("🧠", DX+18, y+27, F20B, ACCENT, anchor="mm")
y += 68

# ── Top 3 Priorities ──────────────────────────────────────────────────────────
text("TOP 3 PRIORITIES", DX, y, F11, LABEL2)
badge("3", DX + d.textlength("TOP 3 PRIORITIES", font=F11) + 8, y-1, ACCENT)
y += 20

CW = (DETAIL_W - 48 - 20) // 3  # card width
cards = [
    ("Approve Q3 budget increase",      "Decision",  INDIGO, "High",   RED,    "⚠ Overdue"),
    ("Prepare board presentation",      "Task",      BLUE,   "High",   RED,    "Today"),
    ("Chase Sarah on vendor contract",  "Follow Up", ORANGE, "Medium", ORANGE, "Today"),
]
for i, (title, typ, tc, pri, pc, due) in enumerate(cards):
    cx = DX + i * (CW + 10)
    shadow_rect(cx, y, CW, 96)
    ty = y + 12
    tag(typ, cx+12, ty, tc, tc)
    p_x = cx + CW - 12 - int(d.textlength(pri, font=F12)) - 16
    tag(pri, p_x, ty, pc, pc)
    # title (wrap manually)
    words = title.split()
    line1, line2 = "", ""
    for w in words:
        test = (line1 + " " + w).strip()
        if d.textlength(test, font=F14B) < CW - 24:
            line1 = test
        else:
            line2 = (line2 + " " + w).strip()
    text(line1, cx+12, ty+28, F14B, LABEL)
    if line2: text(line2, cx+12, ty+44, F14B, LABEL)
    due_col = RED if "Overdue" in due else LABEL2
    text(due, cx+12, ty+66, F12, due_col)
y += 110

# ── Overdue ───────────────────────────────────────────────────────────────────
text("OVERDUE", DX, y, F11, LABEL2)
badge("2", DX + d.textlength("OVERDUE", font=F11) + 8, y-1, RED)
y += 20

for title, typ, tc in [
    ("Integration deadline risk — escalate to James", "Risk",          RED),
    ("Send revised project timeline to stakeholders",  "Meeting Action", TEAL),
]:
    shadow_rect(DX, y, DETAIL_W-48, 52)
    tag(typ, DX+12, y+16, tc, tc)
    text(title, DX + 12 + int(d.textlength(typ, font=F12))+20, y+27, F14B, LABEL, anchor="lm")
    text("⚠ Overdue", W - 130, y+27, F12, RED, anchor="lm")
    y += 62

# ── Waiting on Others ─────────────────────────────────────────────────────────
text("WAITING ON OTHERS", DX, y, F11, LABEL2)
badge("3", DX + d.textlength("WAITING ON OTHERS", font=F11) + 8, y-1, PURPLE)
y += 20

for title, days in [
    ("Legal review of supplier agreement",  "5 days"),
    ("Finance sign-off on headcount plan",  "2 days"),
]:
    shadow_rect(DX, y, DETAIL_W-48, 50)
    tag("Waiting For", DX+12, y+14, PURPLE, PURPLE)
    text(title, DX+110, y+25, F14B, LABEL, anchor="lm")
    text(days, W-130, y+25, F12, LABEL2, anchor="lm")
    y += 60

# ── Decisions needed ─────────────────────────────────────────────────────────
text("DECISIONS NEEDED", DX, y, F11, LABEL2)
badge("2", DX + d.textlength("DECISIONS NEEDED", font=F11) + 8, y-1, INDIGO)
y += 20

for title, status, sc in [
    ("Approve Q3 budget increase for engineering", "Overdue",  RED),
    ("Choose cloud vendor — AWS vs GCP",           "Due Fri",  ORANGE),
]:
    shadow_rect(DX, y, DETAIL_W-48, 50)
    text(title, DX+12, y+25, F14B, LABEL, anchor="lm")
    badge(status, W - 120, y+15, sc)
    y += 60

# ══════════════════════════════════════════════════════════════════════════════
# Save
# ══════════════════════════════════════════════════════════════════════════════
out = "/home/user/rodney-brain/Cadence/cadence-preview.png"
img.save(out, "PNG", optimize=True)
print(f"Saved {out}  ({W}x{H})")
