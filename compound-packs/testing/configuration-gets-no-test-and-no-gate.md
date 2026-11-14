---
title: Configuration gets no test and no gate
applies_when:
  - adding a test asserting a config value, default, port, URL, timeout or version pin
  - adding a CI job, lint rule, check or deploy preflight asserting workflow shape, rulesets, required checks or allowlists
  - adding a check for environment variable or Doppler secret presence, or mirroring src/config.ts
tags: [testing, configuration, gates, ci, preflight, doppler, secrets, workflows]
---

Never add a test, lint rule, script, CI job, or deploy preflight that asserts configuration: config values or defaults, environment or Doppler secret presence, workflow or ruleset shape, version pins, required-check lists, or allowlists. A missing or invalid setting fails at deploy on its own.

Behaviour tests may supply settings as inputs and assert observable consumer behaviour, but must never mirror or restate configuration files.

```typescript
// WRONG: testing config defaults or env presence
expect(process.env.DATABASE_URL).toBeDefined()
// RIGHT: supplying settings to test observable consumer behaviour
const layer = CheckoutConfig.layer({ maxRetries: 1 })
```
