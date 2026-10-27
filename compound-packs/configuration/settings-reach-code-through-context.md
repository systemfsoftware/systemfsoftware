---
title: A feature's settings reach code through its <Feature>Config in context, built by the only layer that evaluates Config
applies_when:
  - adding a setting the service reads from the environment
  - passing settings into a function or constructor
  - reading a Config, process.env or a Worker binding inside a handler, a cell or a workflow
  - writing the layer that builds a feature's settings
  - providing settings to a test
  - adding a switch that turns a feature off
tags: [config, context, service, reference, layer, config-provider]
---

A feature's settings are one Context.Service named `<Feature>Config`, declared in `<feature>.config.ts`. When every setting has a safe default, they are a Context.Reference with a defaultValue instead.

Code reads them with `yield* <Feature>Config`. Settings are never passed as function or constructor arguments.

`<Feature>Config.layer` is the only code that evaluates a Config: it yields the application's Config values and builds the typed settings, so a missing or malformed variable fails as a ConfigError when the layer is built. The ConfigProvider decides where values come from (the process environment by default, Worker bindings through ConfigProvider.fromUnknown(env), a test provider); code never reads process.env or a binding object.

A test provides the service or reference directly with Effect.provideService or Layer.succeed; it never sets or stubs environment variables. Only a test of the layer itself supplies values, and it does so through a test ConfigProvider.

A feature that can be switched off has a tagged Enabled | Disabled value, and only the Enabled variant carries the feature's settings.

```typescript
// WRONG
export const sendReceipt = (receipt: Receipt, smtpHost: string) =>
  Effect.gen(function*() {
    const from = yield* Config.String('MAILER_FROM')
    const pageSize = Number(process.env.SEARCH_PAGE_SIZE ?? '20')
    // ...
  })
// send-receipt.test.ts
process.env.MAILER_FROM = 'receipts@acme.example'
```

```typescript
// RIGHT
// mailer.config.ts
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
// search.config.ts, every setting has a safe default
export class SearchConfig extends Context.Reference<{ readonly pageSize: number }>('acme/SearchConfig', {
  defaultValue: () => ({ pageSize: 20 }),
}) {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function*() {
      return { pageSize: yield* SEARCH_PAGE_SIZE }
    }),
  )
}
// payments.config.ts, a feature that can be switched off
export class PaymentsConfig extends Context.Service<
  PaymentsConfig,
  | { readonly _tag: 'Disabled' }
  | { readonly _tag: 'Enabled'; readonly apiKey: Redacted.Redacted<string> }
>()('acme/PaymentsConfig') {
  static readonly layer = Layer.effect(this)(
    Effect.gen(function*() {
      return (yield* PAYMENTS_ENABLED)
        ? { _tag: 'Enabled', apiKey: yield* PAYMENTS_API_KEY } as const
        : { _tag: 'Disabled' } as const
    }),
  )
}
// send-receipt.ts
export const sendReceipt = Effect.fn('sendReceipt')(function*(receipt: Receipt) {
  const { smtpHost, from } = yield* MailerConfig
  // ...
})
// worker.ts, the composition root
const ConfigLive = Layer.mergeAll(MailerConfig.layer, SearchConfig.layer, PaymentsConfig.layer).pipe(
  Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(env))),
)
// send-receipt.test.ts
sendReceipt(receipt).pipe(Effect.provideService(MailerConfig, { smtpHost: 'localhost', from }))
```

Gate: judge
