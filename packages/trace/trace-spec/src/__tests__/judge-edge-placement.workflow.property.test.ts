import { it } from '@systemfsoftware/vitest'
import { Array as Arr, Schema } from 'effect'
import { absurd } from 'effect/Function'
import * as Result from 'effect/Result'
import {
  EdgePlacementBroken,
  EdgePlacementHeld,
  JudgeEdgePlacement,
  judgeEdgePlacement,
  type JudgeEdgePlacementDecision,
} from '../judge-edge-placement.workflow.js'

const deciding = (placed: ReadonlyArray<string>, reached: ReadonlyArray<string>): JudgeEdgePlacementDecision =>
  Result.match(
    judgeEdgePlacement(
      new JudgeEdgePlacement({ conjunct: 'placement(x)', placed, reached, detail: 'a span is not placed' }),
    ),
    {
      onFailure: (unreachable: never): JudgeEdgePlacementDecision => absurd(unreachable),
      onSuccess: (decision): JudgeEdgePlacementDecision => decision,
    },
  )

const joinedIds = (ids: ReadonlyArray<string>): string => Arr.join(ids, '|')

const everyPlaced = (placed: ReadonlyArray<string>, reached: ReadonlyArray<string>): boolean =>
  placed.every((spanId) => reached.includes(spanId))

it.prop(
  '∀p_EdgePlacement_=EveryReached',
  { of: [Schema.Array(Schema.String), Schema.Array(Schema.String)], subject: deciding },
  (subject, [placed, reached]) => {
    if (!everyPlaced(placed, reached)) return true
    const decision = subject(placed, reached)
    return Schema.is(EdgePlacementHeld)(decision) &&
      decision.conjunct === 'placement(x)' &&
      joinedIds(decision.inspected) === joinedIds(placed)
  },
)

it.prop(
  '∀p_EdgePlacement_=UnplacedBreaks',
  { of: [Schema.Array(Schema.String), Schema.Array(Schema.String)], subject: deciding },
  (subject, [placed, reached]) => {
    if (everyPlaced(placed, reached)) return true
    const decision = subject(placed, reached)
    return Schema.is(EdgePlacementBroken)(decision) &&
      decision.detail === 'a span is not placed' &&
      joinedIds(decision.inspected) === joinedIds(placed)
  },
)
