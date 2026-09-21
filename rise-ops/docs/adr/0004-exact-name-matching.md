# 0004 — Exact matching only, and the residue is output

**Status:** accepted · 2026-09-12

## Context

Binding a Zoom participant to a roster student is the tool's one genuinely uncertain
operation. The available keys are poor:

- RISE exposes **no student email** on any lecturer-reachable endpoint.
- Zoom exports carry a display name and an email, never a NIM.

So the only shared field is a name: an ALL-CAPS legal name on one side, a user-chosen
display name on the other. Fuzzy matching is the obvious fix and catches real cases like
`Zaky Hafiedz` against `ZAKY HAFIEDZ FADHILLAH`.

## Decision

Normalise (strip diacritics and punctuation, collapse spaces, uppercase) and require
**full-string equality**. A name that matches two students is refused as ambiguous rather
than resolved. No similarity scoring, no threshold.

Every run writes `<csv>.unmatched.md` listing both residues, and prints four counts:
Zoom rows, matched, unmatched Zoom rows, students with no Zoom row.

## Consequences

- A wrong fuzzy match costs two errors, not one: the wrong student is marked present and
  the right one is left absent. Neither is visible in the output. That asymmetry is why
  similarity is refused even though it would raise the match rate.
- The lecturer does a short manual pass per sesi. An alias map keyed on display name would
  shrink this to near zero after a few sesi and is the obvious next iteration.
- Reporting matches without the residue would make a 60% match rate look identical to a
  100% one, so the counts are contractual output (CONTRACT.md), not decoration.
