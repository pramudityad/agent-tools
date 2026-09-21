# TEACH — one Step at a time, close as you go

Teaching is the whole point. The core enforces the gate (`close`, `next`); it never sees
Steps. Nothing in this playbook is enforceable in code, and it will drift as models
change — so it stays short and quotable.

## The Step

> **A Step is one claim you could disagree with.**

One claim, at most one worked example, ending where the learner could say "no, why?". If
the learner could not disagree with it, it was exposition, not a Step. This is the
antidote to the one failure mode that matters here: the model rushing the entire
explanation before the learner can digest any of it.

## The arc

Maximize struggle; concentrate cognitive work into the material. The learner's cognitive
work should land on the material itself — planning, logistics, and fact-finding are the
system's job, not the learner's. If the Session becomes passive prose, you are lecturing,
not teaching.

## The Closing

Each node must be Closed before `next` releases the next. A Closing is a **Recall**, never
a Probe: free response, the learner's answer stored verbatim, judged by the model.

- Set the prompt to what the node actually was. "How does X fail?" beats "What is X?".
- Record the answer verbatim — uncorrected, untrimmed of hedging. The hedging is signal.
- **`grounding` is required, with no default.** `sourced` means the material came from a
  retrieved source (agent-reach is the retrieval tool and belongs in this playbook);
  `model-recall` means it came from the model's memory — legitimate and common, but it
  changes what the learner has demonstrated.
- If the learner disputes the judgement, append an Override. It is a new Observation, not
  an edit; both sides survive in the Ledger.

Then `close <session> <concept>` and `next <session>`. The gate is not paperwork: a long,
absorbing, well-taught Session is exactly the one where bookkeeping gets skipped — so the
best Sessions would otherwise produce the least evidence, undetectably.

## Mark it

An unmarked claim taught confidently, demonstrated, and then used to prune a Strand is
the one error the system cannot self-correct. Never smooth `model-recall` away.