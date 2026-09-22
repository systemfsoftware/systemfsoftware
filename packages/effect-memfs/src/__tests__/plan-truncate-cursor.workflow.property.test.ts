import { it } from '@effect/vitest'
import { Schema } from 'effect'
import * as Result from 'effect/Result'
import { PlanTruncateCursor, planTruncateCursor } from '../plan-truncate-cursor.workflow.js'

const settled = (position: bigint, length: number): bigint =>
  Result.getOrThrow(planTruncateCursor(new PlanTruncateCursor({ position, length }))).position

it.prop(
  '∀pl_Cursor_≤Length',
  [Schema.BigInt, Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 4096 })))],
  ([position, length]) => settled(position, length) <= BigInt(length),
)

it.prop(
  '∀pl_CursorWithinEnd_≡Unmoved',
  [
    Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 4096 }))),
    Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 4096 }))),
  ],
  ([drawn, length]) => {
    const within = BigInt(Math.min(drawn, length))
    return settled(within, length) === within
  },
)

it.prop(
  '∀pl_Truncate_∘Idempotent',
  [Schema.BigInt, Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 4096 })))],
  ([position, length]) => settled(settled(position, length), length) === settled(position, length),
)
