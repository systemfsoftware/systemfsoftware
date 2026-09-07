---
"@systemfsoftware/stryker-js": major
---

The test-runner and checker plugin contracts no longer declare `init` or
`dispose` members. A plugin now finishes all of its startup work while its
layer is constructed and releases its resources when that layer is torn
down. If you implemented either service, delete those members and move any
setup code into construction.

Worker-startup failures now report the phase `connect` instead of `init`.
The phases `init` and `dispose` no longer exist on test-runner failures.

`declarePlugin` now accepts a layer whose construction fails with the new
`PluginBuildError`, exported from this package. When a plugin cannot build,
the engine reports that typed error instead of failing silently.
