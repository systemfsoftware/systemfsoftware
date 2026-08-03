import { NodeCommandExecutor, NodeFileSystem } from '@effect/platform-node'
import { FileSystem } from '@effect/platform/FileSystem'
import * as PathModule from '@effect/platform/Path'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { expect } from 'vitest'
import { HookScopeLive } from '../src/hook-runtime.state.js'
import type { HookSession, HookToolCall } from '../src/hook-session.shape.js'
import { loadSettingsWithPaths } from '../src/internal/load-settings.executor.js'
import { runPreToolUseHooks } from '../src/internal/run-pre-tool-use-hooks.executor.js'
import {
  makeGuardedSettingsJson,
  makePathGuardScript,
  makeSettingsJson,
  makeShellHookScript,
} from './hook-dispatcher-fixture.observer.js'
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

const guardedDir = (name: string, forbidden: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem
    const dir = yield* fs.makeTempDirectoryScoped()
    const hook = yield* makePathGuardScript(dir, name, forbidden)
    yield* makeGuardedSettingsJson(dir, hook)
    return { dir, hook }
  })

const dispatchEdit = (dir: string, patch: string) =>
  Effect.gen(function*() {
    const settings = yield* loadSettingsWithPaths([`${dir}/.claude/settings.json`])
    if (settings === null) throw new Error('expected settings to load, got null')
    return yield* runPreToolUseHooks(
      settings,
      makeToolCall('edit', { i: 'x', input: patch }),
      makeCtx(dir),
    )
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
            yield* makePathGuardScript(dir, 'guard', 'repos/vendored')
            yield* makeSettingsJson(dir, {
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
            const hook = yield* makeShellHookScript(dir, 'rewrite', 0, undefined, rewrite)
            yield* makeSettingsJson(dir, {
              PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: hook }] }],
            })
            return { dir, hook }
          })),
        When('runPreToolUseHooks is called for a path-keyed Write')('event', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir.dir}/.claude/settings.json`])
            expect(settings).not.toBeNull()
            const event = makeToolCall('write', { path: '/test.txt', content: 'x' })
            yield* runPreToolUseHooks(expectLoaded(settings), event, makeCtx(s.dir.dir))
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
