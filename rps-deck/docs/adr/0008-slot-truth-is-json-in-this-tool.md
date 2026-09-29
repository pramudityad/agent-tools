# Slot truth is a JSON file in this tool, not the vault's table

The real slot per course lives in `rps-deck/slots.json`, keyed by the naskah's `course`
frontmatter, and `check` refuses a naskah whose `slot-start`/`slot-minutes` disagree with it.
The vault's `02-Projects/Cakrawala/CONTEXT.md` used to hold this table; it now points here. We
chose JSON over parsing the vault's Markdown table because the repo has no parser for anything
richer than flat frontmatter, and two copies of a slot table is how every note came to claim 150
minutes.
