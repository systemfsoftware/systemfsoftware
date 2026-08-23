## 4.0.0

### Major Changes

- `Workflow.make` now takes two arguments: the command's schema class first, the decider second.

  To migrate, declare the command as a `Schema.Class` or `Schema.TaggedClass` and pass it first. The decider's parameter type is inferred from that class, so its annotation can be dropped. A plain interface, a type alias, an object literal, a `Schema.Struct` and a primitive are all refused at the command position — an interface produces no value to pass, and the others are not schema classes.

  The decider's own contract is unchanged: it still returns a `Result`, and a decision channel of `never`, an error channel of `never`, or an error channel carrying no tag are refused as before.

- `Tagged` no longer ships in the `Workflow` namespace.

  The requirement it expressed is unchanged: a decision error must still carry a tag the consumer can
  dispatch on, and `UntaggedError` still names the failure when one does not. Replace an annotation
  that referred to `Workflow.Tagged` with the concrete error type, or with a `Schema.TaggedError`
  class, which satisfies the channel directly.

### Patch Changes

- The peer requirements for `effect` and for the Effect test-runner integration now accept any compatible `4.0.0-rc` release, instead of demanding one exact release candidate.

  Installing alongside a newer release candidate no longer reports an unmet peer dependency or resolves a second copy of `effect` into the dependency tree.
