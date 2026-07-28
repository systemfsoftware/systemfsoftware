import { NodeCommandExecutor, NodeFileSystem } from '@effect/platform-node'
import type { PlatformError } from '@effect/platform/Error'
import { FileSystem } from '@effect/platform/FileSystem'
import * as PathModule from '@effect/platform/Path'
import type { ExtensionContext, InputEvent, ToolCallEvent, ToolResultEvent } from '@oh-my-pi/pi-coding-agent'
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { expect } from 'vitest'
import {
  collectSettingsGapsWithPaths,
  loadSettingsWithPaths,
  runPostToolUseHooks,
  runPreToolUseHooks,
  runUserPromptSubmitHooks,
} from '../src/hook-dispatcher.executor.js'

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
/** Mirrors a real path guard: reads `tool_input.file_path`, no-ops when absent. */
function writePathGuardHook(
  dir: string,
  name: string,
  forbidden: string,
): Effect.Effect<string, PlatformError, FileSystem> {
  return Effect.gen(function*() {
    const fs = yield* FileSystem
    const content = [
      '#!/usr/bin/env bash',
      'payload=$(cat)',
      `target=$(printf '%s' "$payload" | grep -o '"file_path":"[^"]*"' | head -1)`,
      'if [ -z "$target" ]; then exit 0; fi',
      `if printf '%s' "$target" | grep -q '${forbidden}'; then`,
      '  echo "guard: refused $target" >&2',
      '  exit 2',
      'fi',
      'exit 0',
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
    ui: { notify: () => {} },
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

const guardedDir = (name: string, forbidden: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem
    const dir = yield* fs.makeTempDirectoryScoped()
    const hook = yield* writePathGuardHook(dir, name, forbidden)
    yield* writeSettings(dir, {
      PreToolUse: [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command: hook }] }],
    })
    return { dir, hook }
  })

const dispatchEdit = (dir: string, patch: string) =>
  Effect.gen(function*() {
    const settings = yield* loadSettingsWithPaths([`${dir}/.claude/settings.json`])
    expect(settings).not.toBeNull()
    return yield* runPreToolUseHooks(settings!, makeToolCall('edit', { i: 'x', input: patch }), makeCtx(dir))
  })

