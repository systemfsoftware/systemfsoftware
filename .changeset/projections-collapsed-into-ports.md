---
"@systemfsoftware/arethetypeswrong-cli": major
"@systemfsoftware/arethetypeswrong": major
"@systemfsoftware/effect-gherkin-spec": major
"@systemfsoftware/omp-claude-compat": major
"@systemfsoftware/omp-agent-discipline": major
---

Aggregated dependency tags are removed. `AttwCliExecutorDeps`, `CheckPackageExecutorDeps`, `HookDispatcherExecutorDeps` and `InjectInstructionsExecutorDeps` are gone; provide the capabilities themselves instead of an aggregate that bundled them. `HookDispatcherExecutorDeps` was only ever `Scope`, so require `Scope` directly.

`EffectVitestDeps` is renamed to `EffectVitestBindings`. It was never a tag — it is an ordinary type you pass as a parameter, and only its name suggested otherwise.

Providing a capability where an aggregate was expected costs you nothing: a value carrying more members than a requirement asks for still satisfies it.
