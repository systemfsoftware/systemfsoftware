import * as NodeCommandExecutor from '@effect/platform-node/NodeCommandExecutor'
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem'
import { FileSystem } from '@effect/platform/FileSystem'
import * as PathModule from '@effect/platform/Path'
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { expect } from 'vitest'
import { HookScopeLive } from '../src/hook-runtime.state.js'
import { loadSettingsWithPaths } from '../src/internal/load-settings.executor.js'
import { runHookScript } from '../src/internal/run-hook-script.executor.js'
import { runPreCompactHooks } from '../src/internal/run-pre-compact-hooks.executor.js'

const Feature = makeFeature({ it, layer })

const testLayer = HookScopeLive.pipe(
  Layer.provideMerge(
    NodeCommandExecutor.layer.pipe(
      Layer.provideMerge(NodeFileSystem.layer),
      Layer.provideMerge(PathModule.layer),
    ),
  ),
)

const runWithRealClock = <A, E>(effect: Effect.Effect<A, E, never>): Promise<A> =>
  Effect.runPromise(
    Effect.tryPromise(() => Effect.runPromise(effect)),
  )
const runSlowHook = (timeout: number | undefined, sleepSeconds: number) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem
    const dir = yield* fs.makeTempDirectoryScoped()
    const hookPath = `${dir}/slow.sh`
    yield* fs.writeFileString(hookPath, `#!/usr/bin/env bash\nsleep ${sleepSeconds}\nexit 2\n`)
    yield* fs.chmod(hookPath, 0o755)
    return yield* runHookScript({ type: 'command', command: hookPath, timeout }, {}, dir, 'PreToolUse')
  }).pipe(Effect.scoped, Effect.provide(testLayer))

const runNoisyHook = (stderrBytes: number, timeoutSeconds: number) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem
    const dir = yield* fs.makeTempDirectoryScoped()
    const hookPath = `${dir}/noisy.sh`
    yield* fs.writeFileString(
      hookPath,
      `#!/usr/bin/env bash\nhead -c ${stderrBytes} /dev/zero | tr '\\0' 'E' >&2\necho done\nexit 0\n`,
    )
    yield* fs.chmod(hookPath, 0o755)
    return yield* runHookScript(
      { type: 'command', command: hookPath, timeout: timeoutSeconds },
      {},
      dir,
      'PreToolUse',
    )
  }).pipe(Effect.scoped, Effect.provide(testLayer))

const runTermIgnoringHook = (timeoutSeconds: number) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem
    const dir = yield* fs.makeTempDirectoryScoped()
    const hookPath = `${dir}/deaf.sh`
    yield* fs.writeFileString(hookPath, "#!/usr/bin/env bash\ntrap '' TERM\nsleep 30\n")
    yield* fs.chmod(hookPath, 0o755)
    return yield* runHookScript(
      { type: 'command', command: hookPath, timeout: timeoutSeconds },
      {},
      dir,
      'PreToolUse',
    )
  }).pipe(Effect.scoped, Effect.provide(testLayer))

const runPreCompact = (timeoutSeconds: number) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem
    const dir = yield* fs.makeTempDirectoryScoped()
    const hookPath = `${dir}/stall.sh`
    yield* fs.writeFileString(hookPath, '#!/usr/bin/env bash\nsleep 5\nexit 2\n')
    yield* fs.chmod(hookPath, 0o755)
    yield* fs.makeDirectory(`${dir}/.claude`, { recursive: true })
    yield* fs.writeFileString(
      `${dir}/.claude/settings.json`,
      JSON.stringify({
        hooks: { PreCompact: [{ hooks: [{ type: 'command', command: hookPath, timeout: timeoutSeconds }] }] },
      }),
    )
    const settings = yield* loadSettingsWithPaths([`${dir}/.claude/settings.json`])
    if (settings === null) return undefined
    return yield* runPreCompactHooks(settings, {
      cwd: dir,
      sessionManager: { getSessionId: () => 'test-session' },
      ui: { notify: () => {} },
    })
  }).pipe(Effect.scoped, Effect.provide(testLayer))

Feature('Hook dispatcher — timeout enforcement on detached processes', { timeout: 30_000 })
  .withLayer(testLayer)
  .liveClock()
  .body(({ scenario }) => {
    scenario(
      'A hook outliving its timeout is interrupted',
      Gherkin.Do.pipe(
        Given('a sleeping hook with a 300 ms timeout')(
          'result',
          () => Effect.tryPromise(() => runWithRealClock(runSlowHook(0.3, 1))),
        ),
        Then('the run reports it was killed by the timeout')((s) =>
          Effect.sync(() => {
            expect(s.result.code).toBe(-1)
            expect(s.result.stderr).toContain('300ms')
          })
        ),
      ),
    )

    scenario(
      'A hook that fits inside its timeout exits on its own',
      Gherkin.Do.pipe(
        Given('a sleeping hook with a five-second timeout')(
          'result',
          () => Effect.tryPromise(() => runWithRealClock(runSlowHook(5, 1))),
        ),
        Then("the run returns the hook's own exit code")((s) =>
          Effect.sync(() => {
            expect(s.result.code).toBe(2)
          })
        ),
      ),
    )

    scenario(
      'A hook with no configured timeout is allowed to run to completion',
      Gherkin.Do.pipe(
        Given('an eleven-second hook with no timeout')(
          'result',
          () => Effect.tryPromise(() => runWithRealClock(runSlowHook(undefined, 10.5))),
        ),
        Then("the run returns the hook's own exit code")((s) =>
          Effect.sync(() => {
            expect(s.result.code).toBe(2)
          })
        ),
      ),
    )

    scenario(
      'A PreCompact hook that times out does not block compaction',
      Gherkin.Do.pipe(
        Given('a stalling PreCompact hook with a 300 ms timeout')(
          'outcome',
          () => Effect.tryPromise(() => runWithRealClock(runPreCompact(0.3))),
        ),
        Then('compaction is allowed to continue without a block')((s) =>
          Effect.sync(() => {
            expect(s.outcome).toBeDefined()
            expect(s.outcome?.block).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'A hook that writes past the pipe buffer is fully drained',
      Gherkin.Do.pipe(
        Given('a hook writing a million bytes of stderr under an eight-second timeout')(
          'result',
          () => Effect.tryPromise(() => runWithRealClock(runNoisyHook(1_000_000, 8))),
        ),
        Then('both pipes are drained and stdout arrives intact')((s) =>
          Effect.sync(() => {
            expect(s.result.code).toBe(0)
            expect(s.result.stdout.trim()).toBe('done')
            expect(s.result.stderr.length).toBe(1_000_000)
          })
        ),
      ),
    )

    scenario(
      'A hook that ignores SIGTERM is killed when the scope closes',
      Gherkin.Do.pipe(
        Given('the wall clock is read before the call')('started', () => Effect.sync(() => Date.now())),
        When('a deaf hook is run under a one-second timeout')(
          'result',
          () => Effect.tryPromise(() => runWithRealClock(runTermIgnoringHook(1))),
        ),
        Then('the run reports it was killed and the wall-clock wait stays under fifteen seconds')((s) =>
          Effect.sync(() => {
            const elapsedMs = Date.now() - s.started
            expect(s.result.code).toBe(-1)
            expect(elapsedMs).toBeLessThan(15_000)
          })
        ),
      ),
    )
  })
