import { Cell, Sandwich } from '@systemfsoftware/effect-cell-types'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Cause from 'effect/Cause'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import { expect } from 'vitest'

import {
  admitDecodedCommand,
  Admitted,
  Decoded,
  InfraCrashError,
  type Malformed,
  Rejected,
} from './__fixtures__/admit-decoded-command.workflow.js'

const Feature = makeFeature({ it, layer })

interface AdmissionOrder {
  readonly id: string
  readonly tags?: readonly string[]
}

interface AuditRecord {
  readonly orderId: string
  readonly summary: string
}

class AuditService extends Context.Service<AuditService, {
  readonly entries: Effect.Effect<readonly AuditRecord[]>
  readonly record: (orderId: string, summary: string) => Effect.Effect<void>
}>()('AuditService') {}

const AuditServiceLive = Layer.sync(AuditService, () => {
  const log: AuditRecord[] = []
  return {
    entries: Effect.succeed(log),
    record: (orderId, summary) =>
      Effect.sync(() => {
        log.push({ orderId, summary })
      }),
  }
})

const render = (outcome: Result.Result<Admitted | Rejected, Malformed>): string =>
  Result.match(outcome, {
    onSuccess: (decision) =>
      Match.value(decision).pipe(
        Match.tag('Admitted', (admitted) => `admitted:${admitted.length}`),
        Match.tag('Rejected', (rejected) => `refused:${rejected.why}`),
        Match.exhaustive,
      ),
    onFailure: (malformed) => `malformed:${malformed.length}`,
  })

const failureErrorOf = (
  exit: Exit.Exit<unknown, unknown>,
): unknown => (Exit.isFailure(exit) ? Option.getOrUndefined(Cause.findErrorOption(exit.cause)) : undefined)

const primaryProcessor = Sandwich.named('cell.pipeline.primary')((order: AdmissionOrder) => {
  if (order.id === 'infra-crash') {
    return Effect.fail(new InfraCrashError({ message: 'Gateway unavailable' }))
  }
  return Effect.succeed(new Decoded({ length: order.id.length }))
})
  .decide(admitDecodedCommand)
  .write((outcome: Result.Result<Admitted | Rejected, Malformed>, raw: Decoded) =>
    Effect.flatMap(AuditService, (audit) =>
      Effect.as(
        audit.record(raw.length.toString(), render(outcome)),
        render(outcome),
      ))
  )

const fallbackProcessor = Sandwich.named('cell.pipeline.fallback')((order: AdmissionOrder) =>
  Effect.succeed(new Decoded({ length: order.id.length }))
)
  .decide(admitDecodedCommand)
  .write((outcome: Result.Result<Admitted | Rejected, Malformed>) => Effect.succeed(`fallback:${render(outcome)}`))

