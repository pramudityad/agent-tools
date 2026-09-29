# 08 — deck-build check uses status

**What to build:** the `deck-build` recipe's check stops re-running `build` and instead asserts via `rps-deck status` that the given naskah is `approved` with Slides and Materi present — so `orch verify` can go green.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] orch tests pass
- [ ] `orch run deck-build …` on an approved BI naskah, then `orch verify <run>`, exits 0
- [ ] The same check exits non-zero on a draft naskah
