# AGENTS.md — `@systemfsoftware/stryker-js-engine`

> **Location:** `packages/testing/mutation/stryker-js/engine/` — host-neutral mutation engine. Ports in, run out. No Node.

This package is owned outright (`REPO-O1`).

Deltas from root:

- **Zero `@effect/platform-*` on the manifest and no `engines` field.** The engine names no runtime; a process entry (the CLI) binds the layers. Gate: `pnpm --filter @systemfsoftware/stryker-js-engine attw` plus a manifest read — `dependencies` carries none of those names.
- **`makeRunLayer` builds the run; it does not provide Node.** It requires `FileSystem`, `Path`, `ChildProcessSpawner`, `Module`, and a socket port as arguments. Gate: `review` — a default Node layer inside the engine is rejected.
- **Workers are addressed by `entryUrl`, never by an engine-owned file.** The worker entry files are the CLI's dist entries. Gate: `review`.
