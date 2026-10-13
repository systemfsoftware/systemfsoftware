---
"@systemfsoftware/stryker-config": minor
---

`shardMutate` is no longer exported; this removal is breaking, and ships as a minor bump because the package is pre-1.0. `sharedConfig` now carries `mutate`, the files mutation testing mutates: `workflowMutate`, also exported and frozen, which is `src/**/*.workflow.ts` minus `src/**/__tests__/**`, narrowed to the shard's own files when `STRYKER_SHARD=<index>/<count>` is set. `mutate` is computed the first time it is read, so importing the package touches no file; every read returns the same array, and it cannot be assigned. A config spreads `sharedConfig` and sets no `mutate` of its own; replace `mutate: shardMutate([...])` with nothing.
