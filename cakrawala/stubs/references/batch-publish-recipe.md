# Publishing a batch to RISE — recipe

For requests like *"upload materi 1-5"*, *"upload tugas 1-2"*, *"upload referensi code tugas sesi 04"*.
The order matters: **read state → upload what is missing → verify**.

## 1. Read what RISE already carries

```sh
rise-ops auth                 # must print "… · LECTURE · …" before anything else
rise-ops sync                 # refresh class / sesi / roster cache
rise-ops tugas list WAD       # one line per sesi: "ada Tugas.md · 1 di RISE · <title>"
```

Materials — the audit log is the only local record:

```sh
python3 -c "import json;[print(json.loads(l)['at'], json.loads(l)['cmd'], json.loads(l).get('result',{}).get('id','')) for l in open('$HOME/.config/cakrawala/audit.jsonl') if '<class_id>' in l]"
```

Class ids: WAD `4663206b-cb33-46c3-befa-476fd27cde24`, SDLC `13e2a57c-045e-4675-8890-7b922602b038`,
BI `7df1d92e-d20c-474b-924a-357025c467d2`. `rise-ops sync` also refreshes
`~/.config/cakrawala/cache.json` (classes → sessions, roster) when you need the sesi ids.

## 2. Upload

```sh
# deck — one per sesi
rise-ops material WAD 2 "<course>/Sesi 02 - Slides.pdf"

# supplement on the same sesi (reference code, demo zip) — extra row, never a replacement
rise-ops material WAD 4 "<artifacts>/wad-sesi04-referensi-no2.zip" \
  --title "Referensi — Tugas Sesi 4 No 2: Trade-off render-from-state"

# tugas — created or updated by exact title match
rise-ops tugas publish WAD 5
```

- RISE refuses a publish date before today, so a retrospective upload opens *now*; only the tugas
  `due` is authored. Back-filling a sesi that already ran is normal and expected.
- Title comes from the Naskah (`title-materi`) unless `--title` overrides it.
- A second run with the same title refuses; `--replace` swaps it.

## 3. Verify

```sh
rise-ops tugas list WAD       # the sesi should now read "1 di RISE · <title>"
```

Berita acara on a sesi already `SELESAI`:

```sh
rise-ops acara WAD 5 --end
# → "berita acara written from Sesi 05 - Naskah.md (N segments)"
# → then: 409 "Sesi kelas ini sudah selesai, tidak dapat diakhiri lagi."
```

That 409 is expected and harmless — *plans* and *realisasi* are written **before** the end call. Confirm
instead of re-running:

```sh
python3 - <<'PY'
import http.client, os, json
s = open(os.path.expanduser('~/.config/cakrawala/session')).read().strip()
c = http.client.HTTPSConnection('api-pmb.cakrawala.ac.id')
h = {'Cookie': f'cakrawala_session_siakad={s}', 'x-client-app': 'rise',
     'Origin': 'https://rise.cakrawala.ac.id', 'Referer': 'https://rise.cakrawala.ac.id/',
     'Accept': 'application/json'}
c.request('GET', '/api/v1/lecture-schedule/<sesi_id>', headers=h)
d = json.loads(c.getresponse().read())['data']
print(len(d['material_plans'] or ''), len(d['material_realizations'] or ''))
PY
```

Both non-empty = the record is in. Verified on WAD Sesi 5 (`49632850-4ede-4191-a019-7640562e1b28`),
2026-09-21.

## 4. What a batch looked like on 2026-09-21 (WAD)

| Sesi | Materi | Tugas |
| :--- | :--- | :--- |
| 1 | `Sesi 01 - Slides.pdf` (copied from `sesi01-deck-mahasiswa.pdf`) | Tugas Sesi 1 — Jejak Request dan Observasi Jaringan |
| 2 | `Sesi 02 - Slides.pdf` | Tugas Sesi 2 — Setup Lingkungan dan Analisis Responsif |
| 3 | already published | already published |
| 4 | `Sesi 04 - Slides.pdf` + `wad-sesi04-referensi-no2.zip` (supplement) | revised (simplified item 2) |
| 5 | `Sesi 05 - Slides.pdf` | drafted, held for review |

Two Tugas files that never existed were reconstructed from the students' own submissions in
`~/Downloads` — see `course-assessment-design` → `references/session-tugas-patterns.md`.

## Pitfalls

- A sesi can carry unlimited Materi rows with distinct titles; a duplicate *title* is the only thing
  that refuses. So "did it upload?" is answered by the audit log, not by re-running.
- Do not upload `sesiNN-deck-pengampu.*` — instructor deck with teaching notes.
- `rise-ops material WAD 1 --help` is parsed as a filename (`{"error":"no such file: --help"}`); the
  CLI takes no per-command help flag.
