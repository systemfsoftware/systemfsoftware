import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Persistence, rawClient } from '@systemfsoftware/example-inventory-fulfillment'
import { ConfigProvider, Context, Effect, Layer, Ref, Schema } from 'effect'
import type * as Scope from 'effect/Scope'
import type { Pool } from 'pg'

const Feature = makeFeature({ it })

interface PoolState {
  readonly pool: Pool | undefined
  readonly opened: number
  readonly observed: number
}

const freshState: PoolState = { pool: undefined, opened: 0, observed: 0 }

const options = ConfigProvider.layer(
  ConfigProvider.fromUnknown({
    DATABASE_URL: 'postgres://user:secret@127.0.0.1:5432/inventory',
    BETTER_AUTH_SECRET: 'an-inventory-fulfillment-test-secret',
  }),
)

const startPool = (cell: Ref.Ref<PoolState>): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function*() {
    const context = yield* Layer.build(rawClient)
    const pool = Context.get(context, Persistence.PgRuntime.PgRuntime).pool
    yield* Ref.update(cell, (state) => ({ ...state, pool, opened: state.opened + 1 }))
  }).pipe(Effect.provide(options))

const noOpenPool = (cell: Ref.Ref<PoolState>): Effect.Effect<void, Conformance.RuleBroken> =>
  Effect.gen(function*() {
    const state = yield* Ref.get(cell)
    if (state.pool === undefined) {
      return yield* Conformance.RuleBroken.make({ message: 'the probe never saw the database pool open' })
    }
    yield* Ref.update(cell, (current) => ({ ...current, observed: current.observed + 1 }))
    if (!state.pool.ending) {
      return yield* Conformance.RuleBroken.make({ message: 'the database pool is still open' })
    }
  })

interface Probes {
  readonly cells: Array<Ref.Ref<PoolState>>
}

const freshProbes = (): Probes => ({ cells: [] })

Feature('Letting go of the database pool when the service stops early', { timeout: 0 })
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'A service stopped while opening its database pool leaves no pool open',
      Gherkin.Do.pipe(
        Given('a place to record every pool the service opens')('probes', () => Effect.sync(freshProbes)),
        When('the service start is stopped at every step')(
          'checked',
          (s) =>
            Conformance.stopped({
              unit: rawClient,
              world: Effect.map(Ref.make(freshState), (cell) => {
                s.probes.cells.push(cell)
                return cell
              }),
              program: startPool,
              restart: startPool,
              rule: noOpenPool,
              stopWithin: Persistence.PgRuntime.poolShutdownBudget,
            }),
        ),
        Then('no database pool is left open, and the probe saw an open pool at least once')((s, expect) =>
          expect({
            report: s.checked,
            rendered: Conformance.render(s.checked),
            probesThatSawAnOpenPool: s.probes.cells.reduce(
              (total, cell) => total + Ref.getUnsafe(cell).observed,
              0,
            ),
          }).toMatchObject({
            report: { _tag: 'Pass' },
            probesThatSawAnOpenPool: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
          })
        ),
      ),
    )
  })
