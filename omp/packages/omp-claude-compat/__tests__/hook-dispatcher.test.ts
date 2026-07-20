/**
 * Smoke tests for the OMP hook dispatcher bridge.
 *
 * Every test creates its own temp directory with mock hooks and settings —
 * no dependency on the host environment's `.claude/` configuration.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

interface ToolCallEvent {
  readonly type: 'tool_call'
  readonly toolName: string
  readonly toolCallId: string
  readonly input: Record<string, unknown>
}

interface TextContent {
  readonly type: 'text'
  readonly text: string
}

interface ImageContent {
  readonly type: 'image'
  readonly data: string
  readonly mimeType: string
}

interface ToolResultEvent {
  readonly type: 'tool_result'
  readonly toolName: string
  readonly toolCallId: string
  readonly input: Record<string, unknown>
  readonly content: readonly (TextContent | ImageContent)[]
  readonly isError: boolean
}

interface InputEvent {
  readonly type: 'input'
  readonly text: string
  readonly source: string
  readonly images?: readonly unknown[]
}

interface MockExtensionAPI {
  readonly handlers: Map<string, Array<(event: unknown, ctx: unknown) => unknown>>
  on: (event: string, handler: (event: unknown, ctx: unknown) => unknown) => void
  readonly cwd: string
  readonly logger: {
    info: (message: unknown, context?: unknown) => void
    warn: (message: unknown, context?: unknown) => void
    error: (message: unknown, context?: unknown) => void
    debug: (message: unknown, context?: unknown) => void
  }
  readonly recordedLogs: Array<{ level: string; message: unknown; context?: unknown }>
}

function makeMockCtx(api: MockExtensionAPI): Record<string, unknown> {
  return {
    cwd: api.cwd,
    sessionManager: { getSessionId: () => 'test-session' },
  }
}

function fireToolCall(api: MockExtensionAPI, toolName: string, input: Record<string, unknown>): Promise<unknown> {
  const handlers = api.handlers.get('tool_call') ?? []
  const event: ToolCallEvent = { type: 'tool_call', toolName, toolCallId: 'test-1', input }
  const ctx = makeMockCtx(api)
  for (const handler of handlers) {
    return handler(event, ctx) as Promise<unknown>
  }
  return Promise.resolve(undefined)
}

function fireToolResult(
  api: MockExtensionAPI,
  toolName: string,
  input: Record<string, unknown>,
  content: string | readonly (TextContent | ImageContent)[],
): Promise<unknown> {
  const handlers = api.handlers.get('tool_result') ?? []
  const event: ToolResultEvent = {
    type: 'tool_result',
    toolName,
    toolCallId: 'test-1',
    input,
    content: typeof content === 'string' ? [{ type: 'text' as const, text: content }] : content,
    isError: false,
  }
  const ctx = makeMockCtx(api)
  for (const handler of handlers) {
    return handler(event, ctx) as Promise<unknown>
  }
  return Promise.resolve(undefined)
}

function fireInput(api: MockExtensionAPI, text: string): Promise<unknown> {
  const handlers = api.handlers.get('input') ?? []
  const event: InputEvent = { type: 'input', text, source: 'user' }
  const ctx = makeMockCtx(api)
  for (const handler of handlers) {
    return handler(event, ctx) as Promise<unknown>
  }
  return Promise.resolve(undefined)
}

function isBlockResult(value: unknown): value is { block: true; reason?: string } {
  if (typeof value !== 'object' || value === null || !('block' in value)) return false
  return value.block === true
}

function getBlockReason(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('reason' in value)) return undefined
  const reason = value.reason
  return typeof reason === 'string' ? reason : undefined
}

function getInputText(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('text' in value)) return undefined
  const text = value.text
  return typeof text === 'string' ? text : undefined
}

/** Write a mock .ts hook script that exits with the given code. Uses .ts so the dispatcher runs it via bun. */
function writeMockHook(dir: string, name: string, exitCode: number, stderr?: string): string {
  const hookPath = resolve(dir, `${name}.ts`)
  const lines: string[] = []
  if (stderr) lines.push(`process.stderr.write(${JSON.stringify(stderr)});`)
  lines.push(`process.exit(${exitCode});`)
  writeFileSync(hookPath, lines.join('\n'))
  return hookPath
}

