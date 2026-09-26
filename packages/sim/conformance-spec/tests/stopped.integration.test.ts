import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer, Match, Schema } from 'effect'

import {
  detachedFlush,
  exporterSpec,
  flushWithinLimit,
  noLimit,
  overrunsItsLimit,
  takeThenSend,
} from './__fixtures__/Exporter.js'
import { escapingSpec, leftoverChildSpec } from './__fixtures__/Steps.js'
import { relaySpec, relayTakingEveryOffer, relayWaitingForever } from './__fixtures__/Streams.js'
import { creditsWithoutDebiting, rechecksBalance, recordsDecision, transferSpec } from './__fixtures__/Transfer.js'
import { answeringNextStep, watching, workerSpec } from './__fixtures__/Worker.js'

const Feature = makeFeature({ it })

const passedOverOf = (report: Conformance.Report<never, never>): number | undefined =>
  Match.value(report).pipe(
    Match.tag('Pass', (passed) => passed.passedOver),
    Match.tag('Fail', (failed) => failed.failure.passedOver),
    Match.orElse(() => undefined),
  )

const failureOf = (report: Conformance.Report<never, never>): Conformance.Failure<never, never> | undefined =>
  Match.value(report).pipe(
    Match.tag('Fail', (failed) => failed.failure),
    Match.orElse(() => undefined),
  )

const otherCutsOf = (report: Conformance.Report<never, never>): ReadonlyArray<Conformance.Judgement> =>
  Match.value(report).pipe(
    Match.tag('Fail', (failed) => failed.failure.otherCutJudgements ?? []),
    Match.orElse(() => []),
  )

const cutsOfKind = (
  cut: Conformance.StopCut,
): (judgements: ReadonlyArray<Conformance.Judgement>) => ReadonlyArray<Conformance.Judgement> =>
(judgements) => judgements.filter((judgement) => judgement.cut === cut)

