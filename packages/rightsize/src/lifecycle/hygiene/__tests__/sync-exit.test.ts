/**
 * The sync-exit registry (R6) — the process-exit teardown path: a
 * registered run's cleanup stops+removes the container through the
 * recorded spawn argv (scripted), is never run twice, drops the entry, and
 * an unregistered (or unregistered-before-exit) run is a no-op. The
 * process hooks themselves are not installed by these tests — everything
 * observable here flows through the module's own `_runAllForTests` seam,
 * which executes registered cleanups exactly the way the real "exit"
 * handler does.
 */
import { Effect, Layer } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import { makeRecordingNetworks, makeRecordingRuntime, testEnvironmentLayer } from '../../../../__tests__/helpers.js'
import { newContainerSpec } from '../../../model/spec-combinators.js'
import { SandboxRuntime, VirtualNetworks } from '../../../runtime/runtime.js'
import { launchContainer } from '../../launch.js'

import {
  _isRegisteredForTests,
  _resetForTests,
  _runAllForTests,
  registerSyncCleanup,
  syncCleanupIds,
  unregisterSyncCleanup,
} from '../sync-exit.js'

afterEach(() => {
  _resetForTests()
})

describe('sync exit', () => {
  it('Should_StopAndRemoveThroughTheRecordedArgv_When_TheRegisteredRunFlushes', () => {
    const spawned: string[][] = []
    registerSyncCleanup('cid-docker-1', () => spawned.push(['docker', 'rm', '-f', 'container-docker-1']))
    _runAllForTests()
    expect(spawned).toEqual([['docker', 'rm', '-f', 'container-docker-1']])
    expect(syncCleanupIds()).toEqual([])
  })

  it('Should_RegisterTheLaunchedContainersSyncTeardown_When_LaunchRunsWithACleanupSync', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function*() {
          _resetForTests()
          const spawned: string[] = []
          const runtime = makeRecordingRuntime()
          const launch = yield* launchContainer(newContainerSpec('redis:8.2-alpine', 'rz-sync-exit'), {
            hygiene: {
              cacheDir: '/tmp/rightsize-sync-exit-launch',
              // The recorded spawn argv the backend's synchronous teardown
              // would run: docker force-remove by container id.
              cleanupSync: (id) => {
                const argv: readonly string[] = ['docker', 'rm', '-f', id]
                spawned.push(...argv)
              },
            },
          }).pipe(
            Effect.provide(
              Layer.mergeAll(
                testEnvironmentLayer('/tmp/rightsize-sync-exit-launch'),
                Layer.succeed(SandboxRuntime, runtime.service),
                Layer.succeed(VirtualNetworks, makeRecordingNetworks().service),
              ),
            ),
          )
          // The container is live and registered for the process-exit path.
          expect(_isRegisteredForTests(launch.handle.id)).toBe(true)
          const registeredId = launch.handle.id
          // The exit flush runs the recorded spawn argv, then clears.
          _runAllForTests()
          return { launchedId: registeredId, spawned, ids: syncCleanupIds() }
        }),
      ),
    ).then(({ launchedId, spawned, ids }) => {
      expect(spawned).toEqual(['docker', 'rm', '-f', launchedId])
      expect(ids).toEqual([])
    }))

  it('Should_RunExactlyOnce_When_TheRegistryFlushesTwice', () => {
    let invocations = 0
    registerSyncCleanup('cid-exactly-once', () => {
      invocations += 1
    })
    _runAllForTests()
    _runAllForTests()
    expect(invocations).toBe(1)
  })

  it('Should_BeANoOp_When_NothingIsRegistered', () => {
    const spawned: string[] = []
    _runAllForTests()
    expect(spawned).toEqual([])
    expect(syncCleanupIds()).toEqual([])
  })

  it('Should_NotRun_When_TheEntryWasUnregisteredBeforeTheExit', () => {
    const spawned: string[] = []
    registerSyncCleanup('container-gone', () => spawned.push('rm'))
    unregisterSyncCleanup('container-gone')
    _runAllForTests()
    expect(spawned).toEqual([])
  })

  it('Should_ReportRegisteredIds_When_CleanupsAreRegistered', () => {
    registerSyncCleanup('container-a', () => {})
    registerSyncCleanup('container-b', () => {})
    expect(syncCleanupIds()).toEqual(['container-a', 'container-b'])
  })
})
