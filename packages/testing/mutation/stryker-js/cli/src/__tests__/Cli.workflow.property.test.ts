import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { FastCheck as fc } from 'effect/testing'

import {
  CliDispatchCommand,
  cliOperationDecision,
  DispatchError,
  HelpDecision,
  ManifestDecision,
  RunDecision,
  SurvivorsDecision,
} from '../Cli.workflow.js'

const extraArb = fc.array(fc.stringMatching(/^[A-Z][a-z]{1,6}$/), { maxLength: 3 })

describe('cliOperationDecision', () => {
  it.prop('∀a_EmptyArgv_≡Help', [fc.constant<readonly string[]>([])], ([argv]) => {
    const result = cliOperationDecision(CliDispatchCommand.make({ argv }))
    return Result.isSuccess(result) && S.is(HelpDecision)(result.success)
  })

  it.prop('∀t_HelpFlag_≡Help', [extraArb], ([tail]) => {
    const result = cliOperationDecision(CliDispatchCommand.make({ argv: ['run', '--help', ...tail] }))
    return Result.isSuccess(result) && S.is(HelpDecision)(result.success)
  })

  it.prop('∀t_Llms_≡Manifest', [extraArb], ([tail]) => {
    const result = cliOperationDecision(CliDispatchCommand.make({ argv: ['--llms', ...tail] }))
    return Result.isSuccess(result) && S.is(ManifestDecision)(result.success)
  })

  it.prop('∀t_RunSurvivors_≡Survivors', [extraArb], ([tail]) => {
    const result = cliOperationDecision(CliDispatchCommand.make({ argv: ['run', '--survivors', ...tail] }))
    return Result.isSuccess(result) && S.is(SurvivorsDecision)(result.success)
  })

  it.prop('∀t_Run_≡Run', [extraArb], ([tail]) => {
    const result = cliOperationDecision(CliDispatchCommand.make({ argv: ['run', ...tail] }))
    return Result.isSuccess(result) && S.is(RunDecision)(result.success)
  })

  it.prop('∀f_UnknownLongOption_≡DispatchError', [fc.stringMatching(/^--x[a-z]{2,8}$/)], ([flag]) => {
    const result = cliOperationDecision(CliDispatchCommand.make({ argv: [flag] }))
    return Result.isFailure(result) && S.is(DispatchError)(result.failure)
  })

  it.prop('∀c_UnknownCommand_≡DispatchError', [fc.stringMatching(/^z[a-z]{2,8}$/)], ([name]) => {
    const result = cliOperationDecision(CliDispatchCommand.make({ argv: [name] }))
    return Result.isFailure(result) && S.is(DispatchError)(result.failure)
  })
})
