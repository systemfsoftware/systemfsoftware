import { it } from '@effect/vitest'
import { Result, Schema } from 'effect'
import {
  AssignedToDev,
  AssignedToTest,
  assignTaskSplit,
  AssignTaskSplitCommand,
} from '../assign-task-split.workflow.js'

const isDev = Schema.is(AssignedToDev)
const isTest = Schema.is(AssignedToTest)

const decisionOf = (command: AssignTaskSplitCommand) => Result.getOrThrow(assignTaskSplit(command))

it.prop(
  '∀c_TaskSplit_≡FewerSideWinsTiesToDev',
  [AssignTaskSplitCommand],
  ([command]) => {
    const decision = decisionOf(command)
    const fewerOrEqualDev = command.devTasks <= command.testTasks
    return isDev(decision) === fewerOrEqualDev && isTest(decision) === !fewerOrEqualDev
  },
)
