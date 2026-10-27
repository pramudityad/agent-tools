# Pedagogy checklist — authoring and reviewing a naskah

Distilled 2026-09-29 from `GarethManning/education-agent-skills` (explicit-instruction,
memory-learning-science, questioning-discussion), tuned for a **Kelas Profesional** (adults
straight from work, mixed roles, 90–120 min evening slot, no homework). Cakrawala already
handles slot truth, sanitisation and the lab "Contoh" pattern; this file covers what those do
not: **does the lesson shape actually teach**. `cakrawala` → naskah-review uses it as its
pedagogy pass (RED/AMBER below).

Source skills (read the original only when a rule needs its evidence):
`explicit-instruction-sequence-builder`, `lesson-opening-designer`,
`checking-for-understanding-protocol-designer`, `hinge-question-designer`,
`cognitive-load-analyser`, `worked-example-fading-designer`,
`dual-coding-designer`, `productive-failure-desirable-difficulty-designer`.

## 1. Opener = retrieval, not recap (Rosenshine P1; Agarwal 2012)

- First teaching slide after the arrival slot asks students to **recall** something from the
  previous sesi (1–3 questions, low stakes, ≤5 min). Slides that re-explain last week are a recap, not retrieval.
- Target only what **today** depends on, not everything from last time.
- Then one slide that states the link: "Kemarin Anda bisa X; malam ini kita butuh X karena Y."
- Sesi 1 has nothing to retrieve — use a *prior-experience* prompt (kartu diam) instead.
- Learning intention = what they will be **able to do**, one sentence, not "kita akan membahas…".

## 2. Explicit instruction before any lab (Rosenshine P4–P7; Archer & Hughes)

Every lab that produces a graded artifact is preceded by:

| Phase | What the naskah must show | Time guide |
| :---- | :---- | :---- |
| I do | instructor models one case and **says why** at each decision; shows one common error and why it fails | ≤ 10–12 min, never a >12 min monologue |
| We do | a second case worked **together**, students supply steps (cold-call / pair), instructor fades | ~ 2× I do |
| You do | the lab (HOLD) — begins with a task close to the modelled one | the rest |

Shorten I do first when the slot is tight; never cut We do or You do.
Delayed "Contoh" in a HOLD lab (see `lab-example-pattern.md`) is the **fading** step — it is
not a substitute for I do / We do.

## 3. Hinge question before the lab (Wiliam; Black & Wiliam 1998)

One check per sesi, at the point where the instruction must be understood before moving on.

- ONE concept, answerable in <2 min, A/B/C/D by fingers or chat poll.
- **Every wrong option = one named misconception** ("pilih C → mengira grain = tabel").
  The right answer must not be reachable through a misconception.
- No "semua benar", no negative stem.
- Decision rule written in NOTES: **≥80% benar → lanjut lab · 50–80% → re-teach satu miskonsepsi
  terbanyak lalu cek ulang · <50% → ulang We do, lab mundur**.
- In an online/bichronous slot, poll in Zoom chat; do not make the room wait on a slow typer.

## 4. Check for understanding (CFU) and exit ticket (Rosenshine P3, P6)

- A CFU every ~10–12 min of instruction (think-pair-share, cold-call with warning, mini-poll).
  A stretch of slides with no student response for >12 min = AMBER.
- Cold-call: give 5–10 s think time, announce "saya akan panggil", never the same role twice in a row.
- **Exit ticket** in the last 5 min: 1–2 questions on today's objective, answered before leaving.
  Distinct from the artefak (D-n); it tests understanding, the artefak tests production.
- Write what you will do with the results (open the next sesi with the most-missed item).

## 5. Cognitive load per slide (Sweller; Mayer)

- **One idea per slide.** Intrinsic load comes from the content; extraneous load is ours to remove.
- No split attention: label inside the diagram, not in a legend three lines away.
- No decoration (matches existing rule "ikon boleh, dekorasi tidak"); no redundant text that is also read aloud verbatim.
- Introduce ≤ 3–4 new terms per slide; gloss each at first use (`student-friendly-glossa-2026-09-17.md`).
- **Expertise reversal:** the room is mixed (career-changers + working developers). Scaffolds that help
  novices bore experts — keep the extra scaffold in **NOTES/Contoh/FINE** (opt-in), not on the main line.
- A dense table that is meant to be read must be `HOLD` or `VEIL`d; do not flash it for 30 seconds.

## 6. Predict-then-reveal and productive struggle (Kapur; Bjork "desirable difficulty")

- Where a concept has a surprising answer, ask for a prediction **before** the reveal (`VEIL`).
- Attempt-before-explanation is valuable only when the task is within reach; give the explanation
  right after. Don't leave a failed attempt hanging at a break.
- Prefer a **named misconception** as the reveal target over a generic "any questions?".

## 7. Inclusive access (UDL, light touch)

- Every spoken instruction that matters is also on a slide (no auditory-only rules).
- Lab task text is readable from the back (HOLD slide size) and has a text alternative for any diagram.
- Offer at least two ways to respond (chat, voice, written card) — covers Zoom and quiet students.

## Review verdicts (used by `cakrawala` → naskah-review)

**RED** — block `approve`:
- No retrieval/prior-experience opener (§1) in a sesi ≥ 2.
- A graded-artefak lab with no I do / We do before it (§2), or an uninterrupted talk block >12 min.
- No hinge question (or no decision rule) before the first lab (§3).
- No exit ticket / closing check separate from the artefak (§4).

**AMBER** — advisory:
- Hinge distractors not tied to named misconceptions; >12 min with no student response (§3–4).
- A slide carrying >1 idea or >4 new terms; split-attention diagram (§5).
- Expert-only or novice-only scaffold placed on the main line (§5).
- A lab ending in HOLD with no delayed Contoh, or Contoh shown at start (§2, `lab-example-pattern.md`).
- Poll/response channel unspecified for online delivery (§3, §7).

Not a license to add slides: pedagogy items replace or reshape existing DUR minutes
(`restamp` must still equal the slot). Cut from lab/gallery before the break.
