---
"@systemfsoftware/stryker-config": minor
---

`shardMutate` is no longer exported. `sharedConfig` now carries `mutate`, the files mutation testing mutates: `workflowMutate`, also exported and frozen, which is `src/**/*.workflow.ts` minus `src/**/__tests__/**`, narrowed to the shard's own files when `STRYKER_SHARD=<index>/<count>` is set. A config spreads `sharedConfig` and sets no `mutate` of its own; replace `mutate: shardMutate([...])` with nothing.
