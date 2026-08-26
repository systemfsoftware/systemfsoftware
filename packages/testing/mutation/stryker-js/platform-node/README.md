# @systemfsoftware/stryker-js-platform-node

The Node host for the mutation engine: it runs a mutation test on this machine —
reading the project, instrumenting it, spawning the workers and scoring the
result.

## Install

```sh
pnpm add @systemfsoftware/stryker-js-platform-node effect
```

`effect` is a peer dependency: this package declares it but does not install it,
so one copy is shared with the rest of your project.

## Entry points

Anything not listed here is internal and moves without notice.

- `@systemfsoftware/stryker-js-platform-node` — the run, its stages, the
  environment it needs, and the failure identities it raises

Three further subpaths — `internal/checker-worker`,
`internal/child-process-proxy-worker-main` and
`internal/child-process-test-runner-worker` — exist because the engine spawns
them by resolved specifier. They are process entry points, not an API: importing
one for a value is unsupported, and the engine resolves them itself.

## License

Apache-2.0. Part of
[systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/testing/mutation/stryker-js/platform-node#readme).
