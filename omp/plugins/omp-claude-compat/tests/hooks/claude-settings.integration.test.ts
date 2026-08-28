import * as NodeChildProcessSpawner from '@effect/platform-node-shared/NodeChildProcessSpawner'
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import * as PathModule from 'effect/Path'
import { expect } from 'vitest'
import type { HookToolCall } from './__fixtures__/HookPublic.js'
import { HookScopeLive, onToolCall } from './__fixtures__/HookPublic.js'
import type { HookSession } from './__fixtures__/HookPublic.js'

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
  homeDir: cwd,
  sessionManager: { getSessionId: () => 'test-session' },
  ui: { notify: () => {} },
})

const writeCall: HookToolCall = {
  toolName: 'write',
  toolCallId: 'toolu_empty',
  input: { path: '/src/a.ts', content: 'x' },
}

Feature('Settings snapshot at the edge')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    scenario(
      'Should return nothing when no settings file exists',
      Gherkin.Do.pipe(
        Given('an empty project tree')(
          'dir',
          () => Effect.flatMap(FileSystem, (fs) => fs.makeTempDirectoryScoped()),
        ),
        When('a tool-call event arrives')('seen', (s) => onToolCall(writeCall, makeCtx(s.dir))),
        Then('the decision sees an empty snapshot and does not throw')((s) =>
          Effect.sync(() => {
            expect(s.seen).toBeUndefined()
          })
        ),
      ),
    )
  })
