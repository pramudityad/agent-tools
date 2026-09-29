# Telling it in the room — the naskah's delivery section

Trigger: *"update naskah to tell this to class"*, *"how im gonna tell this"*, *"what do I say
when…"* — asked after the deck and the demo script exist. The user is not asking for more slide
content; they are asking for **the words**. Canonical: BI Sesi 04, 2026-09-18.

## Shape: a pengampu-only section at the end of the naskah

BI Sesi 04 added `## 9. Cara menyampaikan — urutan kata, bukan urutan slide` and pushed
`## 9. Referensi` to §10. Prose sections are not parsed by `check`, so slide count, Σ DUR, the
clock and the approval flow are untouched — the script rides along in the same file the user has
open while teaching. Keep it as bullets and tables of **actual sentences**; a paragraph *about*
explaining is useless at minute 22.

**Numbering pitfall.** §0 "Cara pakai" said *"Serahkan §1 sampai §9 ke agent pembuat slide"*.
Inserting the script as §9 silently made that sentence hand the instructor script to the
slide-generation agent. After any section insert, grep the naskah for `§` and re-point the
ranges (§1–§8 = slide material; §9+ = pengampu only).

## What the section must contain

1. **The opening order that must not be reversed.** Environment check and artifact collection
   first, the workplace story second, *then* the term. Naming the term first stops them
   thinking and starts them copying — say so explicitly, because the pull to define early is
   strong.
2. **A `| Konsep | Kalimat yang diucapkan persis |` table** for the hard concepts. This is the
   part that makes the section usable: not "jelaskan idempotensi", the sentence itself.
   BI Sesi 04 covered: idempotency ("bukan 'aman dijalankan dua kali' — **hasilnya identik**, dan
   identik itu bisa diuji"), why append double-counts ("job itu tidak salah, ia hanya tidak punya
   penjaga apa pun"), the watermark trap ("selalu ada satu kolom yang tidak dirawat"), surrogate
   key on the effective date ("cocokkan ke tanggal kejadian, bukan ke `is_current`"), and the
   Unknown member ("null adalah anggota yang belum kamu beri nama").
3. **A per-segment tool plan** — which artifact is on screen at which minute, and the fallback
   if it is not there. Mirror it as a table in §7 (menit · alat di layar · fallback).
4. **A failure fallback for the live demo.** If the tool will not run: close the terminal, project
   the diagram frames, and *state* the numbers as sentences. Never debug in front of the room,
   and never leave "hope it works" as the plan — the session still has to land without it.
5. **An instructor-safety rule for lab numbers.** Never put a team's own row counts on the screen;
   speak in patterns ("dua tim mengalami kenaikan 6 baris"), not absolutes. The materials
   otherwise invite it, since the whole session is about row counts.

## Wire the diagrams into NOTES, with minutes

Slide NOTES are where the frame→minute map belongs, because that is what the instructor reads
while walking the room: e.g. *menit 64–70 F2 dan F3; 70–80 F4; 80–95 F5*. One sentence of
rationale makes it stick: the projected frame is what replaces answering the same question five
times — "arahkan tim ke frame, bukan ke papan tulis". Frame names come from the Excalidraw scene
(`references/excalidraw-session-diagrams.md`).

The same section is the right home for the lab's hard rules: do not type on a team's laptop
(point, don't take over), and if a team's run 2 differs, log it on the board and name the pattern
in the debug clinic — never debug at their desk.

## Cost

Adding the section is a naskah edit: `restamp` → `check` → `render` → `approve` → `build --final`,
and re-print. If slide `KONTEN` changed as well, the hand-built visual deck is now stale — see the
staleness note in SKILL.md.
