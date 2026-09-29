#!/usr/bin/env python3
"""TEMPLATE — generator scene Excalidraw untuk satu sesi (satu frame = satu klaim slide).

Cara pakai: salin berkas ini ke <course>/tools/, ganti isi build_* dan daftar BUILDERS,
lalu jalankan `python3 <nama>.py` (tulis scene) atau `python3 <nama>.py --check` (validasi saja).

Bentuk ini diambil dari BI Sesi 04 2026-09-18 (6 frame, 141 elemen) — struktur helpers,
koordinat lokal per frame, dan baterai validasi di validate() semuanya sudah terbukti.
Detail format + jebakan: references/excalidraw-session-diagrams.md.
"""

import json
import os
import sys

OUT = ("/Users/flp9damarpramuditya/Documents/Obsidian Vault/04-Extras/Excalidraw/"
       "Sesi NN - <Judul>.excalidraw")

NAVY, TEAL, AMBER, RED, GREEN, MUTED = "#0f2a44", "#0e6e6e", "#b45309", "#b3392f", "#1f6b3b", "#5a6675"
SOFT = {"teal": "#dcefed", "amber": "#fdf3e3", "red": "#fbeae9", "green": "#e6f2ea",
        "grey": "#eef1f5", "navy": "#e8edf3"}
FG = {"teal": NAVY, "amber": AMBER, "red": RED, "green": GREEN, "grey": MUTED, "navy": NAVY}

_frame_prefix = ""
_seed = 0


def _base(kind, id_, x, y, w, h, **extra):
    global _seed
    _seed += 1
    el = {
        "id": id_, "type": kind, "x": x, "y": y, "width": w, "height": h, "angle": 0,
        "strokeColor": TEAL, "backgroundColor": "transparent", "fillStyle": "solid",
        "strokeWidth": 2, "strokeStyle": "solid", "roughness": 1, "opacity": 100,
        "groupIds": [], "frameId": _frame_prefix or None, "roundness": {"type": 3},
        "seed": _seed, "version": 1, "versionNonce": _seed, "isDeleted": False,
        "boundElements": [], "updated": 1, "link": None, "locked": False,
    }
    el.update(extra)
    return el


def _wrap(s, width):
    """Perkiraan kasar pembungkusan teks: 0.55em per karakter."""
    out = []
    for para in s.split("\n"):
        line, n = "", 0
        for word in para.split(" "):
            if n + len(word) + 1 > width and line:
                out.append(line); line, n = word, len(word)
            else:
                line = f"{line} {word}".strip(); n += len(word) + 1
        out.append(line)
    return out


def box(id_, x, y, label, w=230, h=90, fill="teal", size=16, align="center", dashed=False):
    """Kotak + teks terikat di dalamnya (containerId + boundElements)."""
    rect = _base("rectangle", id_, x, y, w, h, strokeColor=FG[fill], backgroundColor=SOFT[fill],
                 strokeStyle="dashed" if dashed else "solid")
    lines = _wrap(label, int(w / (size * 0.58)))
    tw, th = round(w - 20, 1), round(len(lines) * size * 1.25, 1)
    txt = _base("text", id_ + "-t", round(x + 10, 1), round(y + (h - th) / 2, 1), tw, th,
                text="\n".join(lines), originalText=label, fontSize=size, fontFamily=2,
                textAlign=align, verticalAlign="middle", containerId=id_, lineHeight=1.25,
                strokeColor=FG[fill], roundness=None, strokeWidth=1)
    rect["boundElements"] = [{"id": txt["id"], "type": "text"}]
    return [rect, txt]


def label(id_, x, y, s, size=16, color=NAVY, w=None, align="left"):
    lines = _wrap(s, int((w or 900) / (size * 0.58)))
    return _base("text", id_, x, y, w or round(max(len(l) for l in lines) * size * 0.6, 1),
                 round(len(lines) * size * 1.25, 1), text="\n".join(lines), originalText=s,
                 fontSize=size, fontFamily=2, textAlign=align, verticalAlign="top",
                 containerId=None, lineHeight=1.25, strokeColor=color, roundness=None, strokeWidth=1)


def arrow(id_, x1, y1, x2, y2, bind_start=None, bind_end=None, dashed=False, color=TEAL):
    el = _base("arrow", id_, x1, y1, round(x2 - x1, 1), round(y2 - y1, 1),
               points=[[0, 0], [round(x2 - x1, 1), round(y2 - y1, 1)]], lastCommittedPoint=None,
               startArrowhead=None, startBinding=None, endArrowhead="arrow", endBinding=None,
               strokeColor=color, strokeStyle="dashed" if dashed else "solid", roundness={"type": 2})
    if bind_start:
        el["startBinding"] = {"elementId": bind_start, "focus": 0, "gap": 6}
    if bind_end:
        el["endBinding"] = {"elementId": bind_end, "focus": 0, "gap": 6}
    return el


