# 0004 — Sanitisation is judgement, then deterministic application

**Status:** accepted · 2026-09-03

## Context

Sessions must project real industry artifacts, which means sanitising documents never
written to be shown. The instinct is to automate it with a rename map.

The Sesi 1 run showed why the map cannot be the starting point. The session note prescribed
renaming the employer and the biller codes — eleven replacements. Reading all 865 lines
found five biller codes, two payment gateways, bank codes, product brands and SKUs, and
partner-prefixed reference IDs. The prescribed map would have shipped the commercial partner
stack intact.

## Decision

Split the work at its natural seam. **Finding** is judgement: the agent reads the artifact in
full and proposes a rename map. **Applying and verifying** is the tool: `sanitise` applies
the map longest-key-first, then scans the result for every mapped identifier
case-insensitively plus generic classes the map may not mention — emails, URLs, phone
numbers, credential shapes, work tags, vault paths.

## Consequences

The generic classes are the safety net for an incomplete map, which is the expected failure
mode rather than an unlikely one.

Case-insensitivity is not incidental: the source carried both `BILLFAZZ` and `BillFazz`, and
a case-sensitive scan passes while shipping the name.

## What this does not solve

Renaming does not hide structure. Service boundaries, logical foreign-key patterns and
partitioning choices stay recognisable to anyone who knows the system. No scan can check
that, so `SANITISE.md` states plainly that the disclosure decision belongs to the document
owner.
