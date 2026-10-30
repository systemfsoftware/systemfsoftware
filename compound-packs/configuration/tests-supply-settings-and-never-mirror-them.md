---
title: A test supplies settings and observes the application, never writes the environment and never mirrors src/config.ts
applies_when:
  - providing settings to a test
  - testing <Feature>Config.layer or a Config declared in src/config.ts
  - a test sets, deletes or stubs an environment variable or a binding
tags: [config, testing, config-provider, change-detector]
---

A test of code that reads settings provides `<Feature>Config` directly (`Layer.succeed` or `Effect.provideService`) with the values its scenario needs. Never assign, delete or stub `process.env` or a binding object in a test.

Never test configuration itself (testing pack: configuration-gets-no-test-and-no-gate.md). No test expects a value copied from src/config.ts: a default, URL, host, port, duration, list or description. A unit test of `<Feature>Config.layer` exists only for logic the layer computes (the Enabled | Disabled branch, a value derived from several variables); it sits in src/, in-source or under src/**tests**, and builds no Feature. A refusal of a domain value is tested with its domain type (schema-modelling pack).

```typescript
// WRONG
process.env.SMTP_HOST = 'localhost'
expect(read).toMatchObject({ smtpPort: 587 })
// RIGHT: code that reads settings gets them directly
sendReceipt(receipt).pipe(Effect.provideService(MailerConfig, { smtpHost: 'localhost', from }))
```
