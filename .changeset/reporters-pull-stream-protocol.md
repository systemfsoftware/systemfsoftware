---
"@systemfsoftware/stryker-js": major
"@systemfsoftware/stryker-js-engine": major
"@systemfsoftware/stryker-js-html-reporter": major
"@systemfsoftware/stryker-js-cli": major
---

Reporter plugins are now pull-stream consumers: a reporter exports a factory
returning an async consumer of the four run events, and the event protocol ships
as a Standard Schema object you can validate and type-infer against without
depending on Effect.

- Removed: `ReporterService`, `broadcastReporter`, `NamedReporter`, and the
  legacy event payload types. A plugin that registered a reporter as an Effect
  layer must be rewritten as a factory.
- The dry-run event no longer carries the coverage map, and the plan event
  carries reduced mutant descriptors instead of full run options.
- An unknown reporter name now fails the run at startup instead of being
  silently ignored.
