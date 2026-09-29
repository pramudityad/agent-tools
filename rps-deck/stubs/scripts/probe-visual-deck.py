#!/usr/bin/env python3
"""Probe a hand-built `Sesi NN - Slides.html` visual deck before handing it off.

    python3 probe-visual-deck.py "Sesi 04 - Slides.html" ["Sesi 04 - Naskah.md"]

Hard failures (exit 1):
  * slide ids not sequential (sub-slides like `s7b` are reported, not failed)
  * a slide without its own `.notes` div
  * no `@media print` / `page-break-after` (the PDF step would silently mis-print)
  * `TODO` / `FLAG` left in visible text
  * a real employer identifier anywhere in the file
  * instructor-only wording in VISIBLE text — the probe strips `.notes` and the hidden
    `#contohContent` box first, which a grep on the raw file cannot do

Warnings (exit 0) when a naskah is given: per-slide `<h2>` / `LEAD` drift from §8. Template
conventions legitimately rewrite the cover title, so these are reported, not failed.
"""

import html as html_mod
import re
import sys
from html.parser import HTMLParser

HIDDEN_IDS = {"contohContent"}
INSTRUCTOR_WORDS = ("proyeksikan", "instruktur", "berkeliling", "jangan di awal",
                    "tampilkan setelah", "setelah 5 menit lab")
EMPLOYER_WORDS = ("cloudeats", "#work/", "flip.id", "alaflip", "gogogo",
                  "custom_module_value", "request_type", "request_log", "biller-svc",
                  "ordering-management-system", "aladin")


class Deck(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.open_divs = 0
        self.hidden_depth = None
        self.slide = None
        self.ids = []
        self.visible = {}
        self.notes = {}
        self.h2 = {}
        self.lead = {}
        self._field = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        classes = a.get("class") or ""
        if tag == "section" and "slide" in classes:
            self.slide = a.get("id") or "?"
            self.ids.append(self.slide)
            self.visible.setdefault(self.slide, "")
        if tag == "div":
            self.open_divs += 1
            if a.get("id") in HIDDEN_IDS and self.hidden_depth is None:
                self.hidden_depth = self.open_divs
        is_notes = tag == "div" and "notes" in classes
        self.stack.append((tag, is_notes))
        if tag in ("h2", "p"):
            self._field = "h2" if tag == "h2" else ("lead" if "lead" in classes else None)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break
        if tag == "div":
            if self.hidden_depth is not None and self.open_divs == self.hidden_depth:
                self.hidden_depth = None
            self.open_divs -= 1
        if tag in ("h2", "p"):
            self._field = None

    def handle_data(self, data):
        text = re.sub(r"\s+", " ", data).strip()
        if not text or not self.slide:
            return
        in_notes = any(flag for _, flag in self.stack)
        if in_notes:
            self.notes[self.slide] = self.notes.get(self.slide, "") + text + " "
            return
        if self.hidden_depth is not None:
            return
        self.visible[self.slide] = self.visible.get(self.slide, "") + text + " "
        if self._field == "h2":
            self.h2[self.slide] = self.h2.get(self.slide, "") + text + " "
        elif self._field == "lead":
            self.lead[self.slide] = self.lead.get(self.slide, "") + text + " "


def manifest(naskah_path):
    """Return {slide number: (title, lead-or-None)} from the naskah's §8."""
    raw = open(naskah_path, encoding="utf-8").read()
    body = raw.split("## 8. Manifest slide")[1].split("\n## 9.")[0]
    parts = re.split(r"### SLIDE (\d+) · (.+)", body)[1:]
    out = {}
    for i in range(0, len(parts), 3):
        number, title, block = int(parts[i]), parts[i + 1].strip(), parts[i + 2]
        lead = re.search(r"^LEAD (.+)$", block, re.M)
        out[number] = (title, lead.group(1).strip() if lead else None)
    return out


def main(argv):
    if not argv:
        print(__doc__.strip())
        return 2
    path = argv[0]
    raw = open(path, encoding="utf-8").read()
    deck = Deck()
    deck.feed(raw)

    fails, warns = [], []

    numbered = [s for s in deck.ids if re.fullmatch(r"s\d+", s)]
    if [int(s[1:]) for s in numbered] != list(range(1, len(numbered) + 1)):
        fails.append(f"slide ids not sequential: {deck.ids}")
    subs = [s for s in deck.ids if s not in numbered]

    missing_notes = [s for s in deck.ids if not deck.notes.get(s, "").strip()]
    if missing_notes:
        fails.append(f"slides without a .notes div: {missing_notes}")

    if "@media print" not in deck.ids and "@media print" not in raw:
        fails.append("no @media print block")
    if "page-break-after" not in raw:
        fails.append("no page-break-after — slides will not paginate")

    for word in ("TODO", "FLAG"):
        hit = [s for s in deck.ids if re.search(rf"\b{word}\b", deck.visible.get(s, ""))]
        if hit:
            fails.append(f"visible {word} on {hit}")

    low = raw.lower()
    leaks = sorted({w for w in EMPLOYER_WORDS if w in low})
    if leaks:
        fails.append(f"employer identifiers present: {leaks}")

    for word in INSTRUCTOR_WORDS:
        hit = [s for s in deck.ids if word in deck.visible.get(s, "").lower()]
        if hit:
            fails.append(f"instructor wording '{word}' visible on {hit}")

    if len(argv) > 1:
        man = manifest(argv[1])
        for number, (title, lead) in man.items():
            sid = f"s{number}"
            if sid not in deck.visible:
                warns.append(f"{sid}: in naskah §8 but not in the deck")
                continue
            key = re.sub(r"[^a-z0-9]", "", title.split(" — ")[0].split(" · ")[-1].lower())[:10]
            have = re.sub(r"[^a-z0-9]", "", deck.h2.get(sid, "").lower())
            if key and key not in have:
                warns.append(f"{sid}: title drift — naskah '{title}' vs h2 '{deck.h2.get(sid, '').strip()[:50]}'")
            if lead:
                probe = re.sub(r"\s+", " ", lead)[:38]
                if probe not in re.sub(r"\s+", " ", deck.visible.get(sid, "")):
                    warns.append(f"{sid}: LEAD not found verbatim: '{probe}…'")

    print(f"{path}: {len(deck.ids)} sections, {len(deck.notes)} notes divs"
          + (f", sub-slides {subs}" if subs else ""))
    for warn in warns:
        print(f"  ⚠ {warn}")
    for fail in fails:
        print(f"  ✗ {fail}")
    if not fails:
        print("  ✓ structure, notes, print CSS and visible-text hygiene clean")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
