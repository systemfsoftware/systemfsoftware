import * as ValidationError from '@effect/cli/ValidationError'
import * as Either from 'effect/Either'
import * as Option from 'effect/Option'
import { describe, expect, it } from 'vitest'

import { isColorEnabled, isProgressEnabled, type ModeInput, resolveMode } from '../output-mode.kernel.js'

const ttyInput = (overrides: Partial<ModeInput> = {}): ModeInput => ({
  stdoutIsTTY: true,
  ...overrides,
})

describe('resolveMode', () => {
  it('Should_ResolveHuman_When_TtyHasNoAgentVariables', () => {
    expect(Either.getOrThrow(resolveMode(ttyInput()))).toEqual({
      mode: 'human',
      signal: 'tty',
      stdoutIsTTY: true,
    })
  })

  it('Should_ResolveMachine_When_NonTtyStdoutRegardlessOfDetectionEnv', () => {
    const resolved = Either.getOrThrow(
      resolveMode({
        stdoutIsTTY: false,
        agent: '1',
        toolVars: { CLAUDECODE: '1' },
      }),
    )
    expect(resolved.mode).toBe('machine')
    expect(resolved.signal).toBe('tty')
    expect(resolved.stdoutIsTTY).toBe(false)
  })

  it('Should_ResolveHuman_When_EnvModeHumanOverridesNonTtyStdout', () => {
    expect(Either.getOrThrow(resolveMode({ stdoutIsTTY: false, envMode: 'human' }))).toEqual({
      mode: 'human',
      signal: 'env',
      stdoutIsTTY: false,
    })
  })

  it('Should_ResolveMachine_When_AgentVariableSetOnTty', () => {
    expect(Either.getOrThrow(resolveMode(ttyInput({ agent: '1' })))).toEqual({
      mode: 'machine',
      signal: 'agent',
      stdoutIsTTY: true,
    })
  })

  it('Should_ResolveHuman_When_AgentVariableEmptyOnTty', () => {
    expect(Either.getOrThrow(resolveMode(ttyInput({ agent: '' })))).toEqual({
      mode: 'human',
      signal: 'tty',
      stdoutIsTTY: true,
    })
  })

  it('Should_ResolveMachine_When_KnownToolVariableSetOnTty', () => {
    expect(Either.getOrThrow(resolveMode(ttyInput({ toolVars: { CODEX_SANDBOX: '1' } })))).toEqual({
      mode: 'machine',
      signal: 'tool',
      stdoutIsTTY: true,
    })
  })

  it('Should_ResolveHuman_When_TextFlagGivenOnPipe', () => {
    expect(Either.getOrThrow(resolveMode({ stdoutIsTTY: false, text: true }))).toEqual({
      mode: 'human',
      signal: 'flag',
      stdoutIsTTY: false,
    })
  })

  it('Should_ResolveMachine_When_JsonFlagGivenOnTty', () => {
    expect(Either.getOrThrow(resolveMode(ttyInput({ json: true })))).toEqual({
      mode: 'machine',
      signal: 'flag',
      stdoutIsTTY: true,
    })
  })

  it('Should_ReturnValidationError_When_JsonAndTextFlagsCombined', () => {
    const outcome = resolveMode(ttyInput({ json: true, text: true }))
    expect(Either.isLeft(outcome)).toEqual(true)
    expect(ValidationError.isValidationError(Option.getOrNull(Either.getLeft(outcome)))).toEqual(true)
  })

  it('Should_ResolveHuman_When_EnvModeHumanOverridesAgentVariable', () => {
    expect(Either.getOrThrow(resolveMode(ttyInput({ envMode: 'human', agent: '1' })))).toEqual({
      mode: 'human',
      signal: 'env',
      stdoutIsTTY: true,
    })
  })

  it('Should_ResolveMachine_When_EnvModeMachineOverridesTty', () => {
    expect(Either.getOrThrow(resolveMode(ttyInput({ envMode: 'machine' })))).toEqual({
      mode: 'machine',
      signal: 'env',
      stdoutIsTTY: true,
    })
  })

  it('Should_PreferExplicitFlag_When_EnvModeAlsoSet', () => {
    expect(Either.getOrThrow(resolveMode(ttyInput({ text: true, envMode: 'machine' })))).toEqual({
      mode: 'human',
      signal: 'flag',
      stdoutIsTTY: true,
    })
    expect(Either.getOrThrow(resolveMode(ttyInput({ json: true, envMode: 'human' })))).toEqual({
      mode: 'machine',
      signal: 'flag',
      stdoutIsTTY: true,
    })
  })

  it('Should_NotConsultStdin_When_ResolvingModeOnTty', () => {
    expect(Either.getOrThrow(resolveMode(ttyInput()))).toEqual({
      mode: 'human',
      signal: 'tty',
      stdoutIsTTY: true,
    })
  })

  it('Should_TreatEmptyEnvModeAsUnset_When_StdoutIsTTY', () => {
    expect(Either.getOrThrow(resolveMode(ttyInput({ envMode: '' })))).toEqual({
      mode: 'human',
      signal: 'tty',
      stdoutIsTTY: true,
    })
  })

  it('Should_TreatEmptyToolVariableAsUnset_When_StdoutIsTTY', () => {
    expect(Either.getOrThrow(resolveMode(ttyInput({ toolVars: { CLAUDECODE: '' } })))).toEqual({
      mode: 'human',
      signal: 'tty',
      stdoutIsTTY: true,
    })
  })
})

describe('TOOL_VARIABLES', () => {
  it('Should_ForceMachineMode_When_AnyKnownToolVariableIsSet', () => {
    expect(Either.getOrThrow(resolveMode(ttyInput({ toolVars: { CLAUDECODE: '1' } }))).mode).toBe('machine')
    expect(Either.getOrThrow(resolveMode(ttyInput({ toolVars: { CODEX_SANDBOX: '1' } }))).mode).toBe('machine')
  })
})

describe('isProgressEnabled', () => {
  it('Should_EnableProgressBar_When_HumanModeOnTty', () => {
    expect(isProgressEnabled(Either.getOrThrow(resolveMode(ttyInput())))).toBe(true)
    expect(isProgressEnabled(Either.getOrThrow(resolveMode({ stdoutIsTTY: false })))).toBe(false)
    expect(isProgressEnabled(Either.getOrThrow(resolveMode({ stdoutIsTTY: false, text: true })))).toBe(false)
    expect(isProgressEnabled(Either.getOrThrow(resolveMode(ttyInput({ agent: '1' }))))).toBe(false)
  })
})

describe('isColorEnabled (R8)', () => {
  it('Should_EnableColor_When_NoColorIsUnsetOrEmpty', () => {
    expect(isColorEnabled(Either.getOrThrow(resolveMode(ttyInput())), undefined)).toBe(true)
    expect(isColorEnabled(Either.getOrThrow(resolveMode(ttyInput())), '')).toBe(true)
  })

  it('Should_DisableColor_When_NoColorIsAnyNonEmptyValue', () => {
    expect(isColorEnabled(Either.getOrThrow(resolveMode(ttyInput())), '1')).toBe(false)
    expect(isColorEnabled(Either.getOrThrow(resolveMode(ttyInput())), '0')).toBe(false)
  })

  it('Should_DisableColor_When_MachineModeRegardlessOfNoColor', () => {
    expect(isColorEnabled(Either.getOrThrow(resolveMode(ttyInput({ agent: '1' }))), undefined)).toBe(false)
    expect(isColorEnabled(Either.getOrThrow(resolveMode({ stdoutIsTTY: false })), '')).toBe(false)
  })
})
