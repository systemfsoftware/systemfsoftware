# @systemfsoftware/effect-gherkin-spec

Write Gherkin-style behaviour tests with [Effect](https://effect.website).

`makeFeature({ it })` gives you a `Feature` builder for organising integration tests as Given/When/Then step pipelines. Every scenario runs under the simulation kernel by default (the zero-preemption schedule, then the profile's seeded schedules); a scenario that must stay on the live clock declares a required reason, which the run report lists.

```ts
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

const Feature = makeFeature({ it })

Feature('Borrowing a library book')
  .withScenarioLayer(BookCheckoutLive)
  .body(({ scenario }) => {
    scenario(
      'A member borrows an available book',
      Gherkin.Do.pipe(
        Given('an available book on the shelf')('book', () => BookCheckoutLive.current()),
        When('the member borrows the book')(() => BookCheckoutLive.borrow('member-42')),
        Then('the book is checked out to the member')(() =>
          Effect.map(BookCheckoutLive.holder(), (holder) => {
            expect(holder).toBe('member-42')
          })
        ),
      ),
    )

    scenario(
      'A notification that leaves the building uses the live clock',
      { live: 'the notification leaves the process for a real socket' },
      Gherkin.Do.pipe(
        Given('a notification on its way out')('notice', () => Effect.succeed('due-reminder')),
        Then('the socket receives the notice')((scope) => {
          expect(scope.notice).toBe('due-reminder')
        }),
      ),
    )
  })
```

A whole feature stays on the live clock with `Feature('Name').live('the reason it waits on real I/O')`, and a scenario outline takes the same reason through `opts.live`. A live declaration without a reason fails type-checking; there is no boolean form.

Scenario outlines parameterise the same behaviour across example rows, each row running through the same kernel exploration:

```ts
Feature('Calculating late fees')
  .withScenarioLayer(LoanLedgerLive)
  .body(({ scenarioOutline }) => {
    scenarioOutline(
      'A late book accrues its daily fee',
      [{ daysLate: 1, fee: 25 }, { daysLate: 3, fee: 75 }],
      ({ daysLate, fee }) =>
        Gherkin.Do.pipe(
          Given('a book returned late')(() => LoanLedgerLive.recordReturn({ daysLate })),
          Then('the ledger shows the accrued fee')(() =>
            Effect.map(LoanLedgerLive.fee(), (charged) => {
              expect(charged).toBe(fee)
            })
          ),
        ),
    )
  })
```

## Install

```bash
pnpm add -D @systemfsoftware/effect-gherkin-spec@workspace:^
```

> [!NOTE]
> This package is `private: true` — it exists to exercise the effect v4 RC inside the workspace and is never published.

> [!NOTE]
> `effect`, `@effect/vitest`, and `vitest` are peer dependencies — you bring your own.
