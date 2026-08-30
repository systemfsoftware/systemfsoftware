import { describe, it } from '@effect/vitest'
import { Exit, Option, Result } from 'effect'
import { Schema as S } from 'effect'
import { FastCheck as fc } from 'effect/testing'
import { HookOutputFromStdout, type ParsedHookOutput } from '../hooks.schema.js'
import { InterpretHookCommand, interpretHookResult } from '../hooks.workflow.js'

const parseHookOutput = S.decodeUnknownExit(HookOutputFromStdout)

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

const nonStandardExit = fc.oneof(
  fc.integer({ min: -5, max: -1 }),
  fc.constant(1),
  fc.integer({ min: 3, max: 255 }),
)

const stderrText = fc
  .tuple(fc.constantFrom('x', 'y', '!'), fc.array(fc.constantFrom('x', 'y', ' ', '!'), { maxLength: 9 }))
  .map(([head, rest]) => head + rest.join(''))

const commandOf = (result: { readonly code: number; readonly stdout: string; readonly stderr: string }, ev: string) =>
  new InterpretHookCommand({ result, event: ev, parsed: parsedOf(result.stdout) })

describe('interpretHookResult (PBT)', () => {
  it.prop('∀stdout_Exit0AndBlankStdout_→Allow', [blankStdout, event], ([stdout, ev]) => {
    const verdict = interpretHookResult(commandOf({ code: 0, stdout, stderr: '' }, ev))
    return Result.isSuccess(verdict) && verdict.success.verdict._tag === 'Allow'
  })

  it.prop('∀stdout_Exit0AndPlainTextStdout_→Allow', [plainStdout, event], ([stdout, ev]) => {
    const verdict = interpretHookResult(commandOf({ code: 0, stdout, stderr: '' }, ev))
    return Result.isSuccess(verdict) && verdict.success.verdict._tag === 'Allow'
  })

  it.prop('∀stdout_Exit0AndMalformedDecisionJson_→VerdictError', [malformedJson, event], ([stdout, ev]) => {
    const verdict = interpretHookResult(commandOf({ code: 0, stdout, stderr: '' }, ev))
    return Result.isFailure(verdict) && verdict.failure.error.raw === stdout
  })

  it.prop('∀stderr_Exit2_→BlockCarryingStderr', [stderrText, event], ([stderr, ev]) => {
    const verdict = interpretHookResult(commandOf({ code: 2, stdout: '', stderr }, ev))
    return Result.isSuccess(verdict) && verdict.success.verdict._tag === 'Block' &&
      verdict.success.verdict.reason === stderr.trim()
  })

  it.prop('∀stdout_Exit2IgnoresStdout_→Block', [fc.oneof(blankStdout, plainStdout, malformedJson), event], ([
    stdout,
    ev,
  ]) => {
    const verdict = interpretHookResult(commandOf({ code: 2, stdout, stderr: 'denied' }, ev))
    return Result.isSuccess(verdict) && verdict.success.verdict._tag === 'Block' &&
      verdict.success.verdict.reason === 'denied'
  })

  it.prop('∀reason_Exit0AndDenyDecision_→Block', [stderrText, event], ([reason, ev]) => {
    const stdout = JSON.stringify({
      hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: reason },
    })
    const verdict = interpretHookResult(commandOf({ code: 0, stdout, stderr: '' }, ev))
    return Result.isSuccess(verdict) && verdict.success.verdict._tag === 'Block' &&
      verdict.success.verdict.reason === reason
  })

  it.prop('∀code_NonStandardExitWithStderr_→Warning', [nonStandardExit, stderrText, event], ([
    code,
    stderr,
    ev,
  ]) => {
    const verdict = interpretHookResult(commandOf({ code, stdout: '', stderr }, ev))
    return Result.isSuccess(verdict) && verdict.success.verdict._tag === 'Warning' &&
      verdict.success.verdict.message === stderr.trim()
  })

  it.prop('∀code_NonStandardExitWithoutStderr_→Allow', [nonStandardExit, blankStdout, event], ([code, stderr, ev]) => {
    const verdict = interpretHookResult(commandOf({ code, stdout: '', stderr }, ev))
    return Result.isSuccess(verdict) && verdict.success.verdict._tag === 'Allow'
  })

  it.prop('∀value_Exit0AndUpdatedInput_→AllowCarriesUpdatedInput', [stderrText, event], ([value, ev]) => {
    const stdout = JSON.stringify({ hookSpecificOutput: { updatedInput: { tool_input: { content: value } } } })
    const verdict = interpretHookResult(commandOf({ code: 0, stdout, stderr: '' }, ev))
    return Result.isSuccess(verdict) && verdict.success.verdict._tag === 'Allow' &&
      JSON.stringify(verdict.success.verdict.updatedInput) === JSON.stringify({ tool_input: { content: value } })
  })

  it.prop('∀code_NonStandardExitIgnoresStdoutJson_→AllowWithoutUpdatedInput', [
    nonStandardExit,
    stderrText,
    event,
  ], ([code, value, ev]) => {
    const stdout = JSON.stringify({ hookSpecificOutput: { updatedInput: { tool_input: { content: value } } } })
    const verdict = interpretHookResult(commandOf({ code, stdout, stderr: '' }, ev))
    return Result.isSuccess(verdict) && verdict.success.verdict._tag === 'Allow' &&
      verdict.success.verdict.updatedInput === undefined
  })

  it.prop('∀value_Exit0DenyWithUpdatedInput_→BlockNotAllow', [stderrText, event], ([value, ev]) => {
    const stdout = JSON.stringify({
      hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: value, updatedInput: { a: '1' } },
    })
    const verdict = interpretHookResult(commandOf({ code: 0, stdout, stderr: '' }, ev))
    return Result.isSuccess(verdict) && verdict.success.verdict._tag === 'Block'
  })

  it.prop('∀prefix_Exit0AndDecisionJsonBehindBlankSpace_→Block', [leadingBlank, stderrText, event], ([
    prefix,
    reason,
    ev,
  ]) => {
    const stdout = prefix + JSON.stringify({
      hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: reason },
    })
    const verdict = interpretHookResult(commandOf({ code: 0, stdout, stderr: '' }, ev))
    return Result.isSuccess(verdict) && verdict.success.verdict._tag === 'Block' &&
      verdict.success.verdict.reason === reason
  })

  it.prop('∀reason_Exit0AndTopLevelBlockDecision_→Block', [stderrText, event], ([reason, ev]) => {
    const stdout = JSON.stringify({ decision: 'block', reason })
    const verdict = interpretHookResult(commandOf({ code: 0, stdout, stderr: '' }, ev))
    return Result.isSuccess(verdict) && verdict.success.verdict._tag === 'Block' &&
      verdict.success.verdict.reason === reason
  })

  it.prop('∀event_Exit0AndDenyWithoutReason_→BlockNamingTheEvent', [event], ([ev]) => {
    const stdout = JSON.stringify({ hookSpecificOutput: { permissionDecision: 'deny' } })
    const verdict = interpretHookResult(commandOf({ code: 0, stdout, stderr: '' }, ev))
    return Result.isSuccess(verdict) && verdict.success.verdict._tag === 'Block' &&
      verdict.success.verdict.reason === `Blocked by ${ev} hook`
  })

  it.prop('∀event_Exit0AndTopLevelBlockWithoutReason_→BlockNamingTheEvent', [event], ([ev]) => {
    const stdout = JSON.stringify({ decision: 'block' })
    const verdict = interpretHookResult(commandOf({ code: 0, stdout, stderr: '' }, ev))
    return Result.isSuccess(verdict) && verdict.success.verdict._tag === 'Block' &&
      verdict.success.verdict.reason === `Blocked by ${ev} hook`
  })
})

describe('interpretHookResult channels (PBT)', () => {
  it.prop(
    '∀cs_Verdict_→SuccessCarriesExitContext',
    [nonStandardExit, fc.oneof(blankStdout, plainStdout), event],
    ([code, stdout, ev]) => {
      const result = interpretHookResult(commandOf({ code, stdout, stderr: '' }, ev))
      return Result.isSuccess(result) && result.success.code === code && result.success.stdout === stdout
    },
  )

  it.prop(
    '∀s_MalformedDecide_→FailureCarriesErrorAndContext',
    [malformedJson, event],
    ([stdout, ev]) => {
      const result = interpretHookResult(commandOf({ code: 0, stdout, stderr: '' }, ev))
      return Result.isFailure(result) && result.failure.error.raw === stdout &&
        result.failure.code === 0 && result.failure.stdout === stdout
    },
  )
})
