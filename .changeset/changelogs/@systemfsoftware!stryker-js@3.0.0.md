## 3.0.0

### Major Changes

- Reporter plugins are now pull-stream consumers: a reporter exports a factory
  that returns an async consumer of the four run events, instead of registering
  an Effect layer that provides the `Reporter` capability service.

  - Removed: `ReporterService`, `broadcastReporter`, `NamedReporter`, the
    `Reporter` service class, and the legacy event payload types.
  - The event protocol ships as a Standard Schema object; validate and infer it
    with `import { ReporterEventSchema, type ReporterFactory, type ReporterInit }
    from '@systemfsoftware/stryker-js/ReporterEvent'`.
  - Event payloads are narrowed: the dry-run event no longer carries the coverage
    map; the plan event carries reduced mutant descriptors instead of full run
    options; `mutantTested` drops `killedBy`, `coveredBy`, `static`,
    `testsCompleted` and `statusReason`, and renames `mutatorName` to `mutator`.
  - `ReporterFailed.event` now names the event kind being processed instead of a
    lifecycle method name; `'wrapUp'` no longer occurs.
  - An unknown reporter name now fails the run at startup instead of being
    silently ignored. A reporter that fails on the terminal report now fails the
    run; a reporter that fails earlier is logged and detached with the exit code
    unchanged.
  - `@systemfsoftware/stryker-js-engine/builtin-reporters` no longer exports
    `strykerPlugins`; call `makeBuiltinReporterFactories({ fileSystem, path })`.
  - The built-in json and clear-text reporters write their notices directly to
    stdout and stderr instead of the Effect logger, and the html reporter no
    longer depends on `@effect/platform-node`.

- Remove the --llms command manifest: the CLI no longer accepts --llms and the Run stream no longer carries a manifest terminal event.
