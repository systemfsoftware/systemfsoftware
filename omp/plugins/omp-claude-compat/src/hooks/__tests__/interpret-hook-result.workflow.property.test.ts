import { describe, it } from '@effect/vitest'
import { Exit, Option, Result } from 'effect'
import { Schema as S } from 'effect'
import { FastCheck as fc } from 'effect/testing'
import { HookOutputFromStdout, HookResult, HookStderr, HookStdout, type ParsedHookOutput } from '../hooks.schema.js'
import { InterpretHookCommand, interpretHookResult } from '../interpret-hook-result.workflow.js'

const parseHookOutput = S.decodeUnknownExit(HookOutputFromStdout)

const parsedOf = (stdout: string): Option.Option<ParsedHookOutput> =>
  Exit.match(parseHookOutput(stdout), {
    onFailure: () => Option.none(),
    onSuccess: Option.some,
  })

const hookResultArb = S.toArbitrary(HookResult)(fc)
const stdoutArb = S.toArbitrary(HookStdout)(fc)
const stderrArb = S.toArbitrary(HookStderr)(fc)
const eventArb = S.toArbitrary(InterpretHookCommand.fields.event)(fc)

const spokenArb = stderrArb.filter((text) => text.trim() !== '')

const blankStderrArb = stderrArb.map((stderr) => stderr.replace(/\S/g, ' '))
const blankPrefixArb = stdoutArb.map((stdout) => stdout.replace(/\S/g, ' '))

const undecidedStdoutArb = stdoutArb.filter((stdout) => !stdout.trim().startsWith('{'))

const unparseableStdoutArb = stdoutArb.map((stdout) => `{${stdout}`).filter((stdout) => {
  try {
    JSON.parse(stdout)
    return false
  } catch {
    return true
  }
})

const commandOf = (result: { readonly code: number; readonly stdout: string; readonly stderr: string }, ev: string) =>
  new InterpretHookCommand({
    result: S.decodeSync(HookResult)({ ...result }),
    event: ev,
    parsed: parsedOf(result.stdout),
  })

