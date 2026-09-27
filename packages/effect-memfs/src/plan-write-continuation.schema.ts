import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'

const WriteAllChunkDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-memfs/WriteAllChunkDecision',
)
type WriteAllChunkDecisionTypeId = typeof WriteAllChunkDecisionTypeId

export class WriteContinued extends Schema.TaggedClass<WriteContinued>()('WriteContinued', {
  skip: Schema.Finite,
}) {
  readonly [WriteAllChunkDecisionTypeId] = WriteAllChunkDecisionTypeId
}

export class WriteDrained extends Schema.TaggedClass<WriteDrained>()('WriteDrained', {}) {
  readonly [WriteAllChunkDecisionTypeId] = WriteAllChunkDecisionTypeId
}

export class WriteZero extends Schema.TaggedError<WriteZero>()('WriteZero', {
  fd: Schema.Finite,
  cause: Schema.optional(Schema.Unknown),
}) {
  readonly [WriteAllChunkDecisionTypeId] = WriteAllChunkDecisionTypeId

  override get message(): string {
    return `The write to file descriptor ${this.fd} made no progress`
  }
}

export const WriteAllChunkDecision = Schema.Union([WriteContinued, WriteDrained])
export type WriteAllChunkDecision = typeof WriteAllChunkDecision.Type

export class WriteAllChunk extends Schema.TaggedClass<WriteAllChunk>()('WriteAllChunk', {
  fd: Schema.Finite,
  written: Schema.Finite,
  remaining: Schema.Finite,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}
