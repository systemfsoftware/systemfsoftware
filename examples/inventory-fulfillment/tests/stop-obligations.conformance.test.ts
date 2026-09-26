import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Fulfillment, Settlement } from '@systemfsoftware/example-inventory-fulfillment'
import { Duration, Effect, Match, Schema } from 'effect'

import {
  freshOrderWorld,
  runPlaceOrderCell,
  runSettlementUnit,
  settledAtMostOnce,
  unitOfWorkClosed,
} from './__fixtures__/stop-obligations.js'

const Feature = makeFeature({ it })

const cutsSearched = (report: Conformance.Report<never, never>): number =>
  Match.value(report).pipe(
    Match.tag('Pass', (passed) => passed.stopCuts ?? 0),
    Match.orElse(() => 0),
  )

Feature('Stopping the fulfillment units', { timeout: 0 })
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'A place-order run stopped at any step and started again never settles the same order twice',
      Gherkin.Do.pipe(
        Given('a fresh order world over a fake settlement driver')('order', () => Effect.succeed(freshOrderWorld)),
        When('the place-order cell runs and is stopped at each step, then started again')(
          'checked',
          (s) =>
            Conformance.stopped({
              unit: Fulfillment.Cell.placeOrderCell,
              world: Effect.sync(() => s.order()),
              program: runPlaceOrderCell,
              restart: runPlaceOrderCell,
              rule: settledAtMostOnce,
              stopWithin: Duration.zero,
            }),
        ),
        Then('the order is settled at most once, and the check tried at least one cut')((s, expect) =>
          expect({
            report: s.checked,
            rendered: Conformance.render(s.checked),
            cuts: cutsSearched(s.checked),
          }).toMatchObject({
            report: { _tag: 'Pass' },
            cuts: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
          })
        ),
      ),
    )

    scenario(
      'A settlement unit stopped at any step and started again is closed, never usable',
      Gherkin.Do.pipe(
        Given('a fresh order world over a fake settlement driver')('order', () => Effect.succeed(freshOrderWorld)),
        When('a unit of work is opened and used, stopped at each step, then started again')(
          'checked',
          (s) =>
            Conformance.stopped({
              unit: Settlement.Unit.open,
              world: Effect.sync(() => s.order()),
              program: runSettlementUnit,
              restart: runSettlementUnit,
              rule: unitOfWorkClosed,
              stopWithin: Duration.zero,
            }),
        ),
        Then('the unit of work is closed after the stop, and the check tried at least one cut')((s, expect) =>
          expect({
            report: s.checked,
            rendered: Conformance.render(s.checked),
            cuts: cutsSearched(s.checked),
          }).toMatchObject({
            report: { _tag: 'Pass' },
            cuts: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
          })
        ),
      ),
    )
  })
