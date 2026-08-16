/**
 * Tunnel respawn-loop tests — the adapter applying the landed `respawnDecision`
 * kernel over a scripted `spawn` double whose children exit without ever
 * serving a byte. The loop's `Effect.sleep` backoffs run on the live clock,
 * so vitest fake timers drive them: the recorded spawn timestamps expose the
 * doubling backoff progression, and the loop must give up after
 * `maxConsecutiveSpawnFailures + 1` no-traffic spawns (the kernel budget —
 * the bounded-deviation replacement for upstream's indefinite fixed-200ms
 * loop). No real msb binary and no sockets anywhere in this suite.
 */
import { PassThrough } from 'node:stream'

import { Clock, Effect } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BackendError } from '../../model/errors.js'
import type { CommandRunnerService } from '../command-runner.js'
import { TUNNEL_TIMING } from '../commands/tunnel.kernel.js'
import { createTunnel } from '../networks.tunnel.js'

const fakeNowMs = (): number => Effect.runSync(Clock.currentTimeMillis)

/** A child whose streams end on the next microtask — exactly a listener swap closing during `spawn`. */
function dyingChild() {
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const { promise, resolve } = Promise.withResolvers<number | null>()
  queueMicrotask(() => {
    stdout.end()
    stderr.end()
    resolve(null)
  })
  return {
    exited: promise,
    stdout,
    stderr,
    stdin: new PassThrough(),
    kill: () => resolve(null),
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('tunnel respawn loop (adapter applies the kernel decision)', () => {
  it('Should_GiveUp_When_ConsecutiveNoTrafficSpawnsExhaustTheBudget', () => {
    vi.useFakeTimers()
    const spawns: Array<{ at: number; args: readonly string[] }> = []
    const runner: CommandRunnerService = {
      spawn: (args) =>
        Effect.sync(() => {
          spawns.push({ at: fakeNowMs(), args: [...args] })
          return dyingChild()
        }),
      invoke: () => Effect.fail(BackendError.make({ message: 'no invoke in tunnel tests' })),
      invokePromise: () => Promise.resolve({ exitCode: 0, stdout: '', stderr: '' }),
      fetchStdoutExact: () => Effect.succeed(''),
      spawnSync: () => {},
    }
    const tunnel = createTunnel(runner, 'rz-test-1', 8080, 9090, () => Promise.resolve())

    return vi.advanceTimersByTimeAsync(60_000)
      .then(() => {
        // The budget is maxConsecutiveSpawnFailures tolerated no-traffic
        // spawns; the decision gives up on the next one.
        expect(tunnel.spawnCount()).toBe(TUNNEL_TIMING.maxConsecutiveSpawnFailures + 1)
        // The spawned listener is exactly the exec-stream `nc -l` bridge.
        expect(spawns[0]?.args).toEqual(['exec', '--stream', 'rz-test-1', '--', 'nc', '-l', '-p', '8080'])
        return vi.advanceTimersByTimeAsync(20_000)
      })
      .then(() => {
        // Given up: no timer keeps respawning forever.
        expect(tunnel.spawnCount()).toBe(TUNNEL_TIMING.maxConsecutiveSpawnFailures + 1)
        return Effect.runPromise(tunnel.close)
      })
  })

  it('Should_DoubleTheBackoff_When_EverySpawnProducesNoTraffic', () => {
    vi.useFakeTimers()
    const spawns: Array<{ at: number; args: readonly string[] }> = []
    const runner: CommandRunnerService = {
      spawn: (args) =>
        Effect.sync(() => {
          spawns.push({ at: fakeNowMs(), args: [...args] })
          return dyingChild()
        }),
      invoke: () => Effect.fail(BackendError.make({ message: 'no invoke in this suite' })),
      invokePromise: () => Promise.resolve({ exitCode: 0, stdout: '', stderr: '' }),
      fetchStdoutExact: () => Effect.succeed(''),
      spawnSync: () => {},
    }
    const tunnel = createTunnel(runner, 'rz-test-1', 8080, 9090, () => Promise.resolve())

    return vi.advanceTimersByTimeAsync(20_000).then(() => {
      // Gaps between consecutive spawns are the backoffs the loop slept:
      // 200, 400, 800, 1600, then the 3200ms cap keeps winning.
      const gaps = spawns.slice(1).map((spawn, index) => spawn.at - (spawns[index]?.at ?? 0))
      expect(gaps).toEqual([200, 400, 800, 1600, 3200, 3200, 3200, 3200])
      return Effect.runPromise(tunnel.close)
    })
  })
})
