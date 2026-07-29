import { NodeCommandExecutor, NodeFileSystem } from '@effect/platform-node'
import type { PlatformError } from '@effect/platform/Error'
import { FileSystem } from '@effect/platform/FileSystem'
import * as PathModule from '@effect/platform/Path'
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { And, Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { expect } from 'vitest'
import { drainAsyncHookOutput, recordAsyncHookOutput } from '../src/async-hook-output.state.js'
import { CLAUDE_CODE_DOC_VERSION, NON_EVALUABLE_MATCHERS, UNBRIDGED_REASONS } from '../src/hook-catalog.schema.js'
import type { HookPrompt, HookSession, HookToolCall, HookToolResult } from '../src/hook-dispatcher.executor.js'
import {
  collectSettingsGapsWithPaths,
  coverageReportLines,
  loadSettingsWithPaths,
  runHooksForEvent,
  runLifecycleHooks,
  runPostToolUseHooks,
  runPreCompactHooks,
  runPreToolUseHooks,
  runSessionStartHooks,
  runSessionSwitchHooks,
  runToolResultHooks,
  runUserPromptSubmitHooks,
} from '../src/hook-dispatcher.executor.js'
import type { CommandHook, HookEntry } from '../src/hook-settings.acl.js'
import { loaded } from './loaded.observer.js'

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
      ...(stderr !== undefined && stderr.length > 0 ? [`echo '${stderr}' >&2`] : []),
      ...(stdout !== undefined && stdout.length > 0 ? [`echo '${stdout}'`] : []),
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

function makeCtx(cwd: string): HookSession {
  return {
    cwd,
    sessionManager: { getSessionId: () => 'test-session' },
    ui: { notify: () => {} },
  }
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

function makeToolCall(toolName: string, input: Record<string, unknown>): HookToolCall {
  return { toolName, toolCallId: 'tc-test', input }
}

function makeToolResult(toolName: string, input: Record<string, unknown>): HookToolResult {
  return { toolName, toolCallId: 'tc-test', input, content: 'ok' }
}

const recorder = (dir: string, name: string): Effect.Effect<CommandHook, never, FileSystem> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem
    const hookPath = `${dir}/${name}.sh`
    yield* fs.writeFileString(
      hookPath,
      ['#!/usr/bin/env bash', `cat > ${dir}/${name}.stdin`, `echo ${name} >> ${dir}/ran.log`, 'exit 0'].join('\n'),
    ).pipe(Effect.orDie)
    yield* fs.chmod(hookPath, 0o755).pipe(Effect.orDie)
    return { type: 'command' as const, command: hookPath }
  })

const readOrEmpty = (path: string): Effect.Effect<string, never, FileSystem> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem
    return yield* fs.readFileString(path).pipe(Effect.orElseSucceed(() => ''))
  })

