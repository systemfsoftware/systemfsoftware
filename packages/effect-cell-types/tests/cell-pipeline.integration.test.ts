import { expect } from '@effect/vitest'
import { Cell, Sandwich } from '@systemfsoftware/effect-cell-types'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Result from 'effect/Result'

import { admitDecodedCommand } from './__fixtures__/admit-decoded-command.workflow.js'

const Feature = makeFeature({ it })

interface Order {
  readonly id: string
}

interface GatewayOutage {
  readonly message: string
}

const primaryCell = Sandwich.named('cell.pipeline.primary')((order: Order) =>
  order.id === 'infra-crash'
    ? Effect.fail({ message: 'Gateway unavailable' })
    : Effect.succeed({ length: order.id.length })
).decide(admitDecodedCommand).write({
  Admitted: (decision) => Effect.succeed(`admitted:${decision.length}`),
  Rejected: (decision) => Effect.succeed(`refused:${decision.why}`),
  Malformed: () => Effect.succeed('unreadable'),
  CommandRejected: () => Effect.succeed('turned away'),
})

const fallbackCell = Sandwich.named('cell.pipeline.fallback')((order: Order) =>
  Effect.succeed({ length: order.id.length })
).decide(admitDecodedCommand).write({
  Admitted: (decision) => Effect.succeed(`fallback:admitted:${decision.length}`),
  Rejected: (decision) => Effect.succeed(`fallback:refused:${decision.why}`),
  Malformed: () => Effect.succeed('unreadable'),
  CommandRejected: () => Effect.succeed('turned away'),
})

