# @systemfsoftware/oxlint-plugin-effect-native

Oxlint rules for native APIs in Effect — when Effect is imported, the native ambient, timer, and concurrency primitives are forbidden in favor of their controllable Effect counterparts.

## Install

```sh
pnpm add -D @systemfsoftware/oxlint-plugin-effect-native
```

`effect` and `typescript` are peer dependencies: this package declares them but does not install them, so one copy is shared with the rest of your project.

## Entry points

- `@systemfsoftware/oxlint-plugin-effect-native` — the plugin: `rules` and `configs.recommended`.
- `@systemfsoftware/oxlint-plugin-effect-native/preset` — the config fragment: registers the plugin and enables `configs.recommended`.

## Use

```ts
// oxlint.config.ts
import preset from '@systemfsoftware/oxlint-plugin-effect-native/preset'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [preset],
})
```

The fragment registers the plugin and enables `configs.recommended`; a rule configured without its plugin registered is reported as unknown and never runs.

## Rules

| Rule                              | What it enforces                                                                                                                                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-date-now-in-effect`           | When Effect is imported, ban Date.now() (including inside Effect.sync). A clock read is an effect — use Clock.currentTimeMillis so it is controllable under TestClock.                                                 |
| `no-native-map-in-effect`         | When Effect is imported, ban native Map (new Map). Use HashMap from effect instead.                                                                                                                                    |
| `no-native-set-in-effect`         | When Effect is imported, ban native Set (new Set). Use HashSet from effect instead.                                                                                                                                    |
| `no-native-setinterval-in-effect` | When Effect is imported, ban native setInterval/clearInterval. Use Effect.repeat with Schedule instead.                                                                                                                |
| `no-native-settimeout-in-effect`  | When Effect is imported, ban native setTimeout. Use Effect.delay or Effect.sleep instead.                                                                                                                              |
| `no-new-promise-in-effect`        | When Effect is imported, ban new Promise(executor). Use Effect.async or Promise.withResolvers instead.                                                                                                                 |
| `no-new-worker-with-wasm-import`  | When a file imports a WASM module (e.g. `*-wasm`), ban new Worker(filePath). Use Bun.spawn for process isolation — WASM global state races on concurrent init across threads of the same OS process and segfaults bun. |
| `no-logging-in-catch`             | Prevents logging inside Effect catch blocks. Use Effect.tapError or logging outside catch instead.                                                                                                                     |

## Enrollment

Turned on by `@systemfsoftware/oxlint-config/base`, which spreads `configs.recommended.rules` of `@systemfsoftware/oxlint-plugin` — the aggregate re-registers every rule here under its own namespace.

## Testing

Each rule ships a RuleTester suite at `src/rules/__tests__/<rule>.test.ts`, with 100% mutation coverage required.

## API

The public surface is generated from the source and versioned with the package: [`etc/oxlint-plugin-effect-native.api.md`](./etc/oxlint-plugin-effect-native.api.md).

## License

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/oxlint-plugin/oxlint-plugin-effect-native#readme).