const whatRan = (dir: string): Effect.Effect<readonly string[], never, FileSystem> =>
  Effect.map(readOrEmpty(`${dir}/ran.log`), (text) => text.split('\n').filter((line) => line !== ''))

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
            expect(loaded(s.result).hooks.PreToolUse).toHaveLength(1)
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
              loaded(settings),
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
              loaded(settings),
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
              loaded(settings),
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
              loaded(settings),
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
            const result = yield* runPreToolUseHooks(loaded(settings), event, makeCtx(s.dir.dir))
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
              loaded(settings),
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
              loaded(settings),
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
              loaded(settings),
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
              loaded(settings),
              makeToolResult('write', { path: '/test.txt', content: 'x' }),
              makeCtx(s.dir.dir),
            )
          })),
        Then('the dispatcher should report a verdict-error warning')((s) =>
          Effect.sync(() => {
            expect(s.result.warning).toContain('produced invalid JSON')
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
    return yield* runPreToolUseHooks(loaded(settings), makeToolCall('edit', { i: 'x', input: patch }), makeCtx(dir))
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
            yield* runPreToolUseHooks(loaded(settings), event, makeCtx(s.dir.dir))
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
    const promptEvent: HookPrompt = { text: 'hello', source: 'interactive' }

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
            return yield* runUserPromptSubmitHooks(loaded(settings), promptEvent, makeCtx(s.dir.dir))
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
            return yield* runUserPromptSubmitHooks(loaded(settings), promptEvent, makeCtx(s.dir.dir))
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

Feature('Prompt context delivery — a host command reaches the host unchanged')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    scenario(
      'Pat compacts the session while a hook has context to offer',
      Gherkin.Do.pipe(
        Given('a UserPromptSubmit hook printing "repo is mid-rebase"')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hook = yield* writeShellHook(dir, 'rebase-note', 0, undefined, 'repo is mid-rebase')
            yield* writeSettings(dir, {
              UserPromptSubmit: [{ hooks: [{ type: 'command', command: hook }] }],
            })
            return dir
          })),
        When('Pat submits the slash command "/compact"')('result', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir}/.claude/settings.json`])
            return yield* runUserPromptSubmitHooks(
              loaded(settings),
              { text: '/compact', source: 'interactive' },
              makeCtx(s.dir),
            )
          })),
        Then('the host receives "/compact" with nothing prefixed')((s) =>
          Effect.sync(() => {
            expect(s.result?.handled).toBeUndefined()
            expect(s.result?.text).toBeUndefined()
          })
        ),
      ),
    )
  })

Feature('Prompt context delivery — output with no second chance outlives the command')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    scenario(
      'Pat lists files between a background scan and a question',
      Gherkin.Do.pipe(
        Given('a background hook has left "background scan finished" waiting')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            yield* writeSettings(dir, {})
            drainAsyncHookOutput()
            recordAsyncHookOutput('background scan finished')
            return dir
          })),
        And('Pat has already submitted the bash command "!ls"')((s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir}/.claude/settings.json`])
            const result = yield* runUserPromptSubmitHooks(
              loaded(settings),
              { text: '!ls', source: 'interactive' },
              makeCtx(s.dir),
            )
            expect(result?.text).toBeUndefined()
          })
        ),
        When('Pat asks "what changed?"')('result', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir}/.claude/settings.json`])
            return yield* runUserPromptSubmitHooks(
              loaded(settings),
              { text: 'what changed?', source: 'interactive' },
              makeCtx(s.dir),
            )
          })),
        Then('the question carries "background scan finished" once, ahead of her words')((s) =>
          Effect.sync(() => {
            expect(s.result?.text).toBe('background scan finished\n\nwhat changed?')
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

Feature('Hook coverage reported at session start')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    const reportFor = (dir: string) =>
      Effect.map(
        collectSettingsGapsWithPaths([`${dir}/.claude/settings.json`]),
        (gaps) => coverageReportLines(gaps.coverage).join('\n'),
      )

    scenario(
      'Should name UserPromptExpansion as a real event this bridge does not carry',
      Gherkin.Do.pipe(
        Given('a settings file hooking UserPromptExpansion')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            yield* writeSettings(dir, {
              PreToolUse: [],
              UserPromptExpansion: [{ hooks: [{ type: 'command', command: 'true' }] }],
            })
            return dir
          })),
        When('the session starts')('report', (s) => reportFor(s.dir)),
        Then('the report blames the bridge and gives the catalog reason')((s) =>
          Effect.sync(() => {
            expect(s.report).toContain('UserPromptExpansion: not carried by this bridge')
            expect(s.report).toContain(UNBRIDGED_REASONS.UserPromptExpansion)
            expect(s.report).not.toContain('Ignoring unsupported hook event')
          })
        ),
      ),
    )

    scenario(
      'Should stay silent when every configured event is bridged with a readable matcher',
      Gherkin.Do.pipe(
        Given('a settings file hooking only PreToolUse and PostToolUse')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            yield* writeSettings(dir, { PreToolUse: [], PostToolUse: [] })
            return dir
          })),
        When('the session starts')('report', (s) => reportFor(s.dir)),
        Then('nothing is reported')((s) =>
          Effect.sync(() => {
            expect(s.report).toBe('')
          })
        ),
      ),
    )

    scenario(
      'Should name the catalog version when the key is not a Claude Code event',
      Gherkin.Do.pipe(
        Given('a settings file hooking NotAnEvent')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            yield* writeSettings(dir, { NotAnEvent: [{ hooks: [{ type: 'command', command: 'true' }] }] })
            return dir
          })),
        When('the session starts')('report', (s) => reportFor(s.dir)),
        Then('the report scopes the verdict to this catalog and its version')((s) =>
          Effect.sync(() => {
            expect(s.report).toContain(`NotAnEvent: not in this bridge's catalog`)
            expect(s.report).toContain(CLAUDE_CODE_DOC_VERSION)
            expect(s.report).not.toContain('not a Claude Code event')
          })
        ),
      ),
    )

    scenario(
      'Should warn that a PreCompact hook carrying a matcher will be skipped',
      Gherkin.Do.pipe(
        Given('a settings file hooking PreCompact with matcher manual')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            yield* writeSettings(dir, {
              PreCompact: [{ matcher: 'manual', hooks: [{ type: 'command', command: 'true' }] }],
            })
            return dir
          })),
        When('the session starts')('report', (s) => reportFor(s.dir)),
        Then('the report says that hook is skipped and why the matcher cannot be read')((s) =>
          Effect.sync(() => {
            expect(s.report).toContain('PreCompact: hook skipped, matcher not evaluable')
            expect(s.report).toContain(NON_EVALUABLE_MATCHERS.PreCompact)
          })
        ),
      ),
    )

    scenario(
      'Should leave a PreCompact hook that declares no matcher unmentioned',
      Gherkin.Do.pipe(
        Given('a settings file hooking PreCompact with no matcher')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            yield* writeSettings(dir, { PreCompact: [{ hooks: [{ type: 'command', command: 'true' }] }] })
            return dir
          })),
        When('the session starts')('report', (s) => reportFor(s.dir)),
        Then('PreCompact goes unmentioned because that hook will run')((s) =>
          Effect.sync(() => {
            expect(s.report).toBe('')
          })
        ),
      ),
    )

    scenario(
      'Should carry all three coverage classes in a single report',
      Gherkin.Do.pipe(
        Given('a settings file hooking NotAnEvent, UserPromptExpansion and a matched PreCompact')(
          'dir',
          (_s) =>
            Effect.gen(function*() {
              const fs = yield* FileSystem
              const dir = yield* fs.makeTempDirectoryScoped()
              yield* writeSettings(dir, {
                NotAnEvent: [{ hooks: [{ type: 'command', command: 'true' }] }],
                UserPromptExpansion: [{ hooks: [{ type: 'command', command: 'true' }] }],
                PreCompact: [{ matcher: 'manual', hooks: [{ type: 'command', command: 'true' }] }],
              })
              return dir
            }),
        ),
        When('the session starts')('report', (s) => reportFor(s.dir)),
        Then('one report carries a line for each of the three classes')((s) =>
          Effect.sync(() => {
            expect(s.report.split('\n')).toHaveLength(3)
            expect(s.report).toContain(`NotAnEvent: not in this bridge's catalog`)
            expect(s.report).toContain('UserPromptExpansion: not carried by this bridge')
            expect(s.report).toContain('PreCompact: hook skipped, matcher not evaluable')
          })
        ),
      ),
    )

    scenario(
      'Should report a flat settings file without mistaking disableAllHooks for an event',
      Gherkin.Do.pipe(
        Given('a flat settings file carrying disableAllHooks beside UserPromptExpansion')(
          'dir',
          (_s) =>
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
              return dir
            }),
        ),
        When('the session starts')('report', (s) => reportFor(s.dir)),
        Then('only UserPromptExpansion is named')((s) =>
          Effect.sync(() => {
            expect(s.report.split('\n')).toHaveLength(1)
            expect(s.report).toContain('UserPromptExpansion: not carried by this bridge')
          })
        ),
      ),
    )

    scenario(
      'Should name a hook that another settings file switched off',
      Gherkin.Do.pipe(
        Given('a user file guarding PreToolUse and a project file setting disableAllHooks')(
          'dirs',
          (_s) =>
            Effect.gen(function*() {
              const fs = yield* FileSystem
              const user = yield* fs.makeTempDirectoryScoped()
              const project = yield* fs.makeTempDirectoryScoped()
              yield* writeSettings(user, {
                PreToolUse: [{ hooks: [{ type: 'command', command: 'true' }] }],
              })
              yield* fs.makeDirectory(`${project}/.claude`, { recursive: true })
              yield* fs.writeFileString(
                `${project}/.claude/settings.json`,
                JSON.stringify({ hooks: {}, disableAllHooks: true }),
              )
              return { project, user }
            }),
        ),
        When('the session starts')('report', (s) =>
          Effect.map(
            collectSettingsGapsWithPaths([
              `${s.dirs.user}/.claude/settings.json`,
              `${s.dirs.project}/.claude/settings.json`,
            ]),
            (gaps) => coverageReportLines(gaps.coverage).join('\n'),
          )),
        Then('the report names PreToolUse and the file that switched it off')((s) =>
          Effect.sync(() => {
            expect(s.report).toContain('PreToolUse: switched off by `disableAllHooks`')
            expect(s.report).toContain(`${s.dirs.project}/.claude/settings.json`)
          })
        ),
      ),
    )

    scenario(
      'Should name a hook group the wrapper shape hides',
      Gherkin.Do.pipe(
        Given('a settings file wrapping PreToolUse and repeating PostToolUse at the top level')(
          'dir',
          (_s) =>
            Effect.gen(function*() {
              const fs = yield* FileSystem
              const dir = yield* fs.makeTempDirectoryScoped()
              yield* fs.makeDirectory(`${dir}/.claude`, { recursive: true })
              yield* fs.writeFileString(
                `${dir}/.claude/settings.json`,
                JSON.stringify({
                  hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'true' }] }] },
                  PostToolUse: [{ hooks: [{ type: 'command', command: 'true' }] }],
                }),
              )
              return dir
            }),
        ),
        When('the session starts')('report', (s) => reportFor(s.dir)),
        Then('the report names PostToolUse as never read')((s) =>
          Effect.sync(() => {
            expect(s.report).toContain('PostToolUse: ignored: this file wraps its hooks')
            expect(s.report).not.toContain('PreToolUse')
          })
        ),
      ),
    )

    scenario(
      'Should strip an escape sequence a settings key smuggles into the report',
      Gherkin.Do.pipe(
        Given('a settings file whose event key carries an escape and a newline')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            yield* writeSettings(dir, {
              PreToolUse: [],
              '\u001B[2J\nAudit: PASSED': [{ hooks: [{ type: 'command', command: 'true' }] }],
            })
            return dir
          })),
        When('the session starts')('report', (s) => reportFor(s.dir)),
        Then('the report is one line carrying no control character')((s) =>
          Effect.sync(() => {
            expect(s.report.split('\n')).toHaveLength(1)
            expect(s.report).not.toContain('\u001B')
          })
        ),
      ),
    )
  })

