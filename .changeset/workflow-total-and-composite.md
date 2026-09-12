---
"@systemfsoftware/effect-cell-types": minor
---

Two constructors join `Workflow.make`.

`Workflow.total` brands a decision that cannot fail. A decider whose error channel is `never` no
longer becomes a workflow that cannot be called; it carries the workflow brand and is accepted
wherever a branded decision is, including `Cell.layer`'s `decide` slot. Like `make`, it takes the
command schema class first, and it still refuses a decision with a single variant or a variant
carrying no `_tag` to dispatch on.

`Workflow.andThen` chains two workflows. The first workflow's decision becomes the second workflow's
command, the composed workflow's error channel is the union of both components, and a refusal from
the first short-circuits — the second never runs. The second workflow's command class is passed as a
value, so the composed signature carries no adapter function.
