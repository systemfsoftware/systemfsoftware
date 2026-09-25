import { Sandwich, Workflow } from '@systemfsoftware/effect-cell-types'
import { Effect, Schema } from 'effect'
import * as Result from 'effect/Result'
import { CorpusDefect } from './defect-error.js'
import type { CorpusFixture } from './record.js'

const defectFile = 'packages/effect-cell-types/tests/__fixtures__/failure-corpus/schema-constructor-error.ts'

const PlanTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/tests/failure-corpus/CountPlan')
type PlanTypeId = typeof PlanTypeId

export class CountCommand extends Schema.TaggedClass<CountCommand>()('CountCommand', { count: Schema.Int }) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

export class Counted extends Schema.TaggedClass<Counted>()('Counted', { count: Schema.Int }) {
  readonly [PlanTypeId] = PlanTypeId
}

export class Uncounted extends Schema.TaggedClass<Uncounted>()('Uncounted', {}) {
  readonly [PlanTypeId] = PlanTypeId
}

export const CountPlan = Schema.Union([Counted, Uncounted])
export type CountPlan = typeof CountPlan.Type

export const admitCount = Workflow.make({
  command: CountCommand,
  decision: CountPlan,
  error: Schema.Never,
  decide: (command): Result.Result<CountPlan, never> => Result.succeed(new Counted({ count: command.count })),
})

const decodeCount = Schema.decodeEffect(Schema.Int)(1.5)

const countCell = Sandwich.named('decode_count')((_raw: string) =>
  Effect.succeed({ _tag: 'CountCommand' as const, count: 1 })
)
  .decide(admitCount)
  .write({
    Counted: () => Effect.flatMap(decodeCount, () => Effect.void),
    Uncounted: () => Effect.succeed('uncounted'),
    CommandRejected: (rejected) => Effect.die(new CorpusDefect({ defectFile, detail: rejected.issue })),
  })

export const schemaConstructorError: CorpusFixture = {
  name: 'an error built by a schema constructor',
  defectFile,
  expectedFirstLocationFile: defectFile,
  program: Effect.asVoid(countCell.run('a count the constructor rejects')),
}
