import * as NodeChildProcessSpawner from '@effect/platform-node-shared/NodeChildProcessSpawner'
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import * as PathModule from 'effect/Path'
import { expect } from 'vitest'
import { drainAsyncHookContext, recordAsyncHookContext } from '../src/async-hook-output.state.js'
import { HookScopeLive } from '../src/hook-runtime.state.js'
import type { HookSession } from '../src/hook-session.shape.js'
import { loadSettingsWithPaths } from '../src/internal/load-settings.executor.js'
import { runUserPromptSubmitHooks } from '../src/internal/run-user-prompt-submit-hooks.executor.js'
import { makeSettingsJson } from './hook-dispatcher-fixture.observer.js'
import { expectLoaded } from './loaded.observer.js'

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
            yield* makeSettingsJson(dir, {})
            drainAsyncHookContext()
            recordAsyncHookContext('background scan finished')
            return dir
          })),
        And('Pat has already submitted the bash command "!ls"')((s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir}/.claude/settings.json`])
            const result = yield* runUserPromptSubmitHooks(
              expectLoaded(settings),
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
              expectLoaded(settings),
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
