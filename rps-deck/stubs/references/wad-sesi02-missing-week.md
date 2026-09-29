# WAD Sesi 2 — missing Week 02 reverse gap (2026-09-05)

RPS Sesi 2 mandates: setup Node/Vite + Python venv, Git branch–commit–PR, project structure, HTML semantics + responsive layout (2%, Praktikum jigsaw & peer review, artifact: repo + skeleton). Vault has no `Week 02*` — `Week 03` jumps to JS Essentials (which is RPS Sesi 3–4).

## Reconcile ruling
- RPS wins. No inferring from Sesi 1; author Sesi 2 entirely from RPS row + course overview assumptions (Vue 3 + FastAPI + PostgreSQL, Class Profesional evening, no homework).
- Full branch–commit–PR practice that didn't fit 120-min cut deferred to Sesi 3 opener per lexicon (D4 in `RPS Defects.md` names target).

## Authoring choices that passed
- 27 slides, Σ DUR 120 (20:00–22:00). Initial Σ 119 → fix lab HOLD 22→19, then `restamp` rewrote stamps (094→097 etc.). `check` passed.
- Artifact: `artifacts/sesi02-repo-skeleton.md` — synthetic teaching artifact (not sanitised production doc) showing expected tree, 5-point checklist, HOLD on teardown slide 16.
- Cut ledger §6: dropped deep css grid vs flex (→ Sesi 12), second live PR review (→ Sesi 3), HTML form validation (→ Sesi 3 Pydantic).

## Build sequence
```sh
node ~/.agent-tools/rps-deck/deck.mjs check "Sesi 02 - Naskah.md"
node ~/.agent-tools/rps-deck/deck.mjs restamp "Sesi 02 - Naskah.md"
node ~/.agent-tools/rps-deck/deck.mjs build "Sesi 02 - Naskah.md"
node ~/.agent-tools/rps-deck/deck.mjs approve "Sesi 02 - Naskah.md"
node ~/.agent-tools/rps-deck/deck.mjs build --final "Sesi 02 - Naskah.md"
```
Output: `sesi02-deck-pengampu.html` (29K) + `sesi02-deck-mahasiswa.html` (23K), approved 2026-09-05, no FLAGs.

## Defects entries
- D4 🟡 Week 02 note hilang vs RPS Sesi 2 (found Sesi 2, uses `Sesi 02 - Naskah.md` + skeleton)
- D5 🟢 Sesi 2 spec valid
