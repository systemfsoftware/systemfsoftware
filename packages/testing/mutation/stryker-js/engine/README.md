# @systemfsoftware/stryker-js-engine

The host-neutral mutation engine: it runs a mutation test — reading the project,
instrumenting it, spawning the workers and scoring the run — through ports a
process entry binds. The engine names no runtime: its manifest carries no
`@effect/platform-*` dependency and no `engines` field. The published process
entries live in [`@systemfsoftware/stryker-js-cli`][cli], which binds the Node
layers (`FileSystem`, `Path`, `ChildProcessSpawner`, `Module`, sockets) around
[`makeRunLayer`][run] and owns the worker files.

```sh
pnpm add @systemfsoftware/stryker-js-engine effect
```

`effect` is a peer dependency: this package declares it but does not install it,
so the host pins one version across the whole run.

## Subpaths

- `@systemfsoftware/stryker-js-engine` — the run, its stages, and the failure
  identities it raises
- `./builtin-reporters` — the clear-text, progress, and JSON reporters
- `./config/base` — the base option preset
- `./worker` — the worker-side wiring a worker entry file calls into

A host other than Node starts the same engine by providing its own layers at
the process that calls `makeRunLayer`; it does not fork these sources.

[cli]: https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/testing/mutation/stryker-js/cli
[run]: https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/testing/mutation/stryker-js/engine
