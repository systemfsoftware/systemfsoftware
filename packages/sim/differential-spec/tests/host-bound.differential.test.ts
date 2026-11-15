import { differentialReport } from '@systemfsoftware/differential-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { integers } from './__fixtures__/arbitraries.js'
import { askedToDouble, doublingService } from './__fixtures__/doublingService.js'

const Feature = makeFeature({ it })

const sameOutcome = (a: number, b: number): boolean => a === b

const hostBound = { runBudget: 20, hostBound: { timeout: 30_000, reason: 'the reference answers over real HTTP' } }

const service = Effect.acquireRelease(doublingService, (held) => held.close)

Feature('Comparing a target that answers over the host network', { timeout: 60_000 })
  .withLayer(Layer.empty)
  .live('the reference is a real HTTP service on the host')
  .body(({ scenario }) => {
    scenario(
      'A host-bound reference and a candidate that agree hold',
      Gherkin.Do.pipe(
        Given('a service on the host that doubles a number over HTTP')('service', () => service),
        When('a candidate that doubles in memory is compared with it, declared host-bound')(
          'report',
          (s) =>
            differentialReport(
              askedToDouble(s.service.origin),
              (x: number) => Effect.succeed(x * 2),
              integers,
              sameOutcome,
              hostBound,
            ),
        ),
        Then('the comparison holds')((s, expect) => expect(s.report).toEqual({ holds: true, report: '' })),
      ),
    )

    scenario(
      'A host-bound disagreement is reduced to the smallest input, with both answers in the report',
      Gherkin.Do.pipe(
        Given('a service on the host that doubles a number over HTTP')('service', () => service),
        When('a candidate that answers one more is compared with it, declared host-bound')(
          'report',
          (s) =>
            differentialReport(
              askedToDouble(s.service.origin),
              (x: number) => Effect.succeed(x * 2 + 1),
              integers,
              sameOutcome,
              hostBound,
            ),
        ),
        Then("the report names zero, the service's 0 and the candidate's 1, and the host-bound reason")((s, expect) =>
          expect(s.report).toEqual({
            holds: false,
            report: expect.stringMatching(
              /Input: 0[\s\S]*Output A: 0[\s\S]*Output B: 1[\s\S]*the reference answers over real HTTP/,
            ),
          })
        ),
      ),
    )

    scenario(
      'A host-bound disagreement that does not recur is reported with the answers that disagreed',
      Gherkin.Do.pipe(
        Given('a reference that answers wrongly on its first call only, as a host glitch would')(
          'reference',
          () =>
            Effect.sync(() => {
              const calls = { made: 0 }
              return (x: number) =>
                Effect.sync(() => {
                  calls.made += 1
                  return calls.made === 1 ? x * 2 + 1 : x * 2
                })
            }),
        ),
        When('a candidate that always doubles is compared with it, declared host-bound')(
          'report',
          (s) =>
            differentialReport(s.reference, (x: number) => Effect.succeed(x * 2), integers, sameOutcome, hostBound),
        ),
        Then('the report shows the two answers that differed, not two that agree on a replay')((s, expect) =>
          expect(s.report).toEqual({
            holds: false,
            report: expect.stringMatching(/Output A: (-?\d+)\s[\s\S]*Output B: (?!\1\s)-?\d+/),
          })
        ),
      ),
    )
  })
