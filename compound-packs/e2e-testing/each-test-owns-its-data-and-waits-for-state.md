---
title: Each e2e test starts from a fresh context, creates and removes its own run-unique data, and waits for a state, never a duration
applies_when:
  - an e2e test needs data to exist before it acts
  - an e2e test sleeps, polls in a loop, or waits a fixed time
  - an e2e test passes only on retry, or depends on another test having run first
  - configuring retries, workers or the replay cache for CI
tags: [e2e, isolation, test-data, waiting, flakiness, retries, replay-cache]
---

Every test starts from a fresh browser context with no page open and calls `app.open()` first. It never relies on what an earlier test left behind. A flow whose order is the point goes in one `describe` marked serial, and nowhere else.

A test creates the data it needs through the system's own API or a fixture, under a run-unique name (``unique(`Guest ${Date.now()}`)``), and removes it in `afterEach`, which also runs after a failure. A run-unique name keeps replays and parallel workers from colliding and keeps the replay cache valid. Calls to the API live in the same suite, in a fixture that reads the browser's session cookies when the API needs them.

Wait for the state, not a duration: no sleep, no fixed delay, no polling loop. Use a locator matcher with a longer `timeout` when a locator names the state exactly, or `agent.waitFor` with a timeout long enough for the slowest case. `await` every step.

CI runs one retry, one worker and a read-only replay cache. A test that passes only on its retry is a flake. Find and fix its cause (shared data, a missing wait, a race in the app); never raise its retries or mark it skipped to make the run green. While debugging, run with retries off.

The bar is the [`e2e`](https://www.npmjs.com/package/e2e) runner's own skill (`skills/e2e/SKILL.md`, `references/writing-tests.md`), which effect-e2e meets (e2e-is-its-own-package-on-real-processes.md).

```typescript
import { unique } from '@systemfsoftware/effect-e2e'
import { expect, test } from '@systemfsoftware/effect-e2e/runner'

// WRONG: shared fixed data, a fixed sleep, and a test that needs the one before it
test('cancels the booking made above', async ({ app, screen }) => {
  await app.open('/bookings/grace-smith')
  await new Promise((resolve) => setTimeout(resolve, 3000))
  await screen.getByRole('button', 'Cancel booking').tap()
})
// RIGHT: the test makes its own booking, waits for the state, and cleans up
const bookingTest = test.extend<{ booking: Booking }>({
  booking: async ({ browser }, use) => {
    const booking = await createBooking(browser, { guest: unique(`Guest ${Date.now()}`) })
    await use(booking)
    await deleteBooking(browser, booking.id)
  },
})
bookingTest('a guest cancels a booking', async ({ app, screen, booking }) => {
  await app.open(`/bookings/${booking.id}`)
  await screen.getByRole('button', 'Cancel booking').tap()
  await expect(screen.getByRole('status', 'Booking')).toHaveText('Cancelled', { timeout: 15_000 })
})
```