Feature('Answering orders when the primary gateway wavers')
  .withScenarioLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'An order the primary gateway cannot reach is answered by the fallback gateway',
      Gherkin.Do.pipe(
        When('an order that breaks the primary gateway is submitted')(
          'outcome',
          () => Effect.exit(Cell.orElse(primaryCell, fallbackCell).run({ id: 'infra-crash' })),
        ),
        Then('the fallback gateway answers instead')((s) => {
          expect(s.outcome).toStrictEqual(Exit.succeed('fallback:admitted:11'))
        }),
      ),
    )

    scenario(
      'An order the primary gateway handles never reaches the fallback gateway',
      Gherkin.Do.pipe(
        When('a healthy order is submitted')(
          'outcome',
          () => Effect.exit(Cell.orElse(primaryCell, fallbackCell).run({ id: 'valid-order' })),
        ),
        Then('the primary gateway answers on its own')((s) => {
          expect(s.outcome).toStrictEqual(Exit.succeed('admitted:11'))
        }),
      ),
    )

    scenario(
      'A gateway outage is reported in words the caller understands',
      Gherkin.Do.pipe(
        When('an order that breaks the primary gateway is submitted')(
          'outcome',
          () =>
            Effect.exit(
              Cell.mapError(primaryCell, (outage: GatewayOutage) => `Service outage: ${outage.message}`).run({
                id: 'infra-crash',
              }),
            ),
        ),
        Then('the caller reads the outage report')((s) => {
          expect(s.outcome).toStrictEqual(Exit.fail('Service outage: Gateway unavailable'))
        }),
      ),
    )

    scenario(
      'A completed answer is noted in passing without changing what the caller receives',
      Gherkin.Do.pipe(
        When('a healthy order is submitted with an onlooker present')(
          'outcome',
          () => {
            let noted: string | null = null
            const observed = Cell.tap(primaryCell, (answer: string) =>
              Effect.sync(() => {
                noted = answer
              }))
            return Effect.map(observed.run({ id: 'valid-order' }), (answer) => ({ answer, noted }))
          },
        ),
        Then('the caller receives the answer and the onlooker noted the same one')((s) => {
          expect(s.outcome.answer).toBe('admitted:11')
          expect(s.outcome.noted).toBe('admitted:11')
        }),
      ),
    )

    scenario(
      'Two gateways answering the same order hand back one combined verdict',
      Gherkin.Do.pipe(
        When('two primary gateways answer the same order')(
          'outcome',
          () => {
            const paired = Cell.zipWith(
              primaryCell,
              primaryCell,
              (first: string, second: string) => `${first} & ${second}`,
            )
            return Effect.exit(paired.run({ id: 'dual-pass' }))
          },
        ),
        Then('the verdict carries both answers')((s) => {
          expect(s.outcome).toStrictEqual(Exit.succeed('admitted:9 & admitted:9'))
        }),
      ),
    )

    scenario(
      'A routed order carries the first stage\u2019s answer into the second stage',
      Gherkin.Do.pipe(
        When('an order\u2019s answer decides what the next stage does')(
          'outcome',
          () => {
            const routed = Cell.flatMap(
              primaryCell,
              (firstAnswer: string) =>
                Sandwich.named('cell.pipeline.routed')((order: Order) => Effect.succeed({ length: order.id.length }))
                  .decide(admitDecodedCommand).write({
                    Admitted: () => Effect.succeed(`chained:${firstAnswer}`),
                    Rejected: () => Effect.succeed(`chained:${firstAnswer}`),
                    Malformed: () => Effect.succeed('unreadable'),
                    CommandRejected: (rejected) => Effect.succeed(`turned away:${rejected.issue}`),
                  }),
            )
            return Effect.exit(routed.run({ id: 'root-order' }))
          },
        ),
        Then('the final answer carries the first stage\u2019s answer')((s) => {
          expect(s.outcome).toStrictEqual(Exit.succeed('chained:admitted:10'))
        }),
      ),
    )

    scenario(
      'A broken order and a good order collapse into one plain status report each',
      Gherkin.Do.pipe(
        When('orders are answered under one status report')(
          'outcome',
          () => {
            const reported = Cell.match(primaryCell, {
              onFailure: (outage: GatewayOutage) => `handled-error:${outage.message}`,
              onSuccess: (answer: string) => `handled-success:${answer}`,
            })
            return Effect.all({
              broken: reported.run({ id: 'infra-crash' }),
              healthy: reported.run({ id: 'valid-order' }),
            })
          },
        ),
        Then('every order gets its plain status')((s) => {
          expect(s.outcome.broken).toBe('handled-error:Gateway unavailable')
          expect(s.outcome.healthy).toBe('handled-success:admitted:11')
        }),
      ),
    )

    scenario(
      'The next stage is chosen from what the first stage answered',
      Gherkin.Do.pipe(
        When('an order is answered and the answer picks the stage that follows')(
          'outcome',
          () => {
            const chosen = Cell.andThen(
              primaryCell,
              (firstAnswer: string) =>
                Sandwich.named('cell.pipeline.chosen')((answer: string) => Effect.succeed({ length: answer.length }))
                  .decide(admitDecodedCommand)
                  .write({
                    Admitted: () => Effect.succeed(`chosen-after:${firstAnswer}`),
                    Rejected: () => Effect.succeed(`chosen-after:${firstAnswer}`),
                    Malformed: () => Effect.succeed('unreadable'),
                    CommandRejected: () => Effect.succeed('turned away'),
                  }),
            )
            return Effect.exit(chosen.run({ id: 'dynamic-order' }))
          },
        ),
        Then('the chosen stage answers with what came before it')((s) => {
          expect(s.outcome).toStrictEqual(Exit.succeed('chosen-after:admitted:13'))
        }),
      ),
    )

    scenario(
      'An order gathers the answers of several stages into one summary',
      Gherkin.Do.pipe(
        When('an order passes the gateway, has its answer measured, and is checked again')(
          'outcome',
          () => {
            const summary = Cell.Do.pipe(
              Cell.bind('first', () => primaryCell),
              Cell.let('firstLength', ({ first }) => first.length),
              Cell.bind('second', ({ first }) => Cell.map(fallbackCell, (answer: string) => `${answer}<-${first}`)),
            )
            return Effect.exit(summary.run({ id: 'enrich-order' }))
          },
        ),
        Then('the summary holds every answer under its own name')((s) => {
          expect(s.outcome).toStrictEqual(
            Exit.succeed({
              first: 'admitted:12',
              firstLength: 11,
              second: 'fallback:admitted:12<-admitted:12',
            }),
          )
        }),
      ),
    )

    scenario(
      'A single stage answer is filed under a name',
      Gherkin.Do.pipe(
        When('an order is answered and the answer is filed under "initial"')(
          'outcome',
          () => Effect.exit(Cell.bindTo(primaryCell, 'initial').run({ id: 'bindto-order' })),
        ),
        Then('the filed answer sits under that name')((s) => {
          expect(s.outcome).toStrictEqual(Exit.succeed({ initial: 'admitted:12' }))
        }),
      ),
    )

    scenario(
      'Fixed, borrowed and lazily built stages answer the way they were built',
      Gherkin.Do.pipe(
        Given(
          'a fixed stage, a refusing stage, a borrowed answer, a lazy stage, a broken lazy stage and a pass-through',
        )(
          'stages',
          () => {
            let built = 0
            return Effect.succeed({
              fixed: Cell.succeed('fixed-value'),
              refusing: Cell.fail('expected-rejection'),
              borrowed: Cell.fromEffect(Effect.succeed('borrowed-value')),
              lazy: Cell.suspend(() => {
                built++
                return Cell.succeed(`built:${built}`)
              }),
              broken: Cell.suspend<Order, never, never, never>(() => {
                throw new Error('construction exploded')
              }),
              passThrough: Cell.id<Order>(),
            })
          },
        ),
        When('each stage answers the same order')(
          'answers',
          ({ stages }) => {
            const order = { id: 'dummy' }
            return Effect.all({
              fixed: stages.fixed.run(order),
              refusing: Effect.exit(stages.refusing.run(order)),
              borrowed: stages.borrowed.run(order),
              lazyFirst: stages.lazy.run(order),
              lazySecond: stages.lazy.run(order),
              broken: Effect.exit(stages.broken.run(order)),
              passThrough: stages.passThrough.run(order),
            })
          },
        ),
        Then('each answers as it was built, and the lazy stage is rebuilt on every order')((s) => {
          expect(s.answers.fixed).toBe('fixed-value')
          expect(s.answers.refusing).toStrictEqual(Exit.fail('expected-rejection'))
          expect(s.answers.borrowed).toBe('borrowed-value')
          expect([s.answers.lazyFirst, s.answers.lazySecond]).toStrictEqual(['built:1', 'built:2'])
          expect(s.answers.broken).toSatisfy(Exit.hasDies)
          expect(s.answers.passThrough).toStrictEqual({ id: 'dummy' })
        }),
      ),
    )

    scenario(
      'A batch answers every order even when some break the gateway',
      Gherkin.Do.pipe(
        When('a batch holding one gateway-breaking order is answered without stopping')(
          'outcome',
          () => {
            const gathered = Cell.collectAll(
              primaryCell,
              (results: ReadonlyArray<Result.Result<string, GatewayOutage>>) =>
                results.map((result) =>
                  Result.match(result, {
                    onSuccess: (answer) => `ok:${answer}`,
                    onFailure: (outage) => `broken:${outage.message}`,
                  })
                ),
            )
            return gathered.run([{ id: 'abcd' }, { id: 'infra-crash' }, { id: 'ab' }])
          },
        ),
        Then('every order has an answer, including the one that broke')((s) => {
          expect(s.outcome).toStrictEqual(['ok:admitted:4', 'broken:Gateway unavailable', 'ok:refused:too short'])
        }),
      ),
    )
  })
