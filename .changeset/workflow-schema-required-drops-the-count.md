---
'@systemfsoftware/oxlint-plugin-effect-workflow': major
---

`workflow-schema-required` no longer reports `tooFewDecisionVariants`, and the messageId is gone from its exported `MessageIds`.

The check counted locally-declared `S.TaggedClass`/`S.TaggedError` names not ending in `Command` and demanded two. That predicate counts declarations, not outcomes, and it fails in both directions on the same file. A workflow whose decision union is imported returns four outcomes — three decision variants and one error — and counts one. The same file before that change passed the count with five, four of which were internal exit-code categories that are not outcomes of anything.

What the count was standing in for is carried at the constructor: `Workflow.make` refuses an uninhabited decision channel, an uninhabited error channel and an untagged error at the call, each witnessed by an unsuppressed `TS2345`. Two inhabited channels are two outcomes, so the arithmetic added nothing true.

`noSchemaVariants` and `missingErrorChannel` are unchanged, so EW1's obligation still stands: a workflow with no schema declaration fails, and one declaring only a command still fails for want of a declared `S.TaggedError`. In the rule's own suite every case that expected `tooFewDecisionVariants` also expected `missingErrorChannel` — the removed arm never fired alone, so no fixture stops being red.
