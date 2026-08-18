import * as NodeChildProcessSpawner from '@effect/platform-node-shared/NodeChildProcessSpawner'
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import * as PathModule from 'effect/Path'
import { expect } from 'vitest'
import { HookScopeLive } from '../src/HookRuntime.js'
import type { HookSession } from '../src/HookSession.js'
import { loadSettingsWithPaths } from '../src/internal/LoadSettingsExecutor.js'
import { runUserPromptSubmitHooks } from '../src/internal/RunUserPromptSubmitHooksExecutor.js'
import { makeSettingsJson, makeShellHookScript } from './__fixtures__/HookDispatcherFixture.js'
import { expectLoaded } from './__fixtures__/Loaded.js'

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
            const hook = yield* makeShellHookScript(dir, 'rebase-note', 0, undefined, 'repo is mid-rebase')
            yield* makeSettingsJson(dir, {
              UserPromptSubmit: [{ hooks: [{ type: 'command', command: hook }] }],
            })
            return dir
          })),
        When('Pat submits the slash command "/compact"')('result', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir}/.claude/settings.json`])
            return yield* runUserPromptSubmitHooks(
              expectLoaded(settings),
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
