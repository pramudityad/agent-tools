# 10 — Verbatim sub-CPMK check

**What to build:** when a naskah is checked against its RPS contract row, any quoted sub-CPMK must match the row's text exactly (whitespace-normalised); a paraphrase is a `check` error naming both texts.

**Blocked by:** 01

**Status:** done, integration gap noted (commit fa29d76)

- [x] Tests: verbatim passes, paraphrase fails, whitespace-only difference passes
- [x] Every existing approved naskah in the vault checked with the comparison function (or the failures are listed for the lecturer) — see Comments
- [x] The check is documented in `rps-deck/stubs/SKILL.md`

## Comments

`cmdCheck` (the `check <naskah.md>` verb) takes only a naskah path — it has never taken an
RPS path, so there is no existing call site where a naskah and its RPS contract are both in
hand at once. Wiring this into `check` live would mean inventing a new CLI argument, which
the ticket says to flag rather than guess at. So this ships as a tested pure function,
`checkVerbatimSubCpmk(quoted, official)` in `deck.mjs`, wired nowhere yet — see the "Verbatim
sub-CPMK" section appended to `stubs/SKILL.md`.

Checking real naskah also turned up that none of the 21 sesi naskah across BI, SDLC and WAD
carry a sub-CPMK quote in one fixed place — no `sub-cpmk:` frontmatter key, no marked
section. Where a naskah does quote RPS sub-CPMK prose (free text, worded differently per
course), here is what running the function by hand against the naskah's quote and
`parseRps(...).row.subCpmk` for that session found:

- **BI** (Sesi 01–07): no naskah quotes the RPS sub-CPMK sentence. Sesi 02/03/04 cite only
  the artifact code ("sub-CPMK D1/D2/D3"), Sesi 07 references it obliquely ("revisi adalah
  separuh sub-CPMK sesi ini"). Nothing to check.
- **SDLC Sesi 03, 05, 06**: each has an explicit `Sub-CPMK Sesi N (RPS, verbatim):` line —
  **PASS**, exact match against the RPS row.
- **SDLC Sesi 02 (and its duplicate "Sesi 2"), Sesi 04**: quote the sentence but drop the
  RPS row's trailing period — **FAIL** under a strict (punctuation-sensitive) compare. This
  is a mechanical drop, not a paraphrase; the substance matches word for word.
- **SDLC Sesi 01, 08**: no sub-CPMK quote found.
- **WAD Sesi 01**: quotes the objective but drops the RPS cell's leading `(CPMK1) ` code
  prefix and trailing period — **FAIL**, same mechanical-diff caveat (WAD's RPS embeds the
  CPMK code inside the Sub-CPMK cell itself, since WAD has no separate CPMK column).
- **WAD Sesi 05**: quotes the sentence with the `(CPMK1)` prefix intact but drops the
  trailing period — **FAIL**, same caveat.
- **WAD Sesi 06**: quotes only the CPMK-code fragment `"(CPMK2, CPMK4)"`, not the sentence —
  not a full quote, not evaluated as a mismatch.
- **WAD Sesi 02, 03, 04, 07**: no sub-CPMK quote found.

No naskah was edited to force a pass. The trailing-period and code-prefix mismatches are a
real judgement call for the lecturer: tighten the check to ignore a missing final period /
leading CPMK-code parenthetical, or tighten the naskah quotes to match the RPS cell
character-for-character.
