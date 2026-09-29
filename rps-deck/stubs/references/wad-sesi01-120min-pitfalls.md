# WAD Sesi 1 — 120-min refit pitfalls (2026-09-04)

Session-specific notes for WAD (20:00–22:00, 120 min) vs the 150-min Week note template.

## DUR rebalance that passed
- Initial manifest Σ DUR = 123 (3 over slot 120) → `check` error `Σ DUR is 123 min, slot is 120 — 3 over`.
- Fix: break `**DUR** 3→6` (+3) and lab `**DUR** 21→18` (-3) = Σ 120. Ran `deck.mjs restamp` — stamps rewritten (slide 24 `094→097`, etc.). `check` then passed.
- Lesson: any DUR change must be followed by `restamp`; don't hand-patch stamps.

## Fenced code ALL-CAPS gotcha
- Raw HTTP examples inside ``` fences:
  ```
  GET /index.html HTTP/1.1
  HTTP/1.1 200 OK
  ```
  failed as `unknown marker GET` / `unknown marker HTTP` (lines 345, 378). Parser does NOT exempt fences.
- Fix: indent 2 spaces + lowercase method/status:
  ```
    get /index.html HTTP/1.1
    http/1.1 200 OK
  ```
  All lines in fence indented so not line-leading ALL-CAPS. Mixed-case headers (`Host:`, `Authorization:`) are safe.

## Slot-specific facts
- WAD real slot 120 min (D1 in `RPS Defects.md`), not 150. Week 01 note already had correct frontmatter `slot: 20:00–22:00 · 120 menit` but session plan table was still 150 — cut ledger in Naskah §6 accounts for -30 (lab 40→18, hook 10→7, core I 35→30, teardown 13→10, etc.).
- Artifact: `artifacts/sesi01-request-flow-nusapay.md` — single diagram source (Flip/Gogogo → NusaPay Orders Service), sanitised by renaming only service name and removing frontmatter tag, no `ce-` token prefix in this file but check still needed.

## Build sequence that worked
```sh
node ~/.agent-tools/rps-deck/deck.mjs check "Sesi 01 - Naskah.md"
node ~/.agent-tools/rps-deck/deck.mjs restamp "Sesi 01 - Naskah.md"
node ~/.agent-tools/rps-deck/deck.mjs build "Sesi 01 - Naskah.md"          # pengampu + mahasiswa
node ~/.agent-tools/rps-deck/deck.mjs approve "Sesi 01 - Naskah.md"
node ~/.agent-tools/rps-deck/deck.mjs build --final "Sesi 01 - Naskah.md"
```
- Output: `sesi01-deck-pengampu.html` (39KB) + `sesi01-deck-mahasiswa.html` (29KB), 25 slides, clock consistent, no FLAGs.