Feature('Processing admission orders through resilient cell pipelines')
  .withScenarioLayer(AuditServiceLive)
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'An order failing on primary infrastructure recovers gracefully via a secondary processor',
      Gherkin.Do.pipe(
        Given('an incoming admission order that triggers a primary gateway failure')(
          'order',
          () => Effect.succeed<AdmissionOrder>({ id: 'infra-crash' }),
        ),
        When('the order is processed by a pipeline equipped with a fallback processor')(
          'outcome',
          ({ order }) => {
            const resilientPipeline = Cell.orElse(primaryProcessor, fallbackProcessor)
            return Effect.exit(resilientPipeline.run(order))
          },
        ),
        Then('the fallback processor handles the order and produces a secondary response')(({ outcome }) => {
          expect(outcome).toStrictEqual(Exit.succeed('fallback:admitted:11'))
        }),
      ),
    )
    scenario(
      'An order succeeding on primary infrastructure bypasses the fallback processor',
      Gherkin.Do.pipe(
        Given('an incoming admission order that succeeds at the primary gateway')(
          'order',
          () => Effect.succeed<AdmissionOrder>({ id: 'valid-order' }),
        ),
        When('the order is processed by a pipeline equipped with a fallback processor')(
          'outcome',
          ({ order }) => {
            const resilientPipeline = Cell.orElse(primaryProcessor, fallbackProcessor)
            return Effect.exit(resilientPipeline.run(order))
          },
        ),
        Then('the primary processor response is preserved without invoking fallback')(({ outcome }) => {
          expect(outcome).toStrictEqual(Exit.succeed('admitted:11'))
        }),
      ),
    )

    scenario(
      'An order with infrastructural failure can be remapped to an application status error',
      Gherkin.Do.pipe(
        Given('an incoming order with an unavailable service')(
          'order',
          () => Effect.succeed<AdmissionOrder>({ id: 'infra-crash' }),
        ),
        When('the pipeline remaps errors to a custom message')(
          'outcome',
          ({ order }) => {
            const mappedPipeline = Cell.mapError(primaryProcessor, (err) => `Service outage: ${err.message}`)
            return Effect.exit(mappedPipeline.run(order))
          },
        ),
        Then('the caller receives the formatted error message')(({ outcome }) => {
          expect(failureErrorOf(outcome)).toStrictEqual('Service outage: Gateway unavailable')
        }),
      ),
    )

    scenario(
      'Observing completed order processing records metrics without altering the final response',
      Gherkin.Do.pipe(
        Given('a valid admission order with adequate length')(
          'order',
          () => Effect.succeed<AdmissionOrder>({ id: 'valid-order' }),
        ),
        When('the pipeline observes successful processing to audit the result')(
          'outcome',
          ({ order }) => {
            let observedValue: string | null = null
            const tappedPipeline = Cell.tap(primaryProcessor, (resp) =>
              Effect.sync(() => {
                observedValue = resp
              }))
            return Effect.map(
              tappedPipeline.run(order),
              (resp) => ({ resp, observedValue }),
            )
          },
        ),
        Then('the original response is returned and the observer noted the exact payload')(({ outcome }) => {
          expect(outcome.resp).toBe('admitted:11')
          expect(outcome.observedValue).toBe('admitted:11')
        }),
      ),
    )

    scenario(
      'Combining parallel validation stages merges outcomes into a combined summary',
      Gherkin.Do.pipe(
        Given('an order requiring dual validation passes')(
          'order',
          () => Effect.succeed<AdmissionOrder>({ id: 'dual-pass' }),
        ),
        When('two validation pipelines are zipped with a custom pairing function')(
          'outcome',
          ({ order }) => {
            const dualPipeline = Cell.zipWith(
              primaryProcessor,
              primaryProcessor,
              (res1, res2) => `${res1} & ${res2}`,
            )
            return Effect.exit(dualPipeline.run(order))
          },
        ),
        Then('both stages complete and deliver the combined paired summary')(({ outcome }) => {
          expect(outcome).toStrictEqual(Exit.succeed('admitted:9 & admitted:9'))
        }),
      ),
    )

    scenario(
      'Sequencing dependent order stages where the second stage relies on the first output',
      Gherkin.Do.pipe(
        Given('an initial order that determines the secondary verification policy')(
          'order',
          () => Effect.succeed<AdmissionOrder>({ id: 'root-order' }),
        ),
        When('the first stage dynamically routes to a follow-up cell based on its response')(
          'outcome',
          ({ order }) => {
            const chainedPipeline = Cell.flatMap(
              primaryProcessor,
              (firstResult) =>
                Sandwich.named('cell.pipeline.chained.route')((ord: AdmissionOrder) =>
                  Effect.succeed(new Decoded({ length: ord.id.length }))
                )
                  .decide(admitDecodedCommand)
                  .write(() => Effect.succeed(`chained:${firstResult}`)),
            )
            return Effect.exit(chainedPipeline.run(order))
          },
        ),
        Then('the composite pipeline delivers the response incorporating both evaluations')(({ outcome }) => {
          expect(outcome).toStrictEqual(Exit.succeed('chained:admitted:10'))
        }),
      ),
    )
    scenario(
      'Failing the first stage short-circuits the pipeline before the second stage runs',
      Gherkin.Do.pipe(
        Given('an incoming order destined to fail at the primary gateway')(
          'order',
          () => Effect.succeed<AdmissionOrder>({ id: 'infra-crash' }),
        ),
        When('the order is dispatched through a chained dependent pipeline')(
          'outcome',
          ({ order }) => {
            let followUpExecuted = false
            const chainedPipeline = Cell.flatMap(
              primaryProcessor,
              (firstResult) => {
                followUpExecuted = true
                return Sandwich.named('cell.pipeline.chained.short.circuit')((ord: AdmissionOrder) =>
                  Effect.succeed(new Decoded({ length: ord.id.length }))
                )
                  .decide(admitDecodedCommand)
                  .write(() => Effect.succeed(`chained:${firstResult}`))
              },
            )
            return Effect.all({
              exit: Effect.exit(chainedPipeline.run(order)),
              wasExecuted: Effect.sync(() => followUpExecuted),
            })
          },
        ),
        Then('the pipeline reports the initial failure without invoking the dependent stage')(({ outcome }) => {
          expect(Exit.isFailure(outcome.exit)).toBe(true)
          expect(outcome.wasExecuted).toBe(false)
        }),
      ),
    )

    scenarioOutline(
      'Collapsing pipeline outcomes into an unexceptional status report',
      [
        {
          orderId: 'valid-order',
          expectedResult: 'handled-success:admitted:11',
        },
        {
          orderId: 'infra-crash',
          expectedResult: 'handled-error:Gateway unavailable',
        },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given('an incoming admission order')(
            'order',
            () => Effect.succeed<AdmissionOrder>({ id: row.orderId }),
          ),
          When('evaluated under a unified outcome matcher')(
            'result',
            ({ order }) => {
              const matchedPipeline = Cell.match(primaryProcessor, {
                onFailure: (err) => `handled-error:${err.message}`,
                onSuccess: (res) => `handled-success:${res}`,
              })
              return matchedPipeline.run(order)
            },
          ),
          Then('it resolves to the formatted status string')(({ result }) => {
            expect(result).toBe(row.expectedResult)
          }),
        ),
    )
    scenario(
      'Sequencing with a dynamic resolver cell decides subsequent routing at runtime',
      Gherkin.Do.pipe(
        Given('an incoming admission order')(
          'order',
          () => Effect.succeed<AdmissionOrder>({ id: 'dynamic-order' }),
        ),
        When('the pipeline sequences into a dynamically resolved cell function')(
          'outcome',
          ({ order }) => {
            const dynamicPipeline = Cell.andThen(
              primaryProcessor,
              (admittedStatus: string) =>
                Sandwich.named('cell.pipeline.dynamic.resolved')((status: string) =>
                  Effect.succeed(new Decoded({ length: status.length }))
                )
                  .decide(admitDecodedCommand)
                  .write(() => Effect.succeed(`resolved-from:${admittedStatus}`)),
            )
            return Effect.exit(dynamicPipeline.run(order))
          },
        ),
        Then('the dynamically chosen cell processes the prior response')(({ outcome }) => {
          expect(outcome).toStrictEqual(Exit.succeed('resolved-from:admitted:13'))
        }),
      ),
    )

    scenario(
      'Composing multi-step processing workflows using contextual do-notation',
      Gherkin.Do.pipe(
        Given('an admission order requiring cumulative enrichment')(
          'order',
          () => Effect.succeed<AdmissionOrder>({ id: 'enrich-order' }),
        ),
        When('the processing steps accumulate named attributes in sequence')(
          'outcome',
          ({ order }) => {
            const pipeline = Cell.Do.pipe(
              Cell.bind('stageOne', () => primaryProcessor),
              Cell.let('summaryLength', ({ stageOne }) => stageOne.length),
              Cell.bind(
                'stageTwo',
                ({ stageOne }) =>
                  Sandwich.named('cell.pipeline.do.stage.two')((ord: AdmissionOrder) =>
                    Effect.succeed(new Decoded({ length: ord.id.length }))
                  )
                    .decide(admitDecodedCommand)
                    .write(() => Effect.succeed(`next-after-${stageOne}`)),
              ),
            )
            return Effect.exit(pipeline.run(order))
          },
        ),
        Then('all accumulated fields are returned in a consolidated context')(({ outcome }) => {
          expect(outcome).toStrictEqual(
            Exit.succeed({
              stageOne: 'admitted:12',
              summaryLength: 11,
              stageTwo: 'next-after-admitted:12',
            }),
          )
        }),
      ),
    )

    scenario(
      'Binding a starting cell directly into a named property context',
      Gherkin.Do.pipe(
        Given('a base processor cell')(
          'order',
          () => Effect.succeed<AdmissionOrder>({ id: 'bindto-order' }),
        ),
        When('the cell response is bound directly into a labeled object')(
          'outcome',
          ({ order }) => {
            const labeledPipeline = Cell.bindTo(primaryProcessor, 'initialResult')
            return Effect.exit(labeledPipeline.run(order))
          },
        ),
        Then('the output matches an object with that single named field')(({ outcome }) => {
          expect(outcome).toStrictEqual(
            Exit.succeed({
              initialResult: 'admitted:12',
            }),
          )
        }),
      ),
    )

    scenario(
      'Creating constant and suspended cells for workflow defaults and lazy initialization',
      Gherkin.Do.pipe(
        Given('a set of static and deferred cell definitions')(
          'defs',
          () => {
            let evalCount = 0
            const staticCell = Cell.succeed('fixed-value')
            const failingCell = Cell.fail('expected-rejection')
            const liftedCell = Cell.fromEffect(Effect.succeed('lifted-value'))
            const lazyCell = Cell.suspend(() => {
              evalCount++
              return Cell.succeed(`evaluated:${evalCount}`)
            })
            const explodingLazyCell = Cell.suspend<AdmissionOrder, never, never, never>(() => {
              throw new Error('construction exploded')
            })
            const identityCell = Cell.id<AdmissionOrder>()
            return Effect.succeed({
              staticCell,
              failingCell,
              liftedCell,
              lazyCell,
              explodingLazyCell,
              identityCell,
              getCount: () => evalCount,
            })
          },
        ),
        When('evaluating these cells under sample orders')(
          'evals',
          ({ defs }) => {
            const order: AdmissionOrder = { id: 'dummy' }
            return Effect.all({
              staticRes: defs.staticCell.run(order),
              failRes: Effect.exit(defs.failingCell.run(order)),
              liftedRes: defs.liftedCell.run(order),
              lazyOne: defs.lazyCell.run(order),
              lazyTwo: defs.lazyCell.run(order),
              explodingRes: Effect.exit(defs.explodingLazyCell.run(order)),
              identityRes: defs.identityCell.run(order),
              finalCount: Effect.sync(defs.getCount),
            })
          },
        ),
        Then('all cells behave consistently with their respective constructors')(({ evals }) => {
          expect(evals.staticRes).toBe('fixed-value')
          expect(evals.failRes).toStrictEqual(Exit.fail('expected-rejection'))
          expect(evals.liftedRes).toBe('lifted-value')
          expect(evals.lazyOne).toBe('evaluated:1')
          expect(evals.lazyTwo).toBe('evaluated:2')
          expect(Exit.hasDies(evals.explodingRes)).toBe(true)
          expect(evals.identityRes).toStrictEqual({ id: 'dummy' })
          expect(evals.finalCount).toBe(2)
        }),
      ),
    )
  })
