# BI Sesi 02 — dual-artifact sanitisation + 150→105 min refit

Canonical for any Cakrawala session that projects 2 artifacts and must compress 150 → 105.

## Artifacts (Week 02 note, lines 151–172)

| # | Source (vault) | Sanitised dst | Map | Sections kept |
|---|----------------|---------------|-----|---------------|
| 1 | `02-Projects/Cloudeats/docs/RFC/MENU_SYNC_DASHBOARD_IMPLEMENTATION_PLAN.md` (989 lines, 37KB) + companion `MENU_SYNC_DASHBOARD_DIAGRAMS.md` (Mermaid) | `artifacts/sesi02-menusync-nusakitchen.md` | `sesi02-menusync-nusakitchen.map.json` | Problem Statement + Business Requirements (BR-01/BR-02) + Assumptions only — 1-page extract, not 900-line original |
| 2 | `02-Projects/Flip/ARCHITECTURE.md` (735 lines, 23KB) | `artifacts/sesi02-architecture-nusapay.md` (new) | `sesi02-architecture-nusapay.map.json` | 2-page extract for seven-layer teardown (layers 1–2, 6) |

## Rename maps

**Map 1 — CloudEats → NusaKitchen:**
- `tags: [#work/cloudeats]` removed
- `Alfred` → `NusaKitchen` (per Week 02 note, not NusaPay)
- `Grab` → `PlatformA`, `FoodPanda` → `PlatformB` (keep asymmetry — BR-02 needs partner answer)
- `GrabFoodMenuSyncLog` → `PlatformASyncLog`, `FoodPandaCatalogImportLog` → `PlatformBImportLog`
- Strip Jira/Atlassian URLs

**Map 2 — Flip → NusaPay:**
- `#work/flip` removed
- `Flip` → `NusaPay`, `DPT` → `Platform Team`
- Strip `*.flip.id`, GitLab URLs, hostnames, named individuals
- Keep DDD/service stack intent, only identifiers change

Run per artifact:
```sh
deck.mjs sanitise <src> <map.json> <dst> --section "Problem Statement"
deck.mjs scan <dst> <map.json>
```
Both scans must exit clean; maps are not interchangeable.

## Slot refit 150 → 105 (BI)

- Real: 18:15–20:00 = 105 min. Note declares 19:00–21:30 = 150.
- Keep: fishbowl (Inmon vs Kimball) at ~min 25–35 (energy peak, do not move post-break), break ~min 60–70, lab (role-play trios) post-break.
- Compress: core blocks I–III, share-out (130–143 → ~95–103), close (143–150 → 103–105).
- D1 collection moves from min 130 to min 105 ("sebelum kamu meninggalkan ruang", defect D1).
- Every slide needs `**DUR**`; then `deck.mjs restamp` recomputes `[min NNN · HH:MM]` as `slot-start + min`. Do not hand-patch stamps.
- Total DUR must equal 105; if `Σ DUR is N > 105`, borrow from lab/gallery, not break (keep break ≥6 min).

## RPS row (Proposed Revision line 117)

Sesi 2 · bobot 2% · CPMK 1,5 · penilaian `Delapan pertanyaan bisnis (D1)` · metode `Fishbowl debate, role-play & whiteboard race` · materi 4 topik (Arsitektur BI, warehouse/lake/lakehouse, batch vs streaming, requirements gathering & stakeholder map).

## What was there before this pattern

`artifacts/sesi02-menusync-nusakitchen.md` (2.1KB, 45 lines) already existed but was a hand-written extract without a verified `scan`. This pattern makes both artifacts scan-verified.

## Failure seen in Sesi 01 that applies here

- `git status` showed `M Sesi 01 - Naskah.md` unstaged + `sesi02-*.map.json` pre-existing. Check before `check`/`build` so DUR arithmetic and `build --final` (FLAG/hash) don't surprise.
- Dual-artifact sessions need two independent `sanitise`/`scan` cycles — a single map misses cross-artifact identifiers (e.g. `Alfred` in one, `Flip` in the other).
