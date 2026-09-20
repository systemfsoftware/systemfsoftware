# @systemfsoftware/oxlint-plugin-effect-native

Oxlint rules for native APIs in Effect — when Effect is imported, native Map and Set are forbidden in favor of HashMap and HashSet. Also bans logging inside Effect catch blocks and `new Worker` alongside WASM imports.

## Rules

| Rule                             | What it enforces                                                                                                                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-native-map-in-effect`        | When Effect is imported, ban native Map (new Map). Use HashMap from effect instead.                                                                                                                                    |
| `no-native-set-in-effect`        | When Effect is imported, ban native Set (new Set). Use HashSet from effect instead.                                                                                                                                    |
| `no-new-worker-with-wasm-import` | When a file imports a WASM module (e.g. `*-wasm`), ban new Worker(filePath). Use Bun.spawn for process isolation — WASM global state races on concurrent init across threads of the same OS process and segfaults bun. |
| `no-logging-in-catch`            | Prevents logging inside Effect catch blocks. Use Effect.tapError or logging outside catch instead.                                                                                                                     |

## Enrollment

Turned on by `@systemfsoftware/oxlint-config/base`, which spreads `configs.recommended.rules` of `@systemfsoftware/oxlint-plugin` — the aggregate re-registers every rule here under its own namespace.

## Testing

Each rule ships a RuleTester suite at `src/rules/__tests__/<rule>.test.ts`, with 100% mutation coverage required.
