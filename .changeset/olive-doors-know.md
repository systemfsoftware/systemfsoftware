---
"@systemfsoftware/oxlint-plugin-dmmf-workflow": major
"@systemfsoftware/oxlint-config-dmmf": major
"@systemfsoftware/oxlint-config-recommended": major
---

New rule `workflow-decides-through-match`, enrolled in `recommended` at `error`. Inside a `Workflow.make` decide body it reports:

- a `Match` handler whose `Result.succeed(…)` returns the matched value unchanged: the handler's parameter or the `Match.value` subject, including through a const alias, an `as`/`satisfies` wrapper or a spread copy;
- a member read keyed by a `_tag` value, such as `table[state._tag]` or `handlers[command._tag](command)`.

To migrate, return a named success variant for a replay the business accepts and a typed refusal for an illegal pair, and dispatch with `Match.tag` instead of a `_tag`-keyed table.
