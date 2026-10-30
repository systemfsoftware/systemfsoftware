---
title: Application code reads a feature's settings only from its <Feature>Config in context, and only <Feature>Config.layer evaluates a Config
applies_when:
  - reading a setting inside a handler, a cell, a workflow or a service
  - passing a setting into a function or a constructor in application code
  - reading process.env, a Config or a Worker binding object outside src/config.ts
  - declaring the settings a feature reads
tags: [config, context, service, layer, config-provider]
---

A feature's settings are one `Context.Service` named `<Feature>Config`, declared in src/config.ts beside the Configs its layer reads; no `<feature>.config.ts` exists under src/ (cell-architecture pack, file-kinds.md).

Application code reads settings with `yield* <Feature>Config` and never takes a setting as a function or constructor parameter. A library adapter's layer options follow the cell-architecture pack, layers-are-named-layer-and-layerConfig.md.

`<Feature>Config.layer` is the only code that evaluates a Config. The ConfigProvider decides where values come from (the process environment by default, a Worker's bindings through `ConfigProvider.fromUnknown(env)`); no other code reads `process.env` or a binding object. Provide the layer at the composition root (cell-architecture pack, services-are-provided-once-at-the-composition-root.md).

```typescript
// WRONG
export const sendReceipt = (receipt: Receipt, smtpHost: string) =>
  Effect.gen(function*() { const from = yield* Config.String('MAILER_FROM') /* ... */ })
// RIGHT
export const sendReceipt = Effect.fn('sendReceipt')(function*(receipt: Receipt) {
  const { smtpHost, from } = yield* MailerConfig
})
```
