import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Result from 'effect/Result'

import { publishDecisions } from './__fixtures__/publish-decisions.workflow.js'

const Feature = makeFeature({ it })

interface Journal {
  readonly entries: Effect.Effect<ReadonlyArray<string>>
  readonly record: (line: string) => Effect.Effect<void>
}

class JournalService extends Context.Service<JournalService, Journal>()('JournalService') {}

const JournalMemory = Layer.sync(JournalService, () => {
  const entries: string[] = []
  return {
    entries: Effect.sync(() => [...entries]),
    record: (line: string) =>
      Effect.sync(() => {
        entries.push(line)
      }),
  }
})

const publishCell = (refuseSecondEvent: boolean) =>
  Sandwich.named('cell.publishing')((order: { readonly count: number }) =>
    Effect.succeed({ _tag: 'PublishDecisions' as const, count: order.count })
  ).decide(publishDecisions).write({
    DecisionOne: (event) =>
      Effect.flatMap(JournalService, (journal) => Effect.as(journal.record(`first:${event.value}`), 'recorded')),
    DecisionTwo: (event) =>
      Effect.flatMap(JournalService, (journal) =>
        Effect.andThen(
          journal.record(`second:${event.reason}`),
          refuseSecondEvent && event.reason === 'event-1'
            ? Effect.fail({ reason: event.reason })
            : Effect.as(Effect.void, 'recorded'),
        )),
    CommandRejected: (rejected) => Effect.fail({ rejected: rejected.issue }),
  })

Feature('Publishing a list of events in order')
  .withScenarioLayer(JournalMemory)
  .body(({ scenario }) => {
    scenario(
      'Every event of a batch is journalled in the order it was produced',
      Gherkin.Do.pipe(
        When('a batch of three events is published')(
          'outcome',
          () => Effect.exit(publishCell(false).run({ count: 3 })),
        ),
        Then('the batch is published in full and the journal holds the events in production order')((s, expect) =>
          Effect.flatMap(
            JournalService,
            (journal) =>
              Effect.map(journal.entries, (entries) =>
                expect({ outcome: s.outcome, entries }).toEqual({
                  outcome: Exit.succeed(['recorded', 'recorded', 'recorded'] as const),
                  entries: ['first:0', 'second:event-1', 'first:2'],
                })),
          )
        ),
      ),
    )

    scenario(
      'A journal that refuses an entry stops the batch right there',
      Gherkin.Do.pipe(
        When('a batch of four events is published and the second kind of event is refused by the journal')(
          'outcome',
          () => Effect.exit(publishCell(true).run({ count: 4 })),
        ),
        Then('the batch stops with the journal\u2019s refusal and no later event reaches it')((s, expect) =>
          Effect.flatMap(
            JournalService,
            (journal) =>
              Effect.map(journal.entries, (entries) =>
                expect({ error: Exit.findError(s.outcome), entries }).toEqual({
                  error: Result.succeed({ reason: 'event-1' }),
                  entries: ['first:0', 'second:event-1'],
                })),
          )
        ),
      ),
    )

    scenario(
      'A batch with no events at all publishes nothing',
      Gherkin.Do.pipe(
        When('an empty batch is published')(
          'outcome',
          () => Effect.exit(publishCell(false).run({ count: 0 })),
        ),
        Then('nothing is published and the journal stays empty')((s, expect) =>
          Effect.flatMap(
            JournalService,
            (journal) =>
              Effect.map(journal.entries, (entries) =>
                expect({ outcome: s.outcome, entries }).toEqual({ outcome: Exit.succeed([] as const), entries: [] })),
          )
        ),
      ),
    )
  })
