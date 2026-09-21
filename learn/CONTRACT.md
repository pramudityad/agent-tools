# Learning core contract

The CLI, storage layout, and record shapes owned by `learn.mjs`. One toolkit per **Shape**
— this one teaches `hierarchical` subjects only. An accumulative tutor (vocabulary,
anatomy) or a procedural one (an instrument) arrives later as a *sibling* sharing this
contract and this Ledger, never as a mode flag inside this toolkit, so each stays legibly
"the tutor for that kind of subject".

Only records this toolkit actually writes appear here. A sibling **extends** this contract
with what its Shape genuinely produces; it does not emit an empty field to satisfy a shape,
and this document is not a place to anticipate fields nobody has seen.

Read `CONTEXT.md` first. Its terms are load-bearing and this document uses them exactly.

## What the core owns, and what it does not

The core is a **referee**, not a teacher. It owns the registry, grading of Probes, the
derive function, the append-only stores, and exactly one piece of control flow: `next`
withholds the following node until the current one has a Closing.

It has no opinion about pedagogy, holds no lesson content, generates no items, renders no
prose, and never writes a vault note. Those belong to the markdown playbooks and to the
agent driving them. This is the same seam as `evidence.mjs` (executes and renders) versus
`TRIAGE.md` (judges), and `li.mjs` (fetches and parses) versus every consumer that has an
opinion about fit.

## Storage

```
<vault>/.learn/registry.jsonl        Concepts. Append-only. Committed.
<vault>/.learn/observations.jsonl    Observations. Append-only. Committed. The asset.
<vault>/.learn/sessions/<id>.json    Session state: Goal, Shape, Path, approval. Committed.
<vault>/.learn/transcripts/<id>.jsonl  Prose of the lesson. GITIGNORED. Disposable.
<vault>/.learn/policy.json           Named, versioned derive parameters. Committed.
```

A dot-directory inside the vault: hidden from Obsidian's explorer, graph and search, so the
vault stays a human artifact — but fully present to git, so the Ledger inherits the vault's
existing remote and cross-device sync rather than needing a backup story of its own. `.pi/`
sets the precedent.

**JSONL, one record per line, never a JSON array.** An array rewrites the whole file on
every append, so two devices conflict on the same lines and the diffs are unreadable. Line
appends conflict by union and resolve mechanically. SQLite is unmergeable binary and is the
worst possible artifact to place in a git-synced folder.

