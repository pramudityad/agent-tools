# 0003 — No roll, no write

**Status:** accepted · 2026-09-12

## Context

BI sesi 1 had 13 of 26 students marked HADIR, all via QR. The other 13 were unmarked. SDLC
sesi 1 and 2 had 28 of 28 unmarked — the QR was evidently never opened.

An unmarked student is genuinely ambiguous: they may have been absent, or present on Zoom
and never scanned. The portal cannot distinguish these and neither can this tool.

The tempting default is "unmarked → ALPA", because it closes the backlog in one command.

## Decision

The tool has no default status. `attendance set` marks only students named explicitly.
`attendance zoom` marks only students an exact roll source matched. Everyone else stays
unmarked and keeps appearing in `todo`.

## Consequences

- The backlog does not close until a roll source exists. Zoom usage exports supply it.
- The failure mode this prevents is the one that is invisible: a present student marked
  absent surfaces only when they are barred from UAS at the 75% gate, months later.
- `todo` stays noisy while marks are missing. That is the point.
- Percentages computed anywhere in the tool are labelled a floor, not a verdict, whenever
  unmarked entries exist — otherwise the at-risk list reads as fact when it is mostly
  missing data.
