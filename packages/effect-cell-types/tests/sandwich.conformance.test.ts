import { Conformance } from '@systemfsoftware/conformance-spec'
import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Metric from 'effect/Metric'

import { admitDecodedCommand } from './__fixtures__/admit-decoded-command.workflow.js'
import {
  recordedClassesOf,
  type RecordedLedger,
  recordedLedger,
  type UnsettledRun,
} from './__fixtures__/sandwich-release.model.js'

const Feature = makeFeature({ it })

const NAME = 'cell.release.admitted'

const refused = (reason: string): Effect.Effect<void, UnsettledRun> => Effect.fail({ reason })

const probeBook = (ledger: RecordedLedger): Effect.Effect<void, UnsettledRun> =>
  Effect.provide(
    Effect.flatMap(
      Effect.map(Metric.snapshot, (snapshots) => recordedClassesOf(snapshots, NAME)),
      (classes) =>
        classes.length > 0 && classes.every((resultClass) => resultClass !== 'missing')
          ? Effect.void
          : refused(`the book holds no settled record: [${classes.join(', ')}]`),
    ),
    ledger.registry,
  )

interface Desk {
  readonly book: RecordedLedger
  readonly run: Effect.Effect<string, never, never>
}

const makeDesk = (): Desk => {
  const book = recordedLedger()
  const answer = Sandwich.named(NAME)((order: { readonly id: string }) => Effect.succeed({ length: order.id.length }))
    .decide(admitDecodedCommand)
    .write({
      Admitted: (decision) => Effect.succeed(`admitted:${decision.length}`),
      Rejected: (decision) => Effect.succeed(`refused:${decision.why}`),
      Malformed: () => Effect.succeed('unreadable'),
      CommandRejected: () => Effect.succeed('turned away'),
    })
  return { book, run: Effect.provide(answer.run({ id: 'abcd' }), book.registry) }
}

const everyRunFiled = (desk: Desk): Effect.Effect<void, Conformance.RuleBroken> =>
  Effect.mapError(probeBook(desk.book), (refusal) => Conformance.RuleBroken.make({ message: refusal.reason }))

Feature('Filing every order run under how it ended, even when the run is stopped')
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'An order run stopped at any step is still filed under how it ended',
      Gherkin.Do.pipe(
        Given('a factory for an order desk that times each run and files it under how the run ended')(
          'make',
          () => Effect.succeed(makeDesk),
        ),
        When('an order for "abcd" is run and stopped at each step of the run, one stop per run')(
          'checked',
          (s) =>
            Conformance.stopped({
              unit: Sandwich.named,
              world: Effect.sync(() => s.make()),
              program: (desk) => desk.run,
              restart: (desk) => desk.run,
              rule: everyRunFiled,
              stopWithin: Duration.zero,
            }),
        ),
        Then('every stopped run is filed under how it ended')((s, expect) =>
          expect({ report: s.checked }, Conformance.render(s.checked)).toMatchObject({ report: { _tag: 'Pass' } })
        ),
      ),
    )
  })
