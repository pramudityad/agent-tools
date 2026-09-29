# SDLC UTS PRD — prodi paste to publish runbook (2026-09-25)

Course: SDLC (`IK103`, class code on the approved sheet: `20261/IKR2149/SDLC3`), Sesi 8,
2026-10-01, 20:00–21:30 (90 min). Assessment: individual PRD + 2.5-min oral defence; group
determines topic only. Prodi approved the student-facing sheet 2026-09-25.

## Timeline of the session

1. User pasted the prodi-format exam sheet → saved verbatim as `UTS - Naskah Soal (Draft).md`,
   replacing the `(Superseded)` written-paper version. Sheet's own internal dosen notes stayed
   in the body (it is the approved artifact); vault-vs-sheet conflicts (class code, "Google
   Docs" only, group size 3–4 vs real group of 5) went into `Catatan internal` as numbered
   items.
2. "prodi sudah acc, whats next? sblm umumin ke mahasiswa" → decision menu. User rulings:
   weight = RPS 25% ("rps benar"); presentation order per group R1→R2→R3→A1→A2→A3→A4;
   peer review stays (RPS row names "& peer review"); resit via prodi.
3. Second instruction batch: announce groups+topics inline; camera-ON + contact-before-session
   attendance rule with lecturer's right to refuse; presentation format bebas/sederhana;
   build a PRD template as RISE attachment; update the Sesi 08 tugas.

## The arithmetic that set the format

28 students × 2.5 min = 70 min; + 13 min peer review + scope statement (compressed but kept —
RPS row) + 5 min admin = 88/90. Never round to 3 min (84 min leaves no peer review). Late
student = end of own group's queue. No-show = oral 15 pts die + prodi resit path.

## Anti-duplicate sub-topic rule (agent-proposed, user implicitly accepted)

Members of one group must pick different features/modules so identical PRDs don't eat the
slot and individual marking stays clean:
- DARA (3 features): no duplicate feature within a group; A4 (5 people, 3 features) → the two
  sharing a feature must differ on persona + success metrics.
- SAPA UMKM (8 modules): one module per person, no duplicates in group.
- Posyandu: same process for all; differ by focus (kader / orang tua / rujukan) + persona +
  requirements.

## Files produced (all in `02-Projects/Cakrawala/Software Development Life Cycle/`)

| File | What happened |
|---|---|
| `UTS - Naskah Soal (Draft).md` | verbatim prodi sheet → `status: final — ACC prodi`, weight locked 25% |
| `Sesi 08 - UTS and Proposal Review.md` | full rewrite: written paper → presentation run order; old revision block + Part A/B/C deleted, peer review compressed to 13 min |
| `00 Course Overview.md` | UTS 20% → 25% + reconciliation callout (old table summed 100 but contradicted RPS); Week-8 row + assumption block updated |
| `Sesi 08 - Tugas.md` | submission format, template reference, camera rule, refusal clause; `due: 2026-09-30T10:00:00Z` (= 17:00 WIB) |
| `Pengumuman RISE - UTS PRD.md` | `status: siap tempel`; 7-group table inline; anti-duplicate rule; session rules; rubric |
| `Template PRD — UTS.md` | 10-section fill-in scaffold, `[petunjuk]` prompts, worked FR/NFR example tables, do/don't metric example; to render DOCX+PDF |
| `UTS - Rollout Checklist.md` | all decision items checked; publish-order runbook + residual risk (63 blank attendance marks) |

## Publish order (pending user "go")

1. `rise-ops tugas publish SDLC 8` (announcement references its deadline).
2. Render `Template PRD — UTS.md` → DOCX + PDF; upload to Materi sesi 8 as
   `rise-ops material SDLC 8 --title "Template PRD — UTS"` (tugas body names this title).
3. Paste the announcement.
4. Verify with two GETs ~20 s apart (RISE description escaping — see rise-ops).

## Open risks

- 63 blank attendance marks behind the group cut; if the Zoom backlog changes sides of 75%,
  re-cut `UTS - Kelompok dan Topik.md` before pasting the announcement.
- Group A4 has 5 members vs the sheet's "3 sampai 4 orang" — documented in the naskah internal
  block, accepted by the roster arithmetic.
- BI and WAD UTS tracks still carry their own open items (see `cakrawala-uts-status-2026-09-22.md`).
