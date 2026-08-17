import * as NodeChildProcessSpawner from '@effect/platform-node-shared/NodeChildProcessSpawner'
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import * as PathModule from 'effect/Path'
import { expect } from 'vitest'
import { HookScopeLive } from '../src/hook-runtime.state.js'
import { collectSettingsGapsWithPaths } from '../src/internal/collect-settings-gaps.executor.js'
import { loadSettingsWithPaths } from '../src/internal/load-settings.executor.js'
import { makeSettingsJson } from './__fixtures__/hook-dispatcher-fixture.observer.js'

const Feature = makeFeature({ it, layer })

const testLayer = HookScopeLive.pipe(
  Layer.provideMerge(
    NodeChildProcessSpawner.layer.pipe(
      Layer.provideMerge(NodeFileSystem.layer),
      Layer.provideMerge(PathModule.layer),
    ),
  ),
)

Feature('Hook dispatcher - undecodable settings')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    scenario(
      'Should name a settings file whose hooks cannot be decoded',
      Gherkin.Do.pipe(
        Given('a settings file with a command hook missing its command')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            yield* makeSettingsJson(dir, {
              PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command' }] }],
            })
            return dir
          })),
        When('the settings are scanned')(
          'found',
          (s) => collectSettingsGapsWithPaths([`${s.dir}/.claude/settings.json`]),
        ),
        Then('the file is named rather than silently skipped')((s) =>
          Effect.sync(() => {
            expect(s.found.malformedFiles).toHaveLength(1)
          })
        ),
      ),
    )

    scenario(
      'Should not let a broken file decode to an empty hook set',
      Gherkin.Do.pipe(
        Given('a settings file with a command hook missing its command')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            yield* makeSettingsJson(dir, {
              PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command' }] }],
            })
            return dir
          })),
        When('the settings are loaded')(
          'result',
          (s) => loadSettingsWithPaths([`${s.dir}/.claude/settings.json`]),
        ),
        Then('the loader refuses it instead of returning empty settings')((s) =>
          Effect.sync(() => {
            expect(s.result).toBeNull()
          })
        ),
      ),
    )

    scenario(
      'Should name a settings file that is not valid JSON',
      Gherkin.Do.pipe(
        Given('a settings file containing a trailing comma')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            yield* fs.makeDirectory(`${dir}/.claude`, { recursive: true })
            yield* fs.writeFileString(`${dir}/.claude/settings.json`, '{ "hooks": {}, }')
            return dir
          })),
        When('the settings are scanned')(
          'found',
          (s) => collectSettingsGapsWithPaths([`${s.dir}/.claude/settings.json`]),
        ),
        Then('the file is named')((s) =>
          Effect.sync(() => {
            expect(s.found.malformedFiles).toHaveLength(1)
          })
        ),
      ),
    )
  })