Feature('Hook dispatcher — edit target fan-out')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    scenario(
      'Should block a hashline edit when a trailing section targets a protected path',
      Gherkin.Do.pipe(
        Given('a directory guarding the vendored tree')('dir', (_s) => guardedDir('guard', 'repos/vendored')),
        When('an edit patches an innocent file before a vendored one')(
          'result',
          (s) => dispatchEdit(s.dir.dir, '[docs/ok.md#A1B2]\nDEL 1\n[repos/vendored/pwned.rs#C3D4]\nDEL 1\n'),
        ),
        Then('the dispatcher should block the whole call')((s) =>
          Effect.sync(() => {
            expect(s.result?.block).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Should block a hashline edit when MV moves a file into a protected path',
      Gherkin.Do.pipe(
        Given('a directory guarding the vendored tree')('dir', (_s) => guardedDir('guard', 'repos/vendored')),
        When('an edit renames an innocent file into it')(
          'result',
          (s) => dispatchEdit(s.dir.dir, '[docs/ok.md#A1B2]\nMV repos/vendored/pwned.rs\n'),
        ),
        Then('the dispatcher should block the whole call')((s) =>
          Effect.sync(() => {
            expect(s.result?.block).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Should allow a hashline edit when no section is protected',
      Gherkin.Do.pipe(
        Given('a directory guarding the vendored tree')('dir', (_s) => guardedDir('guard', 'repos/vendored')),
        When('an edit patches only permitted files')(
          'result',
          (s) => dispatchEdit(s.dir.dir, '[docs/ok.md#A1B2]\nDEL 1\n[src/fine.ts#C3D4]\nDEL 1\n'),
        ),
        Then('the dispatcher should allow the call')((s) =>
          Effect.sync(() => {
            expect(s.result).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'Should run a hook whose command both begins and ends with a quoted project dir',
      Gherkin.Do.pipe(
        Given('a guard invoked through the project-dir variable')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            yield* writePathGuardHook(dir, 'guard', 'repos/vendored')
            yield* writeSettings(dir, {
              PreToolUse: [{
                matcher: 'Edit|Write',
                hooks: [{ type: 'command', command: '"$CLAUDE_PROJECT_DIR"/guard.sh "$CLAUDE_PROJECT_DIR"' }],
              }],
            })
            return { dir }
          })),
        When('an edit targets the protected tree')(
          'result',
          (s) => dispatchEdit(s.dir.dir, '[repos/vendored/pwned.rs#A1B2]\nDEL 1\n'),
        ),
        Then('the guard should still have run and blocked')((s) =>
          Effect.sync(() => {
            expect(s.result?.block).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Should rewrite the original path key when a hook returns file_path',
      Gherkin.Do.pipe(
        Given('a hook rewriting file_path')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const rewrite = JSON.stringify({
              hookSpecificOutput: { updatedInput: { tool_input: { file_path: '/rewritten.txt' } } },
            })
            const hook = yield* writeShellHook(dir, 'rewrite', 0, undefined, rewrite)
            yield* writeSettings(dir, {
              PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: hook }] }],
            })
            return { dir, hook }
          })),
        When('runPreToolUseHooks is called for a path-keyed Write')('event', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir.dir}/.claude/settings.json`])
            expect(settings).not.toBeNull()
            const event = makeToolCall('write', { path: '/test.txt', content: 'x' })
            yield* runPreToolUseHooks(settings!, event, makeCtx(s.dir.dir))
            return event
          })),
        Then('the rewrite should land on path, not a stray file_path')((s) =>
          Effect.sync(() => {
            expect(s.event.input).toEqual({ path: '/rewritten.txt', content: 'x' })
          })
        ),
      ),
    )
  })

Feature('Hook dispatcher — UserPromptSubmit verdict')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    const promptEvent = { type: 'input', text: 'hello', source: 'user' } as unknown as InputEvent

    scenario(
      'Should block the prompt when a hook exits 2',
      Gherkin.Do.pipe(
        Given('a directory with a rejecting prompt hook')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hook = yield* writeShellHook(dir, 'reject', 2, 'prompt refused')
            yield* writeSettings(dir, {
              UserPromptSubmit: [{ hooks: [{ type: 'command', command: hook }] }],
            })
            return { dir, hook }
          })),
        When('runUserPromptSubmitHooks is called')('result', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir.dir}/.claude/settings.json`])
            expect(settings).not.toBeNull()
            return yield* runUserPromptSubmitHooks(settings!, promptEvent, makeCtx(s.dir.dir))
          })),
        Then('the prompt should be marked handled rather than injected')((s) =>
          Effect.sync(() => {
            expect(s.result?.handled).toBe(true)
            expect(s.result?.text).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'Should inject stdout as context when a hook exits 0',
      Gherkin.Do.pipe(
        Given('a directory with a context-injecting prompt hook')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hook = yield* writeShellHook(dir, 'inject', 0, undefined, 'extra context')
            yield* writeSettings(dir, {
              UserPromptSubmit: [{ hooks: [{ type: 'command', command: hook }] }],
            })
            return { dir, hook }
          })),
        When('runUserPromptSubmitHooks is called')('result', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir.dir}/.claude/settings.json`])
            expect(settings).not.toBeNull()
            return yield* runUserPromptSubmitHooks(settings!, promptEvent, makeCtx(s.dir.dir))
          })),
        Then('the prompt should carry the injected context')((s) =>
          Effect.sync(() => {
            expect(s.result?.handled).toBeUndefined()
            expect(s.result?.text).toBe('extra context\n\nhello')
          })
        ),
      ),
    )
  })

Feature('Hook dispatcher — patch grammar reaches the guard')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    scenario(
      'Should block an apply-patch hunk that updates a protected file',
      Gherkin.Do.pipe(
        Given('a directory guarding the vendored tree')('dir', (_s) => guardedDir('guard', 'repos/vendored')),
        When('an apply-patch updates an innocent then a vendored file')('result', (s) =>
          dispatchEdit(
            s.dir.dir,
            '*** Begin Patch\n*** Update File: docs/ok.md\n*** Update File: repos/vendored/x.rs\n*** End Patch\n',
          )),
        Then('the dispatcher should block the whole call')((s) =>
          Effect.sync(() => {
            expect(s.result?.block).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Should block an apply-patch hunk that moves a file into a protected path',
      Gherkin.Do.pipe(
        Given('a directory guarding the vendored tree')('dir', (_s) => guardedDir('guard', 'repos/vendored')),
        When('an apply-patch renames into the vendored tree')('result', (s) =>
          dispatchEdit(
            s.dir.dir,
            '*** Begin Patch\n*** Update File: docs/ok.md\n*** Move to: repos/vendored/x.rs\n*** End Patch\n',
          )),
        Then('the dispatcher should block the whole call')((s) =>
          Effect.sync(() => {
            expect(s.result?.block).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Should recover the exact target path when the payload is CRLF encoded with a BOM',
      Gherkin.Do.pipe(
        Given('a hook recording every file_path it receives')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hookPath = `${dir}/recorder.sh`
            yield* fs.writeFileString(
              hookPath,
              [
                '#!/usr/bin/env bash',
                'payload=$(cat)',
                `printf '%s' "$payload" | grep -o '"file_path":"[^"]*"' | sed 's/.*:"//; s/"$//' >> ${dir}/paths.log`,
                'exit 0',
              ].join('\n'),
            )
            yield* fs.chmod(hookPath, 0o755)
            yield* writeSettings(dir, {
              PreToolUse: [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command: hookPath }] }],
            })
            return { dir }
          })),
        When('an edit arrives CRLF encoded')('log', (s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            yield* dispatchEdit(s.dir.dir, '\uFEFF[repos/vendored/x.rs#A1B2]\r\nDEL 1\r\n')
            return yield* fs.readFileString(`${s.dir.dir}/paths.log`)
          })),
        Then('the guard should see the path with no stray carriage return or bracket')((s) =>
          Effect.sync(() => {
            expect(s.log.split('\n').filter(Boolean)).toEqual(['repos/vendored/x.rs'])
          })
        ),
      ),
    )

    scenario(
      'Should allow an edit whose body row merely begins with the MV keyword',
      Gherkin.Do.pipe(
        Given('a directory guarding the vendored tree')('dir', (_s) => guardedDir('guard', 'repos/vendored')),
        When('an edit inserts a literal line starting with MV')(
          'result',
          (s) => dispatchEdit(s.dir.dir, '[docs/ok.md#A1B2]\nINS.POST 1:\n+MV repos/vendored/x.rs\n'),
        ),
        Then('the dispatcher should not treat the body row as a rename')((s) =>
          Effect.sync(() => {
            expect(s.result).toBeUndefined()
          })
        ),
      ),
    )
  })

Feature('Hook dispatcher — unsupported hook events')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    scenario(
      'Should report a hook group the bridge does not implement',
      Gherkin.Do.pipe(
        Given('settings registering an unsupported event group')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            yield* writeSettings(dir, {
              PreToolUse: [],
              UserPromptExpansion: [{ hooks: [{ type: 'command', command: 'true' }] }],
            })
            return { dir }
          })),
        When('the settings are scanned for unsupported events')(
          'found',
          (s) => collectSettingsGapsWithPaths([`${s.dir.dir}/.claude/settings.json`]),
        ),
        Then('the unsupported group should be named')((s) =>
          Effect.sync(() => {
            expect(s.found.unknownEvents).toEqual(['UserPromptExpansion'])
          })
        ),
      ),
    )

    scenario(
      'Should report nothing when every registered group is supported',
      Gherkin.Do.pipe(
        Given('settings using only supported events')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            yield* writeSettings(dir, { PreToolUse: [], PostToolUse: [] })
            return { dir }
          })),
        When('the settings are scanned for unsupported events')(
          'found',
          (s) => collectSettingsGapsWithPaths([`${s.dir.dir}/.claude/settings.json`]),
        ),
        Then('no group should be reported')((s) =>
          Effect.sync(() => {
            expect(s.found.unknownEvents).toEqual([])
          })
        ),
      ),
    )
  })

Feature('Hook dispatcher — unsupported events in flat settings')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    scenario(
      'Should report an unsupported group without flagging disableAllHooks',
      Gherkin.Do.pipe(
        Given('a flat settings file carrying disableAllHooks')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            yield* fs.makeDirectory(`${dir}/.claude`, { recursive: true })
            yield* fs.writeFileString(
              `${dir}/.claude/settings.json`,
              JSON.stringify({
                PreToolUse: [],
                disableAllHooks: false,
                UserPromptExpansion: [{ hooks: [{ type: 'command', command: 'true' }] }],
              }),
            )
            return { dir }
          })),
        When('the settings are scanned for unsupported events')(
          'found',
          (s) => collectSettingsGapsWithPaths([`${s.dir.dir}/.claude/settings.json`]),
        ),
        Then('only the unsupported group should be named')((s) =>
          Effect.sync(() => {
            expect(s.found.unknownEvents).toEqual(['UserPromptExpansion'])
          })
        ),
      ),
    )
  })

Feature('Hook dispatcher — repeated targets')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    scenario(
      'Should run the hook chain once when two sections name the same file',
      Gherkin.Do.pipe(
        Given('a hook recording every invocation')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hookPath = `${dir}/counter.sh`
            yield* fs.writeFileString(
              hookPath,
              ['#!/usr/bin/env bash', 'cat > /dev/null', `echo call >> ${dir}/calls.log`, 'exit 0'].join('\n'),
            )
            yield* fs.chmod(hookPath, 0o755)
            yield* writeSettings(dir, {
              PreToolUse: [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command: hookPath }] }],
            })
            return { dir }
          })),
        When('an edit patches the same file in two sections')('log', (s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            yield* dispatchEdit(s.dir.dir, '[docs/ok.md#A1B2]\nDEL 1\n[docs/ok.md#C3D4]\nDEL 2\n')
            return yield* fs.readFileString(`${s.dir.dir}/calls.log`)
          })),
        Then('the hook should have been invoked exactly once')((s) =>
          Effect.sync(() => {
            expect(s.log.trim().split('\n')).toHaveLength(1)
          })
        ),
      ),
    )
  })

Feature('Hook dispatcher — hook transports this bridge cannot run')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    const withHttpBeside = (dir: string, guard: string) => ({
      PreToolUse: [
        { matcher: 'Edit|Write', hooks: [{ type: 'http', url: 'https://example.invalid/hook' }] },
        { matcher: 'Edit|Write', hooks: [{ type: 'command', command: guard }] },
      ],
    })

    scenario(
      'Should still run command hooks when an http hook sits beside them',
      Gherkin.Do.pipe(
        Given('settings mixing an http hook with a command guard')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const guard = yield* writePathGuardHook(dir, 'guard', 'repos/vendored')
            yield* writeSettings(dir, withHttpBeside(dir, guard))
            return { dir }
          })),
        When('an edit targets the protected tree')(
          'result',
          (s) => dispatchEdit(s.dir.dir, '[repos/vendored/x.rs#A1B2]\nDEL 1\n'),
        ),
        Then('the command guard should still have blocked it')((s) =>
          Effect.sync(() => {
            expect(s.result?.block).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'Should name the transports it skipped',
      Gherkin.Do.pipe(
        Given('settings carrying every non-command transport')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            yield* writeSettings(dir, {
              PreToolUse: [{
                hooks: [
                  { type: 'command', command: 'true' },
                  { type: 'http', url: 'https://example.invalid' },
                  { type: 'prompt', prompt: 'ok?' },
                ],
              }],
              PostToolUse: [{ hooks: [{ type: 'mcp_tool', server: 's', tool: 't' }] }],
            })
            return { dir }
          })),
        When('the settings are scanned')(
          'found',
          (s) => collectSettingsGapsWithPaths([`${s.dir.dir}/.claude/settings.json`]),
        ),
        Then('every skipped transport should be reported once')((s) =>
          Effect.sync(() => {
            expect([...s.found.unsupportedHookTypes].sort()).toEqual(['http', 'mcp_tool', 'prompt'])
            expect(s.found.unknownEvents).toEqual([])
          })
        ),
      ),
    )
  })

Feature('Hook dispatcher - command execution contract')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    const loadFrom = (dir: string) => loadSettingsWithPaths([`${dir}/.claude/settings.json`])

    scenario(
      'Should hand args to the binary with no shell interpreting them',
      Gherkin.Do.pipe(
        Given('a hook recording its first argument')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hookPath = `${dir}/record.sh`
            yield* fs.writeFileString(
              hookPath,
              `#!/usr/bin/env bash\nprintf '%s' "$1" > "${dir}/arg.txt"\n`,
            )
            yield* fs.chmod(hookPath, 0o755)
            yield* writeSettings(dir, {
              PreToolUse: [{
                matcher: 'Write',
                hooks: [{ type: 'command', command: hookPath, args: ['$(id -u)'] }],
              }],
            })
            return dir
          })),
        When('a Write tool call fires the hook')('arg', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadFrom(s.dir)
            yield* runPreToolUseHooks(
              settings!,
              makeToolCall('Write', { file_path: `${s.dir}/t.txt` }),
              makeCtx(s.dir),
            )
            const fs = yield* FileSystem
            return yield* fs.readFileString(`${s.dir}/arg.txt`)
          })),
        Then('the argument arrives verbatim, unexpanded')((s) =>
          Effect.sync(() => {
            expect(s.arg).toBe('$(id -u)')
          })
        ),
      ),
    )

    scenario(
      'Should not let an asyncRewake hook block the tool call',
      Gherkin.Do.pipe(
        Given('a blocking hook marked asyncRewake')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hook = yield* writeShellHook(dir, 'rewake', 2, 'would block')
            yield* writeSettings(dir, {
              PreToolUse: [{
                matcher: 'Write',
                hooks: [{ type: 'command', command: hook, asyncRewake: true }],
              }],
            })
            return dir
          })),
        When('a Write tool call fires')('result', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadFrom(s.dir)
            return yield* runPreToolUseHooks(
              settings!,
              makeToolCall('Write', { file_path: `${s.dir}/t.txt` }),
              makeCtx(s.dir),
            )
          })),
        Then('the call proceeds because a backgrounded hook cannot decide')((s) =>
          Effect.sync(() => {
            expect(s.result).toBeUndefined()
          })
        ),
      ),
    )
  })

