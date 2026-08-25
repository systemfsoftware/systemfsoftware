import * as Result from 'effect/Result'
import * as CliError from 'effect/unstable/cli/CliError'

import { type ResolvedMode } from '@systemfsoftware/stryker-js-mutation-run'

/**
 * The known tool variables. Narrow per the plan — exactly
 * `['CLAUDECODE', 'CODEX_SANDBOX']` — and load-bearing rather than a
 * fallback: they cover the PTY-allocating harnesses a stdin condition would
 * have rescued.
 */
export const TOOL_VARIABLES = ['CLAUDECODE', 'CODEX_SANDBOX'] as const

export type ToolVariable = (typeof TOOL_VARIABLES)[number]

export interface FormatFlags {
  readonly text?: boolean
  readonly json?: boolean
}

export interface ModeInput extends FormatFlags {
  readonly envMode?: string
  readonly stdoutIsTTY: boolean
  readonly agent?: string
  readonly toolVars?: Readonly<Partial<Record<ToolVariable, string | undefined>>>
}

/**
 * Resolves the output mode by R4 precedence. Pure — reads nothing, so it is
 * fully testable; the caller supplies every input once at startup. The
 * mutually-exclusive-flags case is a caller error, returned as a `failure` so
 * the function stays total.
 */
export function resolveMode(
  input: ModeInput,
): Result.Result<ResolvedMode, CliError.CliError> {
  // The two flags contradict each other and are a caller error, never a
  // silent winner.
  if (input.text === true && input.json === true) {
    return Result.fail(
      CliError.InvalidValue.make({
        option: 'json',
        value: 'text',
        expected: 'the "--format text" and "--json" flags are mutually exclusive — use one or the other',
        kind: 'flag',
      }),
    )
  }
  if (input.text === true) {
    return Result.succeed({ mode: 'human', signal: 'flag', stdoutIsTTY: input.stdoutIsTTY })
  }
  if (input.json === true) {
    return Result.succeed({ mode: 'machine', signal: 'flag', stdoutIsTTY: input.stdoutIsTTY })
  }
  // Set-but-empty falls through to detection, the same way an empty AGENT
  // does; only the literal 'machine' activates machine mode.
  if (input.envMode !== undefined && input.envMode.length > 0) {
    return Result.succeed({
      mode: input.envMode === 'machine' ? 'machine' : 'human',
      signal: 'env',
      stdoutIsTTY: input.stdoutIsTTY,
    })
  }
  // Stdout is the primary signal — it is what the output is written to.
  if (!input.stdoutIsTTY) {
    return Result.succeed({ mode: 'machine', signal: 'tty', stdoutIsTTY: false })
  }
  // AGENT is additive: any non-empty value means machine mode.
  if (input.agent !== undefined && input.agent.length > 0) {
    return Result.succeed({ mode: 'machine', signal: 'agent', stdoutIsTTY: true })
  }
  for (const variable of TOOL_VARIABLES) {
    const value = input.toolVars?.[variable]
    if (value !== undefined && value.length > 0) {
      return Result.succeed({ mode: 'machine', signal: 'tool', stdoutIsTTY: true })
    }
  }
  return Result.succeed({ mode: 'human', signal: 'tty', stdoutIsTTY: true })
}

/**
 * The progress bar's gate. Human mode on a non-TTY stdout (AE1) must not leak
 * its control sequences into a pipe, and machine mode keeps stdout clean for
 * the verdict envelope (R5). Decided from the resolved mode's own detection
 * data — never a second `isTTY` probe.
 */
export function isProgressEnabled(resolved: ResolvedMode): boolean {
  return resolved.mode === 'human' && resolved.stdoutIsTTY
}

/**
 * The log colouriser's gate (R8). Machine mode never emits colour, so a
 * harness merging `2>&1` is not handed escape sequences it must strip, and
 * `NO_COLOR` is honoured for the human path per the convention: any value
 * other than an unset or empty variable disables colour.
 */
export function isColorEnabled(resolved: ResolvedMode, noColor: string | undefined): boolean {
  return resolved.mode === 'human' && (noColor === undefined || noColor.length === 0)
}

