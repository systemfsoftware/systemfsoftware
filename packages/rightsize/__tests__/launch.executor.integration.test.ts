/**
 * The launch executor + teardown executor BDD suite (composition altitude —
 * the repo's test-placement doctrine runs executor coverage as integration
 * tests in the package-root `__tests__/` directory, driven through the
 * Gherkin harness exactly like effect-daemon-spec): every scenario drives
 * the actual `Cell` descriptions (launch + teardown) through the library
 * interpreter against recording doubles for the runtime Tags (R18) — no
 * sockets, no daemon.
 *
 * Covered contracts (R5, R6, R7, F1, F2):
 * - validation rejections fire with ZERO backend calls (the write's Refuse
 *   branch);
 * - the port-conflict retry loop releases ports between attempts, recovers
 *   from a bind conflict, and gives up at 5 with `ContainerLaunchError`;
 * - a non-conflict failure propagates the ORIGINAL error;
 * - interruption mid-start leaves nothing tracked (the scope finalizer
 *   runs the teardown executor);
 * - teardown is idempotent (stop twice, then the scope close);
 * - the library-created network is removed only when its last member
 *   leaves;
 * - keepAlive containers are exempt from teardown;
 * - the sweep ledger tracks and then untracks the sandbox entry.
 */
import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Fiber, Layer, Result, type Scope } from 'effect'
import { expect } from 'vitest'

import { readLedgerEntries } from '../src/lifecycle/hygiene/ledger.js'
import { _resetForTests, syncCleanupIds } from '../src/lifecycle/hygiene/sync-exit.js'
import { _resetReaperForTests } from '../src/lifecycle/hygiene/watchdog.js'
import { launchContainer, type LaunchOptions } from '../src/lifecycle/launch.executor.js'
import type { ContainerSpec } from '../src/model/container-spec.schema.js'
import { BackendError } from '../src/model/errors.js'
import {
  newContainerSpec,
  withDiskLimit,
  withExposedPorts,
  withKeepAlive,
  withNetwork,
  withTmpfsRoot,
} from '../src/model/spec-combinators.js'
import { issuedView } from '../src/runtime/free-ports.kernel.js'
import { RunId } from '../src/runtime/run-id.js'
import { SandboxRuntime, VirtualNetworks } from '../src/runtime/runtime.js'
import {
  makeRecordingNetworks,
  makeRecordingRuntime,
  type RecordingNetworks,
  type RecordingRuntime,
  testEnvironmentLayer,
} from './helpers.js'

// =============================================================================
// Scenario plumbing
// =============================================================================

/** One scenario's fresh doubles + an isolated (node-free) cache-dir path. */
interface Lineup {
  readonly runtime: RecordingRuntime
  readonly networks: RecordingNetworks
  readonly cacheDir: string
}

let cacheSequence = 0

/** A fresh lineup: recording doubles + a unique literal cache path (no node: imports — the root-test lint program has no node types). */
const freshLineup = (): Effect.Effect<Lineup> =>
  Effect.sync(() => {
    _resetForTests()
    _resetReaperForTests()
    const cacheDir = `/tmp/rightsize-u4b-cache-run-${++cacheSequence}`
    return { runtime: makeRecordingRuntime(), networks: makeRecordingNetworks(), cacheDir }
  })

const envLayerFor = (lineup: Lineup, reaper: 'on' | 'sweep' | 'off' = 'off') =>
  Layer.mergeAll(
    testEnvironmentLayer(lineup.cacheDir, reaper),
    Layer.succeed(SandboxRuntime, lineup.runtime.service),
    Layer.succeed(VirtualNetworks, lineup.networks.service),
  )

/**
 * Launches inside the CALLER'S scope (the gherkin scenario supplies it): the
 * running state is bound to that scope's finalizer, so the container lives
 * for the step's lifetime, and teardown runs when the scope closes — the
 * exact lifetime the public facade promises. The returned effect still
 * requires Scope; the scenario runtime provides it.
 */
