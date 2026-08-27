import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { FastCheck as fc } from 'effect/testing'

import {
  AlreadyClosed,
  Finding,
  FindingOrProgressCommand,
  findingOrProgressDecision,
  MachineOnly,
} from '../FindingOrProgress.workflow.js'

const optionalInt = fc.oneof(fc.constant(undefined), fc.integer({ min: 0, max: 1_000_000 }))
const optionalTotal = fc.oneof(fc.constant(undefined), fc.constant(null), fc.integer({ min: 0, max: 1_000_000 }))

const numberText = (value: number | null | undefined, fallback: string): string => {
  if (typeof value === 'number') {
    return String(value)
  }
  return fallback
}

const commandArb = fc.record({
  kind: fc.string(),
  alreadyClosed: fc.boolean(),
  total: optionalTotal,
  completed: optionalInt,
  elapsedMs: optionalInt,
  phase: fc.oneof(fc.constant(undefined), fc.string()),
  score: optionalTotal,
  killed: optionalInt,
  survived: optionalInt,
  error: fc.oneof(fc.constant(undefined), fc.string()),
})

const toCommand = (
  sample: typeof commandArb extends fc.Arbitrary<infer A> ? A : never,
  kind: string,
  alreadyClosed: boolean,
): FindingOrProgressCommand =>
  FindingOrProgressCommand.make({
    kind,
    alreadyClosed,
    total: sample.total,
    completed: sample.completed,
    elapsedMs: sample.elapsedMs,
    phase: sample.phase,
    score: sample.score,
    killed: sample.killed,
    survived: sample.survived,
    error: sample.error,
  })

describe('findingOrProgressDecision', () => {
  it.prop('∀c_Mutant_≡Finding', [commandArb], ([sample]) => {
    const result = findingOrProgressDecision(toCommand(sample, 'mutant', false))
    return Result.isFailure(result) && S.is(Finding)(result.failure)
  })

  it.prop('∀c_AlreadyClosed_≡AlreadyClosed', [commandArb], ([sample]) => {
    const result = findingOrProgressDecision(toCommand(sample, sample.kind, true))
    return Result.isFailure(result) && S.is(AlreadyClosed)(result.failure)
  })

  it.prop('∀c_Tick_≡ProgressLineStartsWithCompleted', [commandArb], ([sample]) => {
    const result = findingOrProgressDecision(toCommand(sample, 'tick', false))
    return (
      Result.isSuccess(result) &&
      result.success.line ===
        `${numberText(sample.completed, '0')}/${numberText(sample.total, '?')} elapsed ${
          numberText(sample.elapsedMs, '0')
        }ms`
    )
  })

  it.prop('∀c_Verdict_≡ScoreNotTheWordVerdict', [commandArb], ([sample]) => {
    const result = findingOrProgressDecision(toCommand(sample, 'verdict', false))
    return (
      Result.isSuccess(result) &&
      result.success.line ===
        `score ${numberText(sample.score, 'n/a')} killed ${numberText(sample.killed, '0')} survived ${
          numberText(sample.survived, '0')
        }`
    )
  })

  it.prop('∀c_Plan_≡ProgressPlanLine', [commandArb], ([sample]) => {
    const result = findingOrProgressDecision(toCommand(sample, 'plan', false))
    return Result.isSuccess(result) && result.success.line === `plan ${numberText(sample.total, '0')} mutants`
  })

  it.prop('∀c_Phase_≡ProgressPhaseLine', [commandArb], ([sample]) => {
    const result = findingOrProgressDecision(toCommand(sample, 'phase', false))
    if (typeof sample.phase === 'string') {
      return Result.isSuccess(result) && result.success.line === `phase ${sample.phase}`
    }
    return Result.isSuccess(result) && result.success.line === 'phase '
  })

  it.prop('∀c_Error_≡ProgressErrorLine', [commandArb], ([sample]) => {
    const result = findingOrProgressDecision(toCommand(sample, 'error', false))
    if (typeof sample.error === 'string') {
      return Result.isSuccess(result) && result.success.line === `error ${sample.error}`
    }
    return Result.isSuccess(result) && result.success.line === 'error '
  })

  it.prop('∀c_StreamKind_≡MachineOnly', [commandArb], ([sample]) => {
    const result = findingOrProgressDecision(toCommand(sample, 'stream', false))
    return Result.isFailure(result) && S.is(MachineOnly)(result.failure)
  })
})
