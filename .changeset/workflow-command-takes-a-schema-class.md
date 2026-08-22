---
'@systemfsoftware/effect-cell-types': major
---

`Workflow.make` now takes two arguments: the command's schema class first, the decider second.

To migrate, declare the command as a `Schema.Class` or `Schema.TaggedClass` and pass it first. The decider's parameter type is inferred from that class, so its annotation can be dropped. A plain interface, a type alias, an object literal, a `Schema.Struct` and a primitive are all refused at the command position — an interface produces no value to pass, and the others are not schema classes.

The decider's own contract is unchanged: it still returns a `Result`, and a decision channel of `never`, an error channel of `never`, or an error channel carrying no tag are refused as before.
