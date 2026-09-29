# BI UTS — prodi paste, ACC-day rulings, publish (2026-09-26)

Second run of the prodi-format pattern (after SDLC 2026-09-25). Use together with
`cakrawala-sdlc-uts-prd-2026-09-25.md`; this file records only what was new.

## Sequence that worked

1. User rules out a new teaching set for the pre-exam session ("uts gak perlu sesi 7") — teams
   finish design with existing materials + the starter repo's `checkpoint.py verify --sesi 8`.
   Do NOT volunteer Naskah/Materi/Slides work for that session.
2. User pastes the **complete prodi-format naskah** (same shape as SDLC's: identity header,
   deskripsi, ketentuan teknis, pelaksanaan table, rubrik). Save verbatim to
   `UTS - Naskah Soal (Draft).md`, `status: final — teks verbatim dosen; dipakai untuk submission
   prodi`, `sumber: "[[UTS - Design Checkpoint]]"`.
3. List the sheet-vs-vault differences as a numbered decision menu in `Catatan internal`.
   "yes / agree" on each = ruling; apply the same-turn sweep:
   - rubric split 30/15/15/40 (sheet) over 35/10/15/40 (brief): patch the brief's rubric table,
     `Soal UTS - ….md`, `RPS Defects.md` D13 (dated revision note; the SAC confirmation cited the
     old split — flag a one-number correction to prodi), keep retired numbers only as dated notes;
   - defense timeline 10–110 + 110–120 (intentional overflow into Sesi 9, past the 105-min slot)
     recorded as deliberate, not an arithmetic bug to "fix";
   - AI rule scoped: **allowed in Sesi 6–7 (design work), banned in Sesi 8 (defense)** — close the
     open D14 consequence item and the SAC-confirmation open question.
4. The announcement had already gone to RISE **Diskusi Kelas** the same day ACC arrived
   ("udh approved, whats next"): flip vault statuses, then direct-API POST with clean HTML
   (rise-ops `discussion post` escapes HTML — see that skill's sharp edge). Class id comes from
   `~/.config/cakrawala/cache.json` (`BI` key) — the CLI alias is `BI`, not `BIS`.
5. Write a manual audit-log entry (`~/.config/cakrawala/audit.jsonl`) for the direct-API post —
   no rise-ops command covered it.

## Differences from the SDLC run (don't re-learn)

- No tugas publish, no template attachment, no presentation arithmetic — BI's UTS is team design
  defense, not individual PRD presentations. The shared part is: prodi paste → verbatim naskah →
  numbered diff rulings → sweep → status flips.
- The grading sheet's rubric differing from the vault brief is expected: the user drafts in chat
  last, so the chat version is the newest ruling, not a typo. Ask, then sweep.
- `rise-ops material` requires a Naskah file even with explicit `--title`/`--description`; a
  minimal logistics-only Naskah (run-of-show table + `status: approved`) is the sanctioned unblock.
- Verification false-positive: `&lt;` inside a `<code>` literal (`<topik>_<slice>`) is correct
  escaping — assert on structural tags (`&lt;h3&gt;`, `&lt;table`), not blanket `&lt;`.

## State left at session close

- Pengumuman live (post `852f080b`, verified 2× GET), statuses stamped, audit written.
- Still open, physical-world: zip → lab machines + one `load --twice` test there; print 9×
  D7/kamus/DoD sets; Metabase/Docker decision for Sesi 10.
- Prodi submission of the naskah sheet itself = the user uploads the file (no Drive automation).