/** The example suite's canonical TTY input. */
const ttyInput = (overrides: Partial<ModeInput> = {}): ModeInput => ({
  stdoutIsTTY: true,
  ...overrides,
})

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`,
  // so this branch is statically dead in the build and the runner never enters
  // the published module graph. A static import would ship it.
  const { describe, it } = await import('@systemfsoftware/effect-gherkin-spec')
  const { expect } = await import('vitest')
  const { FastCheck: fc } = await import('effect/testing')
  const { isDeepStrictEqual } = await import('node:util')
  const Result = await import('effect/Result')
  const Option = await import('effect/Option')
  const CliError = await import('effect/unstable/cli/CliError')

  /**
   * The generated mode-input domain. Every signal slot ranges over its full
   * value space, so the laws below quantify over combinations the example tests
   * never enumerate — including flags on a TTY, empty signals on a pipe, and
   * both tool variables together.
   *
   * The drawn record carries every slot as `T | undefined`; `toModeInput` drops
   * the undefined slots so the value satisfies `ModeInput` under the package's
   * exact-optional-property typecheck (a present `undefined` property is not an
   * absent one).
   */
  type DrawnModeInput = {
    text: boolean
    json: boolean
    envMode: string | undefined
    stdoutIsTTY: boolean
    agent: string | undefined
    toolVars: Readonly<Record<string, string | undefined>> | undefined
  }

  const toModeInput = (drawn: DrawnModeInput): ModeInput => ({
    stdoutIsTTY: drawn.stdoutIsTTY,
    text: drawn.text,
    json: drawn.json,
    ...(drawn.envMode === undefined ? {} : { envMode: drawn.envMode }),
    ...(drawn.agent === undefined ? {} : { agent: drawn.agent }),
    ...(drawn.toolVars === undefined ? {} : { toolVars: drawn.toolVars }),
  })
  const envModeArb = fc.oneof(
    fc.constant(undefined),
    fc.constant(''),
    fc.constant('machine'),
    fc.constant('human'),
    fc.constant('MACHINE'),
    fc.constant('other'),
  )

  const agentArb = fc.oneof(
    fc.constant(undefined),
    fc.constant(''),
    fc.constant('1'),
  )

  const toolVarsArb = fc.oneof(
    fc.constant(undefined),
    fc.constant({}),
    fc.constant({ CLAUDECODE: '' }),
    fc.constant({ CLAUDECODE: '1' }),
    fc.constant({ CODEX_SANDBOX: '1' }),
    fc.constant({ CLAUDECODE: '1', CODEX_SANDBOX: '' }),
  )

  const modeInputArb = fc.record({
    text: fc.boolean(),
    json: fc.boolean(),
    envMode: envModeArb,
    stdoutIsTTY: fc.boolean(),
    agent: agentArb,
    toolVars: toolVarsArb,
  })

  const flagFreeInputArb = modeInputArb.filter((input) => input.text === false && input.json === false)

  const noSignalInputArb = flagFreeInputArb.filter(
    (input) => input.envMode === undefined && input.stdoutIsTTY === false,
  )

  const cleanTtyInputArb = flagFreeInputArb.filter(
    (input) =>
      input.envMode === undefined && input.stdoutIsTTY === true &&
      (input.agent === undefined || input.agent === '') && input.toolVars === undefined,
  )

  const resolvedModeArb = fc.record({
    mode: fc.constantFrom('human', 'machine'),
    signal: fc.constantFrom('flag', 'env', 'tty', 'agent', 'tool'),
    stdoutIsTTY: fc.boolean(),
  })

  const noColorArb = fc.oneof(
    fc.constant(undefined),
    fc.constant(''),
    fc.constant('0'),
    fc.constant('1'),
    fc.string({ maxLength: 6 }),
  )

  describe('resolveMode — totality over the generated domain', () => {
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

    it.prop('∀i_EmptyEnvMode_≡Unset', [modeInputArb], ([input]) =>
      isDeepStrictEqual(
        resolveMode(toModeInput({ ...input, envMode: '' })),
        resolveMode(toModeInput({ ...input, envMode: undefined })),
      ))

    it.prop('∀i_EmptyAgent_≡Unset', [modeInputArb], ([input]) =>
      isDeepStrictEqual(
        resolveMode(toModeInput({ ...input, agent: '' })),
        resolveMode(toModeInput({ ...input, agent: undefined })),
      ))

    it.prop('∀i_EmptyToolVariable_≡Absent', [modeInputArb], ([input]) =>
      isDeepStrictEqual(
        resolveMode(toModeInput({ ...input, toolVars: { CLAUDECODE: '' } })),
        resolveMode(toModeInput({ ...input, toolVars: undefined })),
      ))
  })

  describe('resolveMode — precedence over every signal combination', () => {
    it.prop(
      '∀i_TextFlag_≡HumanEverywhere',
      [modeInputArb.filter((i) => i.text === true && i.json === false)],
      ([input]) => Result.getOrThrow(resolveMode(toModeInput(input))).mode === 'human',
    )

    it.prop(
      '∀i_JsonFlag_≡MachineEverywhere',
      [modeInputArb.filter((i) => i.json === true && i.text === false)],
      ([input]) => Result.getOrThrow(resolveMode(toModeInput(input))).mode === 'machine',
    )

    it.prop('∀i_EnvMode_≡EnvSignalByLiteral', [
      flagFreeInputArb.filter((i) => i.envMode !== undefined && i.envMode.length > 0),
    ], ([input]) => {
      const resolved = Result.getOrThrow(resolveMode(toModeInput(input)))
      return resolved.signal === 'env' &&
        resolved.mode === (input.envMode === 'machine' ? 'machine' : 'human')
    })

    it.prop('∀i_NonTtyNoSignals_≡MachineTtySignal', [noSignalInputArb], ([input]) => {
      const resolved = Result.getOrThrow(resolveMode(toModeInput(input)))
      return resolved.mode === 'machine' && resolved.signal === 'tty'
    })

    it.prop('∀i_CleanTty_≡HumanTtySignal', [cleanTtyInputArb], ([input]) => {
      const resolved = Result.getOrThrow(resolveMode(toModeInput(input)))
      return resolved.mode === 'human' && resolved.signal === 'tty'
    })

    it.prop('∀i_AgentSetOnTty_≡MachineAgentSignal', [
      flagFreeInputArb.filter((i) =>
        i.envMode === undefined && i.stdoutIsTTY === true && i.agent !== undefined && i.agent.length > 0
      ),
    ], ([input]) => {
      const resolved = Result.getOrThrow(resolveMode(toModeInput(input)))
      return resolved.mode === 'machine' && resolved.signal === 'agent'
    })

    it.prop('∀i_ToolVariableSetOnTty_≡MachineToolSignal', [
      flagFreeInputArb.filter((i) =>
        i.envMode === undefined && i.stdoutIsTTY === true && (i.agent === undefined || i.agent === '') &&
        i.toolVars !== undefined && Object.values(i.toolVars).some((value) => value !== undefined && value.length > 0)
      ),
    ], ([input]) => {
      const resolved = Result.getOrThrow(resolveMode(toModeInput(input)))
      return resolved.mode === 'machine' && resolved.signal === 'tool'
    })
  })

  describe('output gates — quantified over every resolved mode and NO_COLOR value', () => {
    it.prop(
      '∀r_MachineMode_≡NeverColored',
      [resolvedModeArb, noColorArb],
      ([resolved, noColor]) => resolved.mode === 'machine' ? !isColorEnabled(resolved, noColor) : true,
    )

    it.prop(
      '∀rn_NoColorNonEmpty_≡NeverColored',
      [resolvedModeArb, noColorArb],
      ([resolved, noColor]) => noColor !== undefined && noColor.length > 0 ? !isColorEnabled(resolved, noColor) : true,
    )

    it.prop('∀r_HumanNoNoColor_≡Colored', [resolvedModeArb], ([resolved]) =>
      resolved.mode === 'human'
        ? isColorEnabled(resolved, undefined) && isColorEnabled(resolved, '')
        : true)

    it.prop(
      '∀r_ProgressEnabled_≡HumanOnTty',
      [resolvedModeArb],
      ([resolved]) => isProgressEnabled(resolved) ? resolved.mode === 'human' && resolved.stdoutIsTTY : true,
    )
  })

  // The example suite, converted verbatim from the deleted example test file.
  describe('resolveMode (examples)', () => {
    it('Should_ResolveHuman_When_TtyHasNoAgentVariables', () => {
      expect(Result.getOrThrow(resolveMode(ttyInput()))).toEqual({
        mode: 'human',
        signal: 'tty',
        stdoutIsTTY: true,
      })
    })

    it('Should_ResolveMachine_When_NonTtyStdoutRegardlessOfDetectionEnv', () => {
      const resolved = Result.getOrThrow(
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
      expect(Result.getOrThrow(resolveMode({ stdoutIsTTY: false, envMode: 'human' }))).toEqual({
        mode: 'human',
        signal: 'env',
        stdoutIsTTY: false,
      })
    })

    it('Should_ResolveMachine_When_AgentVariableSetOnTty', () => {
      expect(Result.getOrThrow(resolveMode(ttyInput({ agent: '1' })))).toEqual({
        mode: 'machine',
        signal: 'agent',
        stdoutIsTTY: true,
      })
    })

    it('Should_ResolveHuman_When_AgentVariableEmptyOnTty', () => {
      expect(Result.getOrThrow(resolveMode(ttyInput({ agent: '' })))).toEqual({
        mode: 'human',
        signal: 'tty',
        stdoutIsTTY: true,
      })
    })

    it('Should_ResolveMachine_When_KnownToolVariableSetOnTty', () => {
      expect(Result.getOrThrow(resolveMode(ttyInput({ toolVars: { CODEX_SANDBOX: '1' } })))).toEqual({
        mode: 'machine',
        signal: 'tool',
        stdoutIsTTY: true,
      })
    })

    it('Should_ResolveHuman_When_TextFlagGivenOnPipe', () => {
      expect(Result.getOrThrow(resolveMode({ stdoutIsTTY: false, text: true }))).toEqual({
        mode: 'human',
        signal: 'flag',
        stdoutIsTTY: false,
      })
    })

    it('Should_ResolveMachine_When_JsonFlagGivenOnTty', () => {
      expect(Result.getOrThrow(resolveMode(ttyInput({ json: true })))).toEqual({
        mode: 'machine',
        signal: 'flag',
        stdoutIsTTY: true,
      })
    })

    it('Should_ReturnValidationError_When_JsonAndTextFlagsCombined', () => {
      const outcome = resolveMode(ttyInput({ json: true, text: true }))
      expect(Result.isFailure(outcome)).toEqual(true)
      expect(CliError.isCliError(Option.getOrNull(Result.getFailure(outcome)))).toEqual(true)
    })

    it('Should_ResolveHuman_When_EnvModeHumanOverridesAgentVariable', () => {
      expect(Result.getOrThrow(resolveMode(ttyInput({ envMode: 'human', agent: '1' })))).toEqual({
        mode: 'human',
        signal: 'env',
        stdoutIsTTY: true,
      })
    })

    it('Should_ResolveMachine_When_EnvModeMachineOverridesTty', () => {
      expect(Result.getOrThrow(resolveMode(ttyInput({ envMode: 'machine' })))).toEqual({
        mode: 'machine',
        signal: 'env',
        stdoutIsTTY: true,
      })
    })

    it('Should_PreferExplicitFlag_When_EnvModeAlsoSet', () => {
      expect(Result.getOrThrow(resolveMode(ttyInput({ text: true, envMode: 'machine' })))).toEqual({
        mode: 'human',
        signal: 'flag',
        stdoutIsTTY: true,
      })
      expect(Result.getOrThrow(resolveMode(ttyInput({ json: true, envMode: 'human' })))).toEqual({
        mode: 'machine',
        signal: 'flag',
        stdoutIsTTY: true,
      })
    })

    it('Should_TreatEmptyEnvModeAsUnset_When_StdoutIsTTY', () => {
      expect(Result.getOrThrow(resolveMode(ttyInput({ envMode: '' })))).toEqual({
        mode: 'human',
        signal: 'tty',
        stdoutIsTTY: true,
      })
    })

    it('Should_TreatEmptyToolVariableAsUnset_When_StdoutIsTTY', () => {
      expect(Result.getOrThrow(resolveMode(ttyInput({ toolVars: { CLAUDECODE: '' } })))).toEqual({
        mode: 'human',
        signal: 'tty',
        stdoutIsTTY: true,
      })
    })
  })

  describe('output gates (examples)', () => {
    it('Should_ForceMachineMode_When_AnyKnownToolVariableIsSet', () => {
      expect(Result.getOrThrow(resolveMode(ttyInput({ toolVars: { CLAUDECODE: '1' } }))).mode).toBe('machine')
      expect(Result.getOrThrow(resolveMode(ttyInput({ toolVars: { CODEX_SANDBOX: '1' } }))).mode).toBe('machine')
    })

    it('Should_EnableProgressBar_When_HumanModeOnTty', () => {
      expect(isProgressEnabled(Result.getOrThrow(resolveMode(ttyInput())))).toBe(true)
      expect(isProgressEnabled(Result.getOrThrow(resolveMode({ stdoutIsTTY: false })))).toBe(false)
      expect(isProgressEnabled(Result.getOrThrow(resolveMode({ stdoutIsTTY: false, text: true })))).toBe(false)
      expect(isProgressEnabled(Result.getOrThrow(resolveMode(ttyInput({ agent: '1' }))))).toBe(false)
    })

    it('Should_EnableColor_When_NoColorIsUnsetOrEmpty', () => {
      expect(isColorEnabled(Result.getOrThrow(resolveMode(ttyInput())), undefined)).toBe(true)
      expect(isColorEnabled(Result.getOrThrow(resolveMode(ttyInput())), '')).toBe(true)
    })

    it('Should_DisableColor_When_NoColorIsAnyNonEmptyValue', () => {
      expect(isColorEnabled(Result.getOrThrow(resolveMode(ttyInput())), '1')).toBe(false)
      expect(isColorEnabled(Result.getOrThrow(resolveMode(ttyInput())), '0')).toBe(false)
    })

    it('Should_DisableColor_When_MachineModeRegardlessOfNoColor', () => {
      expect(isColorEnabled(Result.getOrThrow(resolveMode(ttyInput({ agent: '1' }))), undefined)).toBe(false)
      expect(isColorEnabled(Result.getOrThrow(resolveMode({ stdoutIsTTY: false })), '')).toBe(false)
    })
  })
}