Feature('Hooks whose matcher this bridge cannot read')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    const dispatch = (dir: string, entries: readonly HookEntry[], event: string, matchValue: string) =>
      Effect.gen(function*() {
        yield* runHooksForEvent(entries, matchValue, {}, makeCtx(dir), event)
        return yield* whatRan(dir)
      })

    scenario(
      'Should skip a PreCompact hook that declares a matcher',
      Gherkin.Do.pipe(
        Given('a PreCompact hook scoped to matcher manual')('setup', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hook = yield* recorder(dir, 'scoped')
            return { dir, entries: [{ matcher: 'manual', hooks: [hook] }] satisfies HookEntry[] }
          })),
        When('a compaction is about to run')(
          'ran',
          (s) => dispatch(s.setup.dir, s.setup.entries, 'PreCompact', 'manual'),
        ),
        Then('the hook leaves no trace')((s) =>
          Effect.sync(() => {
            expect(s.ran).toEqual([])
          })
        ),
      ),
    )

    scenario(
      'Should run a PreCompact hook that declares no matcher',
      Gherkin.Do.pipe(
        Given('a PreCompact hook with no matcher')('setup', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hook = yield* recorder(dir, 'bare')
            return { dir, entries: [{ hooks: [hook] }] satisfies HookEntry[] }
          })),
        When('a compaction is about to run')(
          'ran',
          (s) => dispatch(s.setup.dir, s.setup.entries, 'PreCompact', 'manual'),
        ),
        Then('the hook records that it ran')((s) =>
          Effect.sync(() => {
            expect(s.ran).toEqual(['bare'])
          })
        ),
      ),
    )

    scenario(
      'Should run only the bare hook when a scoped and a bare hook share PreCompact',
      Gherkin.Do.pipe(
        Given('a PreCompact hook scoped to manual beside one with no matcher')('setup', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const scoped = yield* recorder(dir, 'scoped')
            const bare = yield* recorder(dir, 'bare')
            return {
              dir,
              entries: [{ matcher: 'manual', hooks: [scoped] }, { hooks: [bare] }] satisfies HookEntry[],
            }
          })),
        When('a compaction is about to run')(
          'ran',
          (s) => dispatch(s.setup.dir, s.setup.entries, 'PreCompact', 'manual'),
        ),
        Then('exactly one run is recorded, by the unscoped hook')((s) =>
          Effect.sync(() => {
            expect(s.ran).toEqual(['bare'])
          })
        ),
      ),
    )

    scenario(
      'Should still honour a tool_name matcher on PostToolUseFailure',
      Gherkin.Do.pipe(
        Given('a PostToolUseFailure hook scoped to matcher Bash')('setup', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hook = yield* recorder(dir, 'bash-only')
            return { dir, entries: [{ matcher: 'Bash', hooks: [hook] }] satisfies HookEntry[] }
          })),
        When('a Bash tool call fails')(
          'ran',
          (s) => dispatch(s.setup.dir, s.setup.entries, 'PostToolUseFailure', 'Bash'),
        ),
        Then('the scoped hook runs, proving the gate is per event')((s) =>
          Effect.sync(() => {
            expect(s.ran).toEqual(['bash-only'])
          })
        ),
      ),
    )

    scenario(
      'Should skip a PostCompact hook that declares a matcher',
      Gherkin.Do.pipe(
        Given('a PostCompact hook scoped to matcher auto')('setup', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const scoped = yield* recorder(dir, 'scoped')
            const bare = yield* recorder(dir, 'bare')
            return {
              dir,
              entries: [{ matcher: 'auto', hooks: [scoped] }, { hooks: [bare] }] satisfies HookEntry[],
            }
          })),
        When('a compaction finishes')('ran', (s) =>
          Effect.gen(function*() {
            yield* runLifecycleHooks(s.setup.entries, makeCtx(s.setup.dir), 'PostCompact')
            return yield* whatRan(s.setup.dir)
          })),
        Then('only the unscoped hook runs')((s) => Effect.sync(() => expect(s.ran).toEqual(['bare']))),
      ),
    )

    scenario(
      'Should skip a SessionEnd hook that declares a matcher',
      Gherkin.Do.pipe(
        Given('a SessionEnd hook scoped to matcher logout')('setup', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const scoped = yield* recorder(dir, 'scoped')
            return { dir, entries: [{ matcher: 'logout', hooks: [scoped] }] satisfies HookEntry[] }
          })),
        When('the session ends')('ran', (s) =>
          Effect.gen(function*() {
            yield* runLifecycleHooks(s.setup.entries, makeCtx(s.setup.dir), 'SessionEnd')
            return yield* whatRan(s.setup.dir)
          })),
        Then('nothing runs, because the bridge cannot tell a logout from any other exit')((s) =>
          Effect.sync(() => expect(s.ran).toEqual([]))
        ),
      ),
    )

    scenario(
      'Should skip a PreCompact hook whose if condition no tool call can be judged against',
      Gherkin.Do.pipe(
        Given('a PreCompact hook whose if condition names two tools, which is not a rule')(
          'setup',
          (_s) =>
            Effect.gen(function*() {
              const fs = yield* FileSystem
              const dir = yield* fs.makeTempDirectoryScoped()
              const hook = yield* recorder(dir, 'conditioned')
              return { dir, entries: [{ hooks: [{ ...hook, if: 'Read Write' }] }] satisfies HookEntry[] }
            }),
        ),
        When('a compaction is about to run')(
          'ran',
          (s) => dispatch(s.setup.dir, s.setup.entries, 'PreCompact', ''),
        ),
        Then('nothing runs, even though an unjudgeable rule elsewhere runs the hook')((s) =>
          Effect.sync(() => expect(s.ran).toEqual([]))
        ),
      ),
    )
  })