const launchScoped = (
  spec: ContainerSpec,
  options: LaunchOptions,
  lineup: Lineup,
  reaper: 'on' | 'sweep' | 'off' = 'off',
): Effect.Effect<RunningHandleLike, unknown, Scope.Scope> =>
  launchContainer(spec, options).pipe(
    Effect.provide(envLayerFor(lineup, reaper)),
  ) as unknown as Effect.Effect<RunningHandleLike, unknown, Scope.Scope>

interface RunningHandleLike {
  readonly handle: { readonly id: string }
  readonly stop: Effect.Effect<unknown, unknown, never>
  readonly remove: Effect.Effect<unknown, unknown, never>
}

/** The observable launch outcome: ok + the failure's `_tag` when it failed. */
interface LaunchOutcome {
  readonly ok: boolean
  readonly failureTag: string | undefined
}

const tagOf = (failure: unknown): string | undefined =>
  typeof failure === 'object' && failure !== null && '_tag' in failure && typeof failure._tag === 'string'
    ? failure._tag
    : undefined

const outcomeOf = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<LaunchOutcome, never, R> =>
  Effect.map(Effect.result(effect), (result) =>
    Result.isSuccess(result)
      ? { ok: true, failureTag: undefined }
      : { ok: false, failureTag: tagOf(result.failure) })

const plainSpec = (): ContainerSpec => newContainerSpec('redis:8.2-alpine', 'rz-test')
const conflictingSpec = (): ContainerSpec => withDiskLimit(withTmpfsRoot(plainSpec(), 512), 1024)
const httpWaitSpec = (): ContainerSpec => ({ ...plainSpec(), waitStrategy: { _tag: 'ForHttp', path: '/' } })

const Feature = makeFeature({ it, layer })

