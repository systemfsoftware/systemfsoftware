import { NodeCommandExecutor, NodeFileSystem } from '@effect/platform-node'
import { FileSystem } from '@effect/platform/FileSystem'
import * as PathModule from '@effect/platform/Path'
import type { ExtensionContext, ToolCallEvent } from '@oh-my-pi/pi-coding-agent'
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { expect } from 'vitest'
import {
  HookDispatcherExecutorDeps,
  loadSettings,
  runHookScript,
  runPreToolUseHooks,
} from '../src/hook-dispatcher.executor.js'

const Feature = makeFeature({ it, layer })

const noTel = () => {}
const telLayer = Layer.succeed(HookDispatcherExecutorDeps, { tel: noTel })
const testLayer = NodeCommandExecutor.layer.pipe(
  Layer.provideMerge(NodeFileSystem.layer),
  Layer.provideMerge(telLayer),
  Layer.provideMerge(PathModule.layer),
)

function writeShellHook(
  dir: string,
  name: string,
  exitCode: number,
  stderr?: string,
  stdout?: string,
): Effect.Effect<string, never, FileSystem.FileSystem> {
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
): Effect.Effect<void, never, FileSystem.FileSystem> {
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
        When('loadSettings is called')('result', (s) => loadSettings(s.dir)),
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
        When('loadSettings is called')('result', (s) => loadSettings(s.dir)),
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
            const settings = yield* loadSettings(s.dir.dir)
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
            const settings = yield* loadSettings(s.dir.dir)
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
            const settings = yield* loadSettings(s.dir.dir)
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
            const settings = yield* loadSettings(s.dir.dir)
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
  })

Feature('Hook dispatcher — TypeScript hook path resolution')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    scenario(
      'Should execute a TypeScript hook addressed with a double-quoted project-dir variable',
      Gherkin.Do.pipe(
        Given('a directory with a TypeScript marker hook')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            yield* fs.writeFileString(`${dir}/marker.ts`, `console.log('quoted-form-ok')\n`)
            return dir
          })),
        When('runHookScript is called with a double-quoted variable command')(
          'result',
          (s) => runHookScript('"$CLAUDE_PROJECT_DIR"/marker.ts', {}, s.dir, 30_000),
        ),
        Then('the hook should run and print its marker')((s) =>
          Effect.sync(() => {
            expect(s.result.code).toBe(0)
            expect(s.result.stdout.trim()).toBe('quoted-form-ok')
          })
        ),
      ),
    )

    scenario(
      'Should execute a TypeScript hook addressed with a single-quoted project-dir variable',
      Gherkin.Do.pipe(
        Given('a directory with a TypeScript marker hook')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            yield* fs.writeFileString(`${dir}/marker.ts`, `console.log('single-quoted-form-ok')\n`)
            return dir
          })),
        When('runHookScript is called with a single-quoted variable command')(
          'result',
          (s) => runHookScript(`'$CLAUDE_PROJECT_DIR'/marker.ts`, {}, s.dir, 30_000),
        ),
        Then('the hook should run and print its marker')((s) =>
          Effect.sync(() => {
            expect(s.result.code).toBe(0)
            expect(s.result.stdout.trim()).toBe('single-quoted-form-ok')
          })
        ),
      ),
    )
  })
