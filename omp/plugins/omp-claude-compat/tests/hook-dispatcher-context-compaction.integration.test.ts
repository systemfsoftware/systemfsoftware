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
import { runLifecycleHooks } from '../src/internal/RunLifecycleHooksExecutor.js'
import { runPreCompactHooks } from '../src/internal/RunPreCompactHooksExecutor.js'
import { runSessionStartHooks } from '../src/internal/RunSessionStartHooksExecutor.js'
import {
  makeRecorder,
  makeSettingsJson,
  makeShellHookScript,
  runInvocations,
} from './__fixtures__/HookDispatcherFixture.js'

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

Feature('Hooks around context compaction')
  .withLayer(testLayer)
  .body(({ scenario }) => {
    const settingsFrom = (dir: string) => loadSettingsWithPaths([`${dir}/.claude/settings.json`])

    const askToCompact = (dir: string) =>
      Effect.gen(function*() {
        const settings = yield* settingsFrom(dir)
        if (settings === null) return { block: undefined, reason: undefined }
        const result = yield* runPreCompactHooks(settings, makeCtx(dir))
        return { block: result.block, reason: result.reason }
      })

    const preCompactExiting = (code: number, stderr?: string) => (_s: unknown) =>
      Effect.gen(function*() {
        const fs = yield* FileSystem
        const dir = yield* fs.makeTempDirectoryScoped()
        const hookPath = yield* makeShellHookScript(dir, 'gate', code, stderr)
        yield* makeSettingsJson(dir, { PreCompact: [{ hooks: [{ type: 'command', command: hookPath }] }] })
        return dir
      })

    scenario(
      'Should cancel compaction when a PreCompact hook exits 2',
      Gherkin.Do.pipe(
        Given('a PreCompact hook that exits 2 explaining itself')(
          'dir',
          preCompactExiting(2, 'still mid refactor'),
        ),
        When('a compaction is about to start')('outcome', (s) => askToCompact(s.dir)),
        Then('compaction is cancelled and the hook explanation is carried')((s) =>
          Effect.sync(() => {
            expect(s.outcome.block).toBe(true)
            expect(s.outcome.reason).toContain('still mid refactor')
          })
        ),
      ),
    )

    scenario(
      'Should let compaction proceed when a PreCompact hook exits 0',
      Gherkin.Do.pipe(
        Given('a PreCompact hook that exits 0')('dir', preCompactExiting(0)),
        When('a compaction is about to start')('outcome', (s) => askToCompact(s.dir)),
        Then('compaction is left to run')((s) =>
          Effect.sync(() => {
            expect(s.outcome.block).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'Should still name a reason when a cancelling hook says nothing',
      Gherkin.Do.pipe(
        Given('a PreCompact hook that exits 2 silently')('dir', preCompactExiting(2)),
        When('a compaction is about to start')('outcome', (s) => askToCompact(s.dir)),
        Then('the cancellation still carries a reason to show the user')((s) =>
          Effect.sync(() => {
            expect(s.outcome.block).toBe(true)
            expect(s.outcome.reason).toBe('Blocked by PreCompact hook')
          })
        ),
      ),
    )

    scenario(
      'Should run a PostCompact hook and ignore the code it exits with',
      Gherkin.Do.pipe(
        Given('a PostCompact hook that exits 2')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const hookPath = `${dir}/after.sh`
            yield* fs.writeFileString(
              hookPath,
              ['#!/usr/bin/env bash', `echo after >> ${dir}/ran.log`, 'exit 2'].join('\n'),
            )
            yield* fs.chmod(hookPath, 0o755)
            yield* makeSettingsJson(dir, { PostCompact: [{ hooks: [{ type: 'command', command: hookPath }] }] })
            return dir
          })),
        When('a compaction finishes')('ran', (s) =>
          Effect.gen(function*() {
            const settings = yield* settingsFrom(s.dir)
            if (settings === null) return []
            yield* runLifecycleHooks(settings.hooks.PostCompact, makeCtx(s.dir), 'PostCompact')
            return yield* runInvocations(s.dir)
          })),
        Then('the hook ran and its objection changed nothing')((s) =>
          Effect.sync(() => {
            expect(s.ran).toEqual(['after'])
          })
        ),
      ),
    )

    scenario(
      'Should fire compact-scoped SessionStart hooks alongside PostCompact',
      Gherkin.Do.pipe(
        Given('a compact-scoped SessionStart hook beside a PostCompact hook')('dir', (_s) =>
          Effect.gen(function*() {
            const fs = yield* FileSystem
            const dir = yield* fs.makeTempDirectoryScoped()
            const onStart = yield* makeRecorder(dir, 'session-start')
            const onCompact = yield* makeRecorder(dir, 'post-compact')
            yield* makeSettingsJson(dir, {
              SessionStart: [{ matcher: 'compact', hooks: [onStart] }],
              PostCompact: [{ hooks: [onCompact] }],
            })
            return dir
          })),
        When('a compaction finishes')('ran', (s) =>
          Effect.gen(function*() {
            const settings = yield* settingsFrom(s.dir)
            if (settings === null) return []
            yield* runSessionStartHooks(settings, 'compact', makeCtx(s.dir))
            yield* runLifecycleHooks(settings.hooks.PostCompact, makeCtx(s.dir), 'PostCompact')
            return yield* runInvocations(s.dir)
          })),
        Then('both hooks record a run, so the new one joined rather than displaced')((s) =>
          Effect.sync(() => {
            expect([...s.ran].sort()).toEqual(['post-compact', 'session-start'])
          })
        ),
      ),
    )
  })
