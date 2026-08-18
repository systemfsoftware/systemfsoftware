import * as NodeChildProcessSpawner from '@effect/platform-node-shared/NodeChildProcessSpawner'
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import * as PathModule from 'effect/Path'
import { expect } from 'vitest'
import { HookScopeLive } from '../src/HookRuntime.js'
import type { HookSession, HookToolCall } from '../src/HookSession.js'
import { loadSettingsWithPaths } from '../src/internal/LoadSettingsExecutor.js'
import { runPreToolUseHooks } from '../src/internal/RunPreToolUseHooksExecutor.js'
import { makeSettingsJson } from './__fixtures__/HookDispatcherFixture.js'

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
            yield* makeSettingsJson(dir, {
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
