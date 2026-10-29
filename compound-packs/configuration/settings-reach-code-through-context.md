---
title: Application code reads a feature's settings only from its <Feature>Config in context, and only <Feature>Config.layer evaluates a Config
applies_when:
  - reading a setting inside a handler, a cell, a workflow or a service
  - passing a setting into a function or a constructor in application code
  - reading process.env, a Config or a Worker binding object outside src/config.ts
  - declaring the settings a feature reads
tags: [config, context, service, layer, config-provider]
---

A feature's settings are one Context.Service named `<Feature>Config`, declared in src/config.ts beside the Configs its layer reads; no `<feature>.config.ts` exists under src/ (cell-architecture pack, file-kinds.md).

Application code reads settings with `yield* <Feature>Config` and never takes a setting as a function or constructor parameter. A library adapter's layer options follow the cell-architecture pack, layers-are-named-layer-and-layerConfig.md.

`<Feature>Config.layer` is the only code that evaluates a Config. The ConfigProvider decides where values come from (the process environment by default, a Worker's bindings through `ConfigProvider.fromUnknown(env)`); no other code reads process.env or a binding object. The layer is provided at the composition root (cell-architecture pack, services-are-provided-once-at-the-composition-root.md), so a missing or malformed variable fails as a ConfigError when the application starts.

Decision test: outside `<Feature>Config.layer`, does any code in the diff evaluate a Config, read process.env or a binding object, or take a setting as a parameter? Any one fails.

Defect prevented: a missing variable surfaces only when a rarely used path first runs in production; code that reads process.env ignores the ConfigProvider, so a Worker's bindings or a test's settings never reach it; a setting threaded through call chains couples signatures that have nothing to do with it.

```typescript
// WRONG
export const sendReceipt = (receipt: Receipt, smtpHost: string) =>
  Effect.gen(function*() {
    const from = yield* Config.String('MAILER_FROM')
    const pageSize = Number(process.env.SEARCH_PAGE_SIZE ?? '20')
    // ...
  })
```

```typescript
// RIGHT
// src/config.ts
export class MailerConfig extends Context.Service<MailerConfig, {
  readonly smtpHost: string
  readonly from: EmailAddress
}>()('acme/MailerConfig') {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function*() {
      return { smtpHost: yield* SMTP_HOST, from: yield* MAILER_FROM }
    }),
  )
}
// send-receipt.ts
export const sendReceipt = Effect.fn('sendReceipt')(function*(receipt: Receipt) {
  const { smtpHost, from } = yield* MailerConfig
  // ...
})
// worker.ts, the composition root
const ConfigLive = MailerConfig.layer.pipe(Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(env))))
```

Source: the effect 4 package's ConfigProvider module (`ConfigProvider.layer`, `ConfigProvider.fromUnknown`) and Config.ConfigError; cell-architecture pack, file-kinds.md, layers-are-named-layer-and-layerConfig.md and services-are-provided-once-at-the-composition-root.md.

Gate: judge
