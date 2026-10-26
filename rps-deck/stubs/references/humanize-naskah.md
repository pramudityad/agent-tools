# Humanize pass — naskah prose

Skill: `humanizer` (blader/humanizer v3.1.0, `~/.agents/skills/humanizer/SKILL.md`). Load it,
run it in **file mode** on the naskah **after** the draft is authored and **before**
`restamp`/`check` → `render`. Its patterns are language-agnostic ("the equivalent construction
in every language"), so apply them to Indonesian prose too.

## What it may touch

Only human-read prose:
- `**KONTEN**` / `**KONTEN-MAHASISWA**` sentences, `LEAD:` and `FINE:` lines, list items
- `**NOTES**` (speaker notes), the §9 delivery script, cut-ledger prose

## What it must NOT touch (the naskah is a spec, not an essay)

- Frontmatter, markers (`LEAD:` `FINE:` `SPLIT:` `PANEL` `NUM` `LABEL` `STRUCK:` `VEIL` `TODO` `HI` `MARK` `DIAGRAM`), `**DUR**`, `**HOLD**`, `**FLAG**`, `**UNIT**`, `**VISUAL**` field names, the `[min NNN · HH:MM]` stamp
- Every number, weight, threshold and name in the `DO NOT INVENT` section; sub-CPMK quoted from the RPS (verbatim rule, ticket 10)
- Table structure and cell values, code, SQL, column names, sanitised identifiers (`NusaPay`, `PARTNER_A`…)
- English technical terms and their first-use Indonesian gloss (don't "simplify" away the gloss)
- Slide count and order — humanize reshapes sentences, never adds or removes slides or minutes

## Where it usually bites in a naskah

- §1 not-X-but-Y: "Ini bukan soal tool, tapi soal keputusan" → state the point directly.
- §2 one-line closers on every slide ("Itulah intinya.") and §3 sayings that sound deep.
- §6 forced triads in LEAD lines; §8 dashes as the universal connector (the `—` in every NOTES).
- §26 re-explaining what the room already knows — NOTES should give the instructor the next move, not restate the slide.
- Keep what makes it sound like the lecturer: specific workplace asides, the "kelas malam, orang capek" kind of detail. Humanizer's own "When not to act" lists these as voice to keep.

## After the pass

1. `deck.mjs restamp "Sesi NN - Naskah.md"` then `deck.mjs check "Sesi NN - Naskah.md"` must still pass (Σ DUR = slot, grammar intact).
2. Diff the numbers: every digit string in `DO NOT INVENT` still appears unchanged.
3. If the naskah was already `approved`, editing revokes the approval (hash) — the lecturer re-approves.
