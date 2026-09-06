## 7.0.0

### Major Changes

- Aggregated dependency tags are removed. `AttwCliExecutorDeps`, `CheckPackageExecutorDeps`, `HookDispatcherExecutorDeps` and `InjectInstructionsExecutorDeps` are gone; provide the capabilities themselves instead of an aggregate that bundled them. `HookDispatcherExecutorDeps` was only ever `Scope`, so require `Scope` directly.

  `EffectVitestDeps` is renamed to `EffectVitestBindings`. It was never a tag — it is an ordinary type you pass as a parameter, and only its name suggested otherwise.

  Providing a capability where an aggregate was expected costs you nothing: a value carrying more members than a requirement asks for still satisfies it.

### Minor Changes

- cut over to effect v4 (4.0.0-rc.108): public surface derives from effect types; peers flip effect ^3→^4

### Patch Changes

- New version is published through npm trusted publishing, so it carries a provenance attestation you can verify.

- Peer Effect requirement advances to 4.0.0-rc.112. No API changes.
