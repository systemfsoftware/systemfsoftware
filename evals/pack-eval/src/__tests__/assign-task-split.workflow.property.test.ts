import { it } from '@effect/vitest'
import { Equal, Result, Schema } from 'effect'
import type { AssignTaskSplitDecision } from '../assign-task-split.workflow.js'
import {
  AssignedToDev,
  AssignedToTest,
  assignTaskSplit,
  AssignTaskSplitCommand,
} from '../assign-task-split.workflow.js'

const decisionOf = (dev: number, test: number): AssignTaskSplitDecision =>
  Result.getOrThrow(assignTaskSplit(new AssignTaskSplitCommand({ devTasks: dev, testTasks: test })))

it.prop(
  '∀c_TaskSplit_≡FewerSideWinsTiesToDev',
  [
    Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
    Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
  ],
  ([dev, test]) => {
    const expected = dev <= test ? new AssignedToDev({ split: 'dev' }) : new AssignedToTest({ split: 'test' })
    return Equal.equals(decisionOf(dev, test), expected)
  },
)
