/**
 * Property tests for the pure decision core.
 *
 * Boolean returns are the pass/fail signal — no expect() in PBT.
 * Constructive generation only — no .filter() rejection traps.
 */
import { describe, it } from '@effect/vitest'
import { FastCheck as fc } from 'effect'
import {
  interpretHookResult,
  isBlockDecision,
  isWarningDecision,
  parseHookOutput,
  parseSettings,
  resolveCommandPath,
} from '../hook-dispatcher.workflow.js'

describe('interpretHookResult (PBT)', () => {
  it.prop(
    '∀s_ExitTwo_=Block',
    [fc.string(), fc.string()],
    ([stderr, event]) => isBlockDecision(interpretHookResult({ code: 2, stdout: '', stderr }, event)),
  )

  it.prop(
    '∀n_NonZeroWithStderr_=Warning',
    [fc.integer({ min: 3, max: 255 }), fc.stringMatching(/\S.*/)],
    ([code, stderr]) => {
      const d = interpretHookResult({ code, stdout: '', stderr }, 'PreToolUse')
      return isWarningDecision(d) && d.message === stderr.trim()
    },
  )

  it.prop(
    '∀n_NonZeroNoStderr_=Allow',
    [fc.integer({ min: 3, max: 255 })],
    ([code]) => interpretHookResult({ code, stdout: '', stderr: '' }, 'PreToolUse')._tag === 'Allow',
  )

  it.prop(
    '∀s_ExitZeroNoOutput_=Allow',
    [fc.string()],
    ([event]) => interpretHookResult({ code: 0, stdout: '', stderr: '' }, event)._tag === 'Allow',
  )

  it.prop(
    '∀s_PermissionDeny_=Block',
    [fc.string({ minLength: 1 })],
    ([reason]) => {
      const stdout = JSON.stringify({
        hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: reason },
      })
      const d = interpretHookResult({ code: 0, stdout, stderr: '' }, 'PreToolUse')
      return isBlockDecision(d) && d.reason === reason
    },
  )

  it.prop(
    '∀s_DecisionBlock_=Block',
    [fc.string({ minLength: 1 })],
    ([reason]) => {
      const stdout = JSON.stringify({ decision: 'block', reason })
      const d = interpretHookResult({ code: 0, stdout, stderr: '' }, 'PostToolUse')
      return isBlockDecision(d) && d.reason === reason
    },
  )
})

describe('parseHookOutput (PBT)', () => {
  it.prop('∀s_WhitespaceOnly_=Null', [fc.stringMatching(/^\s*$/)], ([input]) => parseHookOutput(input) === null)

  it.prop(
    '∀o_ParsedOutput_=NonNull',
    [fc.record({
      decision: fc.oneof(fc.constant(undefined), fc.string()),
      reason: fc.oneof(fc.constant(undefined), fc.string()),
    })],
    ([obj]) => parseHookOutput(JSON.stringify(obj)) !== null,
  )
})

describe('parseSettings (PBT)', () => {
  it.prop(
    '∀x_NonObjectInput_=Null',
    [fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null))],
    ([input]) => parseSettings(input) === null,
  )

  it.prop(
    '∀h_EmptyHooksGroups_=AllEmpty',
    [fc.constant(['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop', 'SessionStart', 'SessionEnd'] as const)],
    ([groups]) => {
      const result = parseSettings({ hooks: {} })
      if (result === null) return false
      return groups.every((g) => Array.isArray(result.hooks[g]) && result.hooks[g].length === 0)
    },
  )
})

describe('resolveCommandPath (PBT)', () => {
  it.prop(
    '∀s_DotTsPath_=Bun',
    [fc.stringMatching(/^[a-zA-Z0-9_-]+$/)],
    ([name]) => {
      const path = `/hooks/${name}.ts`
      const r = resolveCommandPath(path, '/cwd')
      return r.cmd === 'bun' && r.args.length === 1 && (r.args[0] ?? '').includes(`${name}.ts`)
    },
  )

  it.prop(
    '∀s_ShellCommand_=Sh',
    [fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]*$/)],
    ([cmd]) => {
      const r = resolveCommandPath(cmd, '/cwd')
      return r.cmd === 'sh' && r.args[0] === '-c'
    },
  )
})
