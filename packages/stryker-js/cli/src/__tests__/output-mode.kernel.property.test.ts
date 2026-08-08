import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import type { ResolvedMode } from '@systemfsoftware/stryker-js-mutation-run/output-mode'
import { FastCheck as fc } from 'effect'
import * as Either from 'effect/Either'
import { isDeepStrictEqual } from 'node:util'

import { isColorEnabled, isProgressEnabled, type ModeInput, resolveMode } from '../output-mode.kernel.js'

/**
 * The generated mode-input domain. Every signal slot ranges over its full
 * value space, so the laws below quantify over combinations the example test
 * (`output-mode.kernel.test.ts`) never enumerates — including flags on a TTY,
 * empty signals on a pipe, and both tool variables together.
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

const modeInputArb: fc.Arbitrary<DrawnModeInput> = fc.record({
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

const resolvedModeArb: fc.Arbitrary<ResolvedMode> = fc.record({
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
    ([input]) => Either.isLeft(resolveMode(toModeInput(input))) === (input.text === true && input.json === true),
  )

  it.prop(
    '∀i_ResolvedMode_≡CarriesStdoutTty',
    [modeInputArb],
    ([input]) =>
      Either.match(resolveMode(toModeInput(input)), {
        onLeft: () => true,
        onRight: (resolved) => resolved.stdoutIsTTY === input.stdoutIsTTY,
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
    ([input]) => Either.getOrThrow(resolveMode(toModeInput(input))).mode === 'human',
  )

  it.prop(
    '∀i_JsonFlag_≡MachineEverywhere',
    [modeInputArb.filter((i) => i.json === true && i.text === false)],
    ([input]) => Either.getOrThrow(resolveMode(toModeInput(input))).mode === 'machine',
  )

  it.prop('∀i_EnvMode_≡EnvSignalByLiteral', [
    flagFreeInputArb.filter((i) => i.envMode !== undefined && i.envMode.length > 0),
  ], ([input]) => {
    const resolved = Either.getOrThrow(resolveMode(toModeInput(input)))
    return resolved.signal === 'env' &&
      resolved.mode === (input.envMode === 'machine' ? 'machine' : 'human')
  })

  it.prop('∀i_NonTtyNoSignals_≡MachineTtySignal', [noSignalInputArb], ([input]) => {
    const resolved = Either.getOrThrow(resolveMode(toModeInput(input)))
    return resolved.mode === 'machine' && resolved.signal === 'tty'
  })

  it.prop('∀i_CleanTty_≡HumanTtySignal', [cleanTtyInputArb], ([input]) => {
    const resolved = Either.getOrThrow(resolveMode(toModeInput(input)))
    return resolved.mode === 'human' && resolved.signal === 'tty'
  })

  it.prop('∀i_AgentSetOnTty_≡MachineAgentSignal', [
    flagFreeInputArb.filter((i) =>
      i.envMode === undefined && i.stdoutIsTTY === true && i.agent !== undefined && i.agent.length > 0
    ),
  ], ([input]) => {
    const resolved = Either.getOrThrow(resolveMode(toModeInput(input)))
    return resolved.mode === 'machine' && resolved.signal === 'agent'
  })

  it.prop('∀i_ToolVariableSetOnTty_≡MachineToolSignal', [
    flagFreeInputArb.filter((i) =>
      i.envMode === undefined && i.stdoutIsTTY === true && (i.agent === undefined || i.agent === '') &&
      i.toolVars !== undefined && Object.values(i.toolVars).some((value) => value !== undefined && value.length > 0)
    ),
  ], ([input]) => {
    const resolved = Either.getOrThrow(resolveMode(toModeInput(input)))
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
