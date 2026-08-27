import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { FastCheck as fc } from 'effect/testing'

import {
  AlreadyClosed,
  Finding,
  FindingOrProgressCommand,
  findingOrProgressDecision,
} from '../FindingOrProgress.workflow.js'

const optionalInt = fc.oneof(fc.constant(undefined), fc.integer({ min: 0, max: 1_000_000 }))
const optionalTotal = fc.oneof(fc.constant(undefined), fc.constant(null), fc.integer({ min: 0, max: 1_000_000 }))

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
    if (!Result.isSuccess(result)) {
      return false
    }
    const completed = sample.completed
    if (typeof completed === 'number') {
      return result.success.line.startsWith(`${String(completed)}/`)
    }
    return result.success.line.startsWith('0/')
  })

  it.prop('∀c_Verdict_≡ScoreNotTheWordVerdict', [commandArb], ([sample]) => {
    const result = findingOrProgressDecision(toCommand(sample, 'verdict', false))
    if (!Result.isSuccess(result)) {
      return false
    }
    return result.success.line.startsWith('score ') && result.success.line !== 'verdict'
  })
})
