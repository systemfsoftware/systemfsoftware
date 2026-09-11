---
"@systemfsoftware/stryker-js": major
---

The plugin interface is plain data now: a plugin is a value plus a plain factory, and writing one no longer requires `effect` — this package has no runtime dependency at all.

What changed for you:

- `declarePlugin(kind, name, make)` takes a factory, not an Effect `Layer`. Each kind's module documents its factory shape (`Ignorer`, `Evaluator`, `Parser`, `Checker`, `TestRunner`, `Reporter`).
- The kind literal `Ignore` is now `Ignorer`, matching the module, the contribution and the `ignorers` option.
- An evaluator returns `{ exitClass, message? }` (or `null` for "no verdict") instead of logging: the host reports the message and folds the exit class into the run's result.
- The subpath entries `Run`, `Schema`, `Module`, `Metrics`, `ReporterEvent`, `output-file` and `provided-options` are gone. Their types now live on the abstraction that owns them — the run-event stream is internal to the host, `ReporterEvent` is part of `Reporter`, metrics are part of `Report`, and the option schemas and their helpers are part of `Options`.
- `errorToString` and `causeText` are published from the package root for rendering an error as text.

To migrate: replace each `Layer` contribution with the matching factory, import `Ignorer` where you imported `Ignore`, and take any removed subpath name from the abstraction module that now owns it.
