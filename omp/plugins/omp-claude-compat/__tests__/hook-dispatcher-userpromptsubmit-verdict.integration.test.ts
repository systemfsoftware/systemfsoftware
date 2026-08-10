import * as NodeCommandExecutor from '@effect/platform-node/NodeCommandExecutor'
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import { FileSystem } from '@effect/platform/FileSystem'
import * as PathModule from '@effect/platform/Path'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { expect } from 'vitest'
import { HookScopeLive } from '../src/hook-runtime.state.js'
import type { HookPrompt, HookSession } from '../src/hook-session.shape.js'
import { loadSettingsWithPaths } from '../src/internal/load-settings.executor.js'
import { runUserPromptSubmitHooks } from '../src/internal/run-user-prompt-submit-hooks.executor.js'
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
            const hook = yield* makeShellHookScript(dir, 'reject', 2, 'prompt refused')
            yield* makeSettingsJson(dir, {
              UserPromptSubmit: [{ hooks: [{ type: 'command', command: hook }] }],
            })
            return { dir, hook }
          })),
        When('runUserPromptSubmitHooks is called')('result', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir.dir}/.claude/settings.json`])
            expect(settings).not.toBeNull()
            return yield* runUserPromptSubmitHooks(expectLoaded(settings), promptEvent, makeCtx(s.dir.dir))
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
            const hook = yield* makeShellHookScript(dir, 'inject', 0, undefined, 'extra context')
            yield* makeSettingsJson(dir, {
              UserPromptSubmit: [{ hooks: [{ type: 'command', command: hook }] }],
            })
            return { dir, hook }
          })),
        When('runUserPromptSubmitHooks is called')('result', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir.dir}/.claude/settings.json`])
            expect(settings).not.toBeNull()
            return yield* runUserPromptSubmitHooks(expectLoaded(settings), promptEvent, makeCtx(s.dir.dir))
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
