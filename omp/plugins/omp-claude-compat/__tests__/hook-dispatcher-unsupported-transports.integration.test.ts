import * as NodeChildProcessSpawner from '@effect/platform-node-shared/NodeChildProcessSpawner'
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import * as PathModule from 'effect/Path'
import { expect } from 'vitest'
import { HookScopeLive } from '../src/hook-runtime.state.js'
import type { HookSession, HookToolCall } from '../src/hook-session.shape.js'
import { collectSettingsGapsWithPaths } from '../src/internal/collect-settings-gaps.executor.js'
import { loadSettingsWithPaths } from '../src/internal/load-settings.executor.js'
import { runPreToolUseHooks } from '../src/internal/run-pre-tool-use-hooks.executor.js'
import { makePathGuardScript, makeSettingsJson } from './hook-dispatcher-fixture.observer.js'

const Feature = makeFeature({ it, layer })

const testLayer = HookScopeLive.pipe(
  Layer.provideMerge(
    NodeChildProcessSpawner.layer.pipe(
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

Feature('Hook dispatcher — hook transports this bridge cannot run')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    const withHttpBeside = (guard: string) => ({
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
            const guard = yield* makePathGuardScript(dir, 'guard', 'repos/vendored')
            yield* makeSettingsJson(dir, withHttpBeside(guard))
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
            yield* makeSettingsJson(dir, {
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
            expect(s.found.coverage.unrecognized).toEqual([])
            expect(s.found.coverage.notCarried).toEqual([])
            expect(s.found.coverage.matcherNotEvaluable).toEqual([])
            expect(s.found.coverage.matcherOutOfReach).toEqual([])
            expect(s.found.coverage.shadowed).toEqual([])
            expect(s.found.coverage.disabled).toEqual([])
          })
        ),
      ),
    )
  })
