import { NodeCommandExecutor, NodeFileSystem } from '@effect/platform-node'
import { FileSystem } from '@effect/platform/FileSystem'
import * as PathModule from '@effect/platform/Path'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { expect } from 'vitest'
import { HookScopeLive } from '../src/hook-runtime.state.js'
import type { HookSession, HookToolResult } from '../src/hook-session.shape.js'
import { loadSettingsWithPaths } from '../src/internal/load-settings.executor.js'
import { runPostToolUseHooks } from '../src/internal/run-post-tool-use-hooks.executor.js'
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

const makeToolResult = (toolName: string, input: Record<string, unknown>): HookToolResult => ({
  toolName,
  toolCallId: 'tc-test',
  input,
  content: 'ok',
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
            const hook = yield* makeShellHookScript(dir, 'silent', 0)
            yield* makeSettingsJson(dir, {
              PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: hook }] }],
            })
            return { dir, hook }
          })),
        When('runPostToolUseHooks is called for a Write tool result')('result', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir.dir}/.claude/settings.json`])
            expect(settings).not.toBeNull()
            return yield* runPostToolUseHooks(
              expectLoaded(settings),
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
            const hook = yield* makeShellHookScript(dir, 'chatty', 0, undefined, 'hook-ran')
            yield* makeSettingsJson(dir, {
              PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: hook }] }],
            })
            return { dir, hook }
          })),
        When('runPostToolUseHooks is called for a Write tool result')('result', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir.dir}/.claude/settings.json`])
            expect(settings).not.toBeNull()
            return yield* runPostToolUseHooks(
              expectLoaded(settings),
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
            const silent = yield* makeShellHookScript(dir, 'silent-first', 0)
            const warner = yield* makeShellHookScript(dir, 'warn-second', 1, 'real warning from hook B')
            yield* makeSettingsJson(dir, {
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
              expectLoaded(settings),
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
            const hook = yield* makeShellHookScript(dir, 'malformed', 0, undefined, '{"decision":')
            yield* makeSettingsJson(dir, {
              PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: hook }] }],
            })
            return { dir, hook }
          })),
        When('runPostToolUseHooks is called for a Write tool result')('result', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir.dir}/.claude/settings.json`])
            expect(settings).not.toBeNull()
            return yield* runPostToolUseHooks(
              expectLoaded(settings),
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
