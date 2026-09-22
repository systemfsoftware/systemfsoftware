import { it } from '@effect/vitest'
import { Schema } from 'effect'
import * as Result from 'effect/Result'
import {
  planWriteContinuation,
  WriteAllChunk,
  WriteContinued,
  WriteDrained,
} from '../plan-write-continuation.workflow.js'

const continuationTagOf = (fd: number, written: number, remaining: number): string =>
  Result.match(planWriteContinuation(new WriteAllChunk({ fd, written, remaining })), {
    onFailure: (err) => err._tag,
    onSuccess: (decision) => decision._tag,
  })

const continuedSkipOf = (fd: number, written: number, remaining: number): number => {
  const decision = Result.getOrThrow(
    planWriteContinuation(new WriteAllChunk({ fd, written, remaining })),
  )
  return Schema.is(WriteContinued)(decision) ? decision.skip : -1
}

const isDrained = (fd: number, written: number, remaining: number): boolean => {
  const decision = Result.getOrThrow(
    planWriteContinuation(new WriteAllChunk({ fd, written, remaining })),
  )
  return Schema.is(WriteDrained)(decision)
}

it.prop(
  '∀w_WriteZero_≡ZeroWritten',
  [Schema.Int, Schema.Int],
  ([fd, remaining]) => continuationTagOf(fd, 0, remaining) === 'WriteZero',
)

it.prop(
  '∀w_WriteContinued_≡PositiveSkip',
  [Schema.Int, Schema.Int, Schema.Int],
  ([fd, chunk, extra]) => {
    const written = Math.abs(chunk) + 1
    const remaining = written + Math.abs(extra) + 1
    return continuedSkipOf(fd, written, remaining) === written
  },
)

it.prop(
  '∀w_WriteDrained_≡ExhaustedBuffer',
  [Schema.Int, Schema.Int, Schema.Int],
  ([fd, baseRemaining, extra]) => {
    const remaining = Math.abs(baseRemaining)
    const written = remaining + Math.abs(extra)
    return written === 0 || isDrained(fd, written, remaining)
  },
)
