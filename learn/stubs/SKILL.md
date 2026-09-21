---
name: learn
description: >
  MUST USE when the user wants to learn or be taught a hierarchically-structured
  subject, probe their current understanding, plan a learning path, or resume a
  tutoring session — the learning toolkit that teaches one topic via Probe → Plan →
  Teach with an honest ledger of what has been demonstrated. Keeps a registry of
  Concepts and append-only Observations in the vault's .learn/, derives each
  Concept's Standing (unknown/stale/demonstrated) from them, and gates teaching on
  a Closing per Concept. Use it whenever learning progress should be tracked rather
  than just talked through. NOT for: general explanations, homework solving, or
  subjects that do not decompose into testable prerequisites (vocabulary, anatomy,
  an instrument) — those are declined on Shape grounds.
---

# Learn

An agent-agnostic toolkit living at `~/.agent-tools/learn/`. Everything below is in that
directory — read the files, do not guess at their contents.

**Always read `~/.agent-tools/learn/CONTEXT.md` first.** It is the glossary and its terms
are load-bearing: `Concept`, `Goal`, `Strand`, `Frontier`, `Observation`, `Probe`,
`Recall`, `Inference`, `Override`, `Grounding`, `Ledger`, `Standing`, `Policy`,
`Session`, `Shape`, `Path`, `Step`, `Closing`. The `_Avoid_` lists matter: for example a
`Probe` is never a "quiz" and a `Recall` is never a "grade". The user's global CLAUDE.md
requires you to use these terms exactly and to correct the user when they use an `_Avoid_`
term.

Then read the contract, the playbooks, and the ADRs:

| Task | Read |
|---|---|
| Exact CLI shape, storage layout, record shapes, error codes | `~/.agent-tools/learn/CONTRACT.md` |
| Why the Ledger is derived, never stored | `~/.agent-tools/learn/docs/adr/` |
| Pedagogy — how to probe, plan, and teach | `PROBE.md`, `PLAN.md`, `TEACH.md` |

```bash
node ~/.agent-tools/learn/learn.mjs init --vault "<vault>"   # one time
node ~/.agent-tools/learn/learn.mjs <command> ... --summary  # human-readable
node ~/.agent-tools/learn/learn.mjs <command> ... --json     # machine-readable (default)
node ~/.agent-tools/learn/learn.mjs --help                   # usage + full field list
node ~/.agent-tools/learn/test.mjs                           # hermetic test suite
```

Three rules that are easy to get wrong:

- **Only a Recall closes a Concept.** No quantity of Probes moves a Standing to
  `demonstrated`, and `correct` is computed by the core — never assert it yourself.
- **`grounding` is required on every Recall, no default.** Mark `model-recall` honestly;
  an unmarked claim that prunes a Strand is the one error the system cannot self-correct.
- **The gate is discipline, not paperwork.** `next` refuses until the current node has a
  Closing — the best Sessions are exactly the ones where bookkeeping gets skipped.