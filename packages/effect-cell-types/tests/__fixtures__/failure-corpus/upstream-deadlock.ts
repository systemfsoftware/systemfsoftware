import { Sandwich, Workflow } from '@systemfsoftware/effect-cell-types'
import { Deferred, Effect, Fiber, Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { CorpusDefect } from './defect-error.js'
import { Absent, Connected, EvaluateProbe, evaluateProbe } from './evidence.js'
import type { CorpusFixture } from './record.js'

const defectFile = 'packages/effect-cell-types/tests/__fixtures__/failure-corpus/upstream-deadlock.ts'

const PlanTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/tests/failure-corpus/ProbePlan')
type PlanTypeId = typeof PlanTypeId

export class ProbeAbsent extends Schema.TaggedClass<ProbeAbsent>()('ProbeAbsent', { guestPort: Schema.Int }) {
  readonly [PlanTypeId] = PlanTypeId
}

export class ProbeTcp extends Schema.TaggedClass<ProbeTcp>()('ProbeTcp', { guestPort: Schema.Int }) {
  readonly [PlanTypeId] = PlanTypeId
}

export const ProbePlan = Schema.Union([ProbeAbsent, ProbeTcp])
export type ProbePlan = typeof ProbePlan.Type

export class ResolveProbe extends Schema.TaggedClass<ResolveProbe>()('ResolveProbe', { guestPort: Schema.Int }) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

export const resolveProbe = Workflow.make({
  command: ResolveProbe,
  decision: ProbePlan,
  error: Schema.Never,
  decide: (command): Result.Result<ProbePlan, never> =>
    Result.succeed(new ProbeAbsent({ guestPort: command.guestPort })),
})

const resolveCell = Sandwich.named('probe_condition_resolve')((command: ResolveProbe) => Effect.succeed(command))
  .decide(resolveProbe)
  .write({
    ProbeAbsent: (_plan, _command) => Effect.succeed(new EvaluateProbe({ evidence: new Absent({}) })),
    ProbeTcp: (_plan, _command) => Effect.succeed(new EvaluateProbe({ evidence: new Connected({}) })),
    CommandRejected: (rejected) => Effect.die(new CorpusDefect({ defectFile, detail: rejected.issue })),
  })

const evaluateCell = Sandwich.named('probe_condition')((command: EvaluateProbe) => Effect.succeed(command))
  .decide(evaluateProbe)
  .write({
    Satisfied: (verdict) => Effect.succeed(verdict),
    NotYet: (verdict) => Effect.succeed(verdict),
    CommandRejected: (rejected) => Effect.die(new CorpusDefect({ defectFile, detail: rejected.issue })),
  })

const program = Effect.gen(function*() {
  const settled = yield* Deferred.make<void>()
  const worker = yield* Effect.forkChild(Effect.gen(function*() {
    const evidence = yield* resolveCell.run(new ResolveProbe({ guestPort: 8080 }))
    const verdict = yield* evaluateCell.run(evidence)
    yield* Match.value(verdict).pipe(
      Match.tag('Satisfied', () => Deferred.succeed(settled, undefined)),
      Match.orElse(() => Effect.void),
    )
  }))
  yield* Deferred.await(settled)
  yield* Fiber.join(worker)
})

export const upstreamDeadlock: CorpusFixture = {
  name: 'an upstream cell that reports a mapped port absent',
  defectFile,
  expectedFirstLocationFile: defectFile,
  program,
}
