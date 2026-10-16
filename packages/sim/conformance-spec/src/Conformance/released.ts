import { Kernel } from '@systemfsoftware/effect-sim-kernel'
import { Effect, Exit } from 'effect'
import { dual } from 'effect/Function'
import type * as Scope from 'effect/Scope'

import { failed, incomplete, interruptionLeftHeldAt, type Report } from './report.js'

export interface ReleaseSpec<ProbeFailure> {
  readonly probe: Effect.Effect<void, ProbeFailure>
}
const settledCount = <A, E>(counted: Kernel.RunResult<A, E>): boolean =>
  'exit' in counted && Exit.isSuccess(counted.exit)

const pointsOf = <A, E>(counted: Kernel.RunResult<A, E>): ReadonlyArray<number> =>
  settledCount(counted) ? counted.steps.map((step) => step.step) : []

const boundOf = <A, E>(counted: Kernel.RunResult<A, E>): Kernel.Bound => ({
  fibers: new Set(counted.steps.map((step) => step.fiberId)).size,
  operations: counted.steps.length,
  preemptions: 0,
  depth: 0,
  runs: pointsOf(counted).length,
  pruning: Kernel.pruned,
})

const passing = (bound: Kernel.Bound): Report<never, never> => ({
  _tag: 'Pass',
  bound,
  histories: bound.runs,
})

const incompleteOf = <A, E>(
  counted: Kernel.RunResult<A, E>,
  bound: Kernel.Bound,
): Report<never, never> =>
  incomplete({
    failure: 'failure' in counted ? counted.failure : undefined,
    schedule: counted.decisions,
    bound,
  })

const heldReportOf = <A, E>(
  ran: Kernel.RunResult<A, E>,
  atStep: number,
  bound: Kernel.Bound,
): Report<never, never> =>
  failed({
    judgement: interruptionLeftHeldAt(atStep),
    schedule: ran.decisions,
    deviations: ran.steps.filter((step) => step.deviation).length,
    operations: [],
    bound,
  })

const heldFailureOf = <A, E, F>(
  ran: Kernel.RunResult<A, E>,
  atStep: number,
  bound: Kernel.Bound,
  probed: Exit.Exit<void, F>,
): Report<never, never> | undefined => Exit.isFailure(probed) ? heldReportOf(ran, atStep, bound) : undefined

const probedHeld = <A, E, ProbeFailure>(
  program: Effect.Effect<A, E, Scope.Scope>,
  probe: Effect.Effect<void, ProbeFailure>,
  atStep: number,
  bound: Kernel.Bound,
): Effect.Effect<Report<never, never> | undefined> =>
  Effect.flatMap(
    Effect.promise(() => Kernel.run(Effect.scoped(program), { external: 'await', interrupt: { atStep } })),
    (ran) =>
      Effect.map(Effect.promise(() => Effect.runPromiseExit(probe)), (probed) =>
        heldFailureOf(ran, atStep, bound, probed)),
  )

const probeOrNext = <A, E, ProbeFailure>(
  program: Effect.Effect<A, E, Scope.Scope>,
  probe: Effect.Effect<void, ProbeFailure>,
  rest: ReadonlyArray<number>,
  bound: Kernel.Bound,
  report: Report<never, never> | undefined,
): Effect.Effect<Report<never, never>> =>
  report === undefined ? firstHeld(program, probe, rest, bound) : Effect.succeed(report)

const firstHeld = <A, E, ProbeFailure>(
  program: Effect.Effect<A, E, Scope.Scope>,
  probe: Effect.Effect<void, ProbeFailure>,
  points: ReadonlyArray<number>,
  bound: Kernel.Bound,
): Effect.Effect<Report<never, never>> => {
  const first = points[0]
  return first === undefined
    ? Effect.succeed(passing(bound))
    : Effect.flatMap(
      probedHeld(program, probe, first, bound),
      (report) => probeOrNext(program, probe, points.slice(1), bound, report),
    )
}

const countedOf = <A, E>(
  program: Effect.Effect<A, E, Scope.Scope>,
): Effect.Effect<Kernel.RunResult<A, E>> =>
  Effect.promise(() => Kernel.run(Effect.scoped(program), { external: 'await' }))

const settledChecked = <A, E, ProbeFailure>(
  program: Effect.Effect<A, E, Scope.Scope>,
  specification: ReleaseSpec<ProbeFailure>,
  counted: Kernel.RunResult<A, E>,
): Effect.Effect<Report<never, never>> => firstHeld(program, specification.probe, pointsOf(counted), boundOf(counted))

const unsettledChecked = <A, E>(
  counted: Kernel.RunResult<A, E>,
): Effect.Effect<Report<never, never>> => Effect.succeed(incompleteOf(counted, boundOf(counted)))

const checkedImpl = <A, E, ProbeFailure>(
  program: Effect.Effect<A, E, Scope.Scope>,
  specification: ReleaseSpec<ProbeFailure>,
): Effect.Effect<Report<never, never>> =>
  Effect.flatMap(countedOf(program), (counted) =>
    settledCount(counted)
      ? settledChecked(program, specification, counted)
      : unsettledChecked(counted))

export const released: {
  <A, E, ProbeFailure>(
    program: Effect.Effect<A, E, Scope.Scope>,
    specification: ReleaseSpec<ProbeFailure>,
  ): Effect.Effect<Report<never, never>>
  <A, E, ProbeFailure>(
    specification: ReleaseSpec<ProbeFailure>,
  ): (program: Effect.Effect<A, E, Scope.Scope>) => Effect.Effect<Report<never, never>>
} = dual(2, checkedImpl)
