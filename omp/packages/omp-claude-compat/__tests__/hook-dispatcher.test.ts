/**
 * Integration tests for the hook dispatcher — real I/O, no mocks.
 *
 * Uses it.effect from the vitest adapter. All file operations go through
 * the platform FileSystem service — same interface as production. Each test
 * creates a scoped temp directory, writes real shell hook scripts (.sh,
 * portable — no bun), writes a real .claude/settings.json, and runs the
 * REAL executor with REAL NodeCommandExecutor + NodeFileSystem.
 */
import { NodeCommandExecutor, NodeFileSystem } from '@effect/platform-node'
import { FileSystem } from '@effect/platform/FileSystem'
import { afterEach, describe, expect, it } from '@effect/vitest'
import type { ExtensionContext, ToolCallEvent } from '@oh-my-pi/pi-coding-agent'
import { Effect, Layer } from 'effect'
import { clearSettingsCache, loadSettings, runPreToolUseHooks } from '../src/hook-dispatcher.executor.js'

const testLayer = NodeCommandExecutor.layer.pipe(Layer.provideMerge(NodeFileSystem.layer))

afterEach(() => clearSettingsCache())

function makeCtx(cwd: string): ExtensionContext {
  return {
    cwd,
    sessionManager: { getSessionId: () => 'test-session' },
  } as unknown as ExtensionContext
}

function writeShellHook(
  dir: string,
  name: string,
  exitCode: number,
  stderr?: string,
  stdout?: string,
): Effect.Effect<string, never, FileSystem.FileSystem> {
  return Effect.gen(function*() {
    const fs = yield* FileSystem
    const hookPath = `${dir}/${name}.sh`
    const lines: string[] = ['#!/bin/sh']
    if (stdout) lines.push(`printf '%s' ${JSON.stringify(stdout)}`)
    if (stderr) lines.push(`printf '%s' ${JSON.stringify(stderr)} >&2`)
    lines.push(`exit ${exitCode}`)
    yield* fs.writeFileString(hookPath, `${lines.join('\n')}\n`)
    yield* fs.chmod(hookPath, 0o755)
    return hookPath
  })
}

function writeSettings(
  dir: string,
  hooks: Record<string, unknown>,
): Effect.Effect<void, never, FileSystem.FileSystem> {
  return Effect.gen(function*() {
    const fs = yield* FileSystem
    const settingsDir = `${dir}/.claude`
    yield* fs.makeDirectory(settingsDir, { recursive: true })
    yield* fs.writeFileString(
      `${settingsDir}/settings.json`,
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
  })
}

function makeToolCall(toolName: string, input: Record<string, unknown>): ToolCallEvent {
  return { type: 'tool_call', toolName, toolCallId: 'tc-test', input }
}

describe('loadSettings (integration)', () => {
  it.effect('Should_ReturnNull_When_NoSettingsFile', () =>
    Effect.scoped(
      Effect.gen(function*() {
        const fs = yield* FileSystem
        const dir = yield* fs.makeTempDirectoryScoped()
        const result = yield* loadSettings(dir)
        expect(result).toBeNull()
      }),
    ).pipe(Effect.provide(testLayer)))

  it.effect('Should_ReturnSettings_When_FileExists', () =>
    Effect.scoped(
      Effect.gen(function*() {
        const fs = yield* FileSystem
        const dir = yield* fs.makeTempDirectoryScoped()
        yield* writeSettings(dir, {
          PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: '/hooks/check.sh' }] }],
        })
        const result = yield* loadSettings(dir)
        expect(result).not.toBeNull()
        expect(result!.hooks.PreToolUse).toHaveLength(1)
      }),
    ).pipe(Effect.provide(testLayer)))
})

describe('runPreToolUseHooks (integration)', () => {
  it.effect('Should_Block_When_HookExits2', () =>
    Effect.scoped(
      Effect.gen(function*() {
        const fs = yield* FileSystem
        const dir = yield* fs.makeTempDirectoryScoped()
        const hook = yield* writeShellHook(dir, 'block', 2, 'blocked by policy')
        yield* writeSettings(dir, {
          PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: hook }] }],
        })
        const settings = yield* loadSettings(dir)
        expect(settings).not.toBeNull()

        const result = yield* runPreToolUseHooks(
          settings!,
          makeToolCall('write', { path: '/test.txt', content: 'x' }),
          makeCtx(dir),
        )
        expect(result).toEqual({ block: true, reason: 'blocked by policy' })
      }),
    ).pipe(Effect.provide(testLayer)))

  it.effect('Should_Allow_When_HookExits0', () =>
    Effect.scoped(
      Effect.gen(function*() {
        const fs = yield* FileSystem
        const dir = yield* fs.makeTempDirectoryScoped()
        const hook = yield* writeShellHook(dir, 'allow', 0)
        yield* writeSettings(dir, {
          PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: hook }] }],
        })
        const settings = yield* loadSettings(dir)
        expect(settings).not.toBeNull()

        const result = yield* runPreToolUseHooks(
          settings!,
          makeToolCall('write', { path: '/test.txt', content: 'x' }),
          makeCtx(dir),
        )
        expect(result).toBeUndefined()
      }),
    ).pipe(Effect.provide(testLayer)))

  it.effect('Should_Block_When_PermissionDecisionDeny', () =>
    Effect.scoped(
      Effect.gen(function*() {
        const fs = yield* FileSystem
        const dir = yield* fs.makeTempDirectoryScoped()
        const denyJson = JSON.stringify({
          hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: 'banned by policy' },
        })
        const hook = yield* writeShellHook(dir, 'deny', 0, undefined, denyJson)
        yield* writeSettings(dir, {
          PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: hook }] }],
        })
        const settings = yield* loadSettings(dir)
        expect(settings).not.toBeNull()

        const result = yield* runPreToolUseHooks(
          settings!,
          makeToolCall('write', { path: '/test.txt', content: 'x' }),
          makeCtx(dir),
        )
        expect(result).toEqual({ block: true, reason: 'banned by policy' })
      }),
    ).pipe(Effect.provide(testLayer)))

  it.effect('Should_BlockBashCommand_When_HookTargetsBashMatcher', () =>
    Effect.scoped(
      Effect.gen(function*() {
        const fs = yield* FileSystem
        const dir = yield* fs.makeTempDirectoryScoped()
        const hook = yield* writeShellHook(dir, 'block-npx', 2, 'npx is forbidden')
        yield* writeSettings(dir, {
          PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: hook }] }],
        })
        const settings = yield* loadSettings(dir)
        expect(settings).not.toBeNull()

        const result = yield* runPreToolUseHooks(
          settings!,
          makeToolCall('bash', { command: 'npx eslint .' }),
          makeCtx(dir),
        )
        expect(result).toBeDefined()
        expect(result?.block).toBe(true)
      }),
    ).pipe(Effect.provide(testLayer)))
})