Feature('Hooks for a tool call that failed')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    const toolResult = (tool: string, isError: boolean): HookToolResult => ({
      toolName: tool,
      toolCallId: 'toolu_01ABC',
      input: { command: 'npm test' },
      content: [{ type: 'text', text: 'exit status 1' }],
      isError,
    })

    const dispatch = (dir: string, tool: string, isError: boolean) =>
      Effect.gen(function*() {
        const settings = yield* loadSettingsWithPaths([`${dir}/.claude/settings.json`])
        if (settings === null) return { ran: [] as readonly string[], warning: undefined, block: undefined }
        const result = yield* runToolResultHooks(settings, toolResult(tool, isError), makeCtx(dir))
        return { ran: yield* whatRan(dir), warning: result.warning, block: result.block }
      })

    const bothRecorded = (dir: string) =>
      Effect.gen(function*() {
        const onSuccess = yield* recorder(dir, 'success')
        const onFailure = yield* recorder(dir, 'failure')
        yield* writeSettings(dir, {
          PostToolUse: [{ hooks: [onSuccess] }],
          PostToolUseFailure: [{ hooks: [onFailure] }],
        })
      })

    const withBothHooks = (_s: unknown) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem
        const dir = yield* fs.makeTempDirectoryScoped()
        yield* bothRecorded(dir)
        return dir
      })

    scenario(
      'Should run the failure hook and leave PostToolUse untouched when a tool throws',
      Gherkin.Do.pipe(
        Given('a settings file hooking both PostToolUse and PostToolUseFailure')('dir', withBothHooks),
        When('a bash tool call fails')('outcome', (s) => dispatch(s.dir, 'bash', true)),
        Then('only the failure hook records a run')((s) =>
          Effect.sync(() => {
            expect(s.outcome.ran).toEqual(['failure'])
          })
        ),
      ),
    )

    scenario(
      'Should run PostToolUse and leave the failure hook untouched when a tool succeeds',
      Gherkin.Do.pipe(
        Given('a settings file hooking both PostToolUse and PostToolUseFailure')('dir', withBothHooks),
        When('a bash tool call succeeds')('outcome', (s) => dispatch(s.dir, 'bash', false)),
        Then('only the success hook records a run')((s) =>
          Effect.sync(() => {
            expect(s.outcome.ran).toEqual(['success'])
          })
        ),
      ),
    )

    scenario(
      'Should hand the tool name and the error text to the failure hook',
      Gherkin.Do.pipe(
        Given('a failure hook that saves whatever it is sent')('dir', withBothHooks),
        When('a bash tool call fails')('outcome', (s) => dispatch(s.dir, 'bash', true)),
        Then('the saved payload names the tool, the call and the error')((s) =>
          Effect.gen(function*() {
            const payload = yield* readOrEmpty(`${s.dir}/failure.stdin`)
            expect(payload).toContain('"tool_name":"Bash"')
            expect(payload).toContain('"tool_use_id":"toolu_01ABC"')
            expect(payload).toContain('"error":"exit status 1"')
          })
        ),
      ),
    )

    scenario(
      'Should honour a tool_name matcher on the failure event across two tools',
      Gherkin.Do.pipe(
        Given('a failure hook scoped to Bash only')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const onFailure = yield* recorder(dir, 'bash-only')
            yield* writeSettings(dir, { PostToolUseFailure: [{ matcher: 'Bash', hooks: [onFailure] }] })
            return dir
          })),
        When('a bash call fails and then a read call fails')('ran', (s) =>
          Effect.gen(function*() {
            yield* dispatch(s.dir, 'bash', true)
            yield* dispatch(s.dir, 'read', true)
            return yield* whatRan(s.dir)
          })),
        Then('only the bash failure is recorded')((s) =>
          Effect.sync(() => {
            expect(s.ran).toEqual(['bash-only'])
          })
        ),
      ),
    )

    scenario(
      'Should surface stderr as feedback without blocking when a failure hook exits 2',
      Gherkin.Do.pipe(
        Given('a failure hook that exits 2 complaining to stderr')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hookPath = yield* writeShellHook(dir, 'noisy', 2, 'the build was already broken')
            yield* writeSettings(dir, {
              PostToolUseFailure: [{ hooks: [{ type: 'command', command: hookPath }] }],
            })
            return dir
          })),
        When('a bash tool call fails')('outcome', (s) => dispatch(s.dir, 'bash', true)),
        Then('the complaint arrives as a warning and nothing is blocked')((s) =>
          Effect.sync(() => {
            expect(s.outcome.warning).toContain('the build was already broken')
            expect(s.outcome.block).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'Should degrade to a warning when a failure hook prints malformed JSON',
      Gherkin.Do.pipe(
        Given('a failure hook that exits 0 printing malformed JSON')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hookPath = yield* writeShellHook(dir, 'garbled', 0, undefined, '{not json')
            yield* writeSettings(dir, {
              PostToolUseFailure: [{ hooks: [{ type: 'command', command: hookPath }] }],
            })
            return dir
          })),
        When('a bash tool call fails')('outcome', (s) => dispatch(s.dir, 'bash', true)),
        Then('the malformed output becomes a warning rather than throwing')((s) =>
          Effect.sync(() => {
            expect(s.outcome.warning).toContain('invalid JSON')
            expect(s.outcome.block).toBeUndefined()
          })
        ),
      ),
    )
  })

