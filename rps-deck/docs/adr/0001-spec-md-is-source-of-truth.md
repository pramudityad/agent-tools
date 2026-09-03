# 0001 — The spec `.md` is the single source of truth

**Status:** accepted · 2026-09-03

## Context

The Sesi 1 prototype held slide content twice: once in the reviewed
`Sesi 01 - Slide Generation Prompt.md`, and again typed into the generator script. Any
content edit had to be made in both, and nothing detected divergence.

The lecturer's stated requirement was a Markdown file reviewed *before* slides are created.
That only holds if the reviewed file is the one that renders.

## Decision

`deck.mjs` parses the spec. Everything emitted is derived from it; nothing is retyped
alongside it. A malformed slide fails the parse with its number and line rather than being
skipped, so the file cannot quietly render less than it says.

## Consequences

Markdown alone cannot express the deck — the Sesi 1 build used 60 structural elements across
10 types (comparison panels, covered table cells, placeholder chips) with no Markdown
syntax. A marker vocabulary carries them (`FORMAT.md`). That is a bespoke format only this
tool reads; if it grows past roughly fifteen markers the spec stops being pleasant to review
and raw HTML becomes the more honest option.

## Declined

**A JSON sidecar emitted alongside the human `.md`.** More robust to parse, but it adds a
file the lecturer does not review, which can drift from the one they do.
