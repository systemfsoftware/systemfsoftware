import { it } from '@systemfsoftware/vitest'
import { Match, Schema } from 'effect'
import { absurd } from 'effect/Function'
import * as Result from 'effect/Result'
import { ClassifyWorkloadExit, classifyWorkloadExit } from '../MicroVMMedium/classify-workload-exit.workflow.js'
import type { WorkloadExit } from '../MicroVMMedium/WorkloadExit.schema.js'

type ClassifyExit = typeof classifyWorkloadExit

const exitOf = (classify: ClassifyExit, code: number): WorkloadExit =>
  Result.match(classify(new ClassifyWorkloadExit({ code })), {
    onFailure: (error: never): never => absurd(error),
    onSuccess: (exit) => exit,
  })

it.prop(
  '∀c_WorkloadExit_≡ZeroNormal',
  { of: [Schema.Int], subject: classifyWorkloadExit },
  (classify, [code]) =>
    Match.value(exitOf(classify, code)).pipe(
      Match.tag('WorkloadExitedNormal', () => code === 0),
      Match.tag('WorkloadExitedAbnormal', (abnormal) => code !== 0 && abnormal.code === code),
      Match.exhaustive,
    ),
)
