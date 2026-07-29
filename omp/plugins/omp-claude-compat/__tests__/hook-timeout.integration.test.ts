import { NodeCommandExecutor, NodeFileSystem } from '@effect/platform-node'
import { FileSystem } from '@effect/platform/FileSystem'
import * as PathModule from '@effect/platform/Path'
import { Effect, Layer } from 'effect'
import { expect, it } from 'vitest'
import { loadSettingsWithPaths, runHookScript, runPreCompactHooks } from '../src/hook-dispatcher.executor.js'

/**
 * Plain vitest rather than the Gherkin harness on purpose: harness scenarios
 * run on @effect/vitest's TestClock, where `Effect.timeout` never elapses, so
 * a hook timeout can only be exercised on the real runtime.
 */
const testLayer = NodeCommandExecutor.layer.pipe(
  Layer.provideMerge(NodeFileSystem.layer),
  Layer.provideMerge(PathModule.layer),
)

const runSlowHook = (timeout: number | undefined, sleepSeconds = 1) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem
    const dir = yield* fs.makeTempDirectoryScoped()
    const hookPath = `${dir}/slow.sh`
    yield* fs.writeFileString(hookPath, `#!/usr/bin/env bash\nsleep ${sleepSeconds}\nexit 2\n`)
    yield* fs.chmod(hookPath, 0o755)
    return yield* runHookScript({ type: 'command', command: hookPath, timeout }, {}, dir, 'PreToolUse')
  }).pipe(Effect.scoped, Effect.provide(testLayer), Effect.runPromise)

it('Should_KillTheHook_When_ItOutlivesItsTimeout', async () => {
  const result = await runSlowHook(0.3)

  expect(result.code).toBe(-1)
  expect(result.stderr).toContain('300ms')
})

it('Should_ReadTimeoutAsSeconds_When_TheHookFitsInsideIt', async () => {
  // 5 as milliseconds would kill a one-second hook; as seconds it survives.
  const result = await runSlowHook(5)

  expect(result.code).toBe(2)
})

it('Should_LetAHookOutliveTenSeconds_When_ItSetsNoTimeout', async () => {
  const result = await runSlowHook(undefined, 10.5)

  expect(result.code).toBe(2)
}, 25_000)

it('Should_LeaveCompactionRunning_When_ThePreCompactHookTimesOut', async () => {
  const outcome = await Effect.gen(function*() {
    const fs = yield* FileSystem
    const dir = yield* fs.makeTempDirectoryScoped()
    const hookPath = `${dir}/stall.sh`
    yield* fs.writeFileString(hookPath, '#!/usr/bin/env bash\nsleep 5\nexit 2\n')
    yield* fs.chmod(hookPath, 0o755)
    yield* fs.makeDirectory(`${dir}/.claude`, { recursive: true })
    yield* fs.writeFileString(
      `${dir}/.claude/settings.json`,
      JSON.stringify({ hooks: { PreCompact: [{ hooks: [{ type: 'command', command: hookPath, timeout: 0.3 }] }] } }),
    )
    const settings = yield* loadSettingsWithPaths([`${dir}/.claude/settings.json`])
    return settings === null ? undefined : yield* runPreCompactHooks(settings, {
      cwd: dir,
      sessionManager: { getSessionId: () => 'test-session' },
      ui: { notify: () => {} },
    })
  }).pipe(Effect.scoped, Effect.provide(testLayer), Effect.runPromise)

  expect(outcome).toBeDefined()
  expect(outcome?.block).toBeUndefined()
})
