---
title: A test supplies settings and observes the application, never writes the environment and never mirrors src/config.ts
applies_when:
  - providing settings to a test
  - testing <Feature>Config.layer or a Config declared in src/config.ts
  - writing a behaviour test about a missing, malformed or secret setting
  - a test sets, deletes or stubs an environment variable or a binding
tags: [config, testing, config-provider, behaviour-test, change-detector]
---

A test of code that reads settings provides `<Feature>Config` directly (`Layer.succeed` or `Effect.provideService`) with the values its scenario needs. No test assigns, deletes or stubs process.env or a binding object.

What an operator observes about settings is behaviour of starting the application: it refuses to start when a setting is missing or malformed and says which variable to set, and a secret never appears in what it prints. That is a behaviour test through the entry the operator starts (the program's main effect, its CLI, a Worker's fetch handler), named for what the operator does (testing pack, features-specify-our-systems-observable-behaviour.md and scenarios-drive-the-consumer-entry-and-read-what-it-observes.md). Its Given supplies the environment the way the operator would (the env of a spawned process, the bindings a Worker receives, or a ConfigProvider handed to the main effect). The variable's name is part of what the operator is told and may be asserted; the rest of the message text is not.

A unit test of `<Feature>Config.layer` exists only for logic the layer itself computes (the Enabled | Disabled branch, a value derived from several variables); it sits in src/, inside the module (in-source) or under src/**tests**, never under tests/, builds no Feature, and its expected values follow from that logic. A refusal of a domain value is tested with its domain type (schema-modelling pack).

No test expects a value it did not supply that is copied from src/config.ts: a default, a URL, a host, a port, a duration, a list or a description (expected-values-come-from-the-requirement.md).

Decision test: would every test in the diff still pass if src/config.ts changed a default, a description or how its layer is written, while the application, started with the same environment, behaved the same for its operator; and does none of them write process.env or a binding object? A table of defaults read back from a layer or a process.env assignment fails.

Defect prevented: a settings-decoder test dressed as a Feature, which breaks whenever a default or a URL changes and stays green when the application starts wrongly; settings changes that leak between tests through the shared process environment.

```typescript
// WRONG
// tests/reading-the-mailer-settings.integration.test.ts
process.env.SMTP_HOST = 'localhost'
Feature('Reading the mailer settings')
Scenario('the mailer settings hold their defaults')
When('the settings are read', () => Effect.provide(MailerConfig, MailerConfig.layer))
Then('they hold the defaults', (read) => expect(read).toMatchObject({ smtpPort: 587, from: 'receipts@example.com' }))
```

```typescript
// RIGHT
// tests/starting-the-mailer.integration.test.ts
Feature('Starting the mailer')
Scenario('the mailer refuses to start without its relay host and tells the operator which setting is missing')
Given('an environment with no relay host', () => ({ MAILER_FROM: 'receipts@example.com' }))
When(
  'the operator starts the mailer',
  (env) => Effect.exit(main.pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(env))))),
)
Then('it does not start and names the setting to set', (exit) => expect(failureText(exit)).toContain('SMTP_HOST'))
// tests/emailing-a-receipt.integration.test.ts, code that reads settings gets them directly
sendReceipt(receipt).pipe(Effect.provideService(MailerConfig, { smtpHost: 'localhost', from }))
```

Source: Cucumber, Writing better Gherkin (https://cucumber.io/docs/bdd/better-gherkin/): scenarios describe what, not how, and "Will this wording need to change if the implementation does?"; Google Testing Blog, Test Behavior, Not Implementation (https://testing.googleblog.com/2013/08/testing-on-toilet-test-behavior-not.html): an implementation-only change needs no test change; Kent C. Dodds, Testing Implementation Details (https://kentcdodds.com/blog/testing-implementation-details).

Gate: judge
