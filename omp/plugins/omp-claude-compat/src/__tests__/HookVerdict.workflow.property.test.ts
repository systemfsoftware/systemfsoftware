import { describe, it } from '@effect/vitest'
import { Exit, Option, Result } from 'effect'
import { FastCheck as fc } from 'effect/testing'
import type { ParsedHookOutput } from '../HookOutput.schema.js'
import { parseHookOutput } from '../HookOutput.js'
import { InterpretHookCommand, interpretHookResult, submitVerdict } from '../HookVerdict.workflow.js'

/**
 * The decode exactly as the shell supplies it: `None` when the stdout never
 * decoded to a decision object. Mirrors the `decode` phase of the hook chain.
 */
const parsedOf = (stdout: string): Option.Option<ParsedHookOutput> =>
  Exit.match(parseHookOutput(stdout), {
    onFailure: () => Option.none(),
    onSuccess: Option.some,
  })

const event = fc.constantFrom('PreToolUse', 'PostToolUse', 'SessionStart', 'UserPromptSubmit', 'SessionEnd')

const blankStdout = fc.array(fc.constantFrom(' ', '\n', '\t', '\r'), { maxLength: 6 }).map((cs) => cs.join(''))

const leadingBlank = fc.array(fc.constantFrom(' ', '\n', '\t', '\r'), { minLength: 1, maxLength: 6 })
  .map((cs) => cs.join(''))

const plainTextChar = fc.constantFrom('a', 'z', 'A', 'Z', '0', '9', '-', '_', ' ', '.', ':', '[', '"')

const plainStdout = fc
  .tuple(fc.constantFrom('a', 'z', 'A', '0', '-', '[', '"', '.'), fc.array(plainTextChar, { maxLength: 20 }))
  .map(([head, rest]) => head + rest.join(''))

const malformedJson = fc.constantFrom(
  '{"decision":',
  '{',
  '{ "decision": "block"',
  '{not json at all}',
  '{}}',
)

const nonStandardExit = fc.integer({ min: -5, max: 255 }).filter((code) => code !== 0 && code !== 2)

const stderrText = fc.array(fc.constantFrom('x', 'y', ' ', '!'), { minLength: 1, maxLength: 10 })
  .map((cs) => cs.join(''))
  .filter((s) => s.trim().length > 0)

