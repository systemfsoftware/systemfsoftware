import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Broken, JudgeLaw, judgeLaw, RACE, Race, type Verdict } from '@systemfsoftware/effect-unit-of-work/laws'
import { Array as Arr, Effect, Option } from 'effect'
import * as Result from 'effect/Result'
import type { SchemaError } from 'effect/Schema'
import { type ClaimOutcome, type Workerd, workerdLayer, WorkerdService } from './__fixtures__/workerd.fixture.js'

const Feature = makeFeature({ it })

const CAP = 100
const CLAIMS = 300
const REQUESTS: ReadonlyArray<string> = Array.from({ length: CLAIMS }, (_, index) => `claim-${index}`)

interface Observed {
  readonly granted: number
  readonly refused: number
  readonly failed: number
  readonly decided: number
  readonly failures: ReadonlyArray<string>
  readonly defects: ReadonlyArray<string>
  readonly rows: number
}

const decidedAs = (outcome: ClaimOutcome, decision: 'Granted' | 'Refused'): boolean =>
  'decision' in outcome && outcome.decision === decision

const defectOf = (outcome: ClaimOutcome): Option.Option<string> =>
  'defect' in outcome ? Option.some(outcome.defect) : Option.none()

const failureOf = (outcome: ClaimOutcome): Option.Option<string> =>
  'failure' in outcome ? Option.some(outcome.failure) : Option.none()

const observedOf = (
  workerd: Workerd,
  name: string,
  afterClaims: Effect.Effect<void, SchemaError>,
): Effect.Effect<Observed, SchemaError> =>
  Effect.gen(function*() {
    yield* workerd.reset(name)
    const outcomes = yield* Effect.forEach(
      (request: string) => workerd.claim(name, request),
      { concurrency: 'unbounded' },
    )(REQUESTS)
    yield* afterClaims
    const granted = outcomes.filter((outcome) => decidedAs(outcome, 'Granted')).length
    const refused = outcomes.filter((outcome) => decidedAs(outcome, 'Refused')).length
    return {
      granted,
      refused,
      failed: outcomes.length - granted - refused,
      decided: granted + refused,
      failures: Arr.dedupe(Arr.getSomes(Arr.map(outcomes, failureOf))),
      defects: Arr.dedupe(Arr.getSomes(Arr.map(outcomes, defectOf))),
      rows: yield* workerd.rows(name),
    }
  })

const raceVerdict = (observed: Observed): Verdict =>
  Result.getOrThrow(
    judgeLaw(
      new JudgeLaw({
        law: RACE,
        observation: new Race({
          requested: CLAIMS,
          cap: CAP,
          granted: observed.granted,
          decided: observed.decided,
          rows: observed.rows,
        }),
      }),
    ),
  )

Feature('the DO form of pin-dependency-semantics: N concurrent claims over read-decide-write', {
  timeout: 180_000,
})
  .withLayer(workerdLayer)
  .live('a real workerd runs the Durable Object, over Miniflare')
  .body(({ scenario }) => {
    scenario(
      'Three hundred claims grant exactly a hundred on the plain transaction',
      Gherkin.Do.pipe(
        Given('a workerd Durable Object per unit shape')('workerd', () => Effect.service(WorkerdService)),
        When('three hundred claims race for a seat on the plain transaction')(
          'observed',
          (s) => observedOf(s.workerd, 'reference-none', Effect.void),
        ),
        Then('it grants exactly a hundred of three hundred with a hundred rows')((s, expect) =>
          expect(s.observed).toEqual({
            granted: 100,
            refused: 200,
            failed: 0,
            decided: 300,
            failures: [],
            defects: [],
            rows: 100,
          })
        ),
      ),
    )

    scenario(
      'The runPromise shape oversells, and the race law names it',
      Gherkin.Do.pipe(
        Given('a workerd Durable Object per unit shape')('workerd', () => Effect.service(WorkerdService)),
        When('three hundred claims race for a seat on the runPromise shape')(
          'observed',
          (s) =>
            Effect.map(observedOf(s.workerd, 'runPromise-yield', Effect.void), (observed) => ({
              ...observed,
              verdict: raceVerdict(observed),
            })),
        ),
        Then('more than the cap is granted and the race law reports Broken')((s, expect) =>
          expect({
            oversold: s.observed.granted > CAP,
            decided: s.observed.decided,
            rowsMatchGrants: s.observed.rows === s.observed.granted,
            verdict: s.observed.verdict,
          }).toEqual({
            oversold: true,
            decided: CLAIMS,
            rowsMatchGrants: true,
            verdict: Broken.make({
              law: RACE,
              witness: `granted ${s.observed.granted} of ${CAP}, cap ${CAP} over ${CLAIMS} claims`,
            }),
          })
        ),
      ),
    )

    scenario(
      'An async step inside the adapter unit fails every claim and stores nothing',
      Gherkin.Do.pipe(
        Given('a workerd Durable Object per unit shape')('workerd', () => Effect.service(WorkerdService)),
        When('three hundred claims race on an adapter whose unit sleeps')(
          'observed',
          (s) => observedOf(s.workerd, 'adapter-sleep', s.workerd.settled('adapter-sleep', CLAIMS)),
        ),
        Then('every claim fails with the async-unit defect and no row is left behind')((s, expect) =>
          expect({
            granted: s.observed.granted,
            refused: s.observed.refused,
            failed: s.observed.failed,
            failures: s.observed.failures,
            defects: s.observed.defects,
            rows: s.observed.rows,
          }).toEqual({ granted: 0, refused: 0, failed: CLAIMS, failures: [], defects: ['UnitWentAsync'], rows: 0 })
        ),
      ),
    )

    scenario(
      'A unit that writes a seat and then fails rolls its write back',
      Gherkin.Do.pipe(
        Given('a workerd Durable Object per unit shape')('workerd', () => Effect.service(WorkerdService)),
        When('three hundred claims race on an adapter whose unit fails after writing a seat')(
          'observed',
          (s) => observedOf(s.workerd, 'adapter-fail', Effect.void),
        ),
        Then('every claim fails typed and no row is left behind')((s, expect) =>
          expect({
            granted: s.observed.granted,
            refused: s.observed.refused,
            failed: s.observed.failed,
            failures: s.observed.failures,
            defects: s.observed.defects,
            rows: s.observed.rows,
          }).toEqual({ granted: 0, refused: 0, failed: CLAIMS, failures: ['StoreUnavailable'], defects: [], rows: 0 })
        ),
      ),
    )
  })
