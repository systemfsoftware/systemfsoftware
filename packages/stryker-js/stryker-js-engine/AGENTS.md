# AGENTS.md — `@systemfsoftware/stryker-js-engine`

Host-neutral mutation engine: ports in, run out, no Node. Parent: `packages/stryker-js/AGENTS.md`.

## Rules

| ID      | Rule                                                                                                                                                                                                                                                                                                                 | Gate                                                                         |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **EN1** | Zero `@effect/platform-*` in the manifest and no `engines` field — the engine names no runtime; a process entry (the CLI) binds the layers.                                                                                                                                                                          | `pnpm --filter @systemfsoftware/stryker-js-engine attw` plus a manifest read |
| **EN2** | The engine exports static layers only (`idGeneratorLayer`); it ships no parameterized layer factory. The composition root seeds `RunEnvironment` and `RunEvents` with `Layer.succeed`, merges the static layers with its own host layers, and provides once; it never provides a default Node layer from the engine. | `review`                                                                     |
| **EN3** | Workers are addressed by `entryUrl`, never by an engine-owned file; worker entry files are the CLI's dist entries.                                                                                                                                                                                                   | `review`                                                                     |

## Verification

```bash
pnpm --filter @systemfsoftware/stryker-js-engine build
pnpm --filter @systemfsoftware/stryker-js-engine typecheck
pnpm --filter @systemfsoftware/stryker-js-engine test
pnpm --filter @systemfsoftware/stryker-js-engine lint
```