describe('interpretHookResult (PBT)', () => {
  it.prop(
    '∀stdout_Exit0AndBlankStdout_→Allow',
    [blankStdout, event],
    ([stdout, ev]) => {
      const verdict = interpretHookResult(
        new InterpretHookCommand({ result: { code: 0, stdout, stderr: '' }, event: ev, parsed: parsedOf(stdout) }),
      )
      return Result.isSuccess(verdict) && verdict.success._tag === 'Allow'
    },
  )

  it.prop(
    '∀stdout_Exit0AndPlainTextStdout_→Allow',
    [plainStdout, event],
    ([stdout, ev]) => {
      const verdict = interpretHookResult(
        new InterpretHookCommand({ result: { code: 0, stdout, stderr: '' }, event: ev, parsed: parsedOf(stdout) }),
      )
      return Result.isSuccess(verdict) && verdict.success._tag === 'Allow'
    },
  )

  it.prop(
    '∀stdout_Exit0AndMalformedDecisionJson_→VerdictError',
    [malformedJson, event],
    ([stdout, ev]) => {
      const verdict = interpretHookResult(
        new InterpretHookCommand({ result: { code: 0, stdout, stderr: '' }, event: ev, parsed: parsedOf(stdout) }),
      )
      return Result.isFailure(verdict) && verdict.failure.raw === stdout
    },
  )

  it.prop(
    '∀stderr_Exit2_→BlockCarryingStderr',
    [stderrText, event],
    ([stderr, ev]) => {
      const verdict = interpretHookResult(
        new InterpretHookCommand({ result: { code: 2, stdout: '', stderr }, event: ev, parsed: parsedOf('') }),
      )
      return Result.isSuccess(verdict) && verdict.success._tag === 'Block' && verdict.success.reason === stderr.trim()
    },
  )

  it.prop(
    '∀stdout_Exit2IgnoresStdout_→Block',
    [fc.oneof(blankStdout, plainStdout, malformedJson), event],
    ([stdout, ev]) => {
      const verdict = interpretHookResult(
        new InterpretHookCommand({
          result: { code: 2, stdout, stderr: 'denied' },
          event: ev,
          parsed: parsedOf(stdout),
        }),
      )
      return Result.isSuccess(verdict) && verdict.success._tag === 'Block' && verdict.success.reason === 'denied'
    },
  )

  it.prop(
    '∀reason_Exit0AndDenyDecision_→Block',
    [stderrText, event],
    ([reason, ev]) => {
      const stdout = JSON.stringify({
        hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: reason },
      })
      const verdict = interpretHookResult(
        new InterpretHookCommand({ result: { code: 0, stdout, stderr: '' }, event: ev, parsed: parsedOf(stdout) }),
      )
      return Result.isSuccess(verdict) && verdict.success._tag === 'Block' && verdict.success.reason === reason
    },
  )

  it.prop(
    '∀code_NonStandardExitWithStderr_→Warning',
    [nonStandardExit, stderrText, event],
    ([code, stderr, ev]) => {
      const verdict = interpretHookResult(
        new InterpretHookCommand({ result: { code, stdout: '', stderr }, event: ev, parsed: parsedOf('') }),
      )
      return Result.isSuccess(verdict) && verdict.success._tag === 'Warning' &&
        verdict.success.message === stderr.trim()
    },
  )

  it.prop(
    '∀code_NonStandardExitWithoutStderr_→Allow',
    [nonStandardExit, blankStdout, event],
    ([code, stderr, ev]) => {
      const verdict = interpretHookResult(
        new InterpretHookCommand({ result: { code, stdout: '', stderr }, event: ev, parsed: parsedOf('') }),
      )
      return Result.isSuccess(verdict) && verdict.success._tag === 'Allow'
    },
  )

  it.prop(
    '∀value_Exit0AndUpdatedInput_→AllowCarriesUpdatedInput',
    [stderrText, event],
    ([value, ev]) => {
      const stdout = JSON.stringify({ hookSpecificOutput: { updatedInput: { tool_input: { content: value } } } })
      const verdict = interpretHookResult(
        new InterpretHookCommand({ result: { code: 0, stdout, stderr: '' }, event: ev, parsed: parsedOf(stdout) }),
      )
      return Result.isSuccess(verdict) &&
        verdict.success._tag === 'Allow' &&
        JSON.stringify(verdict.success.updatedInput) === JSON.stringify({ tool_input: { content: value } })
    },
  )

  it.prop(
    '∀code_NonStandardExitIgnoresStdoutJson_→AllowWithoutUpdatedInput',
    [nonStandardExit, stderrText, event],
    ([code, value, ev]) => {
      const stdout = JSON.stringify({ hookSpecificOutput: { updatedInput: { tool_input: { content: value } } } })
      const verdict = interpretHookResult(
        new InterpretHookCommand({ result: { code, stdout, stderr: '' }, event: ev, parsed: parsedOf(stdout) }),
      )
      return Result.isSuccess(verdict) && verdict.success._tag === 'Allow' && verdict.success.updatedInput === undefined
    },
  )

  it.prop(
    '∀value_Exit0DenyWithUpdatedInput_→BlockNotAllow',
    [stderrText, event],
    ([value, ev]) => {
      const stdout = JSON.stringify({
        hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: value, updatedInput: { a: '1' } },
      })
      const verdict = interpretHookResult(
        new InterpretHookCommand({ result: { code: 0, stdout, stderr: '' }, event: ev, parsed: parsedOf(stdout) }),
      )
      return Result.isSuccess(verdict) && verdict.success._tag === 'Block'
    },
  )

  it.prop(
    '∀prefix_Exit0AndDecisionJsonBehindBlankSpace_→Block',
    [leadingBlank, stderrText, event],
    ([prefix, reason, ev]) => {
      const stdout = prefix + JSON.stringify({
        hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: reason },
      })
      const verdict = interpretHookResult(
        new InterpretHookCommand({ result: { code: 0, stdout, stderr: '' }, event: ev, parsed: parsedOf(stdout) }),
      )
      return Result.isSuccess(verdict) && verdict.success._tag === 'Block' && verdict.success.reason === reason
    },
  )

  it.prop(
    '∀reason_Exit0AndTopLevelBlockDecision_→Block',
    [stderrText, event],
    ([reason, ev]) => {
      const verdict = interpretHookResult(
        new InterpretHookCommand({
          result: { code: 0, stdout: JSON.stringify({ decision: 'block', reason }), stderr: '' },
          event: ev,
          parsed: parsedOf(JSON.stringify({ decision: 'block', reason })),
        }),
      )
      return Result.isSuccess(verdict) && verdict.success._tag === 'Block' && verdict.success.reason === reason
    },
  )

  it.prop(
    '∀event_Exit0AndDenyWithoutReason_→BlockNamingTheEvent',
    [event],
    ([ev]) => {
      const verdict = interpretHookResult(
        new InterpretHookCommand({
          result: {
            code: 0,
            stdout: JSON.stringify({ hookSpecificOutput: { permissionDecision: 'deny' } }),
            stderr: '',
          },
          event: ev,
          parsed: parsedOf(JSON.stringify({ hookSpecificOutput: { permissionDecision: 'deny' } })),
        }),
      )
      return Result.isSuccess(verdict) &&
        verdict.success._tag === 'Block' &&
        verdict.success.reason === `Blocked by ${ev} hook`
    },
  )

  it.prop(
    '∀event_Exit0AndTopLevelBlockWithoutReason_→BlockNamingTheEvent',
    [event],
    ([ev]) => {
      const verdict = interpretHookResult(
        new InterpretHookCommand({
          result: { code: 0, stdout: JSON.stringify({ decision: 'block' }), stderr: '' },
          event: ev,
          parsed: parsedOf(JSON.stringify({ decision: 'block' })),
        }),
      )
      return Result.isSuccess(verdict) &&
        verdict.success._tag === 'Block' &&
        verdict.success.reason === `Blocked by ${ev} hook`
    },
  )
})

