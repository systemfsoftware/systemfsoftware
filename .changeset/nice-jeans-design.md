---
"@systemfsoftware/stryker-config": minor
---

`shardMutate` is no longer exported; this removal is breaking, and ships as a minor bump because the package is pre-1.0. `sharedConfig` now carries `mutate`, the files mutation testing mutates: `workflowMutate`, also exported and frozen, which is `src/**/*.workflow.ts` minus the `__tests__`, `__fixtures__` and `__mocks__` directories. A config spreads `sharedConfig` and sets no `mutate` of its own; replace `mutate: shardMutate([...])` with nothing. To split a run, use the `plan` command and the `--shard` option of `@systemfsoftware/stryker-js`; the config needs no shard setting.
