import { Sandwich, Workflow } from '@systemfsoftware/effect-cell-types'
import { Effect, Schema } from 'effect'
import * as Result from 'effect/Result'
import { CorpusDefect, MessagelessDefect } from './defect-error.js'
import type { CorpusFixture } from './record.js'

const defectFile = 'packages/effect-cell-types/tests/__fixtures__/failure-corpus/messageless-write-handler.ts'

const PlanTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/tests/failure-corpus/WritePlan')
type PlanTypeId = typeof PlanTypeId

export class ProbeCommand extends Schema.TaggedClass<ProbeCommand>()('ProbeCommand', { hostPort: Schema.Int }) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

export class Probed extends Schema.TaggedClass<Probed>()('Probed', { hostPort: Schema.Int }) {
  readonly [PlanTypeId] = PlanTypeId
}

export class Unprobed extends Schema.TaggedClass<Unprobed>()('Unprobed', {}) {
  readonly [PlanTypeId] = PlanTypeId
}

export const ProbePlan = Schema.Union([Probed, Unprobed])
export type ProbePlan = typeof ProbePlan.Type

export const probeTcp = Workflow.make({
  command: ProbeCommand,
  decision: ProbePlan,
  error: Schema.Never,
  decide: (command): Result.Result<ProbePlan, never> => Result.succeed(new Probed({ hostPort: command.hostPort })),
})

const probeCell = Sandwich.named('probe_tcp_write')((command: ProbeCommand) => Effect.succeed(command))
  .decide(probeTcp)
  .write({
    Probed: (_plan, command) => Effect.fail(new MessagelessDefect({ defectFile, hostPort: command.hostPort })),
    Unprobed: () => Effect.succeed('never probed'),
    CommandRejected: (rejected) => Effect.die(new CorpusDefect({ defectFile, detail: rejected.issue })),
  })

export const messagelessWriteHandler: CorpusFixture = {
  name: 'a message-less error raised in a write handler',
  defectFile,
  expectedFirstLocationFile: defectFile,
  program: Effect.asVoid(probeCell.run(new ProbeCommand({ hostPort: 1 }))),
}
