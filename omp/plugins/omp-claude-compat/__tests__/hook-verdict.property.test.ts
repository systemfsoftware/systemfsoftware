import { describe, it } from '@effect/vitest'
import { Either, FastCheck as fc } from 'effect'
import { interpretHookResult } from '../src/hook-verdict.workflow.js'

const event = fc.constantFrom('PreToolUse', 'PostToolUse', 'SessionStart', 'UserPromptSubmit', 'SessionEnd')

const blankStdout = fc.array(fc.constantFrom(' ', '\n', '\t', '\r'), { maxLength: 6 }).map((cs) => cs.join(''))

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
      const verdict = interpretHookResult({ code: 0, stdout, stderr: '' }, ev)
      return Either.isRight(verdict) && verdict.right._tag === 'Allow'
    },
  )

  it.prop(
    '∀stdout_Exit0AndPlainTextStdout_→Allow',
    [plainStdout, event],
    ([stdout, ev]) => {
      const verdict = interpretHookResult({ code: 0, stdout, stderr: '' }, ev)
      return Either.isRight(verdict) && verdict.right._tag === 'Allow'
    },
  )

  it.prop(
    '∀stdout_Exit0AndMalformedDecisionJson_→VerdictError',
    [malformedJson, event],
    ([stdout, ev]) => {
      const verdict = interpretHookResult({ code: 0, stdout, stderr: '' }, ev)
      return Either.isLeft(verdict) && verdict.left._tag === 'HookVerdictError' && verdict.left.raw === stdout
    },
  )

  it.prop(
    '∀stderr_Exit2_→BlockCarryingStderr',
    [stderrText, event],
    ([stderr, ev]) => {
      const verdict = interpretHookResult({ code: 2, stdout: '', stderr }, ev)
      return Either.isRight(verdict) && verdict.right._tag === 'Block' && verdict.right.reason === stderr.trim()
    },
  )

  it.prop(
    '∀stdout_Exit2IgnoresStdout_→Block',
    [fc.oneof(blankStdout, plainStdout, malformedJson), event],
    ([stdout, ev]) => {
      const verdict = interpretHookResult({ code: 2, stdout, stderr: 'denied' }, ev)
      return Either.isRight(verdict) && verdict.right._tag === 'Block' && verdict.right.reason === 'denied'
    },
  )

  it.prop(
    '∀reason_Exit0AndDenyDecision_→Block',
    [stderrText, event],
    ([reason, ev]) => {
      const stdout = JSON.stringify({
        hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: reason },
      })
      const verdict = interpretHookResult({ code: 0, stdout, stderr: '' }, ev)
      return Either.isRight(verdict) && verdict.right._tag === 'Block' && verdict.right.reason === reason
    },
  )

  it.prop(
    '∀code_NonStandardExitWithStderr_→Warning',
    [nonStandardExit, stderrText, event],
    ([code, stderr, ev]) => {
      const verdict = interpretHookResult({ code, stdout: '', stderr }, ev)
      return Either.isRight(verdict) && verdict.right._tag === 'Warning' && verdict.right.message === stderr.trim()
    },
  )

  it.prop(
    '∀code_NonStandardExitWithoutStderr_→Allow',
    [nonStandardExit, blankStdout, event],
    ([code, stderr, ev]) => {
      const verdict = interpretHookResult({ code, stdout: '', stderr }, ev)
      return Either.isRight(verdict) && verdict.right._tag === 'Allow'
    },
  )

  it.prop(
    '∀value_Exit0AndUpdatedInput_→AllowCarriesUpdatedInput',
    [stderrText, event],
    ([value, ev]) => {
      const stdout = JSON.stringify({ hookSpecificOutput: { updatedInput: { tool_input: { content: value } } } })
      const verdict = interpretHookResult({ code: 0, stdout, stderr: '' }, ev)
      return Either.isRight(verdict) &&
        verdict.right._tag === 'Allow' &&
        JSON.stringify(verdict.right.updatedInput) === JSON.stringify({ tool_input: { content: value } })
    },
  )

  it.prop(
    '∀code_NonStandardExitIgnoresStdoutJson_→AllowWithoutUpdatedInput',
    [nonStandardExit, stderrText, event],
    ([code, value, ev]) => {
      const stdout = JSON.stringify({ hookSpecificOutput: { updatedInput: { tool_input: { content: value } } } })
      const verdict = interpretHookResult({ code, stdout, stderr: '' }, ev)
      return Either.isRight(verdict) && verdict.right._tag === 'Allow' && verdict.right.updatedInput === undefined
    },
  )

  it.prop(
    '∀value_Exit0DenyWithUpdatedInput_→BlockNotAllow',
    [stderrText, event],
    ([value, ev]) => {
      const stdout = JSON.stringify({
        hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: value, updatedInput: { a: '1' } },
      })
      const verdict = interpretHookResult({ code: 0, stdout, stderr: '' }, ev)
      return Either.isRight(verdict) && verdict.right._tag === 'Block'
    },
  )
})
