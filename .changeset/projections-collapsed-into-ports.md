---
"@systemfsoftware/arethetypeswrong-cli": major
"@systemfsoftware/arethetypeswrong-core": major
"@systemfsoftware/effect-gherkin-spec": major
"@systemfsoftware/omp-claude-compat": major
"@systemfsoftware/omp-agent-discipline": major
---

Collapse projection tags into the ports they projected

A `*ExecutorDeps` tag whose service type was indexed off other ports recorded which members
one operation happened to reach for. Exporting it turned internal composition into a surface
commitment: a consumer had to discover and provide an aggregator for each operation, where the
port it came from already served. The tags rode the `R` channel of exported signatures, so a
consumer met them only at their own call site.

Each was removed the way its evidence directed — no tag was renamed, and none was replaced:

- `AttwCliExecutorDeps`, `CheckPackageExecutorDeps` — deleted. Zero consumers, no Live layer;
  callers already required the real capabilities directly.
- `HookDispatcherExecutorDeps` — was a 1:1 alias of `Scope.Scope`. Requiring `Scope` names the
  same service.
- `InjectInstructionsExecutorDeps` — packed `FileSystem`, `Path` and `TomlLoader` with no logic.
  Consumers require the three ports.
- `EffectVitestDeps` → `EffectVitestBindings`. Never a `Context.Tag`: a plain type alias already
  passed as an ordinary parameter, so only the name misdescribed it. A stale api report that no
  `api-extractor` regenerates was deleted with it.

A consumer providing a port instead of an aggregator provides no more than before, since a
service `{ a, b }` is assignable to a requirement `{ a }`.
