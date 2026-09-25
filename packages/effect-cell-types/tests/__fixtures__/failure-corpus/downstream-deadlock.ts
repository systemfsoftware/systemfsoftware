import { Sandwich, Workflow } from '@systemfsoftware/effect-cell-types'
import { Deferred, Effect, Fiber, Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import { CorpusDefect } from './defect-error.js'
import { Connected, EvaluateProbe, NotYet, Verdict } from './evidence.js'
import type { CorpusFixture } from './record.js'

const defectFile = 'packages/effect-cell-types/tests/__fixtures__/failure-corpus/downstream-deadlock.ts'

const evaluateTreatingConnectedAsUnsatisfied = Workflow.make({
  command: EvaluateProbe,
  decision: Verdict,
  error: Schema.Never,
  decide: (): Result.Result<Verdict, never> => Result.succeed(new NotYet({})),
})

const evaluateCell = Sandwich.named('probe_condition')((command: EvaluateProbe) => Effect.succeed(command))
  .decide(evaluateTreatingConnectedAsUnsatisfied)
  .write({
    Satisfied: (verdict) => Effect.succeed(verdict),
    NotYet: (verdict) => Effect.succeed(verdict),
    CommandRejected: (rejected) => Effect.die(new CorpusDefect({ defectFile, detail: rejected.issue })),
  })

const program = Effect.gen(function*() {
  const settled = yield* Deferred.make<void>()
  const worker = yield* Effect.forkChild(Effect.gen(function*() {
    const verdict = yield* evaluateCell.run(new EvaluateProbe({ evidence: new Connected({}) }))
    yield* Match.value(verdict).pipe(
      Match.tag('Satisfied', () => Deferred.succeed(settled, undefined)),
      Match.orElse(() => Effect.void),
    )
  }))
  yield* Deferred.await(settled)
  yield* Fiber.join(worker)
})

export const downstreamDeadlock: CorpusFixture = {
  name: 'a downstream cell that never settles the wait',
  defectFile,
  expectedFirstLocationFile: defectFile,
  program,
}
