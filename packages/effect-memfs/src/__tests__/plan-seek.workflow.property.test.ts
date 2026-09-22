import { it } from '@effect/vitest'
import { Schema } from 'effect'
import * as Result from 'effect/Result'
import { PlanSeek, planSeek, SeekPlanned } from '../plan-seek.workflow.js'

const seekTagOf = (position: bigint, offset: bigint, from: 'start' | 'current'): string =>
  Result.match(planSeek(new PlanSeek({ position, offset, from })), {
    onFailure: (err) => err._tag,
    onSuccess: (decision) => decision._tag,
  })

const plannedPositionOf = (position: bigint, offset: bigint, from: 'start' | 'current'): bigint => {
  const decision = Result.getOrThrow(
    planSeek(new PlanSeek({ position, offset, from })),
  )
  return Schema.is(SeekPlanned)(decision) ? decision.position : -1n
}

it.prop(
  '∀s_SeekRefusal_≡NegativePosition',
  [Schema.BigInt, Schema.BigInt],
  ([pos, delta]) => {
    const position = pos < 0n ? -pos : pos
    const offset = -(position + (delta < 0n ? -delta : delta) + 1n)
    return seekTagOf(position, offset, 'current') === 'SeekBeforeStart' &&
      seekTagOf(position, -1n - (delta < 0n ? -delta : delta), 'start') === 'SeekBeforeStart'
  },
)

it.prop(
  '∀s_SeekPlanned_≡ExactBigIntStart',
  [Schema.BigInt, Schema.BigInt],
  ([pos, off]) => {
    const position = pos < 0n ? -pos : pos
    const offset = off < 0n ? -off : off
    return plannedPositionOf(position, offset, 'start') === offset
  },
)

it.prop(
  '∀s_SeekPlanned_≡ExactBigIntCurrent',
  [Schema.BigInt, Schema.BigInt],
  ([pos, off]) => {
    const position = pos < 0n ? -pos : pos
    const offset = off < 0n ? -off : off
    return plannedPositionOf(position, offset, 'current') === position + offset
  },
)
