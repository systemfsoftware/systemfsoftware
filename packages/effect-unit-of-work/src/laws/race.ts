import { Effect, Exit, Match } from 'effect'
import { dual } from 'effect/Function'
import * as Result from 'effect/Result'
import type { StoreUnavailable } from '../UnitOfWork/StoreUnavailable.schema.js'
import type { Unit } from '../UnitOfWork/unit.handle.js'
import type { ClaimDecision } from './claim.schema.js'
import { JudgeLaw, judgeLaw, Race, type Verdict } from './judge-law.workflow.js'
import type { StoreSubject } from './store-laws.js'

export const RACE = 'N concurrent claims grant exactly min(cap, N) and store one row per grant'

export interface RaceSubject<D> extends StoreSubject<D> {
  readonly cap: number
  readonly claim: (unit: Unit<D>, request: string) => Effect.Effect<ClaimDecision, StoreUnavailable>
  readonly count: (unit: Unit<D>) => Effect.Effect<number, StoreUnavailable>
}

const grantedIn = (exit: Exit.Exit<ClaimDecision, StoreUnavailable>): number =>
  Exit.match(exit, {
    onSuccess: (decision) =>
      Match.value(decision).pipe(
        Match.tag('Granted', () => 1),
        Match.tag('Refused', () => 0),
        Match.exhaustive,
      ),
    onFailure: () => 0,
  })

const decidedIn = (exit: Exit.Exit<ClaimDecision, StoreUnavailable>): number =>
  Exit.match(exit, { onSuccess: () => 1, onFailure: () => 0 })

const raceOver = <D>(subject: RaceSubject<D>, claims: number): Effect.Effect<Verdict, StoreUnavailable> =>
  Effect.gen(function*() {
    const exits = yield* Effect.all(
      Array.from(
        { length: claims },
        (_, index) => Effect.exit(subject.unitOfWork((unit) => subject.claim(unit, `claim-${index}`))),
      ),
      { concurrency: 'unbounded' },
    )
    const rows = yield* subject.unitOfWork((unit) => subject.count(unit))
    return Result.getOrThrow(
      judgeLaw(
        new JudgeLaw({
          law: RACE,
          observation: new Race({
            requested: claims,
            cap: subject.cap,
            granted: exits.reduce((total, exit) => total + grantedIn(exit), 0),
            decided: exits.reduce((total, exit) => total + decidedIn(exit), 0),
            rows,
          }),
        }),
      ),
    )
  })

export const race: {
  <D>(claims: number): (subject: RaceSubject<D>) => Effect.Effect<Verdict, StoreUnavailable>
  <D>(subject: RaceSubject<D>, claims: number): Effect.Effect<Verdict, StoreUnavailable>
} = dual(2, raceOver)
