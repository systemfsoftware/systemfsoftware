---
title: Each environment variable is one described Config in the application's src/config.ts, decoded by its domain type's own schema
applies_when:
  - adding an environment variable or a Worker binding the application reads
  - declaring a schema for an environment variable's value
  - giving a setting a default value
  - reading a password, a token or an API key from the environment
  - adding a config.schema.ts or a *-config.schema.ts file
tags: [config, environment, redacted, defaults, description, schema]
---

Every environment variable the application reads is one Config exported from src/config.ts under the variable's name (SMTP_HOST), with Config.withDefault where a default exists.

Every Config carries a description of what the variable sets. Effect 4 has no Config.withDescription, so the description is a description annotation on the schema the Config decodes with.

A secret is decoded as Redacted, so it never prints in a log, an error or a trace.

A value with domain rules is decoded with Config.schema(DomainType, 'NAME'). DomainType is the value's own schema, declared with the domain type it describes.

No config.schema.ts or *-config.schema.ts file exists, and no struct of settings is a schema. A *.schema.ts file holds wire and storage shapes only.

```typescript
// WRONG
// app-config.schema.ts
export const AppConfig = S.Struct({
  SMTP_HOST: S.String,
  SMTP_PORT: S.NumberFromString,
  SMTP_PASSWORD: S.String,
  MAILER_FROM: S.String.check(S.isPattern(/^[^@\s]+@[^@\s]+$/)),
})
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
export const SMTP_PASSWORD = Config.schema(
  S.Redacted(S.String).annotate({ description: 'Password of the SMTP relay account' }),
  'SMTP_PASSWORD',
)
export const MAILER_FROM = Config.schema(
  EmailAddress.annotate({ description: 'Sender address of every outgoing mail' }),
  'MAILER_FROM',
)
```

Gate: judge
