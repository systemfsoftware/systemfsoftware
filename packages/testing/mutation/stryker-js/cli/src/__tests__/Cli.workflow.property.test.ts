import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { FastCheck as fc } from 'effect/testing'

import {
  CliDispatchCommand,
  cliOperationDecision,
  HelpDecision,
  ManifestDecision,
  RunDecision,
  SurvivorsDecision,
} from '../Cli.workflow.js'

const extraArb = fc.array(fc.stringMatching(/^[A-Z][a-z]{1,6}$/), { maxLength: 3 })

const sameArgv = (got: readonly string[], expected: readonly string[]): boolean =>
  got.length === expected.length && got.every((arg, index) => arg === expected[index])

describe('cliOperationDecision', () => {
  it.prop('∀a_EmptyArgv_≡Help', [fc.constant<readonly string[]>([])], ([argv]) => {
    const result = cliOperationDecision(CliDispatchCommand.make({ argv }))
    return Result.isSuccess(result) && S.is(HelpDecision)(result.success) && sameArgv(result.success.argv, argv)
  })

  it.prop(
    '∀h_HelpOrVersionToken_≡Help',
    [fc.constantFrom('--help', '-h', 'help', '--version', '-v', 'version'), extraArb],
    ([token, tail]) => {
      const argv = [token, ...tail]
      const result = cliOperationDecision(CliDispatchCommand.make({ argv }))
      return Result.isSuccess(result) && S.is(HelpDecision)(result.success) && sameArgv(result.success.argv, argv)
    },
  )

  it.prop('∀t_HelpFlag_≡Help', [extraArb], ([tail]) => {
    const argv = ['run', '--help', ...tail]
    const result = cliOperationDecision(CliDispatchCommand.make({ argv }))
    return Result.isSuccess(result) && S.is(HelpDecision)(result.success) && sameArgv(result.success.argv, argv)
  })

  it.prop('∀t_Llms_≡Manifest', [extraArb], ([tail]) => {
    const argv = ['--llms', ...tail]
    const result = cliOperationDecision(CliDispatchCommand.make({ argv }))
    return Result.isSuccess(result) && S.is(ManifestDecision)(result.success) && sameArgv(result.success.argv, argv)
  })

  it.prop('∀t_LlmsCommand_≡Manifest', [extraArb], ([tail]) => {
    const argv = ['llms', ...tail]
    const result = cliOperationDecision(CliDispatchCommand.make({ argv }))
    return Result.isSuccess(result) && S.is(ManifestDecision)(result.success) && sameArgv(result.success.argv, argv)
  })

  it.prop('∀t_RunSurvivors_≡Survivors', [extraArb], ([tail]) => {
    const argv = ['run', '--survivors', ...tail]
    const result = cliOperationDecision(CliDispatchCommand.make({ argv }))
    return Result.isSuccess(result) && S.is(SurvivorsDecision)(result.success) && sameArgv(result.success.argv, argv)
  })

  it.prop('∀t_Run_≡Run', [extraArb], ([tail]) => {
    const argv = ['run', ...tail]
    const result = cliOperationDecision(CliDispatchCommand.make({ argv }))
    return Result.isSuccess(result) && S.is(RunDecision)(result.success) && sameArgv(result.success.argv, argv)
  })

  it.prop('∀f_UnknownLongOption_≡DispatchError', [fc.stringMatching(/^--x[a-z]{2,8}$/)], ([flag]) => {
    const result = cliOperationDecision(CliDispatchCommand.make({ argv: [flag] }))
    return (
      Result.isFailure(result) &&
      result.failure.message === `Unknown argument: '${flag}'` &&
      result.failure.arg === flag
    )
  })

  it.prop('∀f_UnknownShortOption_≡DispatchError', [fc.stringMatching(/^-[a-gi-uw-z]$/)], ([flag]) => {
    const result = cliOperationDecision(CliDispatchCommand.make({ argv: [flag] }))
    return (
      Result.isFailure(result) &&
      result.failure.message === `Unknown argument: '${flag}'` &&
      result.failure.arg === flag
    )
  })

  it.prop('∀c_UnknownCommand_≡DispatchError', [fc.stringMatching(/^z[a-z]{2,8}$/)], ([name]) => {
    const result = cliOperationDecision(CliDispatchCommand.make({ argv: [name] }))
    return (
      Result.isFailure(result) &&
      result.failure.message === `Unknown command: '${name}'` &&
      result.failure.arg === name
    )
  })
})
