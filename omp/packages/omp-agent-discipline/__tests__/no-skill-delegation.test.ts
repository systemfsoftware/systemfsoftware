/**
 * Tests for the no-skill-delegation extension.
 *
 * Follows the same pattern as xd-retry-guard.test.ts: minimal ExtensionAPI
 * mock, dynamic import (fresh module state per test via vi.resetModules),
 * temp-dir TOML fixtures for config-driven scenarios.
 */
import { resetTomlCache } from '@systemfsoftware/omp-utils'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface MockExtensionAPI {
  readonly handlers: Map<string, Array<(event: never, ctx: never) => unknown>>
  on: (event: string, handler: (event: never, ctx: never) => unknown) => void
  readonly logger: {
    info: (message: unknown, context?: unknown) => void
    warn: (message: unknown, context?: unknown) => void
    error: (message: unknown, context?: unknown) => void
    debug: (message: unknown, context?: unknown) => void
  }
  readonly recordedLogs: Array<{ level: string; message: unknown; context?: unknown }>
}

async function loadExtension(): Promise<MockExtensionAPI> {
  const recordedLogs: MockExtensionAPI['recordedLogs'] = []
  const logger: MockExtensionAPI['logger'] = {
    info(message, context) {
      recordedLogs.push({ level: 'info', message, context })
    },
    warn(message, context) {
      recordedLogs.push({ level: 'warn', message, context })
    },
    error(message, context) {
      recordedLogs.push({ level: 'error', message, context })
    },
    debug(message, context) {
      recordedLogs.push({ level: 'debug', message, context })
    },
  }
  const api: MockExtensionAPI = {
    handlers: new Map(),
    on(event, handler) {
      const list = this.handlers.get(event) ?? []
      list.push(handler)
      this.handlers.set(event, list)
    },
    logger,
    recordedLogs,
  }
  const mod = await import('../src/no-skill-delegation.ts')
  mod.default(api as never)
  return api
}

// Helper: create a temp dir with a systemfsoftware.toml
function withToml(skills: readonly string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'nsd-test-'))
  const content = `no_delegate_skills = [${skills.map((s) => JSON.stringify(s)).join(', ')}]`
  writeFileSync(join(dir, 'systemfsoftware.toml'), content, 'utf-8')
  return dir
}

function cwdCtx(cwd: string): Record<string, unknown> {
  return { cwd, sessionManager: { getSessionId: () => 'test-session' } } as never
}

function fire(
  api: MockExtensionAPI,
  event: string,
  payload: Record<string, unknown>,
  cwd: string,
): unknown {
  const handlers = api.handlers.get(event) ?? []
  let result: unknown
  for (const handler of handlers) {
    result = handler(payload as never, cwdCtx(cwd))
  }
  return result
}

beforeEach(() => {
  vi.resetModules()
  resetTomlCache()
})

/* ------------------------------------------------------------------ */
/*  Scenarios                                                          */
/* ------------------------------------------------------------------ */

