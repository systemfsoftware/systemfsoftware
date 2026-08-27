import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { FastCheck as fc } from 'effect/testing'

import { ModeConflictError, modeDecision, ResolveModeCommand } from '../Output.workflow.js'

const ttyArb = fc.boolean()

describe('modeDecision', () => {
  it.prop('∀t_BothFlags_≡Conflict', [ttyArb], ([stdoutIsTTY]) => {
    const result = modeDecision(ResolveModeCommand.make({ stdoutIsTTY, text: true, json: true }))
    return Result.isFailure(result) && S.is(ModeConflictError)(result.failure)
  })

  it.prop('∀t_TextFlag_≡HumanFlag', [ttyArb], ([stdoutIsTTY]) => {
    const result = modeDecision(ResolveModeCommand.make({ stdoutIsTTY, text: true }))
    return Result.isSuccess(result) && result.success.mode === 'human' && result.success.signal === 'flag'
  })

  it.prop('∀t_JsonFlag_≡MachineFlag', [ttyArb], ([stdoutIsTTY]) => {
    const result = modeDecision(ResolveModeCommand.make({ stdoutIsTTY, json: true }))
    return Result.isSuccess(result) && result.success.mode === 'machine' && result.success.signal === 'flag'
  })

  it.prop('∀t_EnvMachine_≡MachineEnv', [ttyArb], ([stdoutIsTTY]) => {
    const result = modeDecision(ResolveModeCommand.make({ stdoutIsTTY, envMode: 'machine' }))
    return Result.isSuccess(result) && result.success.mode === 'machine' && result.success.signal === 'env'
  })

  it.prop('∀t_EnvHuman_≡HumanEnv', [ttyArb], ([stdoutIsTTY]) => {
    const result = modeDecision(ResolveModeCommand.make({ stdoutIsTTY, envMode: 'human' }))
    return Result.isSuccess(result) && result.success.mode === 'human' && result.success.signal === 'env'
  })

  it.prop('∀u_Pipe_≡MachineTty', [fc.constant(false)], ([stdoutIsTTY]) => {
    const result = modeDecision(ResolveModeCommand.make({ stdoutIsTTY }))
    return Result.isSuccess(result) && result.success.mode === 'machine' && result.success.signal === 'tty'
  })

  it.prop('∀a_AgentOnTty_≡MachineAgent', [fc.string({ minLength: 1, maxLength: 8 })], ([agent]) => {
    const result = modeDecision(ResolveModeCommand.make({ stdoutIsTTY: true, agent }))
    return Result.isSuccess(result) && result.success.mode === 'machine' && result.success.signal === 'agent'
  })

  it.prop('∀v_ClaudeCodeOnTty_≡MachineTool', [fc.string({ minLength: 1, maxLength: 8 })], ([value]) => {
    const result = modeDecision(
      ResolveModeCommand.make({ stdoutIsTTY: true, toolVars: { CLAUDECODE: value } }),
    )
    return Result.isSuccess(result) && result.success.mode === 'machine' && result.success.signal === 'tool'
  })

  it.prop('∀v_CodexOnTty_≡MachineTool', [fc.string({ minLength: 1, maxLength: 8 })], ([value]) => {
    const result = modeDecision(
      ResolveModeCommand.make({ stdoutIsTTY: true, toolVars: { CODEX_SANDBOX: value } }),
    )
    return Result.isSuccess(result) && result.success.mode === 'machine' && result.success.signal === 'tool'
  })

  it.prop('∀u_CleanTty_≡HumanTty', [fc.constant(true)], ([stdoutIsTTY]) => {
    const result = modeDecision(ResolveModeCommand.make({ stdoutIsTTY }))
    return Result.isSuccess(result) && result.success.mode === 'human' && result.success.signal === 'tty'
  })
})
