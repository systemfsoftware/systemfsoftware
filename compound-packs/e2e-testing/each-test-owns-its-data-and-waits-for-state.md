---
title: Each e2e scenario starts from a fresh context, creates and removes its own run-unique data, and waits for a state, never a duration
applies_when:
  - an e2e scenario needs data to exist before it acts
  - an e2e step sleeps, polls in a loop, or waits a fixed time
  - writing a Playwright locator or reaching for a CSS selector
  - an e2e test passes only on retry, or configuring retries for CI
tags: [e2e, isolation, test-data, waiting, flakiness, retries, locators]
---

Every scenario starts from a fresh browser context with no page open and opens the entry URL first. It never relies on what an earlier scenario left behind.

A scenario creates the data it needs through the system's own API, under a run-unique name (`Guest ${Date.now()}`), and removes it via scoped resource cleanup (`Effect.acquireRelease`), which also runs after a failure. A run-unique name keeps parallel workers from colliding. Calls to the API live in helpers under `tests/__fixtures__/`.

Take Playwright locators from what a person perceives: role, label, text. When the app has no accessible name for a control, add an `aria-label` or a heading to the app rather than fall back to a CSS class.

Wait for the state, not a duration: no sleep, no fixed delay, no polling loop. Use Playwright's locator assertions (`expect(locator).toHaveText(...)`, `toBeVisible()`) with a `timeout` long enough for the slowest case, and `yield*` every step.

CI runs one retry. A test that passes only on its retry is a flake. Find and fix its cause (shared data, a missing wait, a race in the app); never raise its retries or mark it skipped to make the run green. While debugging, run with retries off.

```typescript
import { expect } from '@playwright/test'
import { Gherkin, Given, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { createBooking, deleteBooking } from './__fixtures__/bookings.js'

// WRONG: shared fixed data, a fixed sleep, and a CSS selector
Given('the existing booking')(() => Effect.void)
When('the guest cancels it')((s) =>
  Effect.promise(async () => {
    await new Promise((resolve) => setTimeout(resolve, 3000))
    await s.page.locator('.cancel-btn').click()
  })
)

// RIGHT: run-unique data cleaned up on release, role locator, and state wait
Given('a booking for a guest')('booking', () =>
  Effect.acquireRelease(
    createBooking({ guest: `Guest ${Date.now()}` }),
    (booking) => deleteBooking(booking.id),
  ))
When('the guest cancels the booking')((s) =>
  Effect.promise(async () => {
    await s.page.goto(`https://example.com/bookings/${s.booking.id}`)
    await s.page.getByRole('button', { name: 'Cancel booking' }).click()
  })
)
Then('the booking shows as cancelled')((s) =>
  Effect.promise(() =>
    expect(s.page.getByRole('status', { name: 'Booking' })).toHaveText('Cancelled', { timeout: 15_000 })
  )
)
```
