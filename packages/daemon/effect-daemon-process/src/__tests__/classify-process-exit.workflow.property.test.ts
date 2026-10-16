import { it } from '@systemfsoftware/vitest'
import { Match } from 'effect'
import * as Result from 'effect/Result'
import { ClassifyProcessExit, classifyProcessExit } from '../ProcessMedium/classify-process-exit.workflow.js'

it.prop(
  '∀exit_ClassifyProcessExit_≡ExitStatus',
  { of: [ClassifyProcessExit], subject: classifyProcessExit },
  (subject, [command]) =>
    Result.match(subject(command), {
      onFailure: () => false,
      onSuccess: (decision) =>
        Match.value(command.exit).pipe(
          Match.tag('Exited', (exited) =>
            Match.value(decision).pipe(
              Match.tag('ProcessExitNormal', () => exited.code === 0),
              Match.tag('ProcessExitAbnormal', (abnormal) =>
                exited.code !== 0 && abnormal.code === exited.code && abnormal.signal === ''),
              Match.exhaustive,
            )),
          Match.tag('Signaled', () =>
            Match.value(decision).pipe(
              Match.tag('ProcessExitNormal', () =>
                false),
              Match.tag('ProcessExitAbnormal', (abnormal) => abnormal.code === 0),
              Match.exhaustive,
            )),
          Match.exhaustive,
        ),
    }),
)
