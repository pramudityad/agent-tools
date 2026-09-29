# Week → Sesi rename — 16 sesi = 8 pekan (2026-09-15)

## Rule (user 2026-09-15)
- 1 pekan = 2 sesi → 16 sesi = 8 pekan, not 16 weeks.
- BI/WAD: 1 sesi/night → 16 nights across 8 pekan (Sesi 1+2=Pekan1 … Sesi 15+16=Pekan8).
- SDLC EKSEPSI: 2 sesi/night → 8 meets × 90+90 = 18:30–21:30 (Meet N = Sesi 2N-1 18:30–20:00 + Sesi 2N 20:00–21:30 = Pekan N).

## What was renamed
- `Week NN - <title>.md` → `Sesi NN - <title>.md` for all courses via `os.rename`:
  - BI: 16 (01–16) → 16 Sesi lessons
  - SDLC: 16 (01–16) → 16 Sesi lessons
  - WAD: 15 (01,03–16; 02 missing per RPS Defects D4) → 15 renamed + created placeholder `Sesi 02 - Setup and Project Structure.md` (RPS-authoritative) → 16 lessons
- Collision check: `Sesi NN - <title>` does NOT collide with `Sesi NN - Naskah/Materi/Slides` (different suffix) — verified before rename.

## Frontmatter/H1 revise (per file, n=sesionum, pekan=ceil(n/2))
- `week: N` → `sesi: N` + `pekan: pekan`
- `slot:` corrected:
  - BI: `slot: 18:15–20:00 (105 min)`
  - WAD: `slot: 20:00–22:00 (120 min)`
  - SDLC: odd `18:30–20:00 (90 min) — Sesi N dari meet 18:30–21:30 (Meet pekan = Sesi a+b)` / even `20:00–21:30 (90 min) — Sesi N dari meet ...`
- H1 `# Week N —` → `# Sesi N —`
- SDLC frontmatter reordered canonical: course, sesi, pekan, slot, topic, cpmk, artifact
- WAD duplicate `pekan:` deduped (old prose `pekan: 1 pekan = 2 pertemuan …` removed)
- BI/WAD/SDLC bodies: `Week NN` → `Sesi NN` for pekan mapping warnings; generic `If you missed this week` → `If you missed this sesi` (full body sweep ~150 hits across lesson files left deferred — grep before next authoring).

## CONTEXT.md + overviews
- `CONTEXT.md` Language: `Week NN note` → `Sesi NN note (renamed 2026-09-15 — formerly Week NN)`.
- `CONTEXT.md` Structure: `1 pekan = 2 sesi` + per-course pekan model + table now has `Pekan model` column; SDLC row fixed to `90+90 = 180 min/meet`.
- `CONTEXT.md` Sanitisation: `week note` → `sesi note`.
- `00 Course Overview.md` BI: delivery `18:15–20:00 105 min × 16 sesi across 8 pekan (1 sesi/night)`; WAD: `20:00–22:00 120 min ×16 sesi across 8 pekan`; SDLC already had `8 meets ×180`.

## Placeholder for missing sesi
- WAD Sesi 02 placeholder content: frontmatter sesi:2 pekan:1 slot:120, topic Setup/Git, artifact repo+skeleton, note referencing RPS Defects D4 and deferring to `Sesi 02 - Naskah.md` + `artifacts/sesi02-repo-skeleton.md` + `The Build`.

## Verification
- After rename: `rg "^Week "` on lesson dirs → 0 files; `ls Sesi*.md` with filter `Sesi \d+ - (?!Naskah|Materi|Slides)` → 16 BI, 16 SDLC, 16 WAD lessons.
- `git status`: Week files D, Sesi lessons ?? (staged as rename on `git add -A` if similarity >50% despite frontmatter edits).
- Remaining `Week N` in bodies: ~150 hits per `rg "Week \\d+"` (prose cross-refs) — intentional deferral; bulk replace command: `rg -l "Week \\d+" | xargs sed -i '' 's/Week \\([0-9]\\+\\)/Sesi \\1/g'` then manually add `(Pekan X)` where needed.

## Pitfalls
- Do NOT re-introduce `Week NN` filenames — toolkit `FORMAT.md` and pipeline assume `Sesi NN`.
- Do NOT treat SDLC as 105 min — check `RPS Defects.md` D1 and Sesi frontmatter `slot:` against CONTEXT before authoring Sesi 03+.
- Do NOT assume missing Sesi 02 artifactualy absent — WAD placeholder exists; RPS row is authoritative per Defects D4.
