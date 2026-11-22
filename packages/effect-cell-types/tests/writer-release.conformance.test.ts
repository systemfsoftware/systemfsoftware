import { Conformance } from '@systemfsoftware/conformance-spec'
import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Metric from 'effect/Metric'
import * as Schema from 'effect/Schema'

import { PrintReport } from './__fixtures__/print-report.schema.js'
import { recordedClassesOf, recordedLedger, type UnsettledRun } from './__fixtures__/sandwich-release.model.js'

const Feature = makeFeature({ it })

const NAME = 'cell.report.released'

const printer = Sandwich.writer(NAME)((order: { readonly lines: number }) =>
  Effect.succeed({ _tag: 'PrintReport' as const, lines: order.lines })
).decode(PrintReport).write({
  Decoded: (command) => Effect.succeed(command.lines),
  CommandRejected: () => Effect.succeed(-1),
})

const refused = (reason: string): Effect.Effect<void, UnsettledRun> => Effect.fail({ reason })

const probeBook = (registry: Layer.Layer<never, never, never>): Effect.Effect<void, UnsettledRun> =>
  Effect.provide(
    Effect.flatMap(
      Effect.map(Metric.snapshot, (snapshots) => recordedClassesOf(snapshots, NAME)),
      (classes) =>
        classes.length > 0 && classes.every((resultClass) => resultClass !== 'missing')
          ? Effect.void
          : refused(`the book holds no settled record: [${classes.join(', ')}]`),
    ),
    registry,
  )

Feature('Filing every writer run under how it ended, even when the run is stopped')
  .withLayer(Layer.empty)
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'A writer run stopped at any step is still filed under how it ended',
      Gherkin.Do.pipe(
        Given('a writer that times each run and files it under how the run ended')(
          'book',
          () => Effect.succeed(recordedLedger()),
        ),
        When('a report of 4 lines is printed and stopped at each step of the run, one stop per run')(
          'checked',
          (s) =>
            Conformance.released(Effect.provide(printer.run({ lines: 4 }), s.book.registry), {
              probe: probeBook(s.book.registry),
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
