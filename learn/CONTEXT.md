# Learning Toolkit

Teaching one person a hierarchically-structured subject, and keeping honest records of
what they have actually demonstrated. These terms are load-bearing: the whole toolkit
turns on the difference between what was *observed* of the learner and what a model
*claims* about them.

Several terms here collide with vocabulary already owned by sibling toolkits
(`test-evidence`, `linkedin-jobs`). Where they collide, this glossary yields — the
sibling keeps the word and this toolkit picks another. The collisions are called out so
nobody re-introduces them later.

## Language

**Concept**:
One row in the registry: a stable flat slug, a required one-line definition, a mutable
list of domains, and an optional pointer to a vault note. The slug is the primary key and
never encodes a judgement — domain classification churns, so it lives beside the key, not
inside it. The definition is not decoration: it is what makes lookup-before-write a real
decision rather than a string match.
_Avoid_: topic, node, skill, card

**Goal**:
What the learner asked to learn. The root a Path is expanded backwards from. A Goal is not
a Concept — it is a request, it may decompose into many Concepts, and it is never given a
Standing.
_Avoid_: topic, subject, course

**Strand**:
A prerequisite chain descending from one node. The unit that expansion prunes: when the
Ledger already reports `demonstrated` for a node, the Strand below it is never expanded and
never probed. Pruning Strands is the whole return on keeping a Ledger.
_Avoid_: branch, path (reserved — see **Path**), track

**Frontier**:
The set of Concepts where the Ledger goes silent or stale. The only place probing happens.
Deliberately not called "edge": this toolkit works on a directed graph, and an edge is an
arc between nodes. The learning literature's "edge of understanding" is this thing, but the
word cannot be borrowed here without ambiguity.
_Avoid_: edge, zone, level

## Evidence

The distinction in this section is the toolkit's central constraint, not a preference. A
Ledger that blurs it decays into a scoreboard nobody can audit.

**Observation**:
One appended event. The only thing this toolkit ever writes about a learner. Observations
are never edited and never deleted — a mistaken one is answered by appending another, not
by repairing the first.
_Avoid_: result, record, score, entry

**Probe**:
A multiple-choice Observation, graded by the core against a stored key. A **fact**: it was
computed deterministically, it means the same thing in five years, and it can be regression
tested. Probes locate the Frontier cheaply. They cannot establish understanding, because
recognition among four options is exactly the format that lets a learner gaslight
themselves.
_Avoid_: quiz, test, question, check (owned by `test-evidence`)

**Recall**:
A free-response Observation: a prompt, the learner's answer stored verbatim, and a model's
judgement of it. The judgement is a **claim** — namespaced, attributed to the model that
made it, and re-derivable later by a better model precisely because the answer was kept
verbatim. The only kind of Observation that can move a Concept to `demonstrated`.
_Avoid_: quiz, assessment, answer, grade

**Inference**:
A claim derived from other Observations rather than from the learner — chiefly the demotion
of a prerequisite after a Concept built on it failed. Recorded with the Observations it was
drawn from, because it competes with explanations the system cannot distinguish: the
explanation may have been bad, or the item ambiguous. The failure is the fact; the demotion
is a reading of it.
_Avoid_: conclusion, update, adjustment

**Override**:
The learner rejecting a Recall judgement. Appended as its own Observation, never as an edit
to the judgement it disputes. Both survive; the derive function prefers the Override.
_Avoid_: correction, fix

**Grounding**:
Whether the material a Recall closed over was taught from a retrieved source (`sourced`) or
from model memory alone (`model-recall`). Carried into the Ledger row, never smoothed away.
An unmarked claim taught confidently, demonstrated, and then used to prune a Strand is the
one error the system cannot self-correct.
_Avoid_: verified, fact-checked, confidence, trust

## Derivation

**Ledger**:
The per-Concept view derived from Observations. Never written to directly, never edited,
rebuildable from scratch at any time. If the Ledger and the Observations disagree, the
Observations are right.
_Avoid_: profile, learner model, memory, progress

**Standing**:
A Concept's derived state: `unknown`, `stale`, or `demonstrated`. Coarse on purpose. A
stored scalar off three answers would invent precision that was never there, and it could
not distinguish one cold correct answer from four correct answers spread over two months —
which is the distinction the Frontier depends on.
_Avoid_: mastery, score, level, verdict (owned by `test-evidence`), outcome (likewise),
status

**Policy**:
The named, versioned parameter set the derive function reads — decay half-life, how
spacing and repetition lengthen it, how an Override is weighted. Parameters, never data:
changing a Policy re-derives every Standing retroactively with no migration. At one
learner's volume these values are not falsifiable, so they are taken from the spaced-
repetition literature and are never described as learned.
_Avoid_: config, settings, model

## Session

**Session**:
One sitting: a Goal, a Path, and everything appended while working it. Named `Session`
rather than `Run` — `test-evidence` owns `Run` for one execution of one Spec, which is a
batch, whereas this is a conversation that can pause and resume.
_Avoid_: run, lesson, class

**Shape**:
The classification of a Goal at intake. Only `hierarchical` is accepted: a Goal qualifies
when it decomposes into nodes that are individually testable by Recall, and where failing a
node genuinely blocks the next. Accumulative subjects (vocabulary, anatomy) and procedural
ones (an instrument) fail that test. Pointed at them, this toolkit would not fail loudly —
it would produce a confident prerequisite graph that is fiction. Declining is much cheaper.
_Avoid_: type, category, kind

**Path**:
The ordered walk through Concepts that a Session teaches, produced by backwards expansion
and approved by the learner before teaching begins. Approval is the learner's one cheap
opportunity to redirect the Goal ("intuition, not the proof"), which is why it gates
mechanically rather than by request.
_Avoid_: curriculum, syllabus, plan, lesson plan

**Step**:
One inferential move: a single claim plus at most one worked example, ending where the
learner could say "no, why?". If it could not be disagreed with, it was exposition, not a
Step. The core cannot see Steps — this term exists for the playbooks, and it is the part of
the system that no program can enforce.
_Avoid_: chunk, section, message

**Closing**:
The Recall that completes a Concept within a Session and releases the next node. Named
`Closing` to stay clear of `linkedin-jobs`' Route closure and Requisition closure, which
are about postings ceasing to exist and mean something else entirely.
_Avoid_: completion, closure, done

## Invariants

Nothing is ever mutated. The registry and the Observations are append-only; the Ledger is
derived and rebuildable; a mistake is answered with another Observation.

Only a Recall can move a Standing to `demonstrated`. No quantity of Probes can, however
green.

`next` refuses to release a node until the current one has a Closing. Sequencing is
mechanical and belongs to the core; teaching is judgement and belongs to the playbooks. The
gate exists because a long, absorbing, well-taught Session is exactly the one where
bookkeeping gets skipped — so the Sessions that go best would otherwise produce the least
evidence.

Judged, inferred, and declared values are claims. They are stored namespaced and attributed
and are never merged into the fields that hold facts.

An unsourced claim is marked `model-recall` in the lesson and in the Ledger row it
produces.

A Concept at the Frontier whose Standing is `stale` gets one confirmation item before its
Strand is pruned. The asymmetry that drives this: wrongly pruning a Strand teaches the next
Concept on a foundation that is not there, silently, with no trace — and the error then
enters the very mechanism that decides what is never taught again. The opposite error costs
one question.

A Goal whose Shape is not `hierarchical` is declined and logged. It is never degraded into
a fabricated graph.
