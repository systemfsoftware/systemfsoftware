import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Duration, Effect } from 'effect'
import { expect } from 'vitest'
import { Daemon } from '../src/mod.js'
import { run } from '../src/mod.js'
import { Supervision } from '../src/mod.js'
import { oneForOne } from '../src/supervision-policy/supervisor-one-for-one.combinator.js'
import { NoopLayer } from './helpers/shared-layers.js'

const Feature = makeFeature({ it, layer })

Feature('Supervisor boot topology')
  .withScenarioLayer(NoopLayer)
  .body(({ scenario }) => {
    scenario(
      'Booting a nested supervisor wires worker health refs at every level',
      Gherkin.Do.pipe(
        Given('a nested supervisor with two leaf workers')('outer', () =>
          Effect.sync(() => {
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
            return oneForOne({
              name: 'outer',
              children: [inner],
              supervision: Supervision.worker(Duration.minutes(5)),
              lock: { mode: 'none' },
            })
          })),
        When('the outer supervisor is booted')('topology', (s) =>
          Effect.scoped(
            Effect.gen(function*() {
              const health = yield* run.supervisor(s.outer)
              if (!('children' in health)) {
                throw new Error('expected outer supervisor health')
              }
              const [inner] = health.children
              if (inner === void 0 || !('children' in inner)) {
                throw new Error('expected inner supervisor health')
              }
              return {
                outerName: health.name,
                outerChildren: health.children.length,
                innerName: inner.name,
                innerChildren: inner.children.length,
                leafNames: inner.children.map((c) => c.name),
              }
            }),
          )),
        Then('the outer supervisor health names outer with one child')((s) =>
          Effect.sync(() => {
            expect(s.topology.outerName).toBe('outer')
            expect(s.topology.outerChildren).toBe(1)
          })
        ),
        And('the inner supervisor health names inner with the two leaves')((s) =>
          Effect.sync(() => {
            expect(s.topology.innerName).toBe('inner')
            expect(s.topology.innerChildren).toBe(2)
            expect(s.topology.leafNames).toEqual(['leaf-a', 'leaf-b'])
          })
        ),
      ),
    )
  })