Feature('launch and teardown execute a validated, ordered lifecycle over recorded doubles').body(({ scenario }) => {
  scenario(
    'rejects a root-disk conflict before any runtime call',
    Gherkin.Do.pipe(
      Given('a fresh lineup of recording doubles')('setup', () => freshLineup()),
      When('a spec with both a disk limit and a tmpfs root is launched')(
        'launch',
        (s) => outcomeOf(launchScoped(conflictingSpec(), { hygiene: { cacheDir: s.setup.cacheDir } }, s.setup)),
      ),
      Then('the launch fails with RootDiskConflictError')((s) => {
        expect(s.launch.ok).toBe(false)
        expect(s.launch.failureTag).toBe('RootDiskConflictError')
      }),
      And('zero backend calls were recorded')((s) => {
        expect(s.setup.runtime.calls).toEqual([])
        expect(s.setup.networks.calls).toEqual([])
      }),
    ),
  )

  scenario(
    'recovers from a bind conflict on the first attempt',
    Gherkin.Do.pipe(
      Given('a fresh lineup of recording doubles')('setup', () => freshLineup()),
      Given('a start that conflicts once then succeeds')('_', (s) =>
        Effect.sync(() => {
          let conflicted = true
          s.setup.runtime.service.start = (handle) => {
            s.setup.runtime.calls.push(`scripted-start:${handle.id}`)
            if (conflicted) {
              conflicted = false
              return Effect.fail(BackendError.make({ message: 'bind: address already in use' }))
            }
            return Effect.void
          }
        })),
      When('a port-exposed container is launched with a read-probe wait')('launched', (s) =>
        launchScoped(
          withExposedPorts(plainSpec(), 6379),
          { hygiene: { cacheDir: s.setup.cacheDir }, wait: { portProbe: () => Effect.succeed(true) } },
          s.setup,
        )),
      Then('a handle was produced and two create attempts ran')((s) => {
        expect(s.launched.handle.id).toMatch(/^cid-/)
        expect(s.setup.runtime.calls.filter((call) => call.startsWith('create:'))).toHaveLength(2)
      }),
      And('the failed attempt was torn down before the successful boot')((s) => {
        expect(s.setup.runtime.calls.filter((call) => call.startsWith('remove:'))).toHaveLength(1)
      }),
    ),
  )

  scenario(
    'gives up after 5 bind conflicts and releases every port',
    Gherkin.Do.pipe(
      Given('a fresh lineup of recording doubles')('setup', () => freshLineup()),
      Given('a start that always conflicts')('_', (s) =>
        Effect.sync(() => {
          s.setup.runtime.service.start = (handle) => {
            s.setup.runtime.calls.push(`conflict-start:${handle.id}`)
            return Effect.fail(BackendError.make({ message: 'bind: address already in use' }))
          }
        })),
      When('a port-exposed container is launched')('launch', (s) =>
        outcomeOf(
          launchScoped(withExposedPorts(plainSpec(), 6379), { hygiene: { cacheDir: s.setup.cacheDir } }, s.setup),
        )),
      Then('the launch fails with ContainerLaunchError')((s) => {
        expect(s.launch.ok).toBe(false)
        expect(s.launch.failureTag).toBe('ContainerLaunchError')
      }),
      And('exactly five create attempts were made')((s) => {
        expect(s.setup.runtime.calls.filter((call) => call.startsWith('create:'))).toHaveLength(5)
      }),
      And('every host port was released back to the allocator')(() => {
        expect(issuedView().size).toBe(0)
      }),
    ),
  )

  scenario(
    'propagates a non-conflict start failure untouched',
    Gherkin.Do.pipe(
      Given('a fresh lineup of recording doubles')('setup', () => freshLineup()),
      Given('a start that fails for an unrelated reason')('_', (s) =>
        Effect.sync(() => {
          s.setup.runtime.service.start = () => Effect.fail(BackendError.make({ message: 'daemon exploded' }))
        })),
      When('the launch runs')(
        'launch',
        (s) => outcomeOf(launchScoped(plainSpec(), { hygiene: { cacheDir: s.setup.cacheDir } }, s.setup)),
      ),
      Then('the original backend failure surfaces')((s) => {
        expect(s.launch.ok).toBe(false)
        expect(s.launch.failureTag).toBe('BackendError')
      }),
      And('the conflict budget was never exhausted')((s) => {
        expect(s.launch.failureTag).not.toBe('ContainerLaunchError')
      }),
    ),
  )

  scenario(
    'interruption mid-start leaves nothing tracked',
    Gherkin.Do.pipe(
      Given('a fresh lineup of recording doubles')('setup', () => freshLineup()),
      When('a scoped launch is interrupted while the http wait hangs')('fiberExitTag', (s) =>
        Effect.scoped(
          Effect.gen(function*() {
            const fiber = yield* Effect.forkScoped(
              Effect.scoped(
                launchScoped(
                  httpWaitSpec(),
                  { hygiene: { cacheDir: s.setup.cacheDir }, wait: { httpProbe: () => Effect.never } },
                  s.setup,
                ),
              ),
            )
            // No Effect.sleep here: the suite runs under vitest fake timers, which
            // would freeze the effect clock. Yielding a few times lets the forked
            // fiber reach create/start/readiness (all recording-double sync steps).
            let ticks = 0
            while (ticks < 20) {
              yield* Effect.yieldNow
              ticks += 1
            }
            yield* Fiber.interrupt(fiber)
            const exit = yield* Fiber.await(fiber)
            return exit._tag
          }),
        )),
      Then('the container was created, started, and torn back down')((s) => {
        const calls = s.setup.runtime.calls
        expect(calls.some((call) => call.startsWith('create:'))).toBe(true)
        expect(calls.some((call) => call.startsWith('start:'))).toBe(true)
        expect(calls.some((call) => call.startsWith('stop:'))).toBe(true)
        expect(calls.some((call) => call.startsWith('remove:'))).toBe(true)
      }),
      And('nothing remains in the sync-exit registry')(() => {
        expect(syncCleanupIds()).toEqual([])
      }),
    ),
  )

  scenario(
    'teardown is idempotent across stop and scope close',
    Gherkin.Do.pipe(
      Given('a fresh lineup of recording doubles')('setup', () => freshLineup()),
      When('the container is stopped twice then the scope closes')('removals', (s) =>
        Effect.gen(function*() {
          const handle = yield* launchScoped(plainSpec(), { hygiene: { cacheDir: s.setup.cacheDir } }, s.setup)
          yield* handle.stop
          yield* handle.stop
          return s.setup.runtime.calls.filter((call) => call.startsWith('remove:')).length
        }).pipe(Effect.provide(envLayerFor(s.setup)))),
      Then('the backend remove ran exactly once')((s) => {
        expect(s.removals).toBe(1)
      }),
    ),
  )

  scenario(
    'keeps a keepAlive container running at scope close',
    Gherkin.Do.pipe(
      Given('a fresh lineup of recording doubles')('setup', () => freshLineup()),
      When('a keepAlive container is started and its scope closes')('calls', (s) =>
        Effect.gen(function*() {
          yield* launchScoped(withKeepAlive(plainSpec(), true), { hygiene: { cacheDir: s.setup.cacheDir } }, s.setup)
          return s.setup.runtime.calls
        })),
      Then('no stop or remove ever reached the backend')((s) => {
        expect(s.calls.some((call) => call.startsWith('stop:'))).toBe(false)
        expect(s.calls.some((call) => call.startsWith('remove:'))).toBe(false)
      }),
    ),
  )

  scenario(
    'removes the library network only when its last member leaves',
    Gherkin.Do.pipe(
      Given('a fresh lineup of recording doubles')('setup', () => freshLineup()),
      When('two siblings on one network stop, first A then B')('trace', (s) =>
        Effect.gen(function*() {
          const spec = withNetwork(plainSpec(), 'rz-net-last')
          const a = yield* launchScoped(spec, { hygiene: { cacheDir: s.setup.cacheDir } }, s.setup)
          const b = yield* launchScoped(spec, { hygiene: { cacheDir: s.setup.cacheDir } }, s.setup)
          yield* a.stop
          const afterStopA = [...s.setup.networks.calls]
          yield* b.stop
          const afterStopB = [...s.setup.networks.calls]
          return { afterStopA, afterStopB }
        }).pipe(Effect.provide(envLayerFor(s.setup)))),
      Then('no network removal happened while a member still ran')((s) => {
        expect(s.trace.afterStopA.filter((call) => call.startsWith('removeNetwork:'))).toHaveLength(0)
      }),
      And('the network is removed when the last member stops')((s) => {
        expect(s.trace.afterStopB.filter((call) => call.startsWith('removeNetwork:'))).toHaveLength(1)
      }),
    ),
  )

  scenario(
    'tracks and then untracks the sandbox in the sweep ledger',
    Gherkin.Do.pipe(
      Given('a fresh lineup of recording doubles')('setup', () => freshLineup()),
      When('a container is launched under a sweep ledger and then stopped')('result', (s) =>
        Effect.gen(function*() {
          const handle = yield* launchScoped(plainSpec(), { hygiene: { cacheDir: s.setup.cacheDir } }, s.setup, 'sweep')
          const before = yield* Effect.promise(() => readLedgerEntries(s.setup.cacheDir, RunId.value))
          yield* handle.stop
          const after = yield* Effect.promise(() => readLedgerEntries(s.setup.cacheDir, RunId.value))
          return { before, after }
        }).pipe(Effect.provide(envLayerFor(s.setup)))),
      Then('the sandbox was tracked and then untracked')((s) => {
        expect(s.result.before.some((entry) => entry.kind === 'sandbox')).toBe(true)
        expect(s.result.after).toEqual([])
      }),
    ),
  )
})
