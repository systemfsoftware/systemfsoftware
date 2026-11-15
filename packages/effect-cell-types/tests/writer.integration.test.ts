import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Metric from 'effect/Metric'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'
import * as Result from 'effect/Result'
import type { AnySpan, Span } from 'effect/Tracer'

import { PrintReport } from './__fixtures__/print-report.schema.js'
import { recordedClassesOf, recordedLedger } from './__fixtures__/sandwich-release.model.js'

const Feature = makeFeature({ it })

const NAME = 'cell.report.printed'

type Fault = 'none' | 'read' | 'write'

const isLocalSpan = (parent: AnySpan): parent is Span => Predicate.hasProperty(parent, 'attributes')

interface Printed {
  readonly handler: string
  readonly lines: number
  readonly rawLines: number
  readonly writeSpan: string
  readonly operation: Option.Option<Span>
}

const printed = (handler: string, lines: number, raw: { readonly lines: number }) =>
  Effect.map(Effect.currentSpan, (span): Printed => ({
    handler,
    lines,
    rawLines: raw.lines,
    writeSpan: span.name,
    operation: Option.filter(span.parent, isLocalSpan),
  }))

const readOrder = (fault: Fault) => (order: { readonly lines: number }) =>
  fault === 'read'
    ? Effect.fail('the store is offline')
    : Effect.succeed({ _tag: 'PrintReport' as const, lines: order.lines })

const printer = (fault: Fault) =>
  Sandwich.writer(NAME)(readOrder(fault)).decode(PrintReport).write({
    Decoded: (command, raw) =>
      fault === 'write' ? Effect.fail('the terminal closed') : printed('Decoded', command.lines, raw),
    CommandRejected: (_rejected, raw) => printed('CommandRejected', -1, raw),
  })

const runOn = (fault: Fault, lines: number) =>
  Effect.gen(function*() {
    const book = recordedLedger()
    const outcome = yield* Effect.result(Effect.provide(printer(fault).run({ lines }), book.registry))
    const classes = yield* Effect.provide(Effect.map(Metric.snapshot, recordedClassesOf(NAME)), book.registry)
    return { outcome, classes }
  })

const attributesOf = (run: Printed) => Option.getOrThrow(run.operation).attributes

Feature('Writing what a cell read when there is nothing to decide')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A command that decodes reaches the write under the cell span, with no decision on it',
      Gherkin.Do.pipe(
        Given('a writer that prints a report of a given length')('lines', () => Effect.succeed(3)),
        When('it runs on a report of that length')('ran', (s) => runOn('none', s.lines)),
        Then(
          'the decoded handler writes it in the write span under the cell span, with the read command beside it, and the run is filed as a success',
        )(
          (s, expect) => {
            const written = Result.getOrThrow(s.ran.outcome)
            const attributes = attributesOf(written)
            return expect({
              handler: written.handler,
              lines: written.lines,
              rawLines: written.rawLines,
              writeSpan: written.writeSpan,
              span: Option.getOrThrow(written.operation).name,
              cellName: attributes.get('cell.name'),
              commandTag: attributes.get('cell.command_tag'),
              declared: attributes.get('tests.report.lines'),
              decision: attributes.has(`app.${NAME}.decision`),
              decideStacktrace: attributes.has('cell.decide_stacktrace'),
              phases: printer('none').phases,
              classes: s.ran.classes,
            }).toStrictEqual({
              handler: 'Decoded',
              lines: 3,
              rawLines: 3,
              writeSpan: `${NAME}.write`,
              span: NAME,
              cellName: NAME,
              commandTag: 'PrintReport',
              declared: 3,
              decision: false,
              decideStacktrace: false,
              phases: ['read', 'decode', 'write'],
              classes: ['success'],
            })
          },
        ),
      ),
    )

    scenario(
      'A command that does not decode is answered by the rejection handler and filed as a failure',
      Gherkin.Do.pipe(
        Given('a writer whose command needs a non-negative length')('lines', () => Effect.succeed(-2)),
        When('it reads a negative length')('ran', (s) => runOn('none', s.lines)),
        Then('the rejection handler answers in the write span with the read command, and the run is a failure')((
          s,
          expect,
        ) => {
          const written = Result.getOrThrow(s.ran.outcome)
          return expect({
            handler: written.handler,
            rawLines: written.rawLines,
            writeSpan: written.writeSpan,
            outcome: attributesOf(written).get('cell.outcome'),
            classes: s.ran.classes,
          }).toStrictEqual({
            handler: 'CommandRejected',
            rawLines: -2,
            writeSpan: `${NAME}.write`,
            outcome: 'CommandRejected',
            classes: ['failure'],
          })
        }),
      ),
    )

    scenario(
      'A read or a write that fails is filed as infrastructure',
      Gherkin.Do.pipe(
        Given('a writer whose store is offline, and one whose terminal closes')('lines', () => Effect.succeed(1)),
        When('each runs')('ran', (s) => Effect.all({ read: runOn('read', s.lines), write: runOn('write', s.lines) })),
        Then('both runs fail with their own error and are filed as infrastructure')((s, expect) =>
          expect({
            read: { failed: Result.isFailure(s.ran.read.outcome), classes: s.ran.read.classes },
            write: { failed: Result.isFailure(s.ran.write.outcome), classes: s.ran.write.classes },
          }).toStrictEqual({
            read: { failed: true, classes: ['infrastructure'] },
            write: { failed: true, classes: ['infrastructure'] },
          })
        ),
      ),
    )
  })
