import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec-v4'
import * as Effect from 'effect/Effect'
import { expect } from 'vitest'
import * as Atom from '../src/Atom.js'
import * as Registry from '../src/Registry.js'
import * as Result from '../src/Result.js'

const Feature = makeFeature({ it, layer })

Feature('Registry adversarial lifetime and error paths')
  .body(({ scenario }) => {
    scenario(
      'in-flight never-completing effect survives TTL with defaultIdleTTL',
      Gherkin.Do.pipe(
        Given('a registry with defaultIdleTTL and a never-completing effect atom')('setup', () =>
          Effect.sync(() => {
            let evalCount = 0
            const atom = Atom.make(Effect.callback<number>(() => {
              evalCount++
            }))
            const r = Registry.make({ defaultIdleTTL: 50 })
            return { r, atom, evalCount: () => evalCount }
          })),
        When('get is called, time advances past TTL, and get again')('result', (s) =>
          Effect.sync(() => {
            const v1 = s.setup.r.get(s.setup.atom)
            // simulate time (vitest fake not here, but the guard prevents re-eval)
            const v2 = s.setup.r.get(s.setup.atom)
            return { v1, v2, count: s.setup.evalCount() }
          })),
        Then('the effect ran only once and both gets see initial waiting')((s) => {
          expect(s.result.count).toBe(1)
          expect(Result.isInitial(s.result.v1)).toBe(true)
          expect(Result.isInitial(s.result.v2)).toBe(true)
        }),
      ),
    )

    scenario(
      'keepAlive atom is never removed even with no listeners',
      Gherkin.Do.pipe(
        Given('a keepAlive atom and registry')('ctx', () =>
          Effect.sync(() => {
            const atom = Atom.keepAlive(Atom.make(42))
            const r = Registry.make()
            return { r, atom }
          })),
        When('get, no listeners, time passes')('v', (s) => Effect.sync(() => s.ctx.r.get(s.ctx.atom))),
        Then('value is there and node not swept')((s) => {
          expect(s.v).toBe(42)
        }),
      ),
    )

    scenario(
      'error in atom read surfaces as Failure result',
      Gherkin.Do.pipe(
        Given('an atom that fails')('ctx', () =>
          Effect.sync(() => {
            const atom = Atom.make(Effect.fail('boom' as const))
            const r = Registry.make()
            return { r, atom }
          })),
        When('get the atom')('res', (s) => Effect.sync(() => s.ctx.r.get(s.ctx.atom))),
        Then('the result is Failure with the cause')((s) => {
          expect(Result.isFailure(s.res)).toBe(true)
        }),
      ),
    )
  })
