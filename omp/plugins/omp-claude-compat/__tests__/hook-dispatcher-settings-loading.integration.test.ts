import * as NodeCommandExecutor from '@effect/platform-node/NodeCommandExecutor'
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import { FileSystem } from '@effect/platform/FileSystem'
import * as PathModule from '@effect/platform/Path'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { expect } from 'vitest'
import { HookScopeLive } from '../src/hook-runtime.state.js'
import { loadSettingsWithPaths } from '../src/internal/load-settings.executor.js'
import { makeSettingsJson } from './hook-dispatcher-fixture.observer.js'
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
        When('loadSettingsWithPaths is called with non-existent path')(
          'result',
          (s) => loadSettingsWithPaths([`${s.dir}/.claude/settings.json`]),
        ),
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
            yield* makeSettingsJson(dir, {
              PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: '/hooks/check.sh' }] }],
            })
            return dir
          })),
        When('loadSettingsWithPaths is called with settings path')(
          'result',
          (s) => loadSettingsWithPaths([`${s.dir}/.claude/settings.json`]),
        ),
        Then('the settings should contain one PreToolUse hook')((s) =>
          Effect.sync(() => {
            expect(s.result).not.toBeNull()
            expect(expectLoaded(s.result).hooks.PreToolUse).toHaveLength(1)
          })
        ),
      ),
    )
  })
