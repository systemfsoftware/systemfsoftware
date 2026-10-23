import { it } from '@systemfsoftware/vitest'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { NextJudgment, nextJudgment, type NextJudgmentDecision } from '../next-judgment.workflow.js'

type JudgmentPatch = Partial<
  Pick<NextJudgment, 'mode' | 'source' | 'evaluation' | 'changed' | 'modelCalls' | 'maxModelCalls'>
>

const decisionOf = (subject: typeof nextJudgment, command: NextJudgment): NextJudgmentDecision =>
  Result.match(subject(command), { onFailure: (missing: never) => missing, onSuccess: (decision) => decision })

const patchedOf = (command: NextJudgment, patch: JudgmentPatch): NextJudgment =>
  new NextJudgment({
    mode: command.mode,
    source: command.source,
    evaluation: command.evaluation,
    changed: command.changed,
    modelCalls: command.modelCalls,
    maxModelCalls: command.maxModelCalls,
    ...patch,
  })

const freeOf = (command: NextJudgment, drawn: number): JudgmentPatch => ({
  modelCalls: command.modelCalls,
  maxModelCalls: command.modelCalls + Math.abs(drawn) + 1,
})

const spentOf = (command: NextJudgment, drawn: number): JudgmentPatch => ({
  modelCalls: command.maxModelCalls + Math.abs(drawn),
  maxModelCalls: command.maxModelCalls,
})

const isTag = (decision: NextJudgmentDecision, tag: NextJudgmentDecision['_tag']): boolean =>
  Match.valueTags(decision, {
    JudgmentPassed: () => tag === 'JudgmentPassed',
    JudgmentFailed: () => tag === 'JudgmentFailed',
    JudgmentInconclusive: () => tag === 'JudgmentInconclusive',
    JudgmentResolve: () => tag === 'JudgmentResolve',
    JudgmentPoll: () => tag === 'JudgmentPoll',
    JudgmentExhausted: () => tag === 'JudgmentExhausted',
  })

it.prop(
  '∀s_NextJudgment_≡HoldsPassesWhateverTheRest',
  { of: [NextJudgment], subject: nextJudgment, arbitrary: { seed: 506_221 } },
  (subject, [command]) => {
    const decision = decisionOf(subject, patchedOf(command, { evaluation: 'Holds' }))
    return isTag(decision, 'JudgmentPassed')
  },
)

it.prop(
  '∀s_NextJudgment_≡AssertFalsehoodFailsOnEitherSource',
  { of: [NextJudgment], subject: nextJudgment, arbitrary: { seed: 506_222 } },
  (subject, [command]) => {
    const recorded = decisionOf(
      subject,
      patchedOf(command, { mode: 'assert', source: 'recorded', evaluation: 'DoesNotHold' }),
    )
    const fresh = decisionOf(
      subject,
      patchedOf(command, { mode: 'assert', source: 'fresh', evaluation: 'DoesNotHold' }),
    )
    return isTag(recorded, 'JudgmentFailed') && isTag(fresh, 'JudgmentFailed')
  },
)

it.prop(
  '∀s_NextJudgment_≡AssertFreshUnevaluableInconclusive',
  { of: [NextJudgment], subject: nextJudgment, arbitrary: { seed: 506_223 } },
  (subject, [command]) => {
    const decision = decisionOf(
      subject,
      patchedOf(command, { mode: 'assert', source: 'fresh', evaluation: 'Unevaluable' }),
    )
    return isTag(decision, 'JudgmentInconclusive')
  },
)

it.prop(
  '∀s_NextJudgment_≡AssertRecordedUnevaluableFollowsBudget',
  { of: [NextJudgment, Schema.Int], subject: nextJudgment, arbitrary: { seed: 506_224 } },
  (subject, [command, drawn]) => {
    const free = decisionOf(
      subject,
      patchedOf(command, { mode: 'assert', source: 'recorded', evaluation: 'Unevaluable', ...freeOf(command, drawn) }),
    )
    const spent = decisionOf(
      subject,
      patchedOf(command, { mode: 'assert', source: 'recorded', evaluation: 'Unevaluable', ...spentOf(command, drawn) }),
    )
    return isTag(free, 'JudgmentResolve') && isTag(spent, 'JudgmentExhausted')
  },
)

it.prop(
  '∀s_NextJudgment_≡AssertFreshNeverResolves',
  { of: [NextJudgment], subject: nextJudgment, arbitrary: { seed: 506_225 } },
  (subject, [command]) => {
    const holds = decisionOf(subject, patchedOf(command, { mode: 'assert', source: 'fresh', evaluation: 'Holds' }))
    const fails = decisionOf(
      subject,
      patchedOf(command, { mode: 'assert', source: 'fresh', evaluation: 'DoesNotHold' }),
    )
    const unevaluable = decisionOf(
      subject,
      patchedOf(command, { mode: 'assert', source: 'fresh', evaluation: 'Unevaluable' }),
    )
    return isTag(holds, 'JudgmentPassed') &&
      isTag(fails, 'JudgmentFailed') &&
      isTag(unevaluable, 'JudgmentInconclusive')
  },
)

it.prop(
  '∀s_NextJudgment_≡WaitForFalsehoodPollsOnEitherSource',
  { of: [NextJudgment], subject: nextJudgment, arbitrary: { seed: 506_226 } },
  (subject, [command]) => {
    const recorded = decisionOf(
      subject,
      patchedOf(command, { mode: 'waitFor', source: 'recorded', evaluation: 'DoesNotHold' }),
    )
    const fresh = decisionOf(
      subject,
      patchedOf(command, { mode: 'waitFor', source: 'fresh', evaluation: 'DoesNotHold' }),
    )
    return isTag(recorded, 'JudgmentPoll') && isTag(fresh, 'JudgmentPoll')
  },
)

it.prop(
  '∀s_NextJudgment_≡WaitForChangedUnevaluableFollowsBudget',
  { of: [NextJudgment, Schema.Int], subject: nextJudgment, arbitrary: { seed: 506_227 } },
  (subject, [command, drawn]) => {
    const free = decisionOf(
      subject,
      patchedOf(command, { mode: 'waitFor', changed: true, evaluation: 'Unevaluable', ...freeOf(command, drawn) }),
    )
    const spent = decisionOf(
      subject,
      patchedOf(command, { mode: 'waitFor', changed: true, evaluation: 'Unevaluable', ...spentOf(command, drawn) }),
    )
    return isTag(free, 'JudgmentResolve') && isTag(spent, 'JudgmentExhausted')
  },
)

it.prop(
  '∀s_NextJudgment_≡WaitForUnchangedPollsNeverResolves',
  { of: [NextJudgment], subject: nextJudgment, arbitrary: { seed: 506_228 } },
  (subject, [command]) => {
    const holds = decisionOf(subject, patchedOf(command, { mode: 'waitFor', changed: false, evaluation: 'Holds' }))
    const fails = decisionOf(
      subject,
      patchedOf(command, { mode: 'waitFor', changed: false, evaluation: 'DoesNotHold' }),
    )
    const unevaluable = decisionOf(
      subject,
      patchedOf(command, { mode: 'waitFor', changed: false, evaluation: 'Unevaluable' }),
    )
    return isTag(holds, 'JudgmentPassed') &&
      isTag(fails, 'JudgmentPoll') &&
      isTag(unevaluable, 'JudgmentPoll')
  },
)