Feature('Hooks around context compaction')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    const settingsFrom = (dir: string) => loadSettingsWithPaths([`${dir}/.claude/settings.json`])

    const askToCompact = (dir: string) =>
      Effect.gen(function*() {
        const settings = yield* settingsFrom(dir)
        if (settings === null) return { block: undefined, reason: undefined }
        const result = yield* runPreCompactHooks(settings, makeCtx(dir))
        return { block: result.block, reason: result.reason }
      })

    const preCompactExiting = (code: number, stderr?: string) => (_s: unknown) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem
        const dir = yield* fs.makeTempDirectoryScoped()
        const hookPath = yield* writeShellHook(dir, 'gate', code, stderr)
        yield* writeSettings(dir, { PreCompact: [{ hooks: [{ type: 'command', command: hookPath }] }] })
        return dir
      })

    scenario(
      'Should cancel compaction when a PreCompact hook exits 2',
      Gherkin.Do.pipe(
        Given('a PreCompact hook that exits 2 explaining itself')(
          'dir',
          preCompactExiting(2, 'still mid refactor'),
        ),
        When('a compaction is about to start')('outcome', (s) => askToCompact(s.dir)),
        Then('compaction is cancelled and the hook explanation is carried')((s) =>
          Effect.sync(() => {
            expect(s.outcome.block).toBe(true)
            expect(s.outcome.reason).toContain('still mid refactor')
          })
        ),
      ),
    )

    scenario(
      'Should let compaction proceed when a PreCompact hook exits 0',
      Gherkin.Do.pipe(
        Given('a PreCompact hook that exits 0')('dir', preCompactExiting(0)),
        When('a compaction is about to start')('outcome', (s) => askToCompact(s.dir)),
        Then('compaction is left to run')((s) =>
          Effect.sync(() => {
            expect(s.outcome.block).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'Should still name a reason when a cancelling hook says nothing',
      Gherkin.Do.pipe(
        Given('a PreCompact hook that exits 2 silently')('dir', preCompactExiting(2)),
        When('a compaction is about to start')('outcome', (s) => askToCompact(s.dir)),
        Then('the cancellation still carries a reason to show the user')((s) =>
          Effect.sync(() => {
            expect(s.outcome.block).toBe(true)
            expect(s.outcome.reason).toBe('Blocked by PreCompact hook')
          })
        ),
      ),
    )

    scenario(
      'Should run a PostCompact hook and ignore the code it exits with',
      Gherkin.Do.pipe(
        Given('a PostCompact hook that exits 2')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hookPath = `${dir}/after.sh`
            yield* fs.writeFileString(
              hookPath,
              ['#!/usr/bin/env bash', `echo after >> ${dir}/ran.log`, 'exit 2'].join('\n'),
            )
            yield* fs.chmod(hookPath, 0o755)
            yield* writeSettings(dir, { PostCompact: [{ hooks: [{ type: 'command', command: hookPath }] }] })
            return dir
          })),
        When('a compaction finishes')('ran', (s) =>
          Effect.gen(function*() {
            const settings = yield* settingsFrom(s.dir)
            if (settings === null) return []
            yield* runLifecycleHooks(settings.hooks.PostCompact, makeCtx(s.dir), 'PostCompact')
            return yield* whatRan(s.dir)
          })),
        Then('the hook ran and its objection changed nothing')((s) =>
          Effect.sync(() => {
            expect(s.ran).toEqual(['after'])
          })
        ),
      ),
    )

    scenario(
      'Should fire compact-scoped SessionStart hooks alongside PostCompact',
      Gherkin.Do.pipe(
        Given('a compact-scoped SessionStart hook beside a PostCompact hook')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const onStart = yield* recorder(dir, 'session-start')
            const onCompact = yield* recorder(dir, 'post-compact')
            yield* writeSettings(dir, {
              SessionStart: [{ matcher: 'compact', hooks: [onStart] }],
              PostCompact: [{ hooks: [onCompact] }],
            })
            return dir
          })),
        When('a compaction finishes')('ran', (s) =>
          Effect.gen(function*() {
            const settings = yield* settingsFrom(s.dir)
            if (settings === null) return []
            yield* runSessionStartHooks(settings, 'compact', makeCtx(s.dir))
            yield* runLifecycleHooks(settings.hooks.PostCompact, makeCtx(s.dir), 'PostCompact')
            return yield* whatRan(s.dir)
          })),
        Then('both hooks record a run, so the new one joined rather than displaced')((s) =>
          Effect.sync(() => {
            expect([...s.ran].sort()).toEqual(['post-compact', 'session-start'])
          })
        ),
      ),
    )
  })

