import * as NodeChildProcessSpawner from '@effect/platform-node-shared/NodeChildProcessSpawner'
import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import * as PathModule from 'effect/Path'
import { expect } from 'vitest'
import { HookScopeLive } from '../src/HookRuntime.js'
import type { HookSession } from '../src/HookSession.js'
import { collectSettingsGapsWithPaths } from '../src/internal/CollectSettingsGapsExecutor.js'
import { loadSettingsWithPaths } from '../src/internal/LoadSettingsExecutor.js'
import { runSessionStartHooks } from '../src/internal/RunSessionStartHooksExecutor.js'
import { runSessionSwitchHooks } from '../src/internal/RunSessionSwitchHooksExecutor.js'
import { makeRecorder, makeSettingsJson, runInvocations } from './__fixtures__/HookDispatcherFixture.js'

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

Feature('SessionStart matcher values')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    const scopedHooks = (dir: string) =>
      Effect.gen(function*() {
        const onStartup = yield* makeRecorder(dir, 'startup')
        const onResume = yield* makeRecorder(dir, 'resume')
        const onFork = yield* makeRecorder(dir, 'fork')
        const onClear = yield* makeRecorder(dir, 'clear')
        const always = yield* makeRecorder(dir, 'always')
        yield* makeSettingsJson(dir, {
          SessionStart: [
            { matcher: 'startup', hooks: [onStartup] },
            { matcher: 'resume', hooks: [onResume] },
            { matcher: 'fork', hooks: [onFork] },
            { matcher: 'clear', hooks: [onClear] },
            { hooks: [always] },
          ],
        })
        return dir
      })

    const everyMatcher = (_s: unknown) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem
        return yield* scopedHooks(yield* fs.makeTempDirectoryScoped())
      })

    const onSwitch = (dir: string, reason: string) =>
      Effect.gen(function*() {
        const settings = yield* loadSettingsWithPaths([`${dir}/.claude/settings.json`])
        if (settings === null) return []
        yield* runSessionSwitchHooks(settings, reason, makeCtx(dir))
        return yield* runInvocations(dir)
      })

    scenario(
      'Should run the startup-scoped hook when the session starts',
      Gherkin.Do.pipe(
        Given('a SessionStart hook for each documented matcher')('dir', everyMatcher),
        When('the session starts')('ran', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir}/.claude/settings.json`])
            if (settings === null) return []
            yield* runSessionStartHooks(settings, 'startup', makeCtx(s.dir))
            return yield* runInvocations(s.dir)
          })),
        Then('the startup hook and the unscoped hook run, and nothing else does')((s) =>
          Effect.sync(() => {
            expect([...s.ran].sort()).toEqual(['always', 'startup'])
          })
        ),
      ),
    )

    scenario(
      'Should run the resume-scoped hook when a switch resumes a session',
      Gherkin.Do.pipe(
        Given('a SessionStart hook for each documented matcher')('dir', everyMatcher),
        When('a session switch reports resume')('ran', (s) => onSwitch(s.dir, 'resume')),
        Then('the resume hook and the unscoped hook run')((s) =>
          Effect.sync(() => {
            expect([...s.ran].sort()).toEqual(['always', 'resume'])
          })
        ),
      ),
    )

    scenario(
      'Should run the fork-scoped hook when a switch forks a session',
      Gherkin.Do.pipe(
        Given('a SessionStart hook for each documented matcher')('dir', everyMatcher),
        When('a session switch reports fork')('ran', (s) => onSwitch(s.dir, 'fork')),
        Then('the fork hook and the unscoped hook run')((s) =>
          Effect.sync(() => {
            expect([...s.ran].sort()).toEqual(['always', 'fork'])
          })
        ),
      ),
    )

    scenario(
      'Should run nothing when a switch is a new session or a handoff',
      Gherkin.Do.pipe(
        Given('a SessionStart hook for each documented matcher')('dir', everyMatcher),
        When('a session switch reports new and then handoff')('ran', (s) =>
          Effect.gen(function*() {
            yield* onSwitch(s.dir, 'new')
            return yield* onSwitch(s.dir, 'handoff')
          })),
        Then('not even the unscoped hook runs, because neither is a session start')((s) =>
          Effect.sync(() => {
            expect(s.ran).toEqual([])
          })
        ),
      ),
    )

    scenario(
      'Should never run a clear-scoped hook at any boundary',
      Gherkin.Do.pipe(
        Given('a SessionStart hook for each documented matcher')('dir', everyMatcher),
        When('every boundary this bridge can reach fires')('ran', (s) =>
          Effect.gen(function*() {
            const settings = yield* loadSettingsWithPaths([`${s.dir}/.claude/settings.json`])
            if (settings === null) return []
            yield* runSessionStartHooks(settings, 'startup', makeCtx(s.dir))
            yield* runSessionStartHooks(settings, 'compact', makeCtx(s.dir))
            yield* runSessionSwitchHooks(settings, 'resume', makeCtx(s.dir))
            yield* runSessionSwitchHooks(settings, 'fork', makeCtx(s.dir))
            return yield* runInvocations(s.dir)
          })),
        Then('clear never appears, and the unscoped hook ran once per boundary')((s) =>
          Effect.sync(() => {
            expect(s.ran).not.toContain('clear')
            expect(s.ran.filter((name) => name === 'always')).toHaveLength(4)
          })
        ),
      ),
    )

    scenario(
      'Should tell the user a resume-scoped hook misses a cold start under --resume',
      Gherkin.Do.pipe(
        Given('a SessionStart hook for each documented matcher')('dir', everyMatcher),
        When('the session starts')('report', (s) =>
          Effect.map(
            collectSettingsGapsWithPaths([`${s.dir}/.claude/settings.json`]),
            (gaps) => gaps.coverage,
          )),
        Then('the report names the resume gap and the unreachable clear matcher')((s) =>
          Effect.sync(() => {
            expect(s.report.matcherOutOfReach.length).toBeGreaterThan(0)
            const reasons = s.report.matcherOutOfReach.map((row) => row.reason).join('\n')
            expect(reasons).toContain('cold start under `--resume`')
          })
        ),
      ),
    )
  })
