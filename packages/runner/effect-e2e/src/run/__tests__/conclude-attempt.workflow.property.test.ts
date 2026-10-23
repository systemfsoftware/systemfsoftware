import { it } from '@systemfsoftware/vitest'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import * as Result from 'effect/Result'

import type { FailureCode, FailureRecord } from '../../verdict/failure.schema.js'
import type { StepRecord } from '../../verdict/step-record.schema.js'
import {
  ConcludeAttempt,
  concludeAttempt,
  type Conclusion,
  type Launch,
  type SessionRecord,
  type TryEnding,
} from '../conclude-attempt.workflow.js'

type Conclude = typeof concludeAttempt

const conclusionOf = (conclude: Conclude, command: ConcludeAttempt): Conclusion =>
  Result.match(conclude(command), { onFailure: (missing: never) => missing, onSuccess: (conclusion) => conclusion })

const endedBy = (command: ConcludeAttempt, ending: TryEnding): ConcludeAttempt =>
  new ConcludeAttempt({
    ending,
    launches: command.launches,
    records: command.records,
    sessionErrors: command.sessionErrors,
  })

const finishedEndingOf = (ending: TryEnding): TryEnding =>
  Match.valueTags(ending, {
    Finished: (finished): TryEnding => finished,
    Cancelled: (): TryEnding => ({ _tag: 'Finished', errors: [] }),
  })

const edgeErrorsOf = (ending: TryEnding): ReadonlyArray<FailureRecord> =>
  Match.valueTags(ending, {
    Finished: ({ errors }) => errors,
    Cancelled: (): ReadonlyArray<FailureRecord> => [],
  })

const errorsOf = (conclusion: Conclusion): ReadonlyArray<FailureRecord> =>
  Match.valueTags(conclusion, {
    TryPassed: (): ReadonlyArray<FailureRecord> => [],
    TryFailed: ({ errors }) => errors,
    TryCancelled: ({ errors }) => errors,
  })

const isCancelled = (conclusion: Conclusion): boolean =>
  Match.valueTags(conclusion, { TryPassed: () => false, TryFailed: () => false, TryCancelled: () => true })

const isUnawaited = (launch: Launch): boolean => !(launch.joined && launch.settled)

const isNotAwaited = (error: FailureRecord): boolean => error.code === 'STEP_NOT_AWAITED'

const codeOf = (error: FailureRecord): FailureCode => error.code

const byIndex: Order.Order<SessionRecord> = Order.mapInput(Order.Number, (record: SessionRecord) => record.index)

const hasStaged = (record: SessionRecord): boolean => Option.isSome(record.staged)

const stepOf = (record: SessionRecord): StepRecord => record.step

const stepsText = (steps: ReadonlyArray<StepRecord | undefined>): string => JSON.stringify(steps)

it.prop(
  '∀c_ConcludeAttempt_→CancelledIsOneInterruption',
  { of: [ConcludeAttempt], subject: concludeAttempt, arbitrary: { seed: 507_011 } },
  (subject, [command]) => {
    const conclusion = conclusionOf(subject, endedBy(command, { _tag: 'Cancelled' }))
    return isCancelled(conclusion) && errorsOf(conclusion).map(codeOf).join() === 'INTERRUPTED'
  },
)

it.prop(
  '∀c_ConcludeAttempt_≡OneStepNotAwaitedPerUnjoinedOrRunningLaunch',
  { of: [ConcludeAttempt], subject: concludeAttempt, arbitrary: { seed: 507_012 } },
  (subject, [drawn]) => {
    const command = endedBy(drawn, finishedEndingOf(drawn.ending))
    const carried = [...edgeErrorsOf(command.ending), ...command.sessionErrors].filter(isNotAwaited).length
    return errorsOf(conclusionOf(subject, command)).filter(isNotAwaited).length ===
      carried + command.launches.filter(isUnawaited).length
  },
)

it.prop(
  '∀c_ConcludeAttempt_→EachStagedRecordingPointsAtTheStepThatStagedIt',
  { of: [ConcludeAttempt], subject: concludeAttempt, arbitrary: { seed: 507_015 } },
  (subject, [drawn]) => {
    const command = endedBy(drawn, finishedEndingOf(drawn.ending))
    const staging = stepsText(Arr.map(Arr.sort(command.records.filter(hasStaged), byIndex), stepOf))
    return Match.valueTags(conclusionOf(subject, command), {
      TryCancelled: () => false,
      TryPassed: ({ steps, staged }) => stepsText(staged.map((at) => steps[at.stepIndex])) === staging,
      TryFailed: ({ steps, staged }) => stepsText(staged.map((at) => steps[at.stepIndex])) === staging,
    })
  },
)
