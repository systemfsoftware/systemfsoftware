## 4.1.0

### Minor Changes

- `cappedBackoff`, `worker`, `leader`, `task`, `withLeaderLock` and the other exported functions that took their subject first can now also be called data-last inside `pipe`. Existing calls keep working.
