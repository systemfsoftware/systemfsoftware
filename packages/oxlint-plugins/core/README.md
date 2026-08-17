# @systemfsoftware/oxlint-plugin

![version](https://img.shields.io/npm/v/@systemfsoftware/oxlint-plugin)
![license](https://img.shields.io/npm/l/@systemfsoftware/oxlint-plugin)

> Catch Effect-TS violations before they hit review: ban classes, string errors, bare promises, native timers, and every other pattern the System F Software Constitution forbids.

Effect enforces a discipline — no `Date.now()`, no `Set` or `Map` inside an Effect, no barrel exports, no string errors. But the compiler doesn't catch these. And code review catches them too late, one PR at a time, after someone already wrote the wrong thing.

This plugin turns those rules into instant feedback. Wire it into your `oxlint.config.ts`, and every `pnpm lint` run checks every file before commit. Sixteen rules cover the constitution's pure-core and boundary articles — from `ban-error-string` and `no-context-generic-tag` to `no-io-boundary-tests` and `no-logging-in-catch`.

## Quick start

```bash
pnpm add -D @systemfsoftware/oxlint-plugin
```

Configure it in your oxlint config:

```ts
import { defineConfig } from 'oxlint'

export default defineConfig({
  jsPlugins: ['@systemfsoftware/oxlint-plugin'],
  rules: {
    '@systemfsoftware/oxlint-plugin/no-classes': 'error',
  },
})
```

Then lint:

```bash
pnpm oxlint
```

If a `class` keyword appears anywhere, oxlint prints an error and exits 1. No class survives to review.

For a full setup with every rule enabled at the recommended severity, extend the shared base config:

```ts
import baseConfig from '@systemfsoftware/oxlint-config'

export default defineConfig({ ...baseConfig })
```

Browse [`src/rules/`](src/rules/) for every rule and its implementation — that list is always current.

## Tech stack

| Component  | Technology      | Version |
| ---------- | --------------- | ------- |
| Runtime    | Node.js         | 24.x    |
| Linter     | oxlint          | 1.60.x  |
| Plugin API | @oxlint/plugins | 1.60.x  |
| Language   | TypeScript      | 6.0.x   |

## License

Apache 2.0