Feature('Hook dispatcher - undecodable settings')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    scenario(
      'Should name a settings file whose hooks cannot be decoded',
      Gherkin.Do.pipe(
        Given('a settings file with a command hook missing its command')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            yield* writeSettings(dir, {
              PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command' }] }],
            })
            return dir
          })),
        When('the settings are scanned')(
          'found',
          (s) => collectSettingsGapsWithPaths([`${s.dir}/.claude/settings.json`]),
        ),
        Then('the file is named rather than silently skipped')((s) =>
          Effect.sync(() => {
            expect(s.found.malformedFiles).toHaveLength(1)
          })
        ),
      ),
    )

    scenario(
      'Should not let a broken file decode to an empty hook set',
      Gherkin.Do.pipe(
        Given('a settings file with a command hook missing its command')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            yield* writeSettings(dir, {
              PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command' }] }],
            })
            return dir
          })),
        When('the settings are loaded')(
          'result',
          (s) => loadSettingsWithPaths([`${s.dir}/.claude/settings.json`]),
        ),
        Then('the loader refuses it instead of returning empty settings')((s) =>
          Effect.sync(() => {
            expect(s.result).toBeNull()
          })
        ),
      ),
    )

    scenario(
      'Should name a settings file that is not valid JSON',
      Gherkin.Do.pipe(
        Given('a settings file containing a trailing comma')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            yield* fs.makeDirectory(`${dir}/.claude`, { recursive: true })
            yield* fs.writeFileString(`${dir}/.claude/settings.json`, '{ "hooks": {}, }')
            return dir
          })),
        When('the settings are scanned')(
          'found',
          (s) => collectSettingsGapsWithPaths([`${s.dir}/.claude/settings.json`]),
        ),
        Then('the file is named')((s) =>
          Effect.sync(() => {
            expect(s.found.malformedFiles).toHaveLength(1)
          })
        ),
      ),
    )
  })
