import { it } from '@systemfsoftware/vitest'
import { Schema } from 'effect'
import * as Result from 'effect/Result'
import { PlanTruncateCursor } from '../plan-truncate-cursor.schema.js'
import { planTruncateCursor } from '../plan-truncate-cursor.workflow.js'

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
  (subject, [position, length]) =>
    Result.match(subject(position, length), {
      onFailure: () => false,
      onSuccess: (decision) => decision.position <= BigInt(length),
    }),
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
    return Result.match(subject(within, length), {
      onFailure: () => false,
      onSuccess: (decision) => decision.position === within,
    })
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
  (subject, [position, length]) =>
    Result.match(subject(position, length), {
      onFailure: () => false,
      onSuccess: (once) =>
        Result.match(subject(once.position, length), {
          onFailure: () => false,
          onSuccess: (twice) => twice.position === once.position,
        }),
    }),
)
