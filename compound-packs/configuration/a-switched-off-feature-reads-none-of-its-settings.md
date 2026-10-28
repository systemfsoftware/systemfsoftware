---
title: A feature that can be switched off has an Enabled | Disabled <Feature>Config, and its layer reads the feature's other settings only when it is on
applies_when:
  - adding a switch that turns a feature off
  - making a feature's credentials or settings optional
  - reading a feature's settings when the feature may be disabled
tags: [config, feature-switch, tagged-union, context]
---

`<Feature>Config` for a feature that can be switched off is a tagged value: Disabled carries nothing, and Enabled carries every setting the feature needs, each one required.

Its layer reads the switch first and reads the feature's other variables only on the Enabled branch, so the application starts with the feature off and none of its other variables set.

Code dispatches on the tag; it never probes an optional setting to learn whether the feature is on (schema-modelling pack, states-are-tagged-unions.md).

Decision test: with the switch off and none of the feature's other variables set, does the layer succeed, and does no code decide whether the feature runs by checking whether one of its settings is present? An optional credential or setting standing in for the switch, a presence check (`if (config.apiKey)`), or a layer that reads the feature's variables before the switch fails.

Defect prevented: a switched-off feature still demands its credentials at startup, or a half-configured feature runs because one optional setting happened to be set.

```typescript
// WRONG
export class PaymentsConfig extends Context.Service<PaymentsConfig, {
  readonly apiKey: Option.Option<Redacted.Redacted<string>>
}>()('acme/PaymentsConfig') {}
// charge.ts
if (Option.isSome(apiKey)) { /* charge */ }
```

```typescript
// RIGHT
// src/config.ts
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
```

Source: schema-modelling pack, states-are-tagged-unions.md (absence never carries meaning; one variant per state).

Gate: judge
