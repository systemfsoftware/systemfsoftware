import { NodeCommandExecutor, NodeFileSystem } from '@effect/platform-node'
import { FileSystem } from '@effect/platform/FileSystem'
import * as PathModule from '@effect/platform/Path'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { expect } from 'vitest'
import { loadSettingsWithPaths, runPreToolUseHooks } from '../src/hook-dispatcher.executor.js'
import type { HookSession, HookToolCall } from '../src/hook-dispatcher.executor.js'
import { HookScopeLive } from '../src/hook-runtime.state.js'
import { makeSettingsJson, makeShellHookScript } from './hook-dispatcher-fixture.observer.js'
import { expectLoaded } from './loaded.observer.js'

const Feature = makeFeature({ it, layer })

const testLayer = HookScopeLive.pipe(
  Layer.provideMerge(
    NodeCommandExecutor.layer.pipe(
      Layer.provideMerge(NodeFileSystem.layer),
      Layer.provideMerge(PathModule.layer),
    ),
  ),
)

const makeCtx = (cwd: string): HookSession => ({
  cwd,
  sessionManager: { getSessionId: () => 'test-session' },
  ui: { notify: () => {} },
})

const makeToolCall = (toolName: string, input: Record<string, unknown>): HookToolCall => ({
  toolName,
  toolCallId: 'tc-test',
  input,
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
            const hook = yield* makeShellHookScript(dir, 'block', 2, 'blocked by policy')
            yield* makeSettingsJson(dir, {
              PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: hook }] }],
            })
            return { dir, hook }
          })),
        When('runPreToolUseHooks is called for a Write tool call')('result', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir.dir}/.claude/settings.json`])
            expect(settings).not.toBeNull()
            return yield* runPreToolUseHooks(
              expectLoaded(settings),
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
            const hook = yield* makeShellHookScript(dir, 'allow', 0)
            yield* makeSettingsJson(dir, {
              PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: hook }] }],
            })
            return { dir, hook }
          })),
        When('runPreToolUseHooks is called for a Write tool call')('result', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir.dir}/.claude/settings.json`])
            expect(settings).not.toBeNull()
            return yield* runPreToolUseHooks(
              expectLoaded(settings),
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
            const hook = yield* makeShellHookScript(dir, 'deny', 0, undefined, denyJson)
            yield* makeSettingsJson(dir, {
              PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: hook }] }],
            })
            return { dir, hook }
          })),
        When('runPreToolUseHooks is called for a Write tool call')('result', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir.dir}/.claude/settings.json`])
            expect(settings).not.toBeNull()
            return yield* runPreToolUseHooks(
              expectLoaded(settings),
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
            const hook = yield* makeShellHookScript(dir, 'block-npx', 2, 'npx is forbidden')
            yield* makeSettingsJson(dir, {
              PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: hook }] }],
            })
            return { dir, hook }
          })),
        When('runPreToolUseHooks is called for a Bash tool call')('result', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir.dir}/.claude/settings.json`])
            expect(settings).not.toBeNull()
            return yield* runPreToolUseHooks(
              expectLoaded(settings),
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
            const hook = yield* makeShellHookScript(dir, 'rewrite', 0, undefined, rewriteJson)
            yield* makeSettingsJson(dir, {
              PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: hook }] }],
            })
            return { dir, hook }
          })),
        When('runPreToolUseHooks is called for a Write tool call')('event', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir.dir}/.claude/settings.json`])
            expect(settings).not.toBeNull()
            const event = makeToolCall('write', { path: '/test.txt', content: 'original' })
            const result = yield* runPreToolUseHooks(expectLoaded(settings), event, makeCtx(s.dir.dir))
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
