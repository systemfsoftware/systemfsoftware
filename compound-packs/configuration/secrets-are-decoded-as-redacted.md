---
title: A secret setting is decoded as Redacted and stays Redacted in the settings that carry it
applies_when:
  - reading a password, a token, an API key or a signing secret from the environment
  - reading a connection URL or DSN that embeds a credential
  - adding a credential to a feature's settings
tags: [config, secret, redacted, environment]
---

Decode a variable whose value grants access (a password, token, API key, signing secret, or a connection URL or DSN that embeds a credential) in src/config.ts with `S.Redacted(...)`, and type the `<Feature>Config` field that carries it `Redacted.Redacted<...>`.

Never unwrap it into a plain string that is stored in settings, logged, put in an error or attached to a span.

```typescript
// WRONG
S.String.annotate({ description: 'API key of the payment provider' })
// RIGHT
S.Redacted(S.String).annotate({ description: 'API key of the payment provider' })
```
