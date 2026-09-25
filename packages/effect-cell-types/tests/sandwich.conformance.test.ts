import { Conformance } from '@systemfsoftware/conformance-spec'
import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Metric from 'effect/Metric'
import * as Schema from 'effect/Schema'

import { admitDecodedCommand } from './__fixtures__/admit-decoded-command.workflow.js'
import { recordedClassesOf, recordedLedger, type UnsettledRun } from './__fixtures__/sandwich-release.model.js'

const Feature = makeFeature({ it })

const NAME = 'cell.release.admitted'

const refused = (reason: string): Effect.Effect<void, UnsettledRun> => Effect.fail({ reason })

const probeBook = (ledger: {
  readonly registry: Layer.Layer<never, never, never>
}): Effect.Effect<void, UnsettledRun> =>
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

Feature('Filing every order run under how it ended, even when the run is stopped')
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'An order run stopped at any step is still filed under how it ended',
      Gherkin.Do.pipe(
        Given('an order desk that times each run and files it under how the run ended')(
          'desk',
          () =>
            Effect.succeed({
              book: recordedLedger(),
              answer: Sandwich.named(NAME)((order: { readonly id: string }) =>
                Effect.succeed({ length: order.id.length })
              ).decide(admitDecodedCommand).write({
                Admitted: (decision) => Effect.succeed(`admitted:${decision.length}`),
                Rejected: (decision) => Effect.succeed(`refused:${decision.why}`),
                Malformed: () => Effect.succeed('unreadable'),
                CommandRejected: () => Effect.succeed('turned away'),
              }),
            }),
        ),
        When('an order for "abcd" is run and stopped at each step of the run, one stop per run')(
          'checked',
          (s) =>
            Conformance.released(Effect.provide(s.desk.answer.run({ id: 'abcd' }), s.desk.book.registry), {
              probe: probeBook(s.desk.book),
            }),
        ),
        Then('every stopped run is filed under how it ended, and the search tried at least one stop')((s, expect) =>
          expect(
            {
              report: s.checked,
              explored: Match.value(s.checked).pipe(
                Match.tag('Pass', (pass) => pass.histories),
                Match.orElse(() => 0),
              ),
            },
            Conformance.render(s.checked),
          ).toMatchObject({
            report: { _tag: 'Pass' },
            explored: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
          })
        ),
      ),
    )
  })
