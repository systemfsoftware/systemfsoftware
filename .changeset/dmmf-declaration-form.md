---
"@systemfsoftware/oxlint-plugin-effect-dmmf": major
---

Surface `workflow-declaration-form` through the aggregate plugin.

`effect-dmmf` is the plugin name every cell diagnostic is reported under, so a rule added to
`effect-workflow` reaches consumers only once it appears here. Its API surface gains one entry —
`'workflow-declaration-form': Rule` — and `configs.recommended` now enables it at `'error'`.

Breaking for the same reason the underlying rule is: a `*.workflow.ts` file that declares its workflow
with a `Workflow<Command, Decision, Error>` type annotation, rather than producing it with
`Workflow.make`, now fails. The annotation form cannot derive the `UninhabitedDecision` /
`UninhabitedError` markers, so it silently defeats the constructor's guarantee on the very function it
appears to document.