describe('no-skill-delegation', () => {
  it('Should_BlockTaskDispatch_When_SubagentTypeMatchesProtectedSkill', async () => {
    const cwd = withToml(['ce-work', 'ce-plan', 'lfg'])
    const api = await loadExtension()

    const result = fire(api, 'tool_call', {
      type: 'tool_call',
      toolName: 'task',
      toolCallId: 'tc-1',
      input: { subagent_type: 'ce-work', prompt: 'do the work' },
    }, cwd)

    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining('BLOCKED'),
    })
    expect((result as { reason: string }).reason).toContain('ce-work')
    expect((result as { reason: string }).reason).toContain('subagent_type')
  })

  it('Should_BlockAgentDispatch_When_AgentFieldMatchesProtectedSkill', async () => {
    const cwd = withToml(['ce-work', 'ce-plan'])
    const api = await loadExtension()

    const result = fire(api, 'tool_call', {
      type: 'tool_call',
      toolName: 'agent',
      toolCallId: 'tc-2',
      input: { agent: 'ce-work', prompt: 'do it' },
    }, cwd)

    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining('ce-work'),
    })
  })

  it('Should_BlockPrompt_When_DelegationVerbMatchesProtectedSkill', async () => {
    const cwd = withToml(['ce-plan'])
    const api = await loadExtension()

    const result = fire(api, 'tool_call', {
      type: 'tool_call',
      toolName: 'task',
      toolCallId: 'tc-3',
      input: { prompt: 'invoke the ce-plan skill to break down the work' },
    }, cwd)

    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining('ce-plan'),
    })
    expect((result as { reason: string }).reason).toContain('prompt')
  })

  it('Should_PassPrompt_When_OnlyReferenceVerbMentionsProtectedSkill', async () => {
    const cwd = withToml(['ce-plan'])
    const api = await loadExtension()

    const result = fire(api, 'tool_call', {
      type: 'tool_call',
      toolName: 'task',
      toolCallId: 'tc-4',
      input: { prompt: 'per the ce-plan skill, proceed with the next steps' },
    }, cwd)

    expect(result).toBeUndefined()
  })

  it('Should_NoOp_When_TomlIsEmpty', async () => {
    const cwd = withToml([])
    const api = await loadExtension()

    const result = fire(api, 'tool_call', {
      type: 'tool_call',
      toolName: 'task',
      toolCallId: 'tc-5',
      input: { subagent_type: 'ce-work', prompt: 'do the work' },
    }, cwd)

    expect(result).toBeUndefined()
  })

  it('Should_NoOp_When_TomlFileIsMissing', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'nsd-test-'))
    const api = await loadExtension()

    const result = fire(api, 'tool_call', {
      type: 'tool_call',
      toolName: 'task',
      toolCallId: 'tc-6',
      input: { subagent_type: 'ce-work', prompt: 'do the work' },
    }, cwd)

    expect(result).toBeUndefined()
  })

  it('Should_PassThrough_When_NonDelegationToolCalled', async () => {
    const cwd = withToml(['ce-work'])
    const api = await loadExtension()

    const result = fire(api, 'tool_call', {
      type: 'tool_call',
      toolName: 'bash',
      toolCallId: 'tc-7',
      input: { command: 'git status' },
    }, cwd)

    expect(result).toBeUndefined()
  })

  it('Should_FailOpen_When_TomlIsMalformed', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nsd-test-'))
    writeFileSync(join(dir, 'systemfsoftware.toml'), 'no_delegate_skills = [[[[', 'utf-8')
    const api = await loadExtension()

    const result = fire(api, 'tool_call', {
      type: 'tool_call',
      toolName: 'task',
      toolCallId: 'tc-8',
      input: { subagent_type: 'ce-work', prompt: 'do the work' },
    }, dir)

    // Fail open: no block, no throw
    expect(result).toBeUndefined()
  })

  it('Should_PassThrough_When_ToolIsTaskButFieldIsMissing', async () => {
    const cwd = withToml(['ce-work'])
    const api = await loadExtension()

    const result = fire(api, 'tool_call', {
      type: 'tool_call',
      toolName: 'task',
      toolCallId: 'tc-9',
      input: { description: 'just a description mentioning ce-work' },
    }, cwd)

    // description without a delegation verb → pass
    expect(result).toBeUndefined()
  })

  it('Should_BlockPrompt_When_NameAppearsInBacktick', async () => {
    const cwd = withToml(['ce-work'])
    const api = await loadExtension()

    const result = fire(api, 'tool_call', {
      type: 'tool_call',
      toolName: 'task',
      toolCallId: 'tc-10',
      input: { prompt: 'invoke the `ce-work` skill for implementation' },
    }, cwd)

    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining('ce-work'),
    })
  })

  it('Should_Pass_When_ReferenceVerbMatchesWithBacktick', async () => {
    const cwd = withToml(['ce-work'])
    const api = await loadExtension()

    const result = fire(api, 'tool_call', {
      type: 'tool_call',
      toolName: 'task',
      toolCallId: 'tc-11',
      input: { prompt: 'see the `ce-work` skill for details' },
    }, cwd)

    expect(result).toBeUndefined()
  })

  // ── New delegation verbs (use, load, spawn, call, send, create, start) ──

  it('Should_BlockPrompt_When_UseVerbMatchesProtectedSkill', async () => {
    const cwd = withToml(['ce-work'])
    const api = await loadExtension()

    const result = fire(api, 'tool_call', {
      type: 'tool_call',
      toolName: 'task',
      toolCallId: 'tc-uv-1',
      input: { prompt: 'use the ce-work skill in a task to implement the changes' },
    }, cwd)

    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining('ce-work'),
    })
    expect((result as { reason: string }).reason).toContain('prompt')
  })

  it('Should_BlockPrompt_When_LoadVerbMatchesProtectedSkill', async () => {
    const cwd = withToml(['ce-plan'])
    const api = await loadExtension()

    const result = fire(api, 'tool_call', {
      type: 'tool_call',
      toolName: 'task',
      toolCallId: 'tc-ld-1',
      input: { prompt: 'load the ce-plan skill to decompose this' },
    }, cwd)

    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining('ce-plan'),
    })
  })

  it('Should_BlockPrompt_When_SpawnVerbMatchesProtectedSkill', async () => {
    const cwd = withToml(['ce-work'])
    const api = await loadExtension()

    const result = fire(api, 'tool_call', {
      type: 'tool_call',
      toolName: 'task',
      toolCallId: 'tc-sp-1',
      input: { prompt: 'spawn a subagent with the ce-work skill to do the work' },
    }, cwd)

    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining('ce-work'),
    })
  })

  it('Should_BlockPrompt_When_CallVerbMatchesProtectedSkill', async () => {
    const cwd = withToml(['ce-plan'])
    const api = await loadExtension()

    const result = fire(api, 'tool_call', {
      type: 'tool_call',
      toolName: 'task',
      toolCallId: 'tc-cl-1',
      input: { prompt: 'call the ce-plan skill to plan this work' },
    }, cwd)

    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining('ce-plan'),
    })
  })

  it('Should_BlockPrompt_When_SendVerbMatchesProtectedSkill', async () => {
    const cwd = withToml(['ce-work'])
    const api = await loadExtension()

    const result = fire(api, 'tool_call', {
      type: 'tool_call',
      toolName: 'task',
      toolCallId: 'tc-sd-1',
      input: { prompt: 'send the ce-work skill to a subagent for implementation' },
    }, cwd)

    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining('ce-work'),
    })
  })

  it('Should_BlockPrompt_When_CreateVerbMatchesProtectedSkill', async () => {
    const cwd = withToml(['ce-plan'])
    const api = await loadExtension()

    const result = fire(api, 'tool_call', {
      type: 'tool_call',
      toolName: 'task',
      toolCallId: 'tc-cr-1',
      input: { prompt: 'create a task with the ce-plan skill to handle planning' },
    }, cwd)

    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining('ce-plan'),
    })
  })

  it('Should_BlockPrompt_When_StartVerbMatchesProtectedSkill', async () => {
    const cwd = withToml(['ce-work'])
    const api = await loadExtension()

    const result = fire(api, 'tool_call', {
      type: 'tool_call',
      toolName: 'task',
      toolCallId: 'tc-st-1',
      input: { prompt: 'start the ce-work skill to execute the plan' },
    }, cwd)

    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining('ce-work'),
    })
  })

  it('Should_PassPrompt_When_SeeVerbWithNewlyProtectedSkill', async () => {
    const cwd = withToml(['ce-work'])
    const api = await loadExtension()

    const result = fire(api, 'tool_call', {
      type: 'tool_call',
      toolName: 'task',
      toolCallId: 'tc-sr-1',
      input: { prompt: 'see the ce-work skill for details' },
    }, cwd)

    // "see" is a reference verb — must NOT block
    expect(result).toBeUndefined()
  })

  // ── Telemetry ──

  it('Should_EmitDelegationBlocked_When_SubagentTypeMatches', async () => {
    const cwd = withToml(['ce-work'])
    const api = await loadExtension()

    fire(api, 'tool_call', {
      type: 'tool_call',
      toolName: 'task',
      toolCallId: 'tc-tel-1',
      input: { subagent_type: 'ce-work', prompt: 'do it' },
    }, cwd)

    const blockedRecords = api.recordedLogs.filter(
      (r) => r.level === 'info' && (r.context as Record<string, unknown>)?.event === 'delegation.blocked',
    )
    expect(blockedRecords.length).toBe(1)
    const ctx = blockedRecords[0]?.context as Record<string, unknown> | undefined
    expect(ctx?.plugin).toBe('agent_discipline')
    expect(ctx?.skill).toBe('ce-work')
    expect(ctx?.how).toBe('subagent_type')
  })

  it('Should_EmitDelegationBlocked_When_PromptMatches', async () => {
    const cwd = withToml(['ce-work'])
    const api = await loadExtension()

    fire(api, 'tool_call', {
      type: 'tool_call',
      toolName: 'task',
      toolCallId: 'tc-tel-2',
      input: { prompt: 'invoke the ce-work skill for implementation' },
    }, cwd)

    const blockedRecords = api.recordedLogs.filter(
      (r) => r.level === 'info' && (r.context as Record<string, unknown>)?.event === 'delegation.blocked',
    )
    expect(blockedRecords.length).toBe(1)
    const ctx = blockedRecords[0]?.context as Record<string, unknown> | undefined
    expect(ctx?.plugin).toBe('agent_discipline')
    expect(ctx?.skill).toBe('ce-work')
    expect(ctx?.how).toBe('prompt')
  })

  it('Should_NotThrow_When_LoggerThrows', async () => {
    const cwd = withToml(['ce-work'])
    const recordedLogs: MockExtensionAPI['recordedLogs'] = []
    const throwingLogger = {
      info() {
        throw new Error('logger failure')
      },
      warn() {},
      error() {},
      debug() {},
    }
    const api: MockExtensionAPI = {
      handlers: new Map(),
      on(event, handler) {
        const list = this.handlers.get(event) ?? []
        list.push(handler)
        this.handlers.set(event, list)
      },
      logger: throwingLogger,
      recordedLogs,
    }
    const mod = await import('../src/no-skill-delegation.ts')
    mod.default(api as never)

    // Even with a throwing logger, the guard must still block.
    const result = fire(api, 'tool_call', {
      type: 'tool_call',
      toolName: 'task',
      toolCallId: 'tc-tel-3',
      input: { subagent_type: 'ce-work', prompt: 'do it' },
    }, cwd)

    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining('ce-work'),
    })
  })
})
