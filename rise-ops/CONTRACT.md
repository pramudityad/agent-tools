# rise-ops — output contract

Exit `0` on success, human-readable output on stdout. On failure, exit `1` and one compact
JSON object on **stderr**:

```json
{"error": "no Naskah for SDLC sesi 2 — looked for …", "code": "no_naskah"}
```

## Codes

| Code | Meaning | Fix |
| :--- | :--- | :--- |
| `not_configured` | no cookie at `~/.config/cakrawala/session` | paste one from DevTools |
| `auth_expired` | the portal rejected the cookie (HTTP 401) | paste a fresh one |
| `not_found` | the class has no such sesi | check `rise-ops sync` |
| `bad_input` | unknown class, flag, NIM, or malformed CSV | read the message; nothing was written |
| `no_roll` | no Zoom row matched the roster | see the `.unmatched.md` file |
| `no_naskah` | no `Sesi NN - Naskah.md` in the course folder | author one, or fill this sesi by hand |
| `unapproved_naskah` | Naskah `status` is not `approved` | approve it via `rps-deck` first |
| `http_error` | RISE returned non-2xx or `success: false` | message carries the portal's own text |
| `io_error` | anything unclassified | a bug; the stack is not swallowed |

## Write semantics

- **Atomic per batch.** `attendance set` resolves every NIM before sending. One unknown NIM
  aborts the whole batch with `bad_input` and writes nothing — a partial attendance write is
  worse than none, because the half that landed looks complete.
- **Idempotent.** `attendance` sends an `Idempotency-Key` per call.
- **Audited.** Every write appends `{at, cmd, method, path, payload, prior, result}` to
  `~/.config/cakrawala/audit.jsonl`. `prior` is the pre-write value. This is the undo record.
- **Never inferred.** Unmarked attendance is left unmarked. The tool has no default status.
- **File as record (ADR 0005).** `tugas publish` takes no free text. The task is built from
  `Sesi NN - Tugas.md` in the course folder, so the portal and the vault cannot drift apart.
  That file sits *beside* the Naskah, never inside it: the Naskah's approval digest covers
  the whole file, so a tugas edit there would mark an approved Naskah stale.
- **Read/write split (ADR 0006).** `tugas review` never writes; `tugas grade` is the only verb
  that does. Score/feedback are required flags, never inferred from a downloaded submission's
  content. `grade` refuses to overwrite an already-graded submission unless `--force` — a
  score, like an attendance mark, has no undo but the audit log's `prior` value.

## Commands

| Command | Writes | Notes |
| :--- | :--- | :--- |
| `auth` | no | prints name · role · campus email |
| `sync` | cache | refreshes classes, sesi→UUID map, rosters |
| `todo` | no | open rows across all classes |
| `brief <class> [--sesi N]` | no | defaults to the next unfinished sesi |
| `attendance show <class> <sesi>` | no | |
| `attendance set <class> <sesi> --hadir NIM,…` | RISE | flags: `--hadir --izin --sakit --alpa --terlambat` |
| `attendance zoom <class> <sesi> <csv>` | RISE + residue file | writes `<csv>.unmatched.md` always |
| `acara <class> <sesi> [--end]` | RISE | `--end` closes the sesi after writing |
| `discussion list <class> [--limit N]` | no | recent Diskusi Kelas posts |
| `discussion post <class> --title … --description …` | RISE | class-wide, not sesi-scoped — no Naskah dependency |
| `session <start\|end> <class> <sesi>` | RISE | |
| `qr <class> <sesi>` | RISE | opens QR attendance |
| `register <class>` | local file | `~/.config/cakrawala/registers/<CLASS>-kehadiran.md` |
| `tugas list <class> [--sesi N]` | no | counts RISE tasks against each `Sesi NN - Tugas.md` |
| `tugas publish <class> <sesi>` | RISE | creates or updates from the sesi's Tugas file; refuses `group` |
| `tugas rm <class> <task-id> [--force]` | RISE | refuses while any student has submitted, unless `--force` |
| `tugas review <class> <task-id> [--all]` | no | lists submissions, submitted-only unless `--all` |
| `tugas review <class> <task-id> <user-data-id>` | local files | downloads that submission's files + raw JSON, outside the vault |
| `tugas grade <class> <task-id> <user-data-id> --score N [--feedback F] [--force]` | RISE | writes the task-level score; refuses to overwrite an existing grade unless `--force` |

`<class>` is `BI`, `SDLC` or `WAD`. `<sesi>` is the sesi number, not a UUID.

## Stdout stability

`todo` emits one line per open row, `<CLASS> sesi <N> · <needs>`, and a trailing summary.
`attendance zoom` always prints the four counts (Zoom rows, matched, unmatched Zoom rows,
students with no row) — a 60% match rate must not read like a 100% one. Nothing else in the
output is contractual; parse the audit log, not the prose.
