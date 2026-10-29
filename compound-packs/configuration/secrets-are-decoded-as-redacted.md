---
title: A secret setting is decoded as Redacted and stays Redacted in the settings that carry it
applies_when:
  - reading a password, a token, an API key or a signing secret from the environment
  - reading a connection URL or DSN that embeds a credential
  - adding a credential to a feature's settings
tags: [config, secret, redacted, environment]
---

A variable whose value grants access (a password, a token, an API key, a signing secret, or a connection URL or DSN that embeds a credential) is decoded in src/config.ts with `S.Redacted(...)`, and the `<Feature>Config` field that carries it is typed `Redacted.Redacted<...>`.

It is never unwrapped into a plain string that is stored in settings, logged, put in an error or attached to a span.

Decision test: does every credential the diff reads decode through S.Redacted, and is every settings field that holds one typed Redacted? A credential decoded as a plain string, or unwrapped into a plain-string field, log line, error or span attribute, fails.

Defect prevented: a credential printed in a log line, an error message or a trace, where everyone who can read those can use it.

```typescript
// WRONG
export const PAYMENTS_API_KEY = Config.schema(
  S.String.annotate({ description: 'API key of the payment provider' }),
  'PAYMENTS_API_KEY',
)
export class PaymentsConfig
  extends Context.Service<PaymentsConfig, { readonly apiKey: string }>()('acme/PaymentsConfig')
{}
```

```typescript
// RIGHT
export const PAYMENTS_API_KEY = Config.schema(
  S.Redacted(S.String).annotate({ description: 'API key of the payment provider' }),
  'PAYMENTS_API_KEY',
)
export class PaymentsConfig extends Context.Service<
  PaymentsConfig,
  { readonly apiKey: Redacted.Redacted<string> }
>()('acme/PaymentsConfig') {}
```

Source: the effect 4 package's Schema.Redacted and Redacted module (a Redacted value prints as `<redacted>`).

Gate: judge
