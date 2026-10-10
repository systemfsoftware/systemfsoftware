---
"@systemfsoftware/gritlint": minor
---

An unparseable module is now a finding instead of a refused run. `gritlint
check` reports `gritlint/unparseable-module`, naming the module and its
`line:column` in the message, in the same shape as any other finding, and exits
`1`; before, one module the parser could not read aborted the whole run with
exit `2`, hiding every other finding in it. Exit `2` now means only that the
run was refused: an unreadable config, an unknown pack, a rule that does not
compile, or a scan root that selects no files.

The TypeScript parser also accepts more of the language a module may use:
`export type * from "..."`, call signatures separated only by a newline, and
`import("...")` types inside unions no longer make a module unparseable.
