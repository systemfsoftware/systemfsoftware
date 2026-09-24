import { it } from '@effect/vitest'
import { Schema } from 'effect'
import * as Result from 'effect/Result'
import { planReadSlice, ReadExhausted, ReadPartial, ReadSlice, ReadWhole } from '../plan-read-slice.workflow.js'

const decide = (bytesRead: number, requested: number) => planReadSlice(new ReadSlice({ bytesRead, requested }))

it.prop(
  '∀r_ReadExhausted_≡ZeroBytesRead',
  { of: [Schema.Int], subject: decide, runs: 100 },
  (subject, [requested]) => {
    const decision = subject(0, Math.abs(requested) + 1).pipe(Result.getOrThrow)
    return Schema.is(ReadExhausted)(decision)
  },
)

it.prop(
  '∀r_ReadWhole_≡FullRequestSatisfied',
  { of: [Schema.Int, Schema.Int], subject: decide, runs: 100 },
  (subject, [req, extra]) => {
    const requested = Math.abs(req) + 1
    const bytesRead = requested + Math.abs(extra)
    const decision = subject(bytesRead, requested).pipe(Result.getOrThrow)
    return Schema.is(ReadWhole)(decision)
  },
)

it.prop(
  '∀r_ReadPartial_≡UnderflowCount',
  { of: [Schema.Int, Schema.Int], subject: decide, runs: 100 },
  (subject, [read, extra]) => {
    const bytesRead = Math.abs(read) + 1
    const requested = bytesRead + Math.abs(extra) + 1
    const decision = subject(bytesRead, requested).pipe(Result.getOrThrow)
    return Schema.is(ReadPartial)(decision) && decision.bytesRead === bytesRead
  },
)
