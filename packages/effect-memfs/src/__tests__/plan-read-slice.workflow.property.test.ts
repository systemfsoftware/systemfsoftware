import { it } from '@effect/vitest'
import { Schema } from 'effect'
import * as Result from 'effect/Result'
import { planReadSlice, ReadExhausted, ReadPartial, ReadSlice, ReadWhole } from '../plan-read-slice.workflow.js'

const sliceTagOf = (bytesRead: number, requested: number): string => {
  const decision = Result.getOrThrow(
    planReadSlice(new ReadSlice({ bytesRead, requested })),
  )
  return decision._tag
}

const partialBytesOf = (bytesRead: number, requested: number): number => {
  const decision = Result.getOrThrow(
    planReadSlice(new ReadSlice({ bytesRead, requested })),
  )
  return Schema.is(ReadPartial)(decision) ? decision.bytesRead : -1
}

const isReadWhole = (bytesRead: number, requested: number): boolean => {
  const decision = Result.getOrThrow(
    planReadSlice(new ReadSlice({ bytesRead, requested })),
  )
  return Schema.is(ReadWhole)(decision)
}

const isReadExhausted = (bytesRead: number, requested: number): boolean => {
  const decision = Result.getOrThrow(
    planReadSlice(new ReadSlice({ bytesRead, requested })),
  )
  return Schema.is(ReadExhausted)(decision)
}

it.prop(
  '∀r_ReadExhausted_≡ZeroBytesRead',
  [Schema.Int],
  ([requested]) => isReadExhausted(0, Math.abs(requested) + 1),
)

it.prop(
  '∀r_ReadWhole_≡FullRequestSatisfied',
  [Schema.Int, Schema.Int],
  ([req, extra]) => {
    const requested = Math.abs(req) + 1
    const bytesRead = requested + Math.abs(extra)
    return isReadWhole(bytesRead, requested)
  },
)

it.prop(
  '∀r_ReadPartial_≡UnderflowCount',
  [Schema.Int, Schema.Int],
  ([read, extra]) => {
    const bytesRead = Math.abs(read) + 1
    const requested = bytesRead + Math.abs(extra) + 1
    return sliceTagOf(bytesRead, requested) === 'ReadPartial' &&
      partialBytesOf(bytesRead, requested) === bytesRead
  },
)
