import { NodeCommandExecutor, NodeFileSystem } from '@effect/platform-node'
import type { PlatformError } from '@effect/platform/Error'
import { FileSystem } from '@effect/platform/FileSystem'
import * as PathModule from '@effect/platform/Path'
import type { ExtensionContext, ToolCallEvent, ToolResultEvent } from '@oh-my-pi/pi-coding-agent'
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { expect } from 'vitest'
import { loadSettingsWithPaths, runPostToolUseHooks, runPreToolUseHooks } from '../src/hook-dispatcher.executor.js'

const Feature = makeFeature({ it, layer })

const testLayer = NodeCommandExecutor.layer.pipe(
  Layer.provideMerge(NodeFileSystem.layer),
  Layer.provideMerge(PathModule.layer),
)

function writeShellHook(
  dir: string,
  name: string,
  exitCode: number,
  stderr?: string,
  stdout?: string,
): Effect.Effect<string, PlatformError, FileSystem> {
  return Effect.gen(function*() {
    const fs = yield* FileSystem
    const content = [
      '#!/usr/bin/env bash',
      ...(stderr ? [`echo '${stderr}' >&2`] : []),
      ...(stdout ? [`echo '${stdout}'`] : []),
      `exit ${exitCode}`,
    ].join('\n')
    const hookPath = `${dir}/${name}.sh`
    yield* fs.writeFileString(hookPath, content)
    yield* fs.chmod(hookPath, 0o755)
    return hookPath
  })
}
function makeCtx(cwd: string): ExtensionContext {
  return {
    cwd,
    sessionManager: { getSessionId: () => 'test-session' },
  } as unknown as ExtensionContext
}

function writeSettings(
  dir: string,
  hooks: Record<string, unknown>,
): Effect.Effect<void, PlatformError, FileSystem> {
  return Effect.gen(function*() {
    const fs = yield* FileSystem
    yield* fs.makeDirectory(`${dir}/.claude`, { recursive: true })
    yield* fs.writeFileString(
      `${dir}/.claude/settings.json`,
      JSON.stringify({ hooks }, null, 2),
    )
  })
}

function makeToolCall(toolName: string, input: Record<string, unknown>): ToolCallEvent {
  return { type: 'tool_call', toolName, toolCallId: 'tc-test', input }
}

function makeToolResult(toolName: string, input: Record<string, unknown>): ToolResultEvent {
  return {
    type: 'tool_result',
    toolName,
    toolCallId: 'tc-test',
    input,
    content: 'ok',
  } as unknown as ToolResultEvent
}

Feature('Hook dispatcher — settings loading')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    scenario(
      'Should return null when no settings file exists',
      Gherkin.Do.pipe(
        Given('a temporary empty directory')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            return yield* fs.makeTempDirectoryScoped()
          })),
        When('loadSettingsWithPaths is called with non-existent path')(
          'result',
          (s) => loadSettingsWithPaths([`${s.dir}/.claude/settings.json`]),
        ),
        Then('the result should be null')((s) =>
          Effect.sync(() => {
            expect(s.result).toBeNull()
          })
        ),
      ),
    )

    scenario(
      'Should return settings when settings file exists',
      Gherkin.Do.pipe(
        Given('a directory with .claude/settings.json')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            yield* writeSettings(dir, {
              PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: '/hooks/check.sh' }] }],
            })
            return dir
          })),
        When('loadSettingsWithPaths is called with settings path')(
          'result',
          (s) => loadSettingsWithPaths([`${s.dir}/.claude/settings.json`]),
        ),
        Then('the settings should contain one PreToolUse hook')((s) =>
          Effect.sync(() => {
            expect(s.result).not.toBeNull()
            expect(s.result!.hooks.PreToolUse).toHaveLength(1)
          })
        ),
      ),
    )
  })

