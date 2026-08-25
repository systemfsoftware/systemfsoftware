# @systemfsoftware/stryker-js-mutation-run

A source-code fork of the upstream StrykerJS core package

## Install

```sh
pnpm add @systemfsoftware/stryker-js-mutation-run 'effect@4.0.0-rc.108'
```

Those are peer dependencies: this package declares them but does not install them, so one copy is shared with the rest of your project.

## Entry points

Anything not listed here is internal and moves without notice.

- `@systemfsoftware/stryker-js-mutation-run` — the engine, its failure
  identities, and this package's version
- `@systemfsoftware/stryker-js-mutation-run/config/base` — the preset a
  `stryker.config.json` names in `extends`
- `@systemfsoftware/stryker-js-mutation-run/config/config-resolution` — read and
  validate a configuration
- `@systemfsoftware/stryker-js-mutation-run/config/fork-schema` — the forked-run
  configuration contract
- `@systemfsoftware/stryker-js-mutation-run/run-event` — the event stream a run
  emits
- `@systemfsoftware/stryker-js-mutation-run/verdict-envelope` — a finished run's
  verdict
- `@systemfsoftware/stryker-js-mutation-run/exit-classification` — the classed
  status a failure carries
- `@systemfsoftware/stryker-js-mutation-run/output-mode` — the resolved output
  mode and its colour decision

Three further subpaths — `checker-worker`,
`child-process-proxy-worker-main` and `child-process-test-runner-worker` — exist
because the engine spawns them by resolved specifier. They are process entry
points, not an API: importing one for a value is unsupported.

## API

The public surface is generated from the source and versioned with the package: [`etc/stryker-js-mutation-run.api.md`](./etc/stryker-js-mutation-run.api.md).

## License

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/stryker-js/mutation-run#readme).
