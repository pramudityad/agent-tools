# Sanitise mechanics learned the hard way

General lessons about the `sanitise`/`scan` mechanics themselves, independent of any one
course. Per-course worked examples live in their own reference files (e.g.
`bi-sesi02-dual-artifact-105min-refit.md`, `sdlc-sesi04-genap-slot-and-claims-register.md`,
`wad-sesi05-vue-and-visual-deck.md`).

**A map key must not be a substring of its own replacement value.** The residual scan
matches every map key case-insensitively *anywhere* in the output, so `request` →
`service_request` matches `request` inside its own replacement and never exits clean. Fix by
picking a value on a different root (`request` → `service_ticket`) or by dropping the
colliding key and leaving that token unmapped — never by post-editing the scanned output.

**Apply is case-sensitive; scan is not.** `request` will not rewrite `Request`, so both
spellings need their own map entry if both appear — but the scan will flag either
case regardless of which one the map declared.

**Never mention the original name inside the sanitised file itself**, including inside its
own "this was renamed" info box. The scan is case-insensitive, so a box that reads `` `X` →
*Y* `` self-flags `X` as a residual. Describe the rename generically instead (*"nama
perusahaan disamarkan"*) and never quote the source name or host.

**Provenance lines fail the scan too.** A `source: ORIGINAL_FILE.md` frontmatter line, or a
full vault path in an attribution string, is a residual like any other — use a short generic
label instead.

**The same real service gets renamed differently per course or per session note** — ask
before reusing a rename map across sessions or courses, and log whichever canonical name you
chose in the naskah or the course's defect register so the next session doesn't reinvent it.

**A personal (non-employer) artifact still needs two checks**: a credential-shape grep
(`sk-|eyJ|AIza`-style patterns) and a home-directory/username scrub on any mount or path line
— "personal" only exempts it from the employer-identifier sweep, not from these.

**One source artifact can serve several sessions.** Read it in full once, keep its map, and
reuse the map rather than re-deriving it — but re-verify the map still applies to whatever
new section you extract, since a new section can carry identifiers the first pass never saw.
