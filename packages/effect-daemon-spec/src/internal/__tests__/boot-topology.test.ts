import { Duration, Effect, Layer, Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { DaemonReporter } from '../../daemon-reporter.js'
import { Daemon } from '../../daemon.js'
import { LeaderLock } from '../../leader-lock.js'
import { Supervision } from '../../supervision-preset.js'
import { oneForOne } from '../../supervisor.js'
import { bootChild } from '../boot.js'

const BaseLayer = Layer.mergeAll(LeaderLock.Noop, DaemonReporter.Noop)

describe('bootChild supervisor health topology', () => {
  it('Should_WireNestedSupervisorAndLeafWorkerHealthRefs_When_BootingSupervisorChild', () => {
    const program = Effect.scoped(
      Effect.gen(function*() {
        const w1 = Daemon.poll({
          name: 'leaf-a',
          work: Effect.void,
          interval: Duration.seconds(10),
          tick: { tickTimeout: Duration.seconds(90) },
          lock: { mode: 'none' },
        })
        const w2 = Daemon.poll({
          name: 'leaf-b',
          work: Effect.void,
          interval: Duration.seconds(10),
          tick: { tickTimeout: Duration.seconds(90) },
          lock: { mode: 'none' },
        })
        const inner = oneForOne({
          name: 'inner',
          children: [w1, w2],
          supervision: Supervision.worker(Duration.minutes(5)),
          lock: { mode: 'none' },
        })
        const outer = oneForOne({
          name: 'outer',
          children: [inner],
          supervision: Supervision.worker(Duration.minutes(5)),
          lock: { mode: 'none' },
        })
        const booted = yield* bootChild(outer)
        if (!('children' in booted.health)) {
          throw new Error('expected outer supervisor health')
        }
        const outerHealth = booted.health
        expect(outerHealth.name).toBe('outer')
        expect(outerHealth.children).toHaveLength(1)
        const innerCandidate = Option.getOrThrowWith(
          Option.fromNullable(outerHealth.children[0]),
          () => new Error('expected inner supervisor health'),
        )
        if (!('children' in innerCandidate)) {
          throw new Error('expected inner supervisor health')
        }
        const innerHealth = innerCandidate
        expect(innerHealth.name).toBe('inner')
        expect(innerHealth.children).toHaveLength(2)
        expect(innerHealth.children.map((c) => c.name)).toEqual(['leaf-a', 'leaf-b'])
      }),
    )
    return Effect.runPromise(program.pipe(Effect.provide(BaseLayer)))
  })
})