Feature('Stopping an enrolled unit at every step', { timeout: 0 })
  .withLayer(Layer.empty)
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'An exporter that takes its next event out of the buffer before sending loses it when only the sender stops',
      Gherkin.Do.pipe(
        Given('an exporter whose collector answers, sending the next held event each tick')(
          'make',
          () => Effect.succeed(takeThenSend),
        ),
        When('the check stops it at every step, told to stop and one fiber at a time and killed')(
          'checked',
          (s) => Conformance.stopped(exporterSpec({ make: s.make, collectorDown: false })),
        ),
        Then('the check fails naming the one-fiber stop and the one event it lost')((s, expect) =>
          expect({ report: s.checked, rendered: Conformance.render(s.checked) }).toMatchObject({
            report: { _tag: 'Fail' },
            rendered: expect.stringMatching(/one fiber stopped at step \d+: lost 1 accepted event/),
          })
        ),
      ),
    )

    scenario(
      'An exporter whose stop waits on the collector with no time limit never finishes',
      Gherkin.Do.pipe(
        Given('an exporter whose collector is unreachable and whose stop waits on it forever')(
          'make',
          () => Effect.succeed(noLimit),
        ),
        When('the check tells it to stop at every step')(
          'checked',
          (s) => Conformance.stopped(exporterSpec({ make: s.make, collectorDown: true })),
        ),
        Then('the check fails saying the stop never finished')((s, expect) =>
          expect({ report: s.checked, rendered: Conformance.render(s.checked) }).toMatchObject({
            rendered: expect.stringMatching(/told to stop at step \d+: stop never finished/),
          })
        ),
      ),
    )

    scenario(
      'An exporter that hands each batch to a detached fiber leaves work running after its stop',
      Gherkin.Do.pipe(
        Given('an exporter whose every delivery runs on a detached fiber while the collector is unreachable')(
          'make',
          () => Effect.succeed(detachedFlush),
        ),
        When('the check stops it at every step')(
          'checked',
          (s) => Conformance.stopped(exporterSpec({ make: s.make, collectorDown: true })),
        ),
        Then('the check fails saying work was left running after the stop')((s, expect) =>
          expect({ report: s.checked, rendered: Conformance.render(s.checked) }).toMatchObject({
            rendered: expect.stringMatching(/(told to stop|one fiber stopped) at step \d+: left running after stop/),
          })
        ),
      ),
    )

    scenario(
      'An exporter whose stop outlasts the limit it declares is reported as a stop that never finished',
      Gherkin.Do.pipe(
        Given('an exporter that delivers everything it holds, five seconds after it was told to stop')(
          'make',
          () => Effect.succeed(overrunsItsLimit),
        ),
        When('the check tells it to stop at every step')(
          'checked',
          (s) => Conformance.stopped(exporterSpec({ make: s.make, collectorDown: false })),
        ),
        Then('the check fails saying the stop never finished')((s, expect) =>
          expect({ report: s.checked, rendered: Conformance.render(s.checked) }).toMatchObject({
            rendered: expect.stringMatching(/told to stop at step \d+: stop never finished/),
          })
        ),
      ),
    )

    scenario(
      'A worker that only answers as its next step leaves the waiter waiting when the worker alone stops',
      Gherkin.Do.pipe(
        Given('a worker whose waiter is told Done once every job has run, and never when it is stopped')(
          'start',
          () => Effect.succeed(answeringNextStep),
        ),
        When('the check stops one fiber at a time')(
          'checked',
          (s) => Conformance.stopped(workerSpec({ start: s.start, poison: undefined })),
        ),
        Then('the check fails saying the waiter waited forever')((s, expect) =>
          expect({ report: s.checked, rendered: Conformance.render(s.checked) }).toMatchObject({
            rendered: expect.stringMatching(/one fiber stopped at step \d+: waited forever/),
          })
        ),
      ),
    )

    scenario(
      'A transfer that re-checks the balance instead of its recorded decision loses the credit after a kill',
      Gherkin.Do.pipe(
        Given('a transfer with exactly enough funds that decides from the balance on every start')(
          'transfer',
          () => Effect.succeed(rechecksBalance),
        ),
        When('the check stops it at every step, including killing it after the debit')(
          'checked',
          (s) => Conformance.stopped(transferSpec({ transfer: s.transfer, opening: 30 })),
        ),
        Then('the check fails naming the kill, the step and the balances it expected')((s, expect) =>
          expect({ report: s.checked, rendered: Conformance.render(s.checked) }).toMatchObject({
            rendered: expect.stringMatching(/killed at step \d+: expected a=0 b=30, got a=0 b=0/),
          })
        ),
      ),
    )

    scenario(
      'A unit whose rule never holds is reported as a broken unit, with no cut named',
      Gherkin.Do.pipe(
        Given('a transfer that credits the receiver without debiting the sender')(
          'transfer',
          () => Effect.succeed(creditsWithoutDebiting),
        ),
        When('the check runs it, uncut and then stopped at every step')(
          'checked',
          (s) => Conformance.stopped(transferSpec({ transfer: s.transfer, opening: 30 })),
        ),
        Then('the check fails naming the rule and no cut')((s, expect) =>
          expect({ report: s.checked, rendered: Conformance.render(s.checked) }).toMatchObject({
            report: {
              _tag: 'Fail',
              failure: { judgement: { problem: 'stop-rule-broken', cut: 'uncut', step: undefined } },
            },
            rendered: expect.stringMatching(/without any cut: expected a=0 b=30, got a=30 b=30/),
          })
        ),
      ),
    )

    scenario(
      'A unit that reaches the real system is never passed, and the failure names the site',
      Gherkin.Do.pipe(
        When('the check runs a unit whose program calls a real timer instead of the simulation')(
          'checked',
          () => Conformance.stopped(escapingSpec),
        ),
        Then('the check fails naming the uncut run, the killed run and the site both reached')((s, expect) =>
          expect({
            report: s.checked,
            killed: cutsOfKind('killed')(otherCutsOf(s.checked)),
            rendered: Conformance.render(s.checked),
          }, Conformance.render(s.checked)).toMatchObject({
            report: {
              _tag: 'Fail',
              failure: { judgement: { problem: 'reached-real-system', cut: 'uncut' } },
            },
            killed: [{ problem: 'reached-real-system', cut: 'killed' }],
            rendered: expect.stringMatching(
              /without any cut: the run escaped to the setImmediate timer at .+/,
            ),
          })
        ),
      ),
    )

    scenario(
      'A failure names the runs the check made, and not one more',
      Gherkin.Do.pipe(
        Given('a unit whose first step detaches a child nothing ends')(
          'leftover',
          () => Effect.succeed(leftoverChildSpec),
        ),
        When('the check stops it at every step')('checked', (s) => Conformance.stopped(s.leftover)),
        Then('the bound counts the uncut run, both runs of every earlier cut point, and the cut run that broke')(
          (s, expect) => {
            const failure = failureOf(s.checked)
            const step = failure?.judgement.step ?? 0
            return expect({
              report: s.checked,
              runs: failure?.bound.runs,
              runsBeforeTheBrokenStep: 2 * step,
            }, Conformance.render(s.checked)).toMatchObject({
              report: {
                _tag: 'Fail',
                failure: { judgement: { problem: 'left-running-after-stop', cut: 'told-to-stop' } },
              },
              runs: 2 * step,
            })
          },
        ),
      ),
    )

    scenario(
      'A passed-over one-fiber point whose run failed is judged, not passed over in silence',
      Gherkin.Do.pipe(
        Given('a relay whose source offers every value and never ends')(
          'relay',
          () => Effect.succeed(relayWaitingForever),
        ),
        When('the check stops it at every step')('checked', (s) => Conformance.stopped(relaySpec(s.relay))),
        Then('the uncut run fails, and the passed-over point is judged and counted too')((s, expect) =>
          expect({
            report: s.checked,
            passedOver: failureOf(s.checked)?.passedOver,
            oneFiber: cutsOfKind('one-fiber-stopped')(otherCutsOf(s.checked)),
            rendered: Conformance.render(s.checked),
          }, Conformance.render(s.checked)).toMatchObject({
            report: { _tag: 'Fail' },
            passedOver: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
            oneFiber: [{ problem: 'waited-forever', cut: 'one-fiber-stopped' }],
            rendered: expect.stringContaining('one-fiber point(s) passed over'),
          })
        ),
      ),
    )

    scenario(
      'A correct exporter passes every cut in every world',
      Gherkin.Do.pipe(
        Given('an exporter that keeps accepted events durable and stops within its own limit')(
          'make',
          () => Effect.succeed(flushWithinLimit),
        ),
        When('the check stops it at every step with the collector up and with it down')(
          'checked',
          (s) =>
            Effect.all([
              Conformance.stopped(exporterSpec({ make: s.make, collectorDown: false })),
              Conformance.stopped(exporterSpec({ make: s.make, collectorDown: true })),
            ]),
        ),
        Then('both worlds pass every cut')((s, expect) => {
          const [up, down] = s.checked
          return expect({ up, down }, [Conformance.render(up), Conformance.render(down)].join('\n')).toMatchObject({
            up: { _tag: 'Pass' },
            down: { _tag: 'Pass' },
          })
        }),
      ),
    )

    scenario(
      'A unit that takes its source through Stream.callback passes every cut',
      Gherkin.Do.pipe(
        Given('a relay whose source hands its values over through a stream callback')(
          'relay',
          () => Effect.succeed(relayTakingEveryOffer),
        ),
        When('the check stops it at every step')(
          'checked',
          (s) => Conformance.stopped(relaySpec(s.relay)),
        ),
        Then('every stop cut passes, and the report counts the one-fiber points it passed over')((s, expect) =>
          expect({
            report: s.checked,
            passedOver: passedOverOf(s.checked),
            rendered: Conformance.render(s.checked),
          }, Conformance.render(s.checked)).toMatchObject({
            report: { _tag: 'Pass' },
            passedOver: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
            rendered: expect.stringContaining('one-fiber point(s) passed over'),
          })
        ),
      ),
    )

    scenario(
      'A correct worker and a correct transfer pass every cut',
      Gherkin.Do.pipe(
        Given('a worker whose waiter watches its fiber, and a transfer that records its decision first')(
          'units',
          () => Effect.succeed({ worker: watching, transfer: recordsDecision }),
        ),
        When('the check stops each of them at every step')(
          'checked',
          (s) =>
            Effect.all([
              Conformance.stopped(workerSpec({ start: s.units.worker, poison: undefined })),
              Conformance.stopped(transferSpec({ transfer: s.units.transfer, opening: 30 })),
              Conformance.stopped(transferSpec({ transfer: s.units.transfer, opening: 100 })),
            ]),
        ),
        Then('every one of them passes every cut')((s, expect) =>
          expect({ rendered: s.checked.map((report) => Conformance.render(report)) }).toMatchObject({
            rendered: [
              expect.stringContaining('every stop cut passed'),
              expect.stringContaining('every stop cut passed'),
              expect.stringContaining('every stop cut passed'),
            ],
          })
        ),
      ),
    )
  })
