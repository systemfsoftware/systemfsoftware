import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import type { ResolvedMode } from '@systemfsoftware/stryker-js-engine'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { FastCheck as fc } from 'effect/testing'
import type * as CliError from 'effect/unstable/cli/CliError'

import { isColorEnabled, isProgressEnabled, type ModeInput, resolveMode, type ToolVariable } from '../Output.js'
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

type DrawnModeInput = {
  readonly text: boolean
  readonly json: boolean
  readonly envMode: string | undefined
  readonly stdoutIsTTY: boolean
  readonly agent: string | undefined
  readonly toolVars: Readonly<Partial<Record<ToolVariable, string | undefined>>> | undefined
}

const toModeInput = (drawn: DrawnModeInput): ModeInput => {
  let result: ModeInput = { stdoutIsTTY: drawn.stdoutIsTTY, text: drawn.text, json: drawn.json }
  if (drawn.envMode !== undefined) {
    result = { ...result, envMode: drawn.envMode }
  }
  if (drawn.agent !== undefined) {
    result = { ...result, agent: drawn.agent }
  }
  if (drawn.toolVars !== undefined) {
    result = { ...result, toolVars: drawn.toolVars }
  }
  return result
}

const modeInputArb = fc.record({
  text: fc.boolean(),
  json: fc.boolean(),
  envMode: fc.option(fc.string(), { nil: undefined }),
  stdoutIsTTY: fc.boolean(),
  agent: fc.option(fc.string(), { nil: undefined }),
  toolVars: fc.option(
    fc.record({
      CLAUDECODE: fc.option(fc.string(), { nil: undefined }),
      CODEX_SANDBOX: fc.option(fc.string(), { nil: undefined }),
    }),
    { nil: undefined },
  ),
})

const resolvedModeArb = fc.record({
  mode: fc.constantFrom('human', 'machine'),
  signal: fc.constantFrom('flag', 'env', 'tty', 'agent', 'tool'),
  stdoutIsTTY: fc.boolean(),
})

const nonEmptyNoColorArb = fc.string({ minLength: 1 })

const noColorArb = fc.option(fc.string(), { nil: undefined })

const hasNonemptyToolVar = (toolVars: DrawnModeInput['toolVars']): boolean => {
  if (toolVars === undefined) {
    return false
  }
  for (const key of ['CLAUDECODE', 'CODEX_SANDBOX'] as const) {
    const value = toolVars[key]
    if (typeof value === 'string' && value.length > 0) {
      return true
    }
  }
  return false
}

const succeedsAs = (
  result: Result.Result<ResolvedMode, CliError.CliError>,
  mode: ResolvedMode['mode'],
  signal: ResolvedMode['signal'],
  stdoutIsTTY: boolean,
): boolean => {
  if (!Result.isSuccess(result)) {
    return false
  }
  return (
    result.success.mode === mode && result.success.signal === signal &&
    result.success.stdoutIsTTY === stdoutIsTTY
  )
}

describe('Output', () => {
  it.prop(
    '∀i_ResolveMode_≡LeftIffBothFlags',
    [modeInputArb],
    ([input]) => Result.isFailure(resolveMode(toModeInput(input))) === (input.text === true && input.json === true),
  )

  it.prop(
    '∀i_ResolvedMode_≡CarriesStdoutTty',
    [modeInputArb],
    ([input]) =>
      Result.match(resolveMode(toModeInput(input)), {
        onFailure: () => true,
        onSuccess: (resolved) => resolved.stdoutIsTTY === input.stdoutIsTTY,
      }),
  )

  it.prop('∀i_Precedence_≡R4Chain', [modeInputArb], ([input]) => {
    const result = resolveMode(toModeInput(input))
    if (input.text === true && input.json === true) {
      return Result.isFailure(result)
    }
    if (input.text === true) {
      return succeedsAs(result, 'human', 'flag', input.stdoutIsTTY)
    }
    if (input.json === true) {
      return succeedsAs(result, 'machine', 'flag', input.stdoutIsTTY)
    }
    if (input.envMode !== undefined && input.envMode.length > 0) {
      if (input.envMode === 'machine') {
        return succeedsAs(result, 'machine', 'env', input.stdoutIsTTY)
      }
      return succeedsAs(result, 'human', 'env', input.stdoutIsTTY)
    }
    if (!input.stdoutIsTTY) {
      return succeedsAs(result, 'machine', 'tty', false)
    }
    if (input.agent !== undefined && input.agent.length > 0) {
      return succeedsAs(result, 'machine', 'agent', true)
    }
    if (hasNonemptyToolVar(input.toolVars)) {
      return succeedsAs(result, 'machine', 'tool', true)
    }
    return succeedsAs(result, 'human', 'tty', true)
  })

  it.prop(
    '∀rn_NoColorNonEmpty_≡NeverColored',
    [resolvedModeArb, nonEmptyNoColorArb],
    ([resolved, noColor]) => isColorEnabled(resolved, noColor) === false,
  )

  it.prop('∀r_MachineMode_≡NeverColored', [resolvedModeArb, noColorArb], ([resolved, noColor]) => {
    if (resolved.mode === 'machine') {
      return isColorEnabled(resolved, noColor) === false
    }
    return true
  })

  it.prop('∀r_HumanNoNoColor_≡Colored', [resolvedModeArb], ([resolved]) => {
    if (resolved.mode === 'human') {
      return isColorEnabled(resolved, undefined) === true && isColorEnabled(resolved, '') === true
    }
    return true
  })

  it.prop(
    '∀r_ProgressEnabled_≡HumanOnTty',
    [resolvedModeArb],
    ([resolved]) => isProgressEnabled(resolved) === (resolved.mode === 'human' && resolved.stdoutIsTTY),
  )
})
