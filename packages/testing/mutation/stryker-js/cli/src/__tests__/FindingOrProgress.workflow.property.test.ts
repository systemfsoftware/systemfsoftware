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

const numberText = (value: number | null | undefined, fallback: string): string => {
  if (typeof value === 'number') {
    return String(value)
  }
  return fallback
}

const open = (command: FindingOrProgressCommand, kind: string): FindingOrProgressCommand =>
  FindingOrProgressCommand.make({
    kind,
    alreadyClosed: false,
    total: command.total,
    completed: command.completed,
    elapsedMs: command.elapsedMs,
    phase: command.phase,
    score: command.score,
    killed: command.killed,
    survived: command.survived,
    error: command.error,
  })

describe('findingOrProgressDecision', () => {
  it.prop('∀c_Mutant_≡Finding', [S.toArbitrary(FindingOrProgressCommand)(fc)], ([command]) => {
    const result = findingOrProgressDecision(open(command, 'mutant'))
    return Result.isFailure(result) && S.is(Finding)(result.failure)
  })

  it.prop('∀c_AlreadyClosed_≡AlreadyClosed', [S.toArbitrary(FindingOrProgressCommand)(fc)], ([command]) => {
    const result = findingOrProgressDecision(
      FindingOrProgressCommand.make({
        kind: command.kind,
        alreadyClosed: true,
        total: command.total,
        completed: command.completed,
        elapsedMs: command.elapsedMs,
        phase: command.phase,
        score: command.score,
        killed: command.killed,
        survived: command.survived,
        error: command.error,
      }),
    )
    return Result.isFailure(result) && S.is(AlreadyClosed)(result.failure)
  })

  it.prop('∀c_Tick_≡ProgressLine', [S.toArbitrary(FindingOrProgressCommand)(fc)], ([command]) => {
    const result = findingOrProgressDecision(open(command, 'tick'))
    return (
      Result.isSuccess(result) &&
      result.success.line ===
        `${numberText(command.completed, '0')}/${numberText(command.total, '?')} elapsed ${
          numberText(command.elapsedMs, '0')
        }ms`
    )
  })

  it.prop('∀c_Verdict_≡ScoreLine', [S.toArbitrary(FindingOrProgressCommand)(fc)], ([command]) => {
    const result = findingOrProgressDecision(open(command, 'verdict'))
    return (
      Result.isSuccess(result) &&
      result.success.line ===
        `score ${numberText(command.score, 'n/a')} killed ${numberText(command.killed, '0')} survived ${
          numberText(command.survived, '0')
        }`
    )
  })

  it.prop('∀c_Plan_≡PlanLine', [S.toArbitrary(FindingOrProgressCommand)(fc)], ([command]) => {
    const result = findingOrProgressDecision(open(command, 'plan'))
    return Result.isSuccess(result) && result.success.line === `plan ${numberText(command.total, '0')} mutants`
  })

  it.prop('∀c_Phase_≡PhaseLine', [S.toArbitrary(FindingOrProgressCommand)(fc)], ([command]) => {
    const result = findingOrProgressDecision(open(command, 'phase'))
    if (typeof command.phase === 'string') {
      return Result.isSuccess(result) && result.success.line === `phase ${command.phase}`
    }
    return Result.isSuccess(result) && result.success.line === 'phase '
  })

  it.prop('∀c_Error_≡ErrorLine', [S.toArbitrary(FindingOrProgressCommand)(fc)], ([command]) => {
    const result = findingOrProgressDecision(open(command, 'error'))
    if (typeof command.error === 'string') {
      return Result.isSuccess(result) && result.success.line === `error ${command.error}`
    }
    return Result.isSuccess(result) && result.success.line === 'error '
  })

  it.prop('∀c_StreamKind_≡MachineOnly', [S.toArbitrary(FindingOrProgressCommand)(fc)], ([command]) => {
    const result = findingOrProgressDecision(open(command, 'stream'))
    return Result.isFailure(result) && S.is(MachineOnly)(result.failure)
  })
})
