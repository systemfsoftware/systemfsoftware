import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'

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

export type WriteAllChunkDecision = WriteContinued | WriteDrained

export class WriteZero extends Schema.TaggedError<WriteZero>()('WriteZero', {
  fd: Schema.Finite,
  cause: Schema.optional(Schema.Unknown),
}) {
  readonly [WriteAllChunkDecisionTypeId] = WriteAllChunkDecisionTypeId
}

export class WriteAllChunk extends Schema.TaggedClass<WriteAllChunk>()('WriteAllChunk', {
  fd: Schema.Finite,
  written: Schema.Finite,
  remaining: Schema.Finite,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

class WriteZeroOutcome extends Schema.TaggedClass<WriteZeroOutcome>()('WriteZeroOutcome', {}) {}
class WriteContinuedOutcome extends Schema.TaggedClass<WriteContinuedOutcome>()('WriteContinuedOutcome', {}) {}
class WriteDrainedOutcome extends Schema.TaggedClass<WriteDrainedOutcome>()('WriteDrainedOutcome', {}) {}

type WriteStepOutcome = WriteZeroOutcome | WriteContinuedOutcome | WriteDrainedOutcome

const selectNonZero = (written: number, remaining: number): WriteStepOutcome =>
  Match.value(written < remaining).pipe(
    Match.when(true, (): WriteStepOutcome => new WriteContinuedOutcome({})),
    Match.when(false, (): WriteStepOutcome => new WriteDrainedOutcome({})),
    Match.exhaustive,
  )

const classifyWrite = (written: number, remaining: number): WriteStepOutcome =>
  Match.value(written === 0).pipe(
    Match.when(true, (): WriteStepOutcome => new WriteZeroOutcome({})),
    Match.when(false, (): WriteStepOutcome => selectNonZero(written, remaining)),
    Match.exhaustive,
  )

export const planWriteContinuation = Workflow.make(
  WriteAllChunk,
  (command): Result.Result<WriteAllChunkDecision, WriteZero> =>
    Match.value(classifyWrite(command.written, command.remaining)).pipe(
      Match.tag('WriteZeroOutcome', () => Result.fail(new WriteZero({ fd: command.fd }))),
      Match.tag('WriteContinuedOutcome', () => Result.succeed(new WriteContinued({ skip: command.written }))),
      Match.tag('WriteDrainedOutcome', () => Result.succeed(new WriteDrained())),
      Match.exhaustive,
    ),
)
