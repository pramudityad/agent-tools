## Learn

When the user wants to learn or be taught a hierarchically-structured subject, probe their
current understanding, plan a learning path, or resume a tutoring session with tracked
progress, use the dedicated toolkit at `~/.agent-tools/learn/` first. It teaches via
Probe → Plan → Teach and keeps an honest ledger of what has actually been demonstrated.

Read `~/.agent-tools/learn/CONTEXT.md` first — it is the glossary and its terms are
load-bearing: Concept, Goal, Strand, Frontier, Observation, Probe, Recall, Inference,
Override, Grounding, Ledger, Standing, Policy, Session, Shape, Path, Step, Closing. Use
them exactly; correct the user when they use an `_Avoid_` term (e.g. `mastery`, `quiz`,
`lesson`).

One-time setup, then the three playbooks drive the Session:

```bash
node ~/.agent-tools/learn/learn.mjs init --vault "<vault>"
# probe the Frontier (PROBE.md), plan the Path (PLAN.md), teach one Step at a time (TEACH.md)
node ~/.agent-tools/learn/learn.mjs concept lookup entropy
node ~/.agent-tools/learn/learn.mjs session start --goal "..." --shape hierarchical
node ~/.agent-tools/learn/learn.mjs next <session>
node ~/.agent-tools/learn/learn.mjs observe recall --session ... --grounding sourced
node ~/.agent-tools/learn/learn.mjs close <session> <concept>
```

`next` gates on a Closing per node — never skip the bookkeeping. Goals that do not
decompose into testable prerequisites (vocabulary, anatomy, an instrument) are declined,
not forced into a fabricated graph.