describe('interpretHookResult (PBT)', () => {
  it.prop('∀result_NonStandardExitWithStderr_→Warning', [hookResultArb, spokenArb, eventArb], ([
    result,
    stderr,
    ev,
  ]) => {
    fc.pre(result.code !== 0 && result.code !== 2)
    const verdict = interpretHookResult(commandOf({ ...result, stderr }, ev))
    return Result.isSuccess(verdict) && verdict.success._tag === 'Warning' &&
      verdict.success.message === stderr.trim() &&
      verdict.success.code === result.code && verdict.success.stdout === result.stdout
  })

  it.prop('∀result_NonStandardExitWithBlankStderr_→Allow', [hookResultArb, blankStderrArb, eventArb], ([
    result,
    stderr,
    ev,
  ]) => {
    fc.pre(result.code !== 0 && result.code !== 2)
    const verdict = interpretHookResult(commandOf({ ...result, stderr }, ev))
    return Result.isSuccess(verdict) && verdict.success._tag === 'Allow' &&
      verdict.success.code === result.code && verdict.success.stdout === result.stdout
  })

  it.prop('∀result_Exit2WithStderr_→BlockCarryingStderr', [hookResultArb, spokenArb, eventArb], ([
    result,
    stderr,
    ev,
  ]) => {
    const verdict = interpretHookResult(commandOf({ ...result, code: 2, stderr }, ev))
    return Result.isSuccess(verdict) && verdict.success._tag === 'Block' &&
      verdict.success.reason === stderr.trim() &&
      verdict.success.code === 2 && verdict.success.stdout === result.stdout
  })

  it.prop('∀result_Exit2WithBlankStderr_→BlockNamingTheEvent', [hookResultArb, blankStderrArb, eventArb], ([
    result,
    stderr,
    ev,
  ]) => {
    const verdict = interpretHookResult(commandOf({ ...result, code: 2, stderr }, ev))
    return Result.isSuccess(verdict) && verdict.success._tag === 'Block' &&
      verdict.success.reason === `Blocked by ${ev} hook` &&
      verdict.success.code === 2 && verdict.success.stdout === result.stdout
  })

  it.prop('∀reason_Exit0AndDenyDecision_→Block', [spokenArb, eventArb], ([reason, ev]) => {
    const stdout = JSON.stringify({
      hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: reason },
    })
    const verdict = interpretHookResult(commandOf({ code: 0, stdout, stderr: '' }, ev))
    return Result.isSuccess(verdict) && verdict.success._tag === 'Block' &&
      verdict.success.reason === reason &&
      verdict.success.code === 0 && verdict.success.stdout === stdout
  })

  it.prop('∀reason_Exit0AndTopLevelBlockDecision_→Block', [spokenArb, eventArb], ([reason, ev]) => {
    const stdout = JSON.stringify({ decision: 'block', reason })
    const verdict = interpretHookResult(commandOf({ code: 0, stdout, stderr: '' }, ev))
    return Result.isSuccess(verdict) && verdict.success._tag === 'Block' &&
      verdict.success.reason === reason &&
      verdict.success.code === 0 && verdict.success.stdout === stdout
  })

  it.prop('∀stdout_Exit0AndUndecidedStdout_→Allow', [undecidedStdoutArb, eventArb], ([stdout, ev]) => {
    const verdict = interpretHookResult(commandOf({ code: 0, stdout, stderr: '' }, ev))
    return Result.isSuccess(verdict) && verdict.success._tag === 'Allow' &&
      verdict.success.code === 0 && verdict.success.stdout === stdout
  })

  it.prop('∀stdout_Exit0AndUnparseableDecisionJson_→FailureCarriesErrorAndContext', [
    unparseableStdoutArb,
    eventArb,
  ], ([stdout, ev]) => {
    const result = interpretHookResult(commandOf({ code: 0, stdout, stderr: '' }, ev))
    return Result.isFailure(result) && result.failure.error.raw === stdout &&
      result.failure.code === 0 && result.failure.stdout === stdout
  })

  it.prop('∀value_Exit0DenyWithUpdatedInput_→BlockNotAllow', [spokenArb, stderrArb, eventArb], ([
    reason,
    leaf,
    ev,
  ]) => {
    const stdout = JSON.stringify({
      hookSpecificOutput: {
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
        updatedInput: { tool_input: { content: leaf } },
      },
    })
    const verdict = interpretHookResult(commandOf({ code: 0, stdout, stderr: '' }, ev))
    return Result.isSuccess(verdict) && verdict.success._tag === 'Block' &&
      verdict.success.reason === reason &&
      verdict.success.code === 0 && verdict.success.stdout === stdout
  })

  it.prop('∀event_Exit0AndDenyWithoutReason_→BlockNamingTheEvent', [eventArb], ([ev]) => {
    const stdout = JSON.stringify({ hookSpecificOutput: { permissionDecision: 'deny' } })
    const verdict = interpretHookResult(commandOf({ code: 0, stdout, stderr: '' }, ev))
    return Result.isSuccess(verdict) && verdict.success._tag === 'Block' &&
      verdict.success.reason === `Blocked by ${ev} hook` &&
      verdict.success.code === 0 && verdict.success.stdout === stdout
  })

  it.prop('∀event_Exit0AndTopLevelBlockWithoutReason_→BlockNamingTheEvent', [eventArb], ([ev]) => {
    const stdout = JSON.stringify({ decision: 'block' })
    const verdict = interpretHookResult(commandOf({ code: 0, stdout, stderr: '' }, ev))
    return Result.isSuccess(verdict) && verdict.success._tag === 'Block' &&
      verdict.success.reason === `Blocked by ${ev} hook` &&
      verdict.success.code === 0 && verdict.success.stdout === stdout
  })

  it.prop('∀value_Exit0AndUpdatedInput_→AllowCarriesUpdatedInput', [stderrArb, eventArb], ([leaf, ev]) => {
    const stdout = JSON.stringify({ hookSpecificOutput: { updatedInput: { tool_input: { content: leaf } } } })
    const verdict = interpretHookResult(commandOf({ code: 0, stdout, stderr: '' }, ev))
    return Result.isSuccess(verdict) && verdict.success._tag === 'Allow' &&
      JSON.stringify(verdict.success.updatedInput) === JSON.stringify({ tool_input: { content: leaf } }) &&
      verdict.success.code === 0 && verdict.success.stdout === stdout
  })

  it.prop('∀code_NonStandardExitIgnoresStdoutJson_→AllowWithoutUpdatedInput', [
    hookResultArb,
    stderrArb,
    eventArb,
  ], ([result, leaf, ev]) => {
    fc.pre(result.code !== 0 && result.code !== 2)
    const stdout = JSON.stringify({ hookSpecificOutput: { updatedInput: { tool_input: { content: leaf } } } })
    const verdict = interpretHookResult(commandOf({ ...result, stdout, stderr: '' }, ev))
    return Result.isSuccess(verdict) && verdict.success._tag === 'Allow' &&
      verdict.success.updatedInput === undefined &&
      verdict.success.code === result.code && verdict.success.stdout === stdout
  })

  it.prop('∀prefix_Exit0AndDecisionJsonBehindBlankSpace_→Block', [blankPrefixArb, spokenArb, eventArb], ([
    prefix,
    reason,
    ev,
  ]) => {
    const stdout = prefix +
      JSON.stringify({ hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: reason } })
    const verdict = interpretHookResult(commandOf({ code: 0, stdout, stderr: '' }, ev))
    return Result.isSuccess(verdict) && verdict.success._tag === 'Block' &&
      verdict.success.reason === reason &&
      verdict.success.code === 0 && verdict.success.stdout === stdout
  })
})
