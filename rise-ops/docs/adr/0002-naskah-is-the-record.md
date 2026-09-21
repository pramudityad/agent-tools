# 0002 — The Naskah is the berita acara source, and it says the class ran to plan

**Status:** accepted · 2026-09-12

## Context

RISE will not close a sesi until both `material_plans` and `material_realizations` are
non-empty. Realisasi means "what actually ran". Nothing in the vault records that.

Three candidate sources existed:

- `Week NN - ….md` — the lesson plan. Still states 150 minutes and a 19:00 start; every
  course actually runs a shorter slot. Wrong on its face.
- `Sesi NN - Naskah.md` — the instructor script. Carries `slot-minutes`, is already
  sanitised, and is `status: approved` with a SHA. Right content, but still a plan.
- A new post-session note. Accurate, but a new habit, and the six pending sesi have none.

## Decision

Build both fields from the approved Naskah's section-7 segment table. Render realisasi as
the plan restated in the past tense, prefixed `Terlaksana sesuai rencana.`

Refuse when there is no Naskah, or its `status` is not `approved`.

## Consequences

- A sesi that departed from the Naskah is recorded as having run to plan. This is the known
  and accepted cost. The lecturer chose speed over an edit pass, with the tradeoff stated.
- Berita acara becomes a one-command step, which is what makes closing six backlog rows
  tractable at all.
- SDLC sesi 2 has no Naskah and therefore cannot be filled by this tool. It fails with
  `no_naskah` rather than inventing content for an official record.
- The Naskah's own wording carries through verbatim, including its use of "Week N" where
  the domain vocabulary prefers "Sesi N".