function writeSettings(dir: string, hooks: Record<string, unknown>): void {
  const hooksDir = resolve(dir, '.claude', 'hooks')
  mkdirSync(hooksDir, { recursive: true })
  writeFileSync(
    resolve(dir, '.claude', 'settings.json'),
    JSON.stringify({
      hooks: {
        PreToolUse: [],
        PostToolUse: [],
        UserPromptSubmit: [],
        Stop: [],
        SessionStart: [],
        SessionEnd: [],
        ...hooks,
      },
    }),
  )
}

// Load dispatcher — dynamic import required for test isolation
async function createDispatcher(cwd: string): Promise<MockExtensionAPI> {
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
    cwd,
    logger,
    recordedLogs,
  }
  const module = await import('../src/hook-dispatcher.ts')
  module.default(api as never)
  return api
}

describe('hook dispatcher bridge', () => {
  it('Should_LoadWithoutError_When_ExtensionIsInitialized', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    const api = await createDispatcher(dir)
    expect(api.handlers.has('tool_call')).toBe(true)
    expect(api.handlers.has('tool_result')).toBe(true)
    expect(api.handlers.has('input')).toBe(true)
    expect(api.handlers.has('session_start')).toBe(true)
  })

  // ── PreToolUse blocking (exit 2) ──

  it('Should_BlockWritesToIssuesRootFile_When_WritingToIssues', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    const hook = writeMockHook(dir, 'block-issues', 2, 'blocked by issues guard')
    writeSettings(dir, { PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: hook }] }] })
    const api = await createDispatcher(dir)

    const result = await fireToolCall(api, 'write', { path: '.issues/foo.md', content: 'test' })
    expect(isBlockResult(result)).toBe(true)
    expect(getBlockReason(result)?.toLowerCase()).toContain('blocked')
    rmSync(dir, { recursive: true, force: true })
  })

  it('Should_BlockNpxInBashCommands_When_CommandStartsWithNpx', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    const hook = writeMockHook(dir, 'block-npx', 2, 'npx is forbidden')
    writeSettings(dir, { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: hook }] }] })
    const api = await createDispatcher(dir)

    const result = await fireToolCall(api, 'bash', { command: 'npx eslint .' })
    expect(isBlockResult(result)).toBe(true)
    expect(getBlockReason(result)?.toLowerCase()).toContain('npx')
    rmSync(dir, { recursive: true, force: true })
  })

  it('Should_AllowWritesOutsideIssues_When_TargetIsNotInIssues', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    const api = await createDispatcher(dir)
    const tmpDir = join(tmpdir(), `omp-test-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
    writeFileSync(join(tmpDir, 'ok.ts'), 'export {}')

    const result = await fireToolCall(api, 'write', { path: join(tmpDir, 'ok.ts'), content: 'export {}' })
    expect(isBlockResult(result)).toBe(false)
  })

  it('Should_BlockNpx_When_CtxExecuteShellContainsNpx', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    const hook = writeMockHook(dir, 'block-npx', 2, 'npx is forbidden')
    writeSettings(dir, { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: hook }] }] })
    const api = await createDispatcher(dir)

    const result = await fireToolCall(api, 'ctx_execute', { language: 'shell', code: 'npx eslint .' })
    expect(isBlockResult(result)).toBe(true)
    expect(getBlockReason(result)?.toLowerCase()).toContain('npx')
    rmSync(dir, { recursive: true, force: true })
  })

  it('Should_BlockNpx_When_CtxBatchExecuteContainsNpx', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    const hook = writeMockHook(dir, 'block-npx', 2, 'npx is forbidden')
    writeSettings(dir, { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: hook }] }] })
    const api = await createDispatcher(dir)

    const result = await fireToolCall(api, 'ctx_batch_execute', {
      commands: [{ label: 'lint', command: 'npx eslint .' }],
    })
    expect(isBlockResult(result)).toBe(true)
    expect(getBlockReason(result)?.toLowerCase()).toContain('npx')
    rmSync(dir, { recursive: true, force: true })
  })

  it('Should_BlockGit_When_CtxExecuteShellContainsGit', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    const hook = writeMockHook(dir, 'block-git', 2, 'git is forbidden')
    writeSettings(dir, { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: hook }] }] })
    const api = await createDispatcher(dir)

    const result = await fireToolCall(api, 'ctx_execute', { language: 'shell', code: 'git status' })
    expect(isBlockResult(result)).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('Should_BlockDockerContainerPrune_When_CommandMatchesForbiddenPattern', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    const hook = writeMockHook(dir, 'block-docker', 2, 'docker is forbidden')
    writeSettings(dir, { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: hook }] }] })
    const api = await createDispatcher(dir)

    const result = await fireToolCall(api, 'bash', { command: 'docker container prune' })
    expect(isBlockResult(result)).toBe(true)
    expect(getBlockReason(result)?.toLowerCase()).toContain('docker')
    rmSync(dir, { recursive: true, force: true })
  })

  it('Should_BlockGitCommitWithMultipleMessageFlags_When_CommandHasTwoFlags', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    const hook = writeMockHook(dir, 'block-commit', 2, 'multi-message commit forbidden')
    writeSettings(dir, { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: hook }] }] })
    const api = await createDispatcher(dir)

    const result = await fireToolCall(api, 'bash', { command: 'git commit -m "foo" -m "bar"' })
    expect(isBlockResult(result)).toBe(true)
    expect(getBlockReason(result)?.toLowerCase()).toContain('commit')
    rmSync(dir, { recursive: true, force: true })
  })

  it('Should_BlockToolCall_When_MockHookRepliesWithPermissionDecisionDeny', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    const hook = resolve(dir, 'mock-deny.ts')
    writeFileSync(
      hook,
      'console.log(JSON.stringify({ hookSpecificOutput: { permissionDecision: "deny", permissionDecisionReason: "banned by mock" } }));\n',
    )
    writeSettings(dir, { PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: hook }] }] })
    const api = await createDispatcher(dir)

    const result = await fireToolCall(api, 'write', { path: 'packages/foo/src/bar.ts', content: 'export {}' })
    rmSync(dir, { recursive: true, force: true })
    expect(isBlockResult(result)).toBe(true)
    expect(getBlockReason(result)?.toLowerCase()).toContain('banned')
  })

  // ── PostToolUse ──

  it('Should_RunPostToolUseHooksWithoutError_When_ToolResultIsEmitted', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    const api = await createDispatcher(dir)
    const result = await fireToolResult(api, 'write', {
      file_path: 'packages/foo/src/bar.ts',
      content: 'export const x = 1',
    }, '')
    expect(result).toBeUndefined()
  })

  it('Should_SurfacePostToolUseBlockAsError_When_HookExitsCode2', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    const hook = writeMockHook(dir, 'block-post', 2, 'POST BLOCK: lint failed')
    writeSettings(dir, { PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: hook }] }] })
    const api = await createDispatcher(dir)

    const result = (await fireToolResult(api, 'write', {
      file_path: '/tmp/test.ts',
      content: 'const x = 1',
    }, 'File written successfully')) as { isError?: boolean; content?: Array<{ type: string; text?: string }> }

    expect(result?.isError).toBe(true)
    expect(result?.content?.[0]?.text).toContain('POST BLOCK')
    rmSync(dir, { recursive: true, force: true })
  })

  // ── UserPromptSubmit ──

  it('Should_PrependUserPromptSubmitHookOutput_When_HookOutputsText', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    const hook = resolve(dir, 'correction.ts')
    writeFileSync(hook, 'process.stdout.write("CORRECTION NOTE: fix grammar\\n");\n')
    writeSettings(dir, { UserPromptSubmit: [{ hooks: [{ type: 'command', command: hook }] }] })
    const api = await createDispatcher(dir)

    const result = await fireInput(api, 'you need to fix it')
    const text = getInputText(result)
    expect(typeof text).toBe('string')
    expect(text?.toLowerCase()).toContain('correction')
    rmSync(dir, { recursive: true, force: true })
  })

  it('Should_RunSessionStartHooksWithoutError_When_SessionEventsFire', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    const api = await createDispatcher(dir)
    const ctx = makeMockCtx(api)
    for (const eventName of ['session_start', 'session_compact', 'agent_start'] as const) {
      const handlers = api.handlers.get(eventName) ?? []
      for (const handler of handlers) {
        await handler({ type: eventName }, ctx)
      }
    }
  })

  // ── Telemetry ──

  it('Should_EmitHookExecuted_When_HookRunsSuccessfully', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    const hook = writeMockHook(dir, 'ok-hook', 0)
    writeSettings(dir, { PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: hook }] }] })
    const api = await createDispatcher(dir)

    await fireToolCall(api, 'write', { path: '/tmp/test.txt', content: 'test' })

    const hookRecords = api.recordedLogs.filter((r) =>
      r.level === 'info' && (r.context as Record<string, unknown>)?.event === 'hook.executed'
    )
    expect(hookRecords.length).toBe(1)
    const ctx = hookRecords[0]?.context as Record<string, unknown> | undefined
    expect(ctx).toBeDefined()
    expect(ctx!.plugin).toBe('claude_compat')
    expect(ctx!.duration_ms).toBeGreaterThanOrEqual(0)
    expect(ctx!.exit_code).toBe(0)
    expect(ctx!.hook).toBeDefined()
    rmSync(dir, { recursive: true, force: true })
  })

  it('Should_EmitToolCallDecisionAllow_When_HookPasses', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    const hook = writeMockHook(dir, 'allow-hook', 0)
    writeSettings(dir, { PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: hook }] }] })
    const api = await createDispatcher(dir)

    await fireToolCall(api, 'write', { path: '/tmp/test.txt', content: 'test' })

    const allowRecords = api.recordedLogs.filter(
      (r) => r.level === 'info' && (r.context as Record<string, unknown>)?.event === 'tool_call.decision',
    )
    const allowRecord = allowRecords.find(
      (r) => (r.context as Record<string, unknown>)?.decision === 'allow',
    )
    expect(allowRecord).toBeDefined()
    const ctx = allowRecord?.context as Record<string, unknown> | undefined
    expect(ctx?.plugin).toBe('claude_compat')
    expect(ctx?.tool_name).toBe('Write')
    rmSync(dir, { recursive: true, force: true })
  })

  it('Should_EmitToolCallDecisionBlock_When_HookBlocks', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    const hook = writeMockHook(dir, 'block-hook', 2, 'denied by policy')
    writeSettings(dir, { PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: hook }] }] })
    const api = await createDispatcher(dir)

    const result = await fireToolCall(api, 'write', { path: '/tmp/test.txt', content: 'test' })
    expect(isBlockResult(result)).toBe(true)

    const blockRecords = api.recordedLogs.filter(
      (r) => r.level === 'info' && (r.context as Record<string, unknown>)?.event === 'tool_call.decision',
    )
    const blockRecord = blockRecords.find(
      (r) => (r.context as Record<string, unknown>)?.decision === 'block',
    )
    expect(blockRecord).toBeDefined()
    const ctx = blockRecord?.context as Record<string, unknown> | undefined
    expect(ctx?.plugin).toBe('claude_compat')
    expect(ctx?.tool_name).toBe('Write')
    expect(ctx?.reason).toBeDefined()
    rmSync(dir, { recursive: true, force: true })
  })

  it('Should_NotThrow_When_LoggerThrows', async () => {
    // A throwing logger must not break the extension path.
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
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
      cwd: dir,
      logger: throwingLogger,
      recordedLogs,
    }
    const module = await import('../src/hook-dispatcher.ts')
    module.default(api as never)

    // Fire a tool_call with hooks configured — even though logger throws,
    // the extension behavior must be unchanged.
    const hook = writeMockHook(dir, 'block-hook', 2, 'denied')
    writeSettings(dir, {
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: hook }] }],
    })
    const result = await fireToolCall(api, 'bash', { command: 'rm -rf /' })
    expect(isBlockResult(result)).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  // ── Lifecycle telemetry ──

  it('Should_SwallowFailingLifecycleHookAndEmitTelemetry_When_SessionShutdownHooksError', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    const hook = writeMockHook(dir, 'failing-hook', 1, 'lifecycle failure')
    writeSettings(dir, { SessionEnd: [{ hooks: [{ type: 'command', command: hook }] }] })
    const api = await createDispatcher(dir)
    const ctx = makeMockCtx(api)

    const handlers = api.handlers.get('session_shutdown') ?? []
    for (const handler of handlers) {
      await expect(handler({ type: 'session_shutdown' }, ctx)).resolves.toBeUndefined()
    }

    const hookRecords = api.recordedLogs.filter((r) =>
      r.level === 'info' && (r.context as Record<string, unknown>)?.event === 'hook.executed'
    )
    expect(hookRecords.length).toBe(1)
    const ctx2 = hookRecords[0]?.context as Record<string, unknown> | undefined
    expect(ctx2).toBeDefined()
    expect(ctx2!.exit_code).toBe(1)
    expect(ctx2!.error).toBeUndefined()
    rmSync(dir, { recursive: true, force: true })
  })

  // ── Settings cache ──

  it('Should_ServeCachedSettings_When_SettingsFileIsDeletedAfterFirstCall', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    const hook = writeMockHook(dir, 'block-writes', 2, 'blocked')
    writeSettings(dir, { PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: hook }] }] })
    const api = await createDispatcher(dir)

    // First call loads settings into cache
    const r1 = await fireToolCall(api, 'write', { path: '/tmp/test.txt', content: 'test' })
    expect(isBlockResult(r1)).toBe(true)

    // Delete the settings file — cache should still serve the original
    rmSync(resolve(dir, '.claude'), { recursive: true, force: true })
    const r2 = await fireToolCall(api, 'write', { path: '/tmp/test.txt', content: 'test' })
    expect(isBlockResult(r2)).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('Should_NotCacheTransientFailure_When_SettingsFileMissingThenCreated', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    const api = await createDispatcher(dir)

    // No settings file — loadSettings returns null (not cached)
    const r1 = await fireToolCall(api, 'write', { path: '/tmp/test.txt', content: 'test' })
    expect(isBlockResult(r1)).toBe(false)

    // Now create settings with a blocking hook
    const hook = writeMockHook(dir, 'block-writes', 2, 'blocked')
    writeSettings(dir, { PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: hook }] }] })

    // Second call should re-read and find the hooks (null was not cached)
    const r2 = await fireToolCall(api, 'write', { path: '/tmp/test.txt', content: 'test' })
    expect(isBlockResult(r2)).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  // ── Async hooks ──

  it('Should_DispatchAsyncHookAndEmitTelemetry_When_PreToolUseHookIsAsync', async () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'omp-test-'))
    const hook = writeMockHook(dir, 'async-validator', 0)
    writeSettings(dir, { PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: hook, async: true }] }] })
    const api = await createDispatcher(dir)

    const result = await fireToolCall(api, 'write', { path: '/tmp/test.txt', content: 'test' })
    // Async hooks don't block — result should be undefined (not blocked)
    expect(isBlockResult(result)).toBe(false)

    // Wait for async hook to complete (subprocess)
    await vi.waitFor(() => {
      const hookRecords = api.recordedLogs.filter((r) =>
        r.level === 'info' && (r.context as Record<string, unknown>)?.event === 'hook.executed'
      )
      expect(hookRecords.length).toBe(1)
      const ctx2 = hookRecords[0]?.context as Record<string, unknown> | undefined
      expect(ctx2).toBeDefined()
      expect(ctx2!.exit_code).toBe(0)
      expect(ctx2!.hook).toBe('async-validator.ts')
    }, { timeout: 2000, interval: 50 })
    rmSync(dir, { recursive: true, force: true })
  })
})
