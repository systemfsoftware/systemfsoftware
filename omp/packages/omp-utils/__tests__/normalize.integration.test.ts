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

  it('Should_MapWebSearch_When_InputIsWebSearch', () => {
    expect(normalizeToolName('web_search')).toBe('WebSearch')
  })

  it('Should_MapTodo_When_InputIsTodo', () => {
    expect(normalizeToolName('todo')).toBe('TodoWrite')
  })

  it('Should_MapAsk_When_InputIsAsk', () => {
    expect(normalizeToolName('ask')).toBe('AskUserQuestion')
  })

  it('Should_LeaveMcpNamesVerbatim_When_NameStartsWithMcpPrefix', () => {
    expect(normalizeToolName('mcp__foo_bar')).toBe('mcp__foo_bar')
  })

  it('Should_ApplyFallbackCapitalization_When_NameHasNoClaudeEquivalent', () => {
    expect(normalizeToolName('eval')).toBe('Eval')
  })

  it('Should_ReturnEmptyString_When_InputIsEmpty', () => {
    expect(normalizeToolName('')).toBe('')
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

  it('Should_RecoverAddedLines_When_HashlineEditSendsPatchInput', () => {
    const input = {
      path: 'src/foo.ts',
      input: '[src/foo.ts#A1B2]\nSWAP 1.=1:\n+// a comment\n+const x = 1',
    }
    const out = normalizeToolInput('Edit', input)
    expect(out['new_string']).toBe('// a comment\nconst x = 1')
    expect(out['old_string']).toBeUndefined()
  })

  it('Should_SplitAddedFromRemoved_When_ApplyPatchInputCarriesBothSigils', () => {
    const input = {
      path: 'src/foo.ts',
      input: '*** Begin Patch\n*** Update File: src/foo.ts\n-const x = 1\n+const x = 2\n*** End Patch',
    }
    const out = normalizeToolInput('Edit', input)
    expect(out['new_string']).toBe('const x = 2')
    expect(out['old_string']).toBe('const x = 1')
  })

  it('Should_KeepOneSigil_When_AddedLineItselfStartsWithASigil', () => {
    const input = { path: 'doc.md', input: '[doc.md#A1B2]\nINS.TAIL:\n++ nested bullet\n+' }
    expect(normalizeToolInput('Edit', input)['new_string']).toBe('+ nested bullet\n')
  })

  it('Should_AddNoContentFields_When_PatchInputHasNoMarkedLines', () => {
    const input = { path: 'src/foo.ts', input: '[src/foo.ts#A1B2]\nDEL 3' }
    const out = normalizeToolInput('Edit', input)
    expect(out['new_string']).toBeUndefined()
    expect(out['old_string']).toBeUndefined()
  })

  it('Should_NotTouchPatchInput_When_ToolIsNotAnEditTool', () => {
    const input = { path: 'src/foo.ts', input: '+const x = 1' }
    expect(normalizeToolInput('Write', input)).toEqual({ file_path: 'src/foo.ts', input: '+const x = 1' })
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

  it('Should_ReturnTrueWithoutThrowing_When_MatcherPatternIsMalformed', () => {
    expect(() => matchesMatcher('Write', 'Write(')).not.toThrow()
    expect(matchesMatcher('Write', 'Write(')).toBe(true)
  })

  it('Should_StillMatchExactNames_When_MatcherIsValid', () => {
    expect(matchesMatcher('Write', 'Write')).toBe(true)
    expect(matchesMatcher('Bash', 'Write')).toBe(false)
  })

  it('Should_ReturnTrueFromCache_When_MalformedMatcherIsRepeated', () => {
    expect(matchesMatcher('Write', 'Write(')).toBe(true)
    expect(matchesMatcher('Edit', 'Write(')).toBe(true)
    expect(matchesMatcher('Bash', 'Write(')).toBe(true)
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
