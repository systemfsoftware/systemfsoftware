# @systemfsoftware/oxlint-plugin

![version](https://img.shields.io/npm/v/@systemfsoftware/oxlint-plugin)
![license](https://img.shields.io/npm/l/@systemfsoftware/oxlint-plugin)

> Catch Effect-TS violations before they hit review: ban classes, string errors, bare promises, native timers, and every other pattern the System F Software Constitution forbids.

Effect enforces a discipline — no `Date.now()`, no `Set` or `Map` inside an Effect, no barrel exports, no string errors. But the compiler doesn't catch these. And code review catches them too late, one PR at a time, after someone already wrote the wrong thing.

This plugin turns those rules into instant feedback. Wire it into your `oxlint.config.ts`, and every `pnpm lint` run checks every file before commit. Eighteen rules cover the constitution's pure-core and boundary articles — from `ban-classes` and `ban-error-string` to `no-io-boundary-tests` and `no-logging-in-catch`.

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
    '@systemfsoftware/oxlint-plugin/ban-classes': 'error',
  },
})
```

Then lint:

```bash
pnpm oxlint
```

A class that does not extend one of the sanctioned Effect v4 constructor expressions (`Context.Service`, `Schema.Class`, `Data.TaggedClass`, the Rpc factories, ...) is reported and rejected. No legacy class — and no bare class — survives to review.

A service declaration carries the effect that builds it:

```ts
class Store extends Context.Service<Store, StoreShape>()('app/Store', {
  make: Effect.gen(function*() {/* … */}),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
```

`Effect.Service` is reported wherever it appears — the Effect module exports no `Service` in v4, and `Context` exports `Key`, `Service` and `Reference` but no `Tag`.

Whether a service _should_ carry `make` is not linted, and deliberately so. A `Context.Service` with no `make` is a **port**, and a port's own file routinely holds exactly one layer — a stub or a noop — while the real implementations live elsewhere. No rule reading one file can separate that stub from a canonical construction, so a check that fired on "one layer beside a service" would tell a port to promote its stub. Put the construction on the class when the module owns it; that call is a review matter.

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
