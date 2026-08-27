import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Effect, Layer } from 'effect'
import * as PathModule from 'effect/Path'
import { expect } from 'vitest'
import { ClaudeSettings, ClaudeSettingsLiveUnbaked, ClaudeSettingsSources } from '../../src/settings/mod.js'

const Feature = makeFeature({ it, layer })

const customSettingsJson = JSON.stringify({
  hooks: {
    PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'echo hi' }] }],
    PostToolUse: [],
    PostToolUseFailure: [],
    UserPromptSubmit: [],
    SessionStart: [],
    SessionEnd: [],
    Stop: [],
    PreCompact: [],
    PostCompact: [],
  },
})

const fakeDescribe = (_cwd: string, _homeDir: string) =>
  Effect.succeed({
    paths: ['/custom/settings.json'] as const,
    hookFiles: [] as const,
    pluginSources: [] as const,
  })

const fakeSourcesLayer = Layer.succeed(
  ClaudeSettingsSources,
  ClaudeSettingsSources.of({ describe: fakeDescribe }),
)

const memFsLayer = MemoryFileSystem.layerWith({ '/custom/settings.json': customSettingsJson }).pipe(
  Layer.provideMerge(PathModule.layer),
)

const testLayer = ClaudeSettingsLiveUnbaked.pipe(
  Layer.provideMerge(fakeSourcesLayer),
  Layer.provideMerge(memFsLayer),
)

Feature('Settings policy substitution').withLayer(testLayer).body(({ scenario }) => {
  scenario(
    'Should_load_hooks_from_fake_source_without_reading_default_paths',
    Gherkin.Do.pipe(
      Given('a memfs with a custom settings file and a fake source policy')(
        'ctx',
        () => Effect.succeed({ cwd: '/project', homeDir: '/home/user' }),
      ),
      When('ClaudeSettings.load is called')(
        'loaded',
        (s) => Effect.flatMap(ClaudeSettings, (svc) => svc.load(s.ctx.cwd, s.ctx.homeDir)),
      ),
      Then('the loaded settings should contain the custom hook')((s) =>
        Effect.sync(() => {
          expect(s.loaded?.hooks.PreToolUse.length).toBe(1)
          expect(s.loaded?.hooks.PreToolUse[0]?.matcher).toBe('Write')
        })
      ),
    ),
  )
})
