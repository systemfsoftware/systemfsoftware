/**
 * Pure data-driven tests for the hook-input normalization helpers.
 *
 * No mocks, no ExtensionAPI stubs — just real OMP-shaped inputs and the
 * expected Claude Code-shaped outputs.
 */
import { describe, expect, it } from 'vitest'
import { extractShellCommand, isContextModeShellTool } from '../src/context-mode.acl.js'
import { matchesMatcher } from '../src/matcher.acl.js'
import { sessionIds } from '../src/session.acl.js'
import { normalizeToolInput } from '../src/tool-input.acl.js'
import { normalizeToolName } from '../src/tool-name.acl.js'

describe('normalizeToolName', () => {
  it('Should_CapitalizeLowercaseOmpToolNames_When_GivenLowercaseInput', () => {
    expect(normalizeToolName('write')).toBe('Write')
    expect(normalizeToolName('bash')).toBe('Bash')
    expect(normalizeToolName('read')).toBe('Read')
  })

  it('Should_LeaveUnknownNamesAsIs_When_NameHasNoAlias', () => {
    expect(normalizeToolName('github')).toBe('Github')
  })
})

describe('normalizeToolInput', () => {
  it('Should_RewritePathToFilePath_When_InputUsesPath', () => {
    const input = { path: 'src/foo.ts', content: 'export {}' }
    expect(normalizeToolInput('Write', input)).toEqual({
      file_path: 'src/foo.ts',
      content: 'export {}',
    })
  })

  it('Should_NotRewriteNonFileTools_When_ToolIsBash', () => {
    const input = { command: 'npx eslint .' }
    expect(normalizeToolInput('Bash', input)).toEqual(input)
  })

  it('Should_NotRewriteInput_When_FilePathIsAlreadyPresent', () => {
    const input = { path: 'src/foo.ts', file_path: 'src/foo.ts', content: 'x' }
    expect(normalizeToolInput('Write', input)).toEqual(input)
  })

  it('Should_SynthesizeClaudeEditFields_When_OmpEditToolSendsEditsArray', () => {
    const input = { path: 'src/foo.ts', edits: [{ old_text: 'a', new_text: 'b // c' }] }
    expect(normalizeToolInput('Edit', input)).toEqual({
      file_path: 'src/foo.ts',
      edits: [{ old_string: 'a', new_string: 'b // c' }],
      old_string: 'a',
      new_string: 'b // c',
    })
  })

  it('Should_JoinMultipleEdits_When_OmpEditHasSeveralEntries', () => {
    const input = { path: 'src/foo.ts', edits: [{ old_text: 'a', new_text: 'x' }, { old_text: 'b', new_text: 'y' }] }
    const out = normalizeToolInput('MultiEdit', input)
    expect(out['new_string']).toBe('x\ny')
    expect(out['old_string']).toBe('a\nb')
  })

  it('Should_LeaveClaudeEditUntouched_When_NewStringAlreadyPresent', () => {
    const input = { file_path: 'src/foo.ts', old_string: 'a', new_string: 'b // c' }
    expect(normalizeToolInput('Edit', input)).toEqual(input)
  })
})

describe('matchesMatcher', () => {
  it('Should_MatchAnyName_When_MatcherIsEmpty', () => {
    expect(matchesMatcher('Write', '')).toBe(true)
    expect(matchesMatcher('Write', undefined)).toBe(true)
  })

  it('Should_MatchExactNames_When_MatcherEqualsToolName', () => {
    expect(matchesMatcher('Write', 'Write')).toBe(true)
    expect(matchesMatcher('Bash', 'Write')).toBe(false)
  })

  it('Should_MatchPipeSeparatedAlternatives_When_ToolNameIsInList', () => {
    expect(matchesMatcher('Write', 'Write|Edit|Create')).toBe(true)
    expect(matchesMatcher('Edit', 'Write|Edit|Create')).toBe(true)
    expect(matchesMatcher('Bash', 'Write|Edit|Create')).toBe(false)
  })
})

describe('isContextModeShellTool', () => {
  it('Should_ReturnTrue_When_CtxExecuteLanguageIsShell', () => {
    expect(isContextModeShellTool('ctx_execute', { language: 'shell', code: 'ls' })).toBe(true)
  })

  it('Should_ReturnFalse_When_CtxExecuteLanguageIsNotShell', () => {
    expect(isContextModeShellTool('ctx_execute', { language: 'javascript', code: '1+1' })).toBe(false)
  })

  it('Should_ReturnTrue_When_CtxBatchExecute', () => {
    expect(isContextModeShellTool('ctx_batch_execute', { commands: [{ command: 'ls' }] })).toBe(true)
  })

  it('Should_ReturnFalse_When_ToolIsNotContextMode', () => {
    expect(isContextModeShellTool('bash', { command: 'ls' })).toBe(false)
  })
})

describe('extractShellCommand', () => {
  it('Should_ReturnCode_When_CtxExecuteShell', () => {
    expect(extractShellCommand('ctx_execute', { language: 'shell', code: 'git status' })).toBe('git status')
  })

  it('Should_JoinBatchCommands_When_CtxBatchExecute', () => {
    expect(
      extractShellCommand('ctx_batch_execute', {
        commands: [{ command: 'git status' }, { command: 'git log' }],
      }),
    ).toBe('git status\ngit log')
  })

  it('Should_ReturnUndefined_When_NotShellTool', () => {
    expect(extractShellCommand('bash', { command: 'ls' })).toBeUndefined()
  })
})

describe('sessionIds', () => {
  it('Should_ReturnSessionIdAndNullAgentId_When_GetterReturnsId', () => {
    expect(sessionIds(() => 'sess-123')).toEqual({
      session_id: 'sess-123',
      agent_id: null,
    })
  })
})
