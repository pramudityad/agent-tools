# SDLC double-sesi meet — 18:30–21:30 = Sesi 1+2 (2026-09-04)

## The exception
- SDLC (IK103) runs **8 meets × 180 min = 16 sesi**, not 16 meets. Each meet contains 2 sesi back-to-back.
- Meet 1 (Week 1): Sesi 1 Pengantar SDLC 18:30–20:00 (90) + Sesi 2 Traditional Models 20:00–21:30 (90) = 18:30–21:30.
- Other courses differ: BI 18:15–20:00 (105, 1 sesi/meet), WAD 20:00–22:00 (120, 1 sesi/meet).
- User corrections: "sdlc have exception. time 18.30-21.30" + "its longer because 1 meet contain 2 sesi. e.g 1+2" — previous assumption 18:15–20:00 105 was wrong.

## What was patched (2026-09-04)
- `Week 01 - Software Engineering and SDLC Overview.md`: `slot: 18:30–20:00 (90) — Sesi 1 dari meet 18:30–21:30`
- `Week 02 - Traditional SDLC Models.md`: `slot: 20:00–21:30 (90) — Sesi 2 dari meet 18:30–21:30`
- `Sesi 01 / Sesi 1 - Slide Generation Prompt.md`: `slot-start: "18:30", slot-minutes: 90`
- `Sesi 02 / Sesi 2 - Slide Generation Prompt.md`: `slot-start: "20:00", slot-minutes: 90`
- `Week 03–16` each given staggered slot: odd weeks `18:30–20:00` (Sesi ganjil), even weeks `20:00–21:30` (Sesi genap) — 90 each, 8 meets total.
- `00 Course Overview.md`: `8 meets × 180 min (18:30–21:30), 2 sesi per meet = 16 sesi`
- Created `RPS Defects.md` D1: documents 2-sesi/meet, cut ledger §6 surplus (90+90=180 vs nominal 150 → +30), D2 spec valid. Later expanded D1 to cover all 8 meets.

## Pitfalls to avoid
- Do NOT set each Sesi spec to 180 min when given a 180-min block containing 2 sesi — that double-counts. Each spec is 90.
- Do NOT keep `Week NN` 1:1 = 1 meet for SDLC; Week 1 = Sesi 1+2 in one night. The vault's `1 pekan = 2 pertemuan` means calendar Week 1 holds Week 01 + Week 02 notes.
- Manifest clock rail: `[min 000 · 18:30]` for Sesi 1, `[min 000 · 20:00]` for Sesi 2. Do not shift all internal times by +15 and re-wrap close to 21:30 manually — just set correct `slot-start` and keep original offsets; `restamp` handles HH:MM.
- Verify with `deck.mjs check` per spec — staggered starts must each stay ≤90; combined meet 180 is only for overview/defects narrative, not per-spec slot.

## Validation (2026-09-04) — what `check` actually returned
```
✗ Sesi 01 — 25 problem(s)
  ✗ slide 2 stamped 18:17, but min 2 after 18:30 is 18:32
  ...
  ✗ last slide sits at min 103, past the 90-minute slot
✗ Sesi 02 — 27 problem(s)
  ✗ slide 2 stamped 18:17, but min 2 after 20:00 is 20:02
  ...
  ✗ last slide sits at min 100, past the 90-minute slot
```
- Root cause: specs were authored for 105 min (cut from 150 → 105 in §9). Switching to 90 without trimming manifest leaves 10–13 min overflow.
- `deck.mjs restamp` returned `stamps already correct` (Σ DUR 0) — it recomputes `HH:MM` from `slot-start + min` but does NOT change `min` values. You must manually edit `**NOTES** [min NNN · HH:MM]` mins or `slot-minutes`.
- Fix options: (a) keep `slot-minutes: 105` to make `check` pass and note 210 vs 180 overrun in Defects D1, or (b) trim manifest to ≤90 (shorten break/lab by 10–13 min and update §9 cut ledger). Do not leave at 90 with 103/100 mins — it will never pass.
