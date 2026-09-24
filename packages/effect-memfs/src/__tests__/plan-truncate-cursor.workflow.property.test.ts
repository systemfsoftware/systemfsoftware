import { it } from '@effect/vitest'
import { Schema } from 'effect'
import * as Result from 'effect/Result'
import { PlanTruncateCursor, planTruncateCursor } from '../plan-truncate-cursor.workflow.js'

const decide = (position: bigint, length: number) => planTruncateCursor(new PlanTruncateCursor({ position, length }))

it.prop(
  '∀pl_Cursor_≤Length',
  {
    of: [
      Schema.BigInt,
      Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 4096 }))),
    ],
    subject: decide,
  },
  (subject, [position, length]) => {
    const decision = subject(position, length).pipe(Result.getOrThrow)
    return decision.position <= BigInt(length)
  },
)

it.prop(
  '∀pl_CursorWithinEnd_≡Unmoved',
  {
    of: [
      Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 4096 }))),
      Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 4096 }))),
    ],
    subject: decide,
  },
  (subject, [drawn, length]) => {
    const within = BigInt(Math.min(drawn, length))
    const decision = subject(within, length).pipe(Result.getOrThrow)
    return decision.position === within
  },
)

it.prop(
  '∀pl_Truncate_∘Idempotent',
  {
    of: [
      Schema.BigInt,
      Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 4096 }))),
    ],
    subject: decide,
  },
  (subject, [position, length]) => {
    const once = subject(position, length).pipe(Result.getOrThrow).position
    const twice = subject(once, length).pipe(Result.getOrThrow).position
    return twice === once
  },
)