Feature('SessionStart matcher values')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    const scopedHooks = (dir: string) =>
      Effect.gen(function*() {
        const onStartup = yield* recorder(dir, 'startup')
        const onResume = yield* recorder(dir, 'resume')
        const onFork = yield* recorder(dir, 'fork')
        const onClear = yield* recorder(dir, 'clear')
        const always = yield* recorder(dir, 'always')
        yield* writeSettings(dir, {
          SessionStart: [
            { matcher: 'startup', hooks: [onStartup] },
            { matcher: 'resume', hooks: [onResume] },
            { matcher: 'fork', hooks: [onFork] },
            { matcher: 'clear', hooks: [onClear] },
            { hooks: [always] },
          ],
        })
        return dir
      })

    const everyMatcher = (_s: unknown) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem
        return yield* scopedHooks(yield* fs.makeTempDirectoryScoped())
      })

    const onSwitch = (dir: string, reason: string) =>
      Effect.gen(function*() {
        const settings = yield* loadSettingsWithPaths([`${dir}/.claude/settings.json`])
        if (settings === null) return []
        yield* runSessionSwitchHooks(settings, reason, makeCtx(dir))
        return yield* whatRan(dir)
      })

    scenario(
      'Should run the startup-scoped hook when the session starts',
      Gherkin.Do.pipe(
        Given('a SessionStart hook for each documented matcher')('dir', everyMatcher),
        When('the session starts')('ran', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir}/.claude/settings.json`])
            if (settings === null) return []
            yield* runSessionStartHooks(settings, 'startup', makeCtx(s.dir))
            return yield* whatRan(s.dir)
          })),
        Then('the startup hook and the unscoped hook run, and nothing else does')((s) =>
          Effect.sync(() => {
            expect([...s.ran].sort()).toEqual(['always', 'startup'])
          })
        ),
      ),
    )

    scenario(
      'Should run the resume-scoped hook when a switch resumes a session',
      Gherkin.Do.pipe(
        Given('a SessionStart hook for each documented matcher')('dir', everyMatcher),
        When('a session switch reports resume')('ran', (s) => onSwitch(s.dir, 'resume')),
        Then('the resume hook and the unscoped hook run')((s) =>
          Effect.sync(() => {
            expect([...s.ran].sort()).toEqual(['always', 'resume'])
          })
        ),
      ),
    )

    scenario(
      'Should run the fork-scoped hook when a switch forks a session',
      Gherkin.Do.pipe(
        Given('a SessionStart hook for each documented matcher')('dir', everyMatcher),
        When('a session switch reports fork')('ran', (s) => onSwitch(s.dir, 'fork')),
        Then('the fork hook and the unscoped hook run')((s) =>
          Effect.sync(() => {
            expect([...s.ran].sort()).toEqual(['always', 'fork'])
          })
        ),
      ),
    )

    scenario(
      'Should run nothing when a switch is a new session or a handoff',
      Gherkin.Do.pipe(
        Given('a SessionStart hook for each documented matcher')('dir', everyMatcher),
        When('a session switch reports new and then handoff')('ran', (s) =>
          Effect.gen(function*() {
            yield* onSwitch(s.dir, 'new')
            return yield* onSwitch(s.dir, 'handoff')
          })),
        Then('not even the unscoped hook runs, because neither is a session start')((s) =>
          Effect.sync(() => {
            expect(s.ran).toEqual([])
          })
        ),
      ),
    )

    scenario(
      'Should never run a clear-scoped hook at any boundary',
      Gherkin.Do.pipe(
        Given('a SessionStart hook for each documented matcher')('dir', everyMatcher),
        When('every boundary this bridge can reach fires')('ran', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir}/.claude/settings.json`])
            if (settings === null) return []
            yield* runSessionStartHooks(settings, 'startup', makeCtx(s.dir))
            yield* runSessionStartHooks(settings, 'compact', makeCtx(s.dir))
            yield* runSessionSwitchHooks(settings, 'resume', makeCtx(s.dir))
            yield* runSessionSwitchHooks(settings, 'fork', makeCtx(s.dir))
            return yield* whatRan(s.dir)
          })),
        Then('clear never appears, and the unscoped hook ran once per boundary')((s) =>
          Effect.sync(() => {
            expect(s.ran).not.toContain('clear')
            expect(s.ran.filter((name) => name === 'always')).toHaveLength(4)
          })
        ),
      ),
    )

    scenario(
      'Should tell the user a resume-scoped hook misses a cold start under --resume',
      Gherkin.Do.pipe(
        Given('a SessionStart hook for each documented matcher')('dir', everyMatcher),
        When('the session starts')('report', (s) =>
          Effect.map(
            collectSettingsGapsWithPaths([`${s.dir}/.claude/settings.json`]),
            (gaps) => coverageReportLines(gaps.coverage).join('\n'),
          )),
        Then('the report names the resume gap and the unreachable clear matcher')((s) =>
          Effect.sync(() => {
            expect(s.report).toContain('SessionStart (matcher "resume")')
            expect(s.report).toContain('cold start under `--resume`')
            expect(s.report).toContain('SessionStart (matcher "clear")')
            expect(s.report).not.toContain('matcher "startup"')
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
            expect(coverageReportLines(s.found.coverage)).toEqual([])
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
              loaded(settings),
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
              loaded(settings),
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

    scenario(
      'Should run the hook under the shell it declares',
      Gherkin.Do.pipe(
        Given('a bash hook recording its interpreter')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            yield* writeSettings(dir, {
              PreToolUse: [{
                matcher: 'Write',
                hooks: [{
                  type: 'command',
                  command: `printf '%s' "$0" > "${dir}/shell.txt"`,
                  shell: 'bash',
                }],
              }],
            })
            return dir
          })),
        When('a Write tool call fires the hook')('shell', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadFrom(s.dir)
            yield* runPreToolUseHooks(
              loaded(settings),
              makeToolCall('Write', { file_path: `${s.dir}/t.txt` }),
              makeCtx(s.dir),
            )
            const fs = yield* FileSystem
            return yield* fs.readFileString(`${s.dir}/shell.txt`)
          })),
        Then('bash ran it, not sh')((s) =>
          Effect.sync(() => {
            expect(s.shell).toBe('bash')
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

Feature('Hook dispatcher - if condition')
  .withLayer(testLayer)
  .body(({ scenario, scenarioOutline }) => {
    const guardedBy = (rule: string) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem
        const dir = yield* fs.makeTempDirectoryScoped()
        const hook = yield* writeShellHook(dir, 'guard', 2, 'refused')
        yield* writeSettings(dir, {
          PreToolUse: [{ hooks: [{ type: 'command', command: hook, if: rule }] }],
        })
        return dir
      })

    const refused = (dir: string, toolName: string, input: Record<string, unknown>) =>
      Effect.gen(function*() {
        const settings = yield* loadSettingsWithPaths([`${dir}/.claude/settings.json`])
        const result = yield* runPreToolUseHooks(loaded(settings), makeToolCall(toolName, input), makeCtx(dir))
        return result?.block === true
      })

    scenarioOutline(
      'Should <verdict> the guard when <rule> meets <command>',
      [
        { rule: 'Bash(git *)', command: 'FOO=bar git push', verdict: 'run', blocks: true },
        { rule: 'Bash(git *)', command: 'npm test && git push', verdict: 'run', blocks: true },
        { rule: 'Bash(rm *)', command: 'echo $(rm -rf /)', verdict: 'run', blocks: true },
        { rule: 'Bash(rm *)', command: 'echo $(date)', verdict: 'skip', blocks: false },
        { rule: 'Bash(git push *)', command: 'echo $(date)', verdict: 'run', blocks: true },
        { rule: 'Bash(rm *)', command: 'npm test', verdict: 'skip', blocks: false },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given('a PreToolUse guard conditioned on a permission rule')('dir', (_s) => guardedBy(row.rule)),
          When('Claude runs the shell command')(
            'blocked',
            (s) => refused(s.dir, 'bash', { command: row.command }),
          ),
          Then('the guard refuses the call only when its rule matches')((s) =>
            Effect.sync(() => {
              expect(s.blocked).toBe(row.blocks)
            })
          ),
        ),
    )

    scenarioOutline(
      'Should <verdict> the guard when <rule> meets the edited file <file>',
      [
        { rule: 'Edit(*.ts)', file: 'a.ts', verdict: 'run', blocks: true },
        { rule: 'Edit(*.ts)', file: 'a.js', verdict: 'skip', blocks: false },
        { rule: 'Edit(src/**)', file: 'src/a.ts', verdict: 'run', blocks: true },
        { rule: 'Edit(src/**)', file: 'src', verdict: 'run', blocks: true },
        { rule: 'Edit(src/**)', file: 'lib/src/a.ts', verdict: 'skip', blocks: false },
        { rule: 'Edit(**/src/**)', file: 'lib/src/a.ts', verdict: 'run', blocks: true },
        { rule: 'Edit', file: 'anything.md', verdict: 'run', blocks: true },
        { rule: 'Write(*.ts)', file: 'a.ts', verdict: 'skip', blocks: false },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given('a PreToolUse guard conditioned on a path rule')('dir', (_s) => guardedBy(row.rule)),
          When('Claude edits the file')(
            'blocked',
            (s) => refused(s.dir, 'edit', { file_path: `${s.dir}/${row.file}` }),
          ),
          Then('the guard refuses the edit only when its rule matches the path')((s) =>
            Effect.sync(() => {
              expect(s.blocked).toBe(row.blocks)
            })
          ),
        ),
    )

    scenario(
      'Should never run a hook carrying an if condition on a non-tool event',
      Gherkin.Do.pipe(
        Given('a prompt hook carrying an if condition')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hook = yield* writeShellHook(dir, 'reject', 2, 'prompt refused')
            yield* writeSettings(dir, {
              UserPromptSubmit: [{ hooks: [{ type: 'command', command: hook, if: 'Bash(git *)' }] }],
            })
            return dir
          })),
        When('a prompt is submitted')('result', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir}/.claude/settings.json`])
            return yield* runUserPromptSubmitHooks(
              loaded(settings),
              { text: 'hello', source: 'interactive' },
              makeCtx(s.dir),
            )
          })),
        Then('the hook is skipped rather than blocking the prompt')((s) =>
          Effect.sync(() => {
            expect(s.result).toBeUndefined()
          })
        ),
      ),
    )
  })
