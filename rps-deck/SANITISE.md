# Sanitising a teaching artifact

Real industry artifacts are a hard requirement of these courses, so most sessions project a
document that was never written to be shown. Sanitising it is two jobs with different
natures: **finding** what must change is judgement, **applying and verifying** is the tool's
(ADR 0004).

## Read the whole file first

Not a grep, not a skim. The Sesi 1 ERD was 865 lines; a targeted search for the employer
name found 4 lines and would have shipped the entire commercial partner stack — five biller
codes, two payment gateways, bank codes, product brands and SKUs — untouched.

## Identifier classes

Work through all of them, in order:

1. **Employer** — company name, wallet or balance constants, internal doc tags.
2. **Services** — internal service names, database schema qualifiers.
3. **Partners and vendors** — biller codes, payment gateways, their human-readable names,
   and any reference IDs carrying their prefix (`BF123…`, `GT987…`).
4. **Banks and instruments** — bank codes, account types.
5. **Brands and SKUs** — product names, slugs, partner product codes.
6. **PII shapes** — names, account numbers, phone numbers. Usually already synthetic in a
   schema doc; confirm rather than assume.
7. **Credentials** — keys, tokens, passwords, bearer strings.
8. **Internal paths and tags** — vault paths, `#work/…` frontmatter.

## What to keep

Everything that makes it a teaching artifact: partitioning strategy, JSONB columns and their
query patterns, logical foreign-key patterns across service boundaries, state machines,
retention policy, every column name and type, every index.

## Verify

```sh
node deck.mjs sanitise <source> <map.json> <destination>
```

Applies the map longest-key-first, then scans the output for every mapped identifier
case-insensitively plus the generic classes. Non-zero exit means something survived.

## The part the tool cannot check

Renaming does not hide **structure**. Anyone who knows the system will recognise its service
boundaries and schema choices regardless of the names. Whether that is acceptable is the
document owner's call, not the tool's — and not the agent's.
