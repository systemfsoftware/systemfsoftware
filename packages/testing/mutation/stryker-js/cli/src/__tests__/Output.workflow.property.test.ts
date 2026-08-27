import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { FastCheck as fc } from 'effect/testing'

import { ResolveModeCommand, resolveModeWorkflow } from '../Output.workflow.js'

const CONFLICT_EXPECTED = 'the "--format text" and "--json" flags are mutually exclusive — use one or the other'

const TOOL_NAMES = ['CLAUDECODE', 'CODEX_SANDBOX'] as const

const hasNonemptyTool = (command: ResolveModeCommand): boolean => {
  const toolVars = command.toolVars ?? {}
  for (const variable of TOOL_NAMES) {
    const value = toolVars[variable]
    if (typeof value === 'string' && value.length > 0) {
      return true
    }
  }
  return false
}

const envSet = (command: ResolveModeCommand): boolean => command.envMode !== undefined && command.envMode.length > 0

const agentSet = (command: ResolveModeCommand): boolean => command.agent !== undefined && command.agent.length > 0

describe('resolveModeWorkflow', () => {
  it.prop('∀c_Command_≡R4Mode', [S.toArbitrary(ResolveModeCommand)(fc)], ([command]) => {
    const result = resolveModeWorkflow(command)
    if (command.text === true && command.json === true) {
      return (
        Result.isFailure(result) &&
        result.failure.option === 'json' &&
        result.failure.value === 'text' &&
        result.failure.expected === CONFLICT_EXPECTED
      )
    }
    if (command.text === true) {
      return (
        Result.isSuccess(result) &&
        result.success.mode === 'human' &&
        result.success.signal === 'flag' &&
        result.success.stdoutIsTTY === command.stdoutIsTTY
      )
    }
    if (command.json === true) {
      return (
        Result.isSuccess(result) &&
        result.success.mode === 'machine' &&
        result.success.signal === 'flag' &&
        result.success.stdoutIsTTY === command.stdoutIsTTY
      )
    }
    if (envSet(command)) {
      if (command.envMode === 'machine') {
        return (
          Result.isSuccess(result) &&
          result.success.mode === 'machine' &&
          result.success.signal === 'env' &&
          result.success.stdoutIsTTY === command.stdoutIsTTY
        )
      }
      return (
        Result.isSuccess(result) &&
        result.success.mode === 'human' &&
        result.success.signal === 'env' &&
        result.success.stdoutIsTTY === command.stdoutIsTTY
      )
    }
    if (!command.stdoutIsTTY) {
      return (
        Result.isSuccess(result) &&
        result.success.mode === 'machine' &&
        result.success.signal === 'tty' &&
        result.success.stdoutIsTTY === false
      )
    }
    if (agentSet(command)) {
      return (
        Result.isSuccess(result) &&
        result.success.mode === 'machine' &&
        result.success.signal === 'agent' &&
        result.success.stdoutIsTTY === true
      )
    }
    if (hasNonemptyTool(command)) {
      return (
        Result.isSuccess(result) &&
        result.success.mode === 'machine' &&
        result.success.signal === 'tool' &&
        result.success.stdoutIsTTY === true
      )
    }
    return (
      Result.isSuccess(result) &&
      result.success.mode === 'human' &&
      result.success.signal === 'tty' &&
      result.success.stdoutIsTTY === true
    )
  })
})