def frame(id_, name, x, y, w=1180, h=780):
    global _frame_prefix
    _frame_prefix = id_
    return _base("frame", id_, x, y, w, h, name=name, strokeColor="#c6ced7",
                 backgroundColor="transparent", strokeWidth=1, roughness=0, roundness=None,
                 strokeStyle="solid", boundElements=[])


# ── satu frame contoh: ganti/tambah sesuai sesi ─────────────────────────────

def build_contoh():
    els = [label("c-title", 40, 40, "Judul frame — satu kalimat, 28 px", 28)]
    els += box("c-a", 40, 120, "Langkah pertama", 240, 90, "grey")
    els += box("c-b", 340, 120, "Langkah kedua", 240, 90, "amber")
    els += box("c-c", 640, 120, "Hasil", 240, 90, "green")
    els.append(arrow("c-a1", 280, 165, 340, 165, "c-a", "c-b"))
    els.append(arrow("c-a2", 580, 165, 640, 165, "c-b", "c-c"))
    els += box("c-broken", 940, 120, "jalur yang tidak aman", 200, 90, "red", dashed=True)
    els.append(label("c-note", 40, 240, "Catatan kaki: satu paragraf, warna muted, jangan ulangi isi slide.",
                     16, MUTED, w=1100))
    return els


# (nama, builder, x, y, lebar, tinggi) — frame lebar (timeline) dapat satu baris penuh
BUILDERS = [("F1 · Judul frame", build_contoh, 0, 0, 1260, 560)]


def scene():
    global _frame_prefix
    elements = []
    for idx, (name, build, x, y, w, h) in enumerate(BUILDERS):
        fid = f"frame{idx + 1}"
        elements.append(frame(fid, name, x, y, w, h))
        kids = build()
        for el in kids:                      # koordinat builder selalu lokal ke frame
            el["x"] += x
            el["y"] += y
            el["frameId"] = fid
        elements.extend(kids)
    _frame_prefix = ""
    return {"type": "excalidraw", "version": 2, "source": "https://excalidraw.com",
            "elements": elements, "appState": {"gridSize": None, "viewBackgroundColor": "#ffffff"},
            "files": {}}


def validate(data):
    ids, problems = set(), []
    frames = [e for e in data["elements"] if e["type"] == "frame"]
    for e in data["elements"]:
        if e["id"] in ids:
            problems.append(f"id ganda: {e['id']}")
        ids.add(e["id"])
    for e in data["elements"]:
        if e["type"] == "arrow":
            for k in ("startBinding", "endBinding"):
                b = e.get(k)
                if b and b["elementId"] not in ids:
                    problems.append(f"{e['id']}: {k} menunjuk {b['elementId']} yang tidak ada")
        if e["type"] == "text" and e.get("containerId") and e["containerId"] not in ids:
            problems.append(f"{e['id']}: containerId hilang")
        if e["type"] == "rectangle":
            for b in e.get("boundElements") or []:
                if b["id"] not in ids:
                    problems.append(f"{e['id']}: boundElements menunjuk {b['id']} yang tidak ada")
    for f in frames:
        kids = [e for e in data["elements"] if e.get("frameId") == f["id"]]
        out = [e["id"] for e in kids if not (f["x"] <= e["x"] and f["y"] <= e["y"]
                                            and e["x"] + e["width"] <= f["x"] + f["width"]
                                            and e["y"] + e["height"] <= f["y"] + f["height"])]
        if out:
            problems.append(f"frame {f['name']}: {len(out)} elemen keluar batas ({out[:3]})")
    return frames, problems


if __name__ == "__main__":
    data = scene()
    frames, problems = validate(data)
    if "--check" in sys.argv:
        print(f"elements: {len(data['elements'])} · frames: {len(frames)}")
        for f in frames:
            kids = [e for e in data["elements"] if e.get("frameId") == f["id"]]
            print(f"  {f['name']:<32} {len(kids):>3} elemen")
        print("masalah:", problems or "tidak ada")
        sys.exit(1 if problems else 0)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
    print(f"✓ {OUT} — {len(data['elements'])} elemen · {len(frames)} frame · "
          f"{os.path.getsize(OUT) // 1024} KB")
    print("masalah:", problems or "tidak ada")
