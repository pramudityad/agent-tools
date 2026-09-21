# 0001 — RISE is not the academic record

**Status:** accepted · 2026-09-12

## Context

The obvious reading of "build me a grading agent" is: find the grade endpoint in the portal
we already have a cookie for, and write to it. RISE does expose scoring endpoints —
`PUT /v1/task-log/{id}/score`, `POST /v1/task-log/score/group-member`, and an essay-score
endpoint for quizzes.

Two facts killed that reading:

1. `siakad.cakrawala.ac.id` exists and redirects to `sso.sevima.com`. Cakrawala runs SEVIMA
   SIAKAD as its academic information system. That is where nilai akhir lives.
2. RISE's own SPA bundle returns `is_grade_locked` on every lecture-class and **reads it
   nowhere**. There is no final-grade surface in RISE at all.

Separately, the lecturer creates no Tasks in RISE — all 48 sesi across three classes had
zero. Artifacts are collected as Google Docs links in a Google Sheet, and the Drive
connector on this machine is authenticated as a different (employer) account, so the tool
cannot read that Sheet.

## Decision

`rise-ops` writes attendance and berita acara to RISE. It does not write grades anywhere.
Grading support is a local gradebook built from a CSV the lecturer exports by hand.

Nilai akhir stays a manual step in SIAKAD.

## Consequences

- No RISE Task is created, so students see no score in the LMS. Accepted: scores they would
  see there would not be the scores of record anyway.
- The grading path needs no Google auth and no unexercised RISE API.
- If SIAKAD turns out to have a usable API, that is a new tool, not an extension of this one.
  Its auth model (OAuth via Sevima SSO) shares nothing with this cookie.
