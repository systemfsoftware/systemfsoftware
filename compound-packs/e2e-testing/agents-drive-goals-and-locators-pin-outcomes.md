---
title: An agent step drives one goal and a deterministic locator check pins its outcome right after it; a model judgment is never a test's only check
applies_when:
  - writing or reviewing an e2e test that calls agent.act, agent.assert, agent.waitFor or agent.extract
  - choosing between an agent step and an exact screen interaction
  - writing a locator, or reaching for a CSS selector
tags: [e2e, agent, locator, replay-cache, assertion, accessibility]
---

The agent does the flow and `expect` pins what must be true. Each `agent.act` names one goal: one outcome that one check confirms. When an instruction leaves two states worth checking, it is two goals, each with its own `act` and check. Describe the outcome, not the mechanics the runner already handles (waiting, scrolling, retrying).

Pin every `act` outcome with a locator `expect` right after it. That check is what lets the replay cache record the goal: an unchecked `act` never replays and calls the model on every run. It also keeps the test portable across models.

Use `screen` for exact interactions and values, where the precise input is the point of the test (an empty submission, a boundary value, a key press).

`agent.assert`, `agent.waitFor` and `agent.extract` call the model every run and are never cached. Use them only for a state a locator cannot name (a chart's shape, a generated summary), and never as a test's only check. Check a secret's value with a locator, because the judge sees a secret by name only. Assert a fact a model produced with `toContain`, not its exact sentence.

Take locators from what a person perceives: role, label, text. When the app has no accessible name for a control, add an `aria-label` or a heading to the app rather than fall back to a CSS class.

The bar is the [`e2e`](https://www.npmjs.com/package/e2e) runner's own skill (`skills/e2e/references/writing-tests.md`, `agent.md`), which effect-e2e meets (e2e-is-its-own-package-on-real-processes.md).

```typescript
import { expect, test } from '@systemfsoftware/effect-e2e/runner'

// WRONG: three goals in one instruction, one recording, and a model judgment as the only check
await agent.act('pick the sea-view double, add breakfast, and pay')
await agent.assert('the booking looks confirmed')
// RIGHT: one goal per act, each pinned by a locator; the exact value goes through screen
await agent.act('choose the sea-view double room')
await expect(screen.getByRole('heading', 'Sea-view double')).toBeVisible()
await screen.getByLabel('Nights').fill('3')
await agent.act('pay for the booking')
await expect(screen.getByRole('status', 'Booking')).toHaveText('Confirmed')
```
