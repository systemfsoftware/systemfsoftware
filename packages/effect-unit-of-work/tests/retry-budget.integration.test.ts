import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { type RetryBudget, retryBudget } from '@systemfsoftware/effect-unit-of-work/postgres'
import { Duration, Effect, Layer, Schedule } from 'effect'
import * as Result from 'effect/Result'

const Feature = makeFeature({ it })

const schedule: RetryBudget['schedule'] = Schedule.spaced(Duration.millis(1))

/** The boundary values a budget refuses: zero, negative, fractional, and both infinities. */
const REFUSED_ATTEMPTS: ReadonlyArray<number> = [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]

/** What building a budget from `attempts` answered: the failure's tag, or what the built budget carries. */
interface Built {
  readonly outcome: string
  readonly attempts: number
  readonly scheduleKept: boolean
}

const builtFrom = (attempts: number): Built =>
  Result.match(Effect.runSync(Effect.result(retryBudget(attempts, schedule))), {
    onSuccess: (budget): Built => ({
      outcome: 'taken',
      attempts: budget.attempts,
      scheduleKept: budget.schedule === schedule,
    }),
    onFailure: (failure): Built => ({ outcome: failure._tag, attempts: 0, scheduleKept: false }),
  })

Feature('Building the retry budget a Postgres unit spends')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'Attempts that are not whole positive numbers are refused',
      Gherkin.Do.pipe(
        Given('the attempts a caller could write: zero, negative, fractional, and the two infinities')(
          'attempts',
          () => Effect.succeed(REFUSED_ATTEMPTS),
        ),
        When('each attempt count is decoded into a budget')(
          'built',
          (s) => Effect.succeed(s.attempts.map(builtFrom)),
        ),
        Then('every one is refused with a schema error')((s, expect) =>
          expect(s.built.map((one) => one.outcome)).toEqual(
            Array.from({ length: REFUSED_ATTEMPTS.length }, () => 'SchemaError'),
          )
        ),
      ),
    )

    scenario(
      'A whole positive number of attempts is taken',
      Gherkin.Do.pipe(
        Given('three attempts and the schedule the engine waits between them')(
          'build',
          () => Effect.succeed(builtFrom(3)),
        ),
        When('the budget is decoded')('built', (s) => Effect.succeed(s.build)),
        Then('the budget carries three attempts and keeps the schedule it was given')((s, expect) =>
          expect({ ...s.built, outcome: 'taken' }).toEqual({ outcome: 'taken', attempts: 3, scheduleKept: true })
        ),
      ),
    )
  })
