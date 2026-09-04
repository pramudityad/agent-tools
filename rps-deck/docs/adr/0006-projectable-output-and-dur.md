# 0006 — The HTML is a deck, and DUR owns the clock

**Status:** accepted · 2026-09-04

## Context

Two findings from the Sesi 2 dry run pointed the same way.

**Review moved to Markdown.** Once `naskah.md` is authored and `materi.md` is generated,
both get read before approval. The HTML was a scrolling review page — a second way to read
what had already been read.

**A hand-made deck already existed.** `Sesi 01 - Slides.html` was a self-contained,
projectable deck matching the 25-slide naskah, built by hand. It also carried 25
`<aside class="notes">`: speaker notes inside a file that looks shareable.

Separately, authoring Sesi 2 cost **27 hand-computed clock stamps**. Each is
`slot-start + cumulative minutes`, and a stamp that drifts from its segment is invisible
until someone is standing in front of the room. The Sesi 1 source note drifted 15 minutes
mid-table exactly this way.

## Decision

**The HTML becomes a projectable deck**, in the same two variants. One slide per screen,
keyboard navigation, a slide counter, and a speaker-notes pane in the naskah only. The
scrolling review page is retired; `.md` is the review surface.

**`DUR` per slide owns the clock.** Each slide declares its minutes; `restamp` computes
every `[min · clock]` and fails when `Σ DUR ≠ slot-minutes`. Slides without `DUR` keep
hand-authored stamps and the existing validation, so nothing already written breaks.

## Consequences

The materi variant is now *safer* than the hand-made deck it replaces: the two variants
render from separate code paths and `build` asserts no notes markup before writing, so the
shareable file cannot carry notes.

`DUR` is the only budget. The naskah's cut table stays prose for the reader — there is no
second machine-readable copy to drift.

Output filenames are unchanged, so the published materi artifact keeps its URL. The output
*type* changed; the paths did not.

## Evidence

`restamp` reproduces all 52 hand-authored stamps across Sesi 1 (25) and Sesi 2 (27)
byte-for-byte. The arithmetic matches the judgement that produced them, which is what makes
it safe to hand the clock to the tool.
