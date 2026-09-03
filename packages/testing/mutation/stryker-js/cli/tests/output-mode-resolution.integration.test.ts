import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import type { ResolvedMode } from '@systemfsoftware/stryker-js-engine'
import { Effect, Equal } from 'effect'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as CliError from 'effect/unstable/cli/CliError'
import { expect } from 'vitest'

import { isColorEnabled, isProgressEnabled, type ModeInput, resolveMode } from './__fixtures__/output-subject.js'

const checkExpect = expect

const Feature = makeFeature({ it, layer })

const ttyInput = (overrides: Partial<ModeInput> = {}): ModeInput => ({
  stdoutIsTTY: true,
  ...overrides,
})

Feature('Resolving the output mode').body(({ scenario }) => {
  scenario(
    'A TTY with no agent variables resolves human on the TTY signal',
    Gherkin.Do.pipe(
      Given('a TTY with no agent variables')('input', () => Effect.succeed(ttyInput())),
      When('the mode is resolved')(
        'resolved',
        (s: { input: ModeInput }) => Effect.succeed(Result.getOrThrow(resolveMode(s.input))),
      ),
      Then('the mode is human on the TTY signal')((s: { resolved: ResolvedMode }) => {
        checkExpect(s.resolved).toEqual({ mode: 'human', signal: 'tty', stdoutIsTTY: true })
      }),
    ),
  )

  scenario(
    'A pipe stays machine on the TTY signal when agent and tool detection are set',
    Gherkin.Do.pipe(
      Given('a pipe with agent and tool detection set')(
        'input',
        () => Effect.succeed({ stdoutIsTTY: false, agent: '1', toolVars: { CLAUDECODE: '1' } }),
      ),
      When('the mode is resolved')(
        'resolved',
        (s: { input: ModeInput }) => Effect.succeed(Result.getOrThrow(resolveMode(s.input))),
      ),
      Then('the mode is machine and still carries the pipe probe')((s: { resolved: ResolvedMode }) => {
        checkExpect(s.resolved.mode).toBe('machine')
        checkExpect(s.resolved.signal).toBe('tty')
        checkExpect(s.resolved.stdoutIsTTY).toBe(false)
      }),
    ),
  )

  scenario(
    'Human env mode overrides a pipe',
    Gherkin.Do.pipe(
      Given('a pipe with the env mode set to human')(
        'input',
        () => Effect.succeed({ stdoutIsTTY: false, envMode: 'human' }),
      ),
      When('the mode is resolved')(
        'resolved',
        (s: { input: ModeInput }) => Effect.succeed(Result.getOrThrow(resolveMode(s.input))),
      ),
      Then('the mode is human on the env signal')((s: { resolved: ResolvedMode }) => {
        checkExpect(s.resolved).toEqual({ mode: 'human', signal: 'env', stdoutIsTTY: false })
      }),
    ),
  )

  scenario(
    'A set agent variable on a TTY resolves machine on the agent signal',
    Gherkin.Do.pipe(
      Given('a TTY with the agent variable set')('input', () => Effect.succeed(ttyInput({ agent: '1' }))),
      When('the mode is resolved')(
        'resolved',
        (s: { input: ModeInput }) => Effect.succeed(Result.getOrThrow(resolveMode(s.input))),
      ),
      Then('the mode is machine on the agent signal')((s: { resolved: ResolvedMode }) => {
        checkExpect(s.resolved).toEqual({ mode: 'machine', signal: 'agent', stdoutIsTTY: true })
      }),
    ),
  )

  scenario(
    'An empty agent variable on a TTY resolves human on the TTY signal',
    Gherkin.Do.pipe(
      Given('a TTY with an empty agent variable')('input', () => Effect.succeed(ttyInput({ agent: '' }))),
      When('the mode is resolved')(
        'resolved',
        (s: { input: ModeInput }) => Effect.succeed(Result.getOrThrow(resolveMode(s.input))),
      ),
      Then('the mode is human on the TTY signal')((s: { resolved: ResolvedMode }) => {
        checkExpect(s.resolved).toEqual({ mode: 'human', signal: 'tty', stdoutIsTTY: true })
      }),
    ),
  )

  scenario(
    'A known tool variable on a TTY resolves machine on the tool signal',
    Gherkin.Do.pipe(
      Given('a TTY with a known tool variable set')(
        'input',
        () => Effect.succeed(ttyInput({ toolVars: { CODEX_SANDBOX: '1' } })),
      ),
      When('the mode is resolved')(
        'resolved',
        (s: { input: ModeInput }) => Effect.succeed(Result.getOrThrow(resolveMode(s.input))),
      ),
      Then('the mode is machine on the tool signal')((s: { resolved: ResolvedMode }) => {
        checkExpect(s.resolved).toEqual({ mode: 'machine', signal: 'tool', stdoutIsTTY: true })
      }),
    ),
  )

  scenario(
    'The text flag on a pipe resolves human on the flag signal',
    Gherkin.Do.pipe(
      Given('a pipe with the text flag')('input', () => Effect.succeed({ stdoutIsTTY: false, text: true })),
      When('the mode is resolved')(
        'resolved',
        (s: { input: ModeInput }) => Effect.succeed(Result.getOrThrow(resolveMode(s.input))),
      ),
      Then('the mode is human on the flag signal')((s: { resolved: ResolvedMode }) => {
        checkExpect(s.resolved).toEqual({ mode: 'human', signal: 'flag', stdoutIsTTY: false })
      }),
    ),
  )

  scenario(
    'The JSON flag on a TTY resolves machine on the flag signal',
    Gherkin.Do.pipe(
      Given('a TTY with the JSON flag')('input', () => Effect.succeed(ttyInput({ json: true }))),
      When('the mode is resolved')(
        'resolved',
        (s: { input: ModeInput }) => Effect.succeed(Result.getOrThrow(resolveMode(s.input))),
      ),
      Then('the mode is machine on the flag signal')((s: { resolved: ResolvedMode }) => {
        checkExpect(s.resolved).toEqual({ mode: 'machine', signal: 'flag', stdoutIsTTY: true })
      }),
    ),
  )

  scenario(
    'Combining JSON and text flags fails with a CLI error',
    Gherkin.Do.pipe(
      Given('a TTY asking for both JSON and text')('input', () => Effect.succeed(ttyInput({ json: true, text: true }))),
      When('the mode is resolved')('outcome', (s: { input: ModeInput }) => Effect.succeed(resolveMode(s.input))),
      Then('resolution refuses the combination as a CLI error')(
        (s: { outcome: Result.Result<ResolvedMode, CliError.CliError> }) => {
          checkExpect(Result.isFailure(s.outcome)).toEqual(true)
          checkExpect(CliError.isCliError(Option.getOrNull(Result.getFailure(s.outcome)))).toEqual(true)
        },
      ),
    ),
  )

  scenario(
    'Combined flags fail no matter which other signals are set',
    Gherkin.Do.pipe(
      Given('combined flags beside env, agent and tool signals')('inputs', () =>
        Effect.succeed({
          withEnv: ttyInput({ json: true, text: true, envMode: 'human' }),
          onPipe: { stdoutIsTTY: false, json: true, text: true },
        })),
      When('both modes are resolved')(
        'outcomes',
        (s: { inputs: { withEnv: ModeInput; onPipe: ModeInput } }) =>
          Effect.succeed({
            withEnv: resolveMode(s.inputs.withEnv),
            onPipe: resolveMode(s.inputs.onPipe),
          }),
      ),
      Then('both resolutions fail')(
        (s: {
          outcomes: {
            withEnv: Result.Result<ResolvedMode, CliError.CliError>
            onPipe: Result.Result<ResolvedMode, CliError.CliError>
          }
        }) => {
          checkExpect(Result.isFailure(s.outcomes.withEnv)).toEqual(true)
          checkExpect(Result.isFailure(s.outcomes.onPipe)).toEqual(true)
        },
      ),
    ),
  )

  scenario(
    'Human env mode overrides a set agent variable',
    Gherkin.Do.pipe(
      Given('a TTY with human env mode and a set agent')(
        'input',
        () => Effect.succeed(ttyInput({ envMode: 'human', agent: '1' })),
      ),
      When('the mode is resolved')(
        'resolved',
        (s: { input: ModeInput }) => Effect.succeed(Result.getOrThrow(resolveMode(s.input))),
      ),
      Then('the mode is human on the env signal')((s: { resolved: ResolvedMode }) => {
        checkExpect(s.resolved).toEqual({ mode: 'human', signal: 'env', stdoutIsTTY: true })
      }),
    ),
  )

  scenario(
    'Machine env mode overrides a TTY',
    Gherkin.Do.pipe(
      Given('a TTY with machine env mode')('input', () => Effect.succeed(ttyInput({ envMode: 'machine' }))),
      When('the mode is resolved')(
        'resolved',
        (s: { input: ModeInput }) => Effect.succeed(Result.getOrThrow(resolveMode(s.input))),
      ),
      Then('the mode is machine on the env signal')((s: { resolved: ResolvedMode }) => {
        checkExpect(s.resolved).toEqual({ mode: 'machine', signal: 'env', stdoutIsTTY: true })
      }),
    ),
  )

  scenario(
    'An unrecognised env mode still resolves human on the env signal',
    Gherkin.Do.pipe(
      Given('a TTY with an unrecognised env mode')('inputs', () =>
        Effect.succeed({
          upper: ttyInput({ envMode: 'MACHINE' }),
          other: ttyInput({ envMode: 'other' }),
        })),
      When('both modes are resolved')(
        'resolved',
        (s: { inputs: { upper: ModeInput; other: ModeInput } }) =>
          Effect.succeed({
            fromUpper: Result.getOrThrow(resolveMode(s.inputs.upper)),
            fromOther: Result.getOrThrow(resolveMode(s.inputs.other)),
          }),
      ),
      Then('both modes are human on the env signal')(
        (s: { resolved: { fromUpper: ResolvedMode; fromOther: ResolvedMode } }) => {
          checkExpect(s.resolved.fromUpper).toEqual({ mode: 'human', signal: 'env', stdoutIsTTY: true })
          checkExpect(s.resolved.fromOther).toEqual({ mode: 'human', signal: 'env', stdoutIsTTY: true })
        },
      ),
    ),
  )

  scenario(
    'An explicit flag beats the env mode in both directions',
    Gherkin.Do.pipe(
      Given('a TTY with conflicting flag and env signals')('inputs', () =>
        Effect.succeed({
          textOnMachineEnv: ttyInput({ text: true, envMode: 'machine' }),
          jsonOnHumanEnv: ttyInput({ json: true, envMode: 'human' }),
        })),
      When('both modes are resolved')(
        'resolved',
        (s: { inputs: { textOnMachineEnv: ModeInput; jsonOnHumanEnv: ModeInput } }) =>
          Effect.succeed({
            fromText: Result.getOrThrow(resolveMode(s.inputs.textOnMachineEnv)),
            fromJson: Result.getOrThrow(resolveMode(s.inputs.jsonOnHumanEnv)),
          }),
      ),
      Then('the explicit flag wins in both directions')(
        (s: { resolved: { fromText: ResolvedMode; fromJson: ResolvedMode } }) => {
          checkExpect(s.resolved.fromText).toEqual({ mode: 'human', signal: 'flag', stdoutIsTTY: true })
          checkExpect(s.resolved.fromJson).toEqual({ mode: 'machine', signal: 'flag', stdoutIsTTY: true })
        },
      ),
    ),
  )

  scenario(
    'An empty env mode on a TTY resolves human on the TTY signal',
    Gherkin.Do.pipe(
      Given('a TTY with an empty env mode')('input', () => Effect.succeed(ttyInput({ envMode: '' }))),
      When('the mode is resolved')(
        'resolved',
        (s: { input: ModeInput }) => Effect.succeed(Result.getOrThrow(resolveMode(s.input))),
      ),
      Then('the mode matches the unset env mode')((s: { resolved: ResolvedMode }) => {
        checkExpect(s.resolved).toEqual({ mode: 'human', signal: 'tty', stdoutIsTTY: true })
        checkExpect(Equal.equals(s.resolved, Result.getOrThrow(resolveMode(ttyInput())))).toBe(true)
      }),
    ),
  )

  scenario(
    'An empty tool variable on a TTY resolves human on the TTY signal',
    Gherkin.Do.pipe(
      Given('a TTY with an empty tool variable')(
        'input',
        () => Effect.succeed(ttyInput({ toolVars: { CLAUDECODE: '' } })),
      ),
      When('the mode is resolved')(
        'resolved',
        (s: { input: ModeInput }) => Effect.succeed(Result.getOrThrow(resolveMode(s.input))),
      ),
      Then('the mode is human on the TTY signal')((s: { resolved: ResolvedMode }) => {
        checkExpect(s.resolved).toEqual({ mode: 'human', signal: 'tty', stdoutIsTTY: true })
      }),
    ),
  )

  scenario(
    'Agent and tool signals stay quiet off a TTY',
    Gherkin.Do.pipe(
      Given('a pipe with agent and tool detection set')(
        'input',
        () => Effect.succeed({ stdoutIsTTY: false, agent: '1', toolVars: { CLAUDECODE: '1' } }),
      ),
      When('the mode is resolved')(
        'resolved',
        (s: { input: ModeInput }) => Effect.succeed(Result.getOrThrow(resolveMode(s.input))),
      ),
      Then('the pipe fallback wins over both signals')((s: { resolved: ResolvedMode }) => {
        checkExpect(s.resolved).toEqual({ mode: 'machine', signal: 'tty', stdoutIsTTY: false })
      }),
    ),
  )

  scenario(
    'Either known tool variable forces machine mode',
    Gherkin.Do.pipe(
      Given('a TTY with each known tool variable set')('inputs', () =>
        Effect.succeed({
          claudeCode: ttyInput({ toolVars: { CLAUDECODE: '1' } }),
          codexSandbox: ttyInput({ toolVars: { CODEX_SANDBOX: '1' } }),
        })),
      When('both modes are resolved')(
        'resolved',
        (s: { inputs: { claudeCode: ModeInput; codexSandbox: ModeInput } }) =>
          Effect.succeed({
            fromClaudeCode: Result.getOrThrow(resolveMode(s.inputs.claudeCode)),
            fromCodexSandbox: Result.getOrThrow(resolveMode(s.inputs.codexSandbox)),
          }),
      ),
      Then('both modes are machine')(
        (s: { resolved: { fromClaudeCode: ResolvedMode; fromCodexSandbox: ResolvedMode } }) => {
          checkExpect(s.resolved.fromClaudeCode.mode).toBe('machine')
          checkExpect(s.resolved.fromCodexSandbox.mode).toBe('machine')
        },
      ),
    ),
  )

  scenario(
    'The progress bar runs only on a human TTY',
    Gherkin.Do.pipe(
      Given('human and machine modes on TTY and pipe')('inputs', () =>
        Effect.succeed({
          humanTty: ttyInput(),
          machinePipe: { stdoutIsTTY: false },
          humanPipe: { stdoutIsTTY: false, text: true },
          machineTty: ttyInput({ agent: '1' }),
        })),
      When('every mode is resolved and probed')(
        'enabled',
        (
          s: {
            inputs: {
              humanTty: ModeInput
              machinePipe: ModeInput
              humanPipe: ModeInput
              machineTty: ModeInput
            }
          },
        ) =>
          Effect.succeed({
            humanTty: isProgressEnabled(Result.getOrThrow(resolveMode(s.inputs.humanTty))),
            machinePipe: isProgressEnabled(Result.getOrThrow(resolveMode(s.inputs.machinePipe))),
            humanPipe: isProgressEnabled(Result.getOrThrow(resolveMode(s.inputs.humanPipe))),
            machineTty: isProgressEnabled(Result.getOrThrow(resolveMode(s.inputs.machineTty))),
          }),
      ),
      Then('only the human TTY enables the progress bar')(
        (s: {
          enabled: { humanTty: boolean; machinePipe: boolean; humanPipe: boolean; machineTty: boolean }
        }) => {
          checkExpect(s.enabled.humanTty).toBe(true)
          checkExpect(s.enabled.machinePipe).toBe(false)
          checkExpect(s.enabled.humanPipe).toBe(false)
          checkExpect(s.enabled.machineTty).toBe(false)
        },
      ),
    ),
  )

  scenario(
    'Unset and empty NO_COLOR enable colour on a human TTY',
    Gherkin.Do.pipe(
      Given('a human TTY')('input', () => Effect.succeed(ttyInput())),
      When('the mode is resolved')(
        'resolved',
        (s: { input: ModeInput }) => Effect.succeed(Result.getOrThrow(resolveMode(s.input))),
      ),
      Then('unset and empty NO_COLOR enable colour')((s: { resolved: ResolvedMode }) => {
        checkExpect(isColorEnabled(s.resolved, undefined)).toBe(true)
        checkExpect(isColorEnabled(s.resolved, '')).toBe(true)
      }),
    ),
  )

  scenario(
    'Any non-empty NO_COLOR disables colour',
    Gherkin.Do.pipe(
      Given('a human TTY')('input', () => Effect.succeed(ttyInput())),
      When('the mode is resolved')(
        'resolved',
        (s: { input: ModeInput }) => Effect.succeed(Result.getOrThrow(resolveMode(s.input))),
      ),
      Then('every non-empty NO_COLOR value disables colour')((s: { resolved: ResolvedMode }) => {
        checkExpect(isColorEnabled(s.resolved, '1')).toBe(false)
        checkExpect(isColorEnabled(s.resolved, '0')).toBe(false)
        checkExpect(isColorEnabled(s.resolved, 'yes')).toBe(false)
      }),
    ),
  )

  scenario(
    'Machine mode stays colourless regardless of NO_COLOR',
    Gherkin.Do.pipe(
      Given('machine modes on TTY and pipe')('inputs', () =>
        Effect.succeed({
          machineTty: ttyInput({ agent: '1' }),
          machinePipe: { stdoutIsTTY: false },
        })),
      When('both modes are resolved')(
        'resolved',
        (s: { inputs: { machineTty: ModeInput; machinePipe: ModeInput } }) =>
          Effect.succeed({
            fromTty: Result.getOrThrow(resolveMode(s.inputs.machineTty)),
            fromPipe: Result.getOrThrow(resolveMode(s.inputs.machinePipe)),
          }),
      ),
      Then('colour stays disabled regardless of NO_COLOR')(
        (s: { resolved: { fromTty: ResolvedMode; fromPipe: ResolvedMode } }) => {
          checkExpect(isColorEnabled(s.resolved.fromTty, undefined)).toBe(false)
          checkExpect(isColorEnabled(s.resolved.fromPipe, '')).toBe(false)
        },
      ),
    ),
  )
})
