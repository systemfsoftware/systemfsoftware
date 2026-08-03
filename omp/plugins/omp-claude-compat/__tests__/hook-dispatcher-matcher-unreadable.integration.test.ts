import { NodeCommandExecutor, NodeFileSystem } from '@effect/platform-node'
import { FileSystem } from '@effect/platform/FileSystem'
import * as PathModule from '@effect/platform/Path'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { expect } from 'vitest'
import { HookScopeLive } from '../src/hook-runtime.state.js'
import type { HookSession } from '../src/hook-session.shape.js'
import { runHooksForEvent } from '../src/internal/run-hooks-for-event.executor.js'
import { runLifecycleHooks } from '../src/internal/run-lifecycle-hooks.executor.js'
import { makeRecorder, runInvocations } from './hook-dispatcher-fixture.observer.js'

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

type HookEntry = Parameters<typeof runHooksForEvent>[0][number]

Feature('Hooks whose matcher this bridge cannot read')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    const dispatch = (dir: string, entries: readonly HookEntry[], event: string, matchValue: string) =>
      Effect.gen(function*() {
        yield* runHooksForEvent(entries, matchValue, {}, makeCtx(dir), event)
        return yield* runInvocations(dir)
      })

    scenario(
      'Should skip a PreCompact hook that declares a matcher',
      Gherkin.Do.pipe(
        Given('a PreCompact hook scoped to matcher manual')('setup', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hook = yield* makeRecorder(dir, 'scoped')
            return { dir, entries: [{ matcher: 'manual', hooks: [hook] }] }
          })),
        When('a compaction is about to run')(
          'ran',
          (s) => dispatch(s.setup.dir, s.setup.entries, 'PreCompact', 'manual'),
        ),
        Then('the hook leaves no trace')((s) =>
          Effect.sync(() => {
            expect(s.ran).toEqual([])
          })
        ),
      ),
    )

    scenario(
      'Should run a PreCompact hook that declares no matcher',
      Gherkin.Do.pipe(
        Given('a PreCompact hook with no matcher')('setup', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hook = yield* makeRecorder(dir, 'bare')
            return { dir, entries: [{ hooks: [hook] }] }
          })),
        When('a compaction is about to run')(
          'ran',
          (s) => dispatch(s.setup.dir, s.setup.entries, 'PreCompact', 'manual'),
        ),
        Then('the hook records that it ran')((s) =>
          Effect.sync(() => {
            expect(s.ran).toEqual(['bare'])
          })
        ),
      ),
    )

    scenario(
      'Should run only the bare hook when a scoped and a bare hook share PreCompact',
      Gherkin.Do.pipe(
        Given('a PreCompact hook scoped to manual beside one with no matcher')('setup', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const scoped = yield* makeRecorder(dir, 'scoped')
            const bare = yield* makeRecorder(dir, 'bare')
            return {
              dir,
              entries: [{ matcher: 'manual', hooks: [scoped] }, { hooks: [bare] }],
            }
          })),
        When('a compaction is about to run')(
          'ran',
          (s) => dispatch(s.setup.dir, s.setup.entries, 'PreCompact', 'manual'),
        ),
        Then('exactly one run is recorded, by the unscoped hook')((s) =>
          Effect.sync(() => {
            expect(s.ran).toEqual(['bare'])
          })
        ),
      ),
    )

    scenario(
      'Should still honour a tool_name matcher on PostToolUseFailure',
      Gherkin.Do.pipe(
        Given('a PostToolUseFailure hook scoped to matcher Bash')('setup', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hook = yield* makeRecorder(dir, 'bash-only')
            return { dir, entries: [{ matcher: 'Bash', hooks: [hook] }] }
          })),
        When('a Bash tool call fails')(
          'ran',
          (s) => dispatch(s.setup.dir, s.setup.entries, 'PostToolUseFailure', 'Bash'),
        ),
        Then('the scoped hook runs, proving the gate is per event')((s) =>
          Effect.sync(() => {
            expect(s.ran).toEqual(['bash-only'])
          })
        ),
      ),
    )

    scenario(
      'Should skip a PostCompact hook that declares a matcher',
      Gherkin.Do.pipe(
        Given('a PostCompact hook scoped to matcher auto')('setup', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const scoped = yield* makeRecorder(dir, 'scoped')
            const bare = yield* makeRecorder(dir, 'bare')
            return {
              dir,
              entries: [{ matcher: 'auto', hooks: [scoped] }, { hooks: [bare] }],
            }
          })),
        When('a compaction finishes')('ran', (s) =>
          Effect.gen(function*() {
            yield* runLifecycleHooks(s.setup.entries, makeCtx(s.setup.dir), 'PostCompact')
            return yield* runInvocations(s.setup.dir)
          })),
        Then('only the unscoped hook runs')((s) => Effect.sync(() => expect(s.ran).toEqual(['bare']))),
      ),
    )

    scenario(
      'Should skip a SessionEnd hook that declares a matcher',
      Gherkin.Do.pipe(
        Given('a SessionEnd hook scoped to matcher logout')('setup', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const scoped = yield* makeRecorder(dir, 'scoped')
            return { dir, entries: [{ matcher: 'logout', hooks: [scoped] }] }
          })),
        When('the session ends')('ran', (s) =>
          Effect.gen(function*() {
            yield* runLifecycleHooks(s.setup.entries, makeCtx(s.setup.dir), 'SessionEnd')
            return yield* runInvocations(s.setup.dir)
          })),
        Then('nothing runs, because the bridge cannot tell a logout from any other exit')((s) =>
          Effect.sync(() => expect(s.ran).toEqual([]))
        ),
      ),
    )

    scenario(
      'Should skip a PreCompact hook whose if condition no tool call can be judged against',
      Gherkin.Do.pipe(
        Given('a PreCompact hook whose if condition names two tools, which is not a rule')(
          'setup',
          (_s) =>
            Effect.gen(function*() {
              const fs = yield* FileSystem
              const dir = yield* fs.makeTempDirectoryScoped()
              const hook = yield* makeRecorder(dir, 'conditioned')
              return { dir, entries: [{ hooks: [{ ...hook, if: 'Read Write' }] }] }
            }),
        ),
        When('a compaction is about to run')(
          'ran',
          (s) => dispatch(s.setup.dir, s.setup.entries, 'PreCompact', ''),
        ),
        Then('nothing runs, even though an unjudgeable rule elsewhere runs the hook')((s) =>
          Effect.sync(() => expect(s.ran).toEqual([]))
        ),
      ),
    )
  })