describe('submitVerdict (PBT)', () => {
  /**
   * The merged make's contract with the write: the raw's code and stdout ride
   * the success channel of the verdict so the write can still act on them.
   */
  it.prop(
    '∀cs_SubmitVerdict_≡Context',
    [fc.integer(), fc.string()],
    ([code, stdout]) => {
      const cmd = new InterpretHookCommand({
        result: { code: 0, stdout: '', stderr: '' },
        event: 'UserPromptSubmit',
        parsed: parsedOf(''),
      })
      const result = submitVerdict({ cmd, code, stdout })
      return Result.isSuccess(result) &&
        result.success.code === code &&
        result.success.stdout === stdout
    },
  )

  /**
   * The same guarantee on the failure channel: a malformed decision reaches the
   * write as the verdict error plus the raw's code and stdout, so the write can
   * feature-skip without losing the raw.
   */
  it.prop(
    '∀cs_MalformedDecide_→FailureCarriesContext',
    [fc.integer(), fc.string()],
    ([code, stdout]) => {
      const cmd = new InterpretHookCommand({
        result: { code: 0, stdout: '{', stderr: '' },
        event: 'UserPromptSubmit',
        parsed: parsedOf('{'),
      })
      const result = submitVerdict({ cmd, code, stdout })
      return Result.isFailure(result) &&
        result.failure.error.raw === '{' &&
        result.failure.code === code &&
        result.failure.stdout === stdout
    },
  )
})