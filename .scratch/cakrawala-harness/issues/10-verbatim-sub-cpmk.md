# 10 — Verbatim sub-CPMK check

**What to build:** when a naskah is checked against its RPS contract row, any quoted sub-CPMK must match the row's text exactly (whitespace-normalised); a paraphrase is a `check` error naming both texts.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Tests: verbatim passes, paraphrase fails, whitespace-only difference passes
- [ ] Every existing approved naskah in the vault still passes (or the failures are listed for the lecturer)
