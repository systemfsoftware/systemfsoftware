# @systemfsoftware/oxlint-plugin-tag-discipline

Oxlint rules for tagged-model discipline — services are declared with `Context.Service`, tagged unions are consumed through their matchers and guards, and HTTP status assertions surface the response body.

## Install

```sh
pnpm add -D @systemfsoftware/oxlint-plugin-tag-discipline
```

`effect` and `typescript` are peer dependencies: this package declares them but does not install them, so one copy is shared with the rest of your project.

## Entry points

- `@systemfsoftware/oxlint-plugin-tag-discipline` — the plugin: `rules` and `configs.recommended`.
- `@systemfsoftware/oxlint-plugin-tag-discipline/preset` — the config fragment: registers the plugin and enables `configs.recommended`.

## Use

```ts
// oxlint.config.ts
import preset from '@systemfsoftware/oxlint-plugin-tag-discipline/preset'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [preset],
})
```

The fragment registers the plugin and enables `configs.recommended`; a rule configured without its plugin registered is reported as unknown and never runs.

## Rules

| Rule                           | What it enforces                                                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-context-generic-tag`       | Ban `Context.GenericTag` — a v4 service is declared with `Context.Service`.                                                                                               |
| `no-direct-tag-access`         | Ban direct `_tag` access. Use the Effect Match API or type guards (`Either.isLeft`/`isRight`, `Option.isSome`/`isNone`, ...) instead. Configurable: expected, fix, allow. |
| `no-either-tag-assertions`     | Ban Either `_tag` assertions in test files. Use `expect(result).toEqual(Either.left(...))` / `Either.right(...)` instead.                                                 |
| `no-bodyless-status-assertion` | Forbids asserting an HTTP response status without surfacing the response body on failure. Use `checkResponseWithBody` so a mismatch reports the problem+json detail.      |

`no-bodyless-status-assertion` ships in `rules` but is excluded from `configs.recommended`: it needs a status-assertion vocabulary only some packages have. A consumer enables it by name.

## Enrollment

Turned on by `@systemfsoftware/oxlint-config/base`, which spreads `configs.recommended.rules` of `@systemfsoftware/oxlint-plugin` — the aggregate re-registers every rule here under its own namespace.

## Testing

Each rule ships a RuleTester suite at `src/rules/__tests__/<rule>.test.ts`, with 100% mutation coverage required.

## API

The public surface is generated from the source and versioned with the package: [`etc/oxlint-plugin-tag-discipline.api.md`](./etc/oxlint-plugin-tag-discipline.api.md).

## License

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/oxlint-plugin/oxlint-plugin-tag-discipline#readme).
