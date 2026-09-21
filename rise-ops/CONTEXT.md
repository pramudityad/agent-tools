# rise-ops — context

Facts an agent needs before running this tool. Course-level teaching vocabulary lives in
`~/Documents/Obsidian Vault/02-Projects/Cakrawala/CONTEXT.md`; read that first. This file
covers only what is specific to talking to the portal.

## Language

**RISE**:
The LMS at `rise.cakrawala.ac.id`, API at `api-pmb.cakrawala.ac.id/api`. Holds sessions,
materials, attendance, tasks, discussion.
_Avoid_: SIAKAD, portal — see below, they are a different system.

**SIAKAD**:
`siakad.cakrawala.ac.id`, a SEVIMA product behind `sso.sevima.com`. Holds the academic
record and nilai akhir. **This tool never touches it** and has no credentials for it.
_Avoid_: using it as a synonym for RISE. Conflating the two is how a grade gets written
into a system nobody grades from.

**Roll source**:
Independent evidence of who attended — a Zoom usage export, or a name you supply. QR scans
already in RISE are a roll source; silence is not. No roll, no write (ADR 0003).
_Avoid_: attendance data (ambiguous between the evidence and the marks).

**Berita acara**:
The `material_plans` + `material_realizations` pair on a sesi. Both must be non-empty
before RISE will close the sesi. An official record.
_Avoid_: realisasi alone — it is the pair that matters, not either half.

**Residue**:
The Zoom rows that matched no student, and the students that matched no Zoom row. Written
to `<csv>.unmatched.md` on every `attendance zoom` run and always reported as a count.
_Avoid_: leftovers, errors — the residue is expected output, not a failure.

**Register**:
The generated attendance table at `~/.config/cakrawala/registers/<CLASS>-kehadiran.md`.
Outside the vault on purpose: the vault auto-commits to a remote.
_Avoid_: gradebook (this holds attendance, not nilai).

## Auth

One cookie, `cakrawala_session_siakad`, in `~/.config/cakrawala/session` (mode 600). The
`__cf_bm` Cloudflare cookie is **not** required. Requests also need `x-client-app: rise`
and an `origin`/`referer` of `https://rise.cakrawala.ac.id`, or they 403.

The cookie expires. There is no refresh: copy a new one from DevTools → Application →
Cookies. `rise-ops auth` is the cheap probe; on failure everything exits `auth_expired`.

Credentials are never stored. `POST /v1/siakad-auth/login` exists and is deliberately unused.

## Slots

Three sources disagree, and the precedence matters because the slot feeds the lateness rule.

1. **The Naskah's `slot-minutes`** — the length actually taught. Correct for all three
   courses. Use this when the sesi has a Naskah.
2. **RISE's `start_date_time`/`end_date_time`** — the block *booked*, which can be longer
   than what is taught. Use only when there is no Naskah.
3. The fallback constant in `ops.mjs`, for a sesi with neither.

| Course | Booked (RISE) | Taught (Naskah) | Vault CONTEXT.md |
| :--- | :--- | :--- | :--- |
| BI | 18:00–20:00 · 120 | **105** | 18:15–20:00 · 105 ✓ |
| SDLC sesi 1 | 18:30–20:00 · **90** | 90 | 18:15–20:00 · 105 ✗ stale |
| WAD | 20:00–22:00 · 120 | 120 | 20:00–22:00 · 120 ✓ |

Taking the booked window for BI marked a student who attended 100 of 105 minutes as
`TERLAMBAT`: 100 clears the 15-minute bar against 105 but not against 120. Never use the
Week note's stated duration — it says 150 for every course and is wrong for all of them.

## Things that look like data and are not

- **`percentage_attendance`** on the roster endpoint is `0` for every student. RISE never
  populates it. Compute the percentage from per-sesi marks instead.
- **`is_grade_locked`** is returned on lecture-classes and read by nothing in the SPA.
- **`attendance_deadline`** is advisory. `PATCH` was verified to accept a correction a full
  day past it, which is what makes the backlog closable at all.

## Before a bulk write, check the audit log

Every write appends to `~/.config/cakrawala/audit.jsonl` with its prior value. That file is
the only undo record — there is no API to revert a berita acara or an attendance mark.

```sh
python3 -c "import json;[print(json.loads(l)['at'], json.loads(l)['cmd']) for l in open('$HOME/.config/cakrawala/audit.jsonl')]"
```
