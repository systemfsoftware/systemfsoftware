---
title: Each environment variable is one described Config exported from the application's src/config.ts, decoded by its domain type's own schema
applies_when:
  - adding an environment variable or a Worker binding the application reads
  - declaring a schema for an environment variable's value
  - giving a setting a default value
  - adding a config.schema.ts, a *-config.schema.ts file or a struct of settings
tags: [config, environment, defaults, description, schema]
---

Every environment variable or Worker binding the application reads is exactly one Config exported from src/config.ts under the variable's name, built as `Config.schema(<schema>, 'NAME')`, with `Config.withDefault` where a default exists. The default is written there and nowhere else.

The schema carries a description annotation saying what the variable sets; Effect 4 has no Config.withDescription. When the value has domain rules, the schema is the domain type's own schema imported from the domain type's module, never a check re-declared in src/config.ts.

No config.schema.ts, *-config.schema.ts or struct schema of settings exists; a *.schema.ts file holds wire and storage shapes only.

Decision test: for each variable the diff reads, is there exactly one export in src/config.ts built with Config.schema, whose schema carries a description and, when the value has rules, is the domain type's own schema? A second read of the same name, a default written in a second place, a missing description, a check re-declared in config, or a settings struct schema fails.

Defect prevented: an operator cannot tell from the code what a variable sets or what it defaults to; two reads of one variable drift to different defaults or checks; a value's rule in config drifts from the rule its domain type enforces.

```typescript
// WRONG
// app-config.schema.ts
export const AppConfig = S.Struct({
  SMTP_HOST: S.String,
  SMTP_PORT: S.NumberFromString,
  MAILER_FROM: S.String.check(S.isPattern(/^[^@\s]+@[^@\s]+$/)),
})
// report.ts, a second read with its own default
const port = yield* Config.Number('SMTP_PORT').pipe(Config.withDefault(25))
```

```typescript
// RIGHT
// src/mail/email-address.ts, the domain type's own module
export const EmailAddress = S.String.check(
  S.isPattern(/^[^@\s]+@[^@\s]+$/, { message: 'an email address has one @ between a local part and a domain' }),
).pipe(S.brand('EmailAddress'))
// src/config.ts
export const SMTP_HOST = Config.schema(S.String.annotate({ description: 'Host name of the SMTP relay' }), 'SMTP_HOST')
export const SMTP_PORT = Config.schema(
  S.Int.check(S.isBetween({ minimum: 1, maximum: 65535 })).annotate({ description: 'Port of the SMTP relay' }),
  'SMTP_PORT',
).pipe(Config.withDefault(587))
export const MAILER_FROM = Config.schema(
  EmailAddress.annotate({ description: 'Sender address of every outgoing mail' }),
  'MAILER_FROM',
)
```

Source: the effect 4 package's Config module (`Config.schema(codec, path)`, `Config.withDefault`; it declares no withDescription); schema-modelling pack, invariants-live-in-the-schema.md (a value's rule is a check on the schema that declares it).

Gate: judge
