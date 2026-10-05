import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Broken, Held, JudgeLaw, judgeLaw, RACE, Race, type Verdict } from '@systemfsoftware/effect-unit-of-work/laws'
import { Array as Arr, Duration, Effect, Option } from 'effect'
import * as Result from 'effect/Result'
import type { SchemaError } from 'effect/Schema'
import {
  type ClaimOutcome,
  type Verdicts,
  type Workerd,
  workerdLayer,
  WorkerdService,
} from './__fixtures__/workerd.fixture.js'

const Feature = makeFeature({ it })

const CAP = 100
const CLAIMS = 300
const SETTLE = '250 millis'
const REQUESTS: ReadonlyArray<string> = Array.from({ length: CLAIMS }, (_, index) => `claim-${index}`)

interface Observed {
  readonly granted: number
  readonly refused: number
  readonly failed: number
  readonly decided: number
  readonly defects: ReadonlyArray<string>
  readonly rows: number
}

const decidedAs = (outcome: ClaimOutcome, decision: 'Granted' | 'Refused'): boolean =>
  'decision' in outcome && outcome.decision === decision

const defectOf = (outcome: ClaimOutcome): Option.Option<string> =>
  'defect' in outcome ? Option.some(outcome.defect) : Option.none()

const observedOf = (
  workerd: Workerd,
  name: string,
  settle: Duration.Input,
): Effect.Effect<Observed, SchemaError> =>
  Effect.gen(function*() {
    yield* workerd.reset(name)
    const outcomes = yield* Effect.forEach(
      (request: string) => workerd.claim(name, request),
      { concurrency: 'unbounded' },
    )(REQUESTS)
    yield* Effect.sleep(settle)
    const granted = outcomes.filter((outcome) => decidedAs(outcome, 'Granted')).length
    const refused = outcomes.filter((outcome) => decidedAs(outcome, 'Refused')).length
    return {
      granted,
      refused,
      failed: outcomes.length - granted - refused,
      decided: granted + refused,
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

const heldVerdicts = (): Verdicts => ({
  readAfterWrite: Held.make({}),
  idempotentRead: Held.make({}),
  crossKeyCommute: Held.make({}),
  failedUnitWritesNothing: Held.make({}),
  concurrentUnitsSerialize: Held.make({}),
  endedUnitDies: Held.make({}),
})

Feature('the DO form of pin-dependency-semantics: N concurrent claims over read-decide-write', {
  timeout: 180_000,
})
  .withLayer(workerdLayer)
  .live('a real workerd runs the Durable Object, over Miniflare')
  .body(({ scenario }) => {
    scenario(
      'Three hundred claims grant exactly a hundred on the plain transaction and on the adapter',
      Gherkin.Do.pipe(
        Given('a workerd Durable Object per unit shape')('workerd', () => Effect.service(WorkerdService)),
        When('three hundred claims race for a seat, with a yield inside the unit')('observed', (s) =>
          Effect.all({
            reference: observedOf(s.workerd, 'reference-none', '0 millis'),
            adapter: observedOf(s.workerd, 'adapter-yield', '0 millis'),
          })),
        Then('each shape grants exactly a hundred of three hundred with a hundred rows')((s, expect) =>
          expect(s.observed).toEqual({
            reference: { granted: 100, refused: 200, failed: 0, decided: 300, defects: [], rows: 100 },
            adapter: { granted: 100, refused: 200, failed: 0, decided: 300, defects: [], rows: 100 },
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
            Effect.map(observedOf(s.workerd, 'runPromise-yield', '0 millis'), (observed) => ({
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
          (s) => observedOf(s.workerd, 'adapter-sleep', SETTLE),
        ),
        Then('every claim fails with the async-unit defect and no row is left behind')((s, expect) =>
          expect({
            granted: s.observed.granted,
            refused: s.observed.refused,
            failed: s.observed.failed,
            defects: s.observed.defects,
            rows: s.observed.rows,
          }).toEqual({ granted: 0, refused: 0, failed: CLAIMS, defects: ['UnitWentAsync'], rows: 0 })
        ),
      ),
    )

    scenario(
      'Every store law holds when the unit runs inside the Durable Object',
      Gherkin.Do.pipe(
        Given('a workerd Durable Object per unit shape')('workerd', () => Effect.service(WorkerdService)),
        When('the base and unit laws run inside the object over the adapter')(
          'verdicts',
          (s) => s.workerd.verdicts('laws-none'),
        ),
        Then('every law holds')((s, expect) => expect(s.verdicts).toEqual(heldVerdicts())),
      ),
    )
  })
