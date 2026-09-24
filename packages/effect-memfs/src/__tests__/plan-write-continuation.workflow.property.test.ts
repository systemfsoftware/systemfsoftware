import { it } from '@systemfsoftware/vitest'
import { Schema } from 'effect'
import * as Result from 'effect/Result'
import {
  planWriteContinuation,
  WriteAllChunk,
  type WriteAllChunkDecision,
  WriteContinued,
  WriteDrained,
  type WriteZero,
} from '../plan-write-continuation.workflow.js'

const decide = (fd: number, written: number, remaining: number) =>
  planWriteContinuation(new WriteAllChunk({ fd, written, remaining }))

const tagOf = (outcome: Result.Result<WriteAllChunkDecision, WriteZero>): string =>
  Result.match(outcome, {
    onFailure: (error) => error._tag,
    onSuccess: (decision) => decision._tag,
  })

it.prop(
  '∀w_WriteZero_≡ZeroWritten',
  { of: [Schema.Int, Schema.Int], subject: decide },
  (subject, [fd, remaining]) => tagOf(subject(fd, 0, remaining)) === 'WriteZero',
)

it.prop(
  '∀w_WriteContinued_≡PositiveSkip',
  { of: [Schema.Int, Schema.Int, Schema.Int], subject: decide },
  (subject, [fd, chunk, extra]) => {
    const written = Math.abs(chunk) + 1
    const remaining = written + Math.abs(extra) + 1
    const decision = subject(fd, written, remaining).pipe(Result.getOrThrow)
    return Schema.is(WriteContinued)(decision) && decision.skip === written
  },
)

it.prop(
  '∀w_WriteDrained_≡ExhaustedBuffer',
  { of: [Schema.Int, Schema.Int, Schema.Int], subject: decide },
  (subject, [fd, baseRemaining, extra]) => {
    const remaining = Math.abs(baseRemaining)
    const written = remaining + Math.abs(extra)
    if (written === 0) return true
    const decision = subject(fd, written, remaining).pipe(Result.getOrThrow)
    return Schema.is(WriteDrained)(decision)
  },
)