Feature('Hook dispatcher — PreToolUse hook execution')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    scenario(
      'Should block tool use when hook exits 2',
      Gherkin.Do.pipe(
        Given('a directory with a block hook configured')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hook = yield* writeShellHook(dir, 'block', 2, 'blocked by policy')
            yield* writeSettings(dir, {
              PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: hook }] }],
            })
            return { dir, hook }
          })),
        When('runPreToolUseHooks is called for a Write tool call')('result', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir.dir}/.claude/settings.json`])
            expect(settings).not.toBeNull()
            return yield* runPreToolUseHooks(
              settings!,
              makeToolCall('write', { path: '/test.txt', content: 'x' }),
              makeCtx(s.dir.dir),
            )
          })),
        Then('the hook should block the tool with a reason')((s) =>
          Effect.sync(() => {
            expect(s.result).toEqual({ block: true, reason: 'blocked by policy' })
          })
        ),
      ),
    )

    scenario(
      'Should allow tool use when hook exits 0',
      Gherkin.Do.pipe(
        Given('a directory with an allow hook configured')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hook = yield* writeShellHook(dir, 'allow', 0)
            yield* writeSettings(dir, {
              PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: hook }] }],
            })
            return { dir, hook }
          })),
        When('runPreToolUseHooks is called for a Write tool call')('result', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir.dir}/.claude/settings.json`])
            expect(settings).not.toBeNull()
            return yield* runPreToolUseHooks(
              settings!,
              makeToolCall('write', { path: '/test.txt', content: 'x' }),
              makeCtx(s.dir.dir),
            )
          })),
        Then('the result should be undefined')((s) =>
          Effect.sync(() => {
            expect(s.result).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'Should block tool use when permission decision is deny',
      Gherkin.Do.pipe(
        Given('a directory with a deny-returning hook')('dir', (_s) =>
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
            return { dir, hook }
          })),
        When('runPreToolUseHooks is called for a Write tool call')('result', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir.dir}/.claude/settings.json`])
            expect(settings).not.toBeNull()
            return yield* runPreToolUseHooks(
              settings!,
              makeToolCall('write', { path: '/test.txt', content: 'x' }),
              makeCtx(s.dir.dir),
            )
          })),
        Then('the hook should block with the deny reason')((s) =>
          Effect.sync(() => {
            expect(s.result).toEqual({ block: true, reason: 'banned by policy' })
          })
        ),
      ),
    )

    scenario(
      'Should block bash commands when hook targets Bash matcher',
      Gherkin.Do.pipe(
        Given('a directory with a Bash block hook')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hook = yield* writeShellHook(dir, 'block-npx', 2, 'npx is forbidden')
            yield* writeSettings(dir, {
              PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: hook }] }],
            })
            return { dir, hook }
          })),
        When('runPreToolUseHooks is called for a Bash tool call')('result', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir.dir}/.claude/settings.json`])
            expect(settings).not.toBeNull()
            return yield* runPreToolUseHooks(
              settings!,
              makeToolCall('bash', { command: 'npx eslint .' }),
              makeCtx(s.dir.dir),
            )
          })),
        Then('the hook should block the bash command')((s) =>
          Effect.sync(() => {
            expect(s.result).toBeDefined()
            expect(s.result?.block).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Should rewrite tool input when a hook returns updatedInput',
      Gherkin.Do.pipe(
        Given('a directory with a hook returning updatedInput')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const rewriteJson = JSON.stringify({
              hookSpecificOutput: { updatedInput: { tool_input: { content: 'rewritten by hook' } } },
            })
            const hook = yield* writeShellHook(dir, 'rewrite', 0, undefined, rewriteJson)
            yield* writeSettings(dir, {
              PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: hook }] }],
            })
            return { dir, hook }
          })),
        When('runPreToolUseHooks is called for a Write tool call')('event', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir.dir}/.claude/settings.json`])
            expect(settings).not.toBeNull()
            const event = makeToolCall('write', { path: '/test.txt', content: 'original' })
            const result = yield* runPreToolUseHooks(settings!, event, makeCtx(s.dir.dir))
            expect(result).toBeUndefined()
            return event
          })),
        Then("the tool call's input should carry the hook's replacement")((s) =>
          Effect.sync(() => {
            expect(s.event.input).toEqual({ path: '/test.txt', content: 'rewritten by hook' })
          })
        ),
      ),
    )
  })

Feature('Hook dispatcher — PostToolUse warning slot')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    scenario(
      'Should not warn when a hook exits 0 without writing to stdout',
      Gherkin.Do.pipe(
        Given('a directory with a silent exit-0 hook')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hook = yield* writeShellHook(dir, 'silent', 0)
            yield* writeSettings(dir, {
              PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: hook }] }],
            })
            return { dir, hook }
          })),
        When('runPostToolUseHooks is called for a Write tool result')('result', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir.dir}/.claude/settings.json`])
            expect(settings).not.toBeNull()
            return yield* runPostToolUseHooks(
              settings!,
              makeToolResult('write', { path: '/test.txt', content: 'x' }),
              makeCtx(s.dir.dir),
            )
          })),
        Then('the dispatcher should report no warning')((s) =>
          Effect.sync(() => {
            expect(s.result).toEqual({})
          })
        ),
      ),
    )

    scenario(
      'Should not warn when a hook exits 0 writing plain non-JSON text',
      Gherkin.Do.pipe(
        Given('a directory with a status-printing exit-0 hook')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hook = yield* writeShellHook(dir, 'chatty', 0, undefined, 'hook-ran')
            yield* writeSettings(dir, {
              PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: hook }] }],
            })
            return { dir, hook }
          })),
        When('runPostToolUseHooks is called for a Write tool result')('result', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir.dir}/.claude/settings.json`])
            expect(settings).not.toBeNull()
            return yield* runPostToolUseHooks(
              settings!,
              makeToolResult('write', { path: '/test.txt', content: 'x' }),
              makeCtx(s.dir.dir),
            )
          })),
        Then('the dispatcher should report no warning')((s) =>
          Effect.sync(() => {
            expect(s.result).toEqual({})
          })
        ),
      ),
    )

    scenario(
      'Should surface a later hook warning past a silently-allowing hook',
      Gherkin.Do.pipe(
        Given('a directory with a silent hook ahead of a warning hook')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const silent = yield* writeShellHook(dir, 'silent-first', 0)
            const warner = yield* writeShellHook(dir, 'warn-second', 1, 'real warning from hook B')
            yield* writeSettings(dir, {
              PostToolUse: [{
                matcher: 'Write',
                hooks: [
                  { type: 'command', command: silent },
                  { type: 'command', command: warner },
                ],
              }],
            })
            return { dir, silent, warner }
          })),
        When('runPostToolUseHooks is called for a Write tool result')('result', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir.dir}/.claude/settings.json`])
            expect(settings).not.toBeNull()
            return yield* runPostToolUseHooks(
              settings!,
              makeToolResult('write', { path: '/test.txt', content: 'x' }),
              makeCtx(s.dir.dir),
            )
          })),
        Then("the warning should be the second hook's, not a parse complaint")((s) =>
          Effect.sync(() => {
            expect(s.result).toEqual({ warning: 'real warning from hook B' })
          })
        ),
      ),
    )

    scenario(
      'Should still warn when a hook exits 0 writing malformed decision JSON',
      Gherkin.Do.pipe(
        Given('a directory with a hook printing a truncated decision object')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hook = yield* writeShellHook(dir, 'malformed', 0, undefined, '{"decision":')
            yield* writeSettings(dir, {
              PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: hook }] }],
            })
            return { dir, hook }
          })),
        When('runPostToolUseHooks is called for a Write tool result')('result', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir.dir}/.claude/settings.json`])
            expect(settings).not.toBeNull()
            return yield* runPostToolUseHooks(
              settings!,
              makeToolResult('write', { path: '/test.txt', content: 'x' }),
              makeCtx(s.dir.dir),
            )
          })),
        Then('the dispatcher should report a verdict-error warning')((s) =>
          Effect.sync(() => {
            expect(s.result?.warning).toContain('produced invalid JSON')
          })
        ),
      ),
    )
  })
