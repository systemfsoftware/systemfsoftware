import { it } from '@systemfsoftware/vitest'
import { Cause, Exit, Match } from 'effect'
import * as Result from 'effect/Result'
import { ClassifyChildExit, classifyChildExit } from '../Supervisor/classify-child-exit.workflow.js'

const interruptsOnly = <Failure>(exit: Exit.Exit<void, Failure>): boolean =>
  Exit.match(exit, { onSuccess: () => false, onFailure: (cause) => Cause.hasInterruptsOnly(cause) })

it.prop(
  '∀c_ChildExit_≡StoppingAndOutcome',
  { of: [ClassifyChildExit], subject: classifyChildExit },
  (subject, [command]) =>
    Result.match(subject(command), {
      onFailure: () => false,
      onSuccess: (decision) =>
        Match.value(command.stopping).pipe(
          Match.when(true, () =>
            Match.value(decision).pipe(
              Match.tag('Shutdown', () => true),
              Match.tag('Normal', () => false),
              Match.tag('Abnormal', () => false),
              Match.exhaustive,
            )),
          Match.when(false, () =>
            Match.value(decision).pipe(
              Match.tag('Normal', () => Exit.isSuccess(command.exit)),
              Match.tag('Shutdown', () => interruptsOnly(command.exit)),
              Match.tag('Abnormal', () => !Exit.isSuccess(command.exit) && !interruptsOnly(command.exit)),
              Match.exhaustive,
            )),
          Match.exhaustive,
        ),
    }),
)
