# AGENTS.md — `@systemfsoftware/effect-memfs`

Root `AGENTS.md` governs; this is the fact no default gate reports.

| ID      | Rule                                                                                                                                                                                                                           | Gate                                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **MF2** | Exactly one driver (`memfs`) sits behind the FileSystem port, imported only by `src/memory-file-system.handle.ts`; `src/driver-values.ts` narrows the values the handle hands it with predicates and never imports the driver. | `git grep -l "from 'memfs'" -- packages/effect-memfs/src` prints exactly `packages/effect-memfs/src/memory-file-system.handle.ts` |
