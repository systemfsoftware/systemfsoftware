## 3.0.0

### Major Changes

- Published types no longer include names tagged `@internal`. If you imported one of those names from the package, switch to a public export or stop using it.

### Minor Changes

- The loop kinds now ship their tags as values.

  `PollLoopTag`, `StreamLoopTag` and `SubscriptionLoopTag` are new exports: each is a shared `{ _tag }`
  value together with a type of the same name, and `PollLoop`, `StreamLoop` and
  `SubscriptionLoop` inherit their discriminant from it. Members, tag strings and every existing
  narrowing are unchanged, and constructing a loop can now spread the carrier instead of repeating
  the literal.

### Patch Changes

- The peer requirements for `effect` and for the Effect test-runner integration now accept any compatible `4.0.0-rc` release, instead of demanding one exact release candidate.

  Installing alongside a newer release candidate no longer reports an unmet peer dependency or resolves a second copy of `effect` into the dependency tree.

- Updated dependencies:
  - @systemfsoftware/effect-cell-types@4.0.0
