## 0.1.0

### Minor Changes

- Publish initial release of `@systemfsoftware/stryker-config`: `sharedConfig` (the shared StrykerJS options: pnpm, per-test coverage analysis, incremental runs, HTML and JSON reports under `reports/mutation/`, break threshold 100, `STRYKER_CONCURRENCY` override) and `shardMutate(patterns)`, which splits `mutate` across `STRYKER_SHARD=<index>/<count>` shards. `@systemfsoftware/stryker-js` `^17.0.0` is an optional peer.
