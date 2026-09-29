# Never verify a write from an immediate GET

A task-update reported "updated" and a GET right after showed the new text, yet a later GET
returned the *older* description — an immediate read is not proof the write landed.

Re-GET after ~20s and assert on the actual field (e.g. `"github.com/x" in description`,
`description.count("&gt;") == 0`), twice, before telling the user a write succeeded.