**Two durability tiers, deliberately.** Observations are small, precious, and committed;
transcripts are bulky, useful only for re-reading and crash-resume, and stay local. Losing a
transcript costs replay ability and nothing else — every verbatim thing that must survive
(the item, the learner's answer, the judgement) lives in an Observation, not in the prose.

Vault location resolves in this order: `--home`, then `$LEARN_HOME`, then the path recorded
by `learn.mjs init --vault <path>`. Failing all three, exit `1` with `not_configured`.

## CLI

```
learn.mjs <command> [args] [--json] [--summary] [--home PATH] [--help]
```

- `--json` (default) — one compact JSON object on stdout, nothing else
- `--summary` — short human-readable rendering on stdout
- `--help` — usage **and the full record field list**, so an agent that has never seen this
  tool can learn the contract without reading source
- Exit `0` on success
- Exit `1` with `{"error": "...", "code": "..."}` on stderr

### Commands

| Command | Does |
|---|---|
| `init --vault PATH` | Record the vault; create `.learn/`; idempotent |
| `concept lookup <query>` | Candidate Concepts by slug, alias, and definition text. **Required before any create** |
| `concept add --slug --definition [--domains a,b] [--note "[[X]]"]` | Append a registry row |
| `concept alias <slug> <alias>` | Append an alias |
| `concept merge <from> <into>` | Fold one slug into another. Explicit only — never implicit, never inferred |
| `session start --goal TEXT --shape hierarchical` | Open a Session; returns its id |
| `session get <id>` | Session state |
| `path propose <session> <path.json>` | Store the expanded Path, unapproved |
| `path approve <session>` | The Q7 gate. Until this, `next` refuses |
| `path amend <session> <path.json>` | Material change → returns the Path to unapproved |
| `observe probe --session --concept --item --options --key --chosen` | Append a Probe. **The core computes `correct`**; callers never assert it |
| `observe recall --session --concept --prompt --answer --verdict --by --rubric --grounding [--sources]` | Append a Recall |
| `observe infer --session --concept --claim --because obs1,obs2 --by` | Append an Inference |
| `observe override --observation <id> --learner-verdict --note` | Append an Override |
| `close <session> <concept>` | Assert a Closing exists; fails `no_closing` if it does not |
| `next <session>` | The next unclosed node, or refusal |
| `standing <slug>` | Derived Standing |
| `why <slug>` | The Observations and the Policy rule that produced the Standing |
| `frontier <session>` | Concepts on the Path whose Standing is `unknown` or `stale` |
| `decline --goal TEXT --shape SHAPE --because TEXT` | Log a Goal refused on Shape grounds |
| `ledger rebuild` | Re-derive every Standing from Observations |

### Required error codes

| code | meaning |
|---|---|
| `not_configured` | no vault recorded and none supplied |
| `not_found` | no such Concept, Session, or Observation |
| `ambiguous_concept` | the query matched several Concepts; caller must qualify |
| `duplicate_slug` | that slug already exists — look it up, alias it, or qualify a sibling |
| `path_unapproved` | `next` called before `path approve` |
| `no_closing` | `next` or `close` called while the current node has no Recall |
| `wrong_shape` | Shape is not `hierarchical` |
| `bad_input` | malformed arguments or record |
| `io_error` | store unreadable or unwritable |

A caller must be able to tell "this does not exist" from "you have not paid the Ledger" from
"we could not look" using the exit code and `code` alone, without parsing prose.

## Records

### Concept — `registry.jsonl`

```jsonc
{
  "slug":       "differential-forms",   // primary key. flat. no domain, no hierarchy
  "definition": "Antisymmetric multilinear objects integrated over oriented manifolds.",
  "domains":    ["math", "physics"],    // mutable, multi-valued, a VIEW — never identity
  "aliases":    ["k-forms"],
  "note":       "[[differential forms]]",  // one-way, nullable pointer into the vault
  "at":         "2026-08-16T19:31:00Z"
}
```

- **The definition is required.** Without it `concept lookup` degrades to string matching
  and cannot disambiguate `entropy` from `entropy`, which is the whole job of the lookup.
- **Domains never enter the key.** Domain assignment is a judgement that churns; a key that
  encodes it accumulates alias debt from the model's inconsistency rather than from anything
  real.
- **Homonyms are qualified at creation, on real collision only** — `entropy` exists and is
  thermodynamic, so information theory creates `entropy-information` as a distinct sibling.
  Never a taxonomy invented up front.
- **`note` is one-way and nullable.** The vault is reorganized by hand; a renamed note must
  never break a key, and a Concept must be recordable as `unknown` long before any note for
  it exists.

### Observation — `observations.jsonl`

Common to every kind:

```jsonc
{
  "id":      "obs_01J...",   // sortable
  "at":      "2026-08-16T19:42:11Z",
  "session": "ses_01J...",
  "concept": "differential-forms",
  "kind":    "probe" | "recall" | "inference" | "override"
}
```

**`probe` — a fact.**

```jsonc
{
  "item":    "Which of these is NOT a 2-form on R^3?",
  "options": ["dx∧dy", "dy∧dz", "dx", "x dy∧dz"],
  "key":     "dx",
  "chosen":  "dy∧dz",
  "correct": false          // computed by the core, never supplied by the caller
}
```

**`recall` — the answer is a fact, the judgement is a claim.**

```jsonc
{
  "prompt": "Why does d∘d = 0?",
  "answer": "<the learner's words, verbatim, uncorrected, untrimmed of hedging>",
  "judged": {                          // NAMESPACED. never merged into the fields above
    "verdict": "demonstrated",         // "demonstrated" | "partial" | "missed"
    "by":      "claude-opus-5",
    "rubric":  "<what the model was asked to look for>"
  },
  "grounding": "sourced",              // "sourced" | "model-recall"
  "sources":   ["Spivak, Calculus on Manifolds, ch.4"]   // [] when model-recall
}
```

**`inference` — a claim about the learner drawn from other Observations.**

```jsonc
{
  "claim":   "demote",
  "because": ["obs_01J...", "obs_01J..."],
  "by":      "claude-opus-5"
}
```

**`override` — the learner disputing a judgement.**

```jsonc
{
  "observation":     "obs_01J...",   // the recall being disputed
  "learnerVerdict":  "missed",
  "note":            "I guessed the shape of the answer, I could not reproduce it"
}
```

### Field rules

- **The learner's answer is stored verbatim.** Not summarized, not cleaned, not normalized.
  It is the only artifact that lets a later, better model re-judge an old Recall, and
  normalizing it would erase the hedging that makes a shaky answer detectable.
- **`judged`, `claim`, and `learnerVerdict` are claims** and stay namespaced. A caller must
  never be able to mistake a model's opinion for a graded fact. Same discipline as
  `declared.*` in `linkedin-jobs` (see its ADR 0001).
- **`correct` is computed, never supplied.** A caller that could assert `correct` could
  assert anything, and the one field this system grades deterministically would become as
  soft as the rest.
- **`grounding` is required on every Recall.** There is no default. `model-recall` is a
  legitimate value and a common one; an *absent* value is not.
- **Absent field → `null`.** Never an empty string, never `"N/A"`, never `"unknown"` (which
  is a Standing and means something else).
- **Nothing is ever rewritten.** No record in either append-only store is edited or removed.

### Ledger row — derived, never stored as truth

```jsonc
{
  "slug":           "differential-forms",
  "standing":       "demonstrated",       // "unknown" | "stale" | "demonstrated"
  "lastEvidence":   "2026-08-16T19:42:11Z",
  "demonstrations": 2,                    // count of Recalls verdicted demonstrated
  "spacingDays":    [0, 14],              // between them
  "probes":         { "seen": 6, "correct": 5 },
  "grounding":      "mixed",              // "sourced" | "model-recall" | "mixed"
  "policy":         "v1",
  "disputed":       false                 // an Override touches this Concept
}
```

- **Standing is coarse — three values, no number.** A scalar computed from a hand-picked
  half-life over eleven Observations is invented precision wearing a lab coat.
- **Counts are facts and may be shown**; they are tallies of Observations, not estimates of
  the learner.
- **`policy` is stamped** so `why` can name the rule that produced a Standing, and so a
  Standing derived under an older Policy is never silently compared with a newer one.
- **The row is rebuildable.** `ledger rebuild` must reproduce it exactly from
  `observations.jsonl` alone. If it cannot, the Ledger has acquired state it was never
  allowed to have.

## Non-goals

**No teaching.** The core holds no explanations, generates no items, chooses no examples,
and has no opinion about what makes a good Step. A core that taught would have to be
rewritten for every subject and would fork the pedagogy that the playbooks already own.

**No scheduling.** This is not a spaced-repetition system. It answers "what is this
learner's Standing" when asked; it never decides that today is the day to review something.
A sibling toolkit for accumulative subjects may schedule; this one does not.

**No vault writes outside `.learn/`.** Lesson notes are produced by the agent through the
folder map, with the propagation rules the vault already has. The core writing notes would
couple it to one vault layout and to one agent.

**No network.** Sourcing happens in the playbooks, where retrieval and judgement live. The
core reads and writes local files and nothing else.

**No other Shapes.** A Goal that is not `hierarchical` is declined and logged. See the
invariants in `CONTEXT.md`.
