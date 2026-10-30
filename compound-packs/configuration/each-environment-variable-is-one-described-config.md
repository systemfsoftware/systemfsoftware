---
title: Each environment variable is one described Config exported from the application's src/config.ts, decoded by its domain type's own schema
applies_when:
  - adding an environment variable or a Worker binding the application reads
  - declaring a schema for an environment variable's value
  - giving a setting a default value
  - adding a config.schema.ts, a *-config.schema.ts file or a struct of settings
tags: [config, environment, defaults, description, schema]
---

Declare every environment variable or Worker binding the application reads as exactly one Config exported from src/config.ts under the variable's name, built as `Config.schema(<schema>, 'NAME')`, with `Config.withDefault` where a default exists. Write the default there and nowhere else.

The schema carries a description annotation saying what the variable sets (Effect 4 has no `Config.withDescription`). When the value has domain rules, use the domain type's own schema from its module; never re-declare the check in src/config.ts.

Never create a `config.schema.ts`, `*-config.schema.ts` or struct schema of settings; a `*.schema.ts` file holds wire and storage shapes only.

```typescript
// RIGHT
export const SMTP_PORT = Config.schema(
  S.Int.check(S.isBetween({ minimum: 1, maximum: 65535 })).annotate({ description: 'Port of the SMTP relay' }),
  'SMTP_PORT',
).pipe(Config.withDefault(587))
export const MAILER_FROM = Config.schema(
  EmailAddress.annotate({ description: 'Sender address of every outgoing mail' }),
  'MAILER_FROM',
)
```
