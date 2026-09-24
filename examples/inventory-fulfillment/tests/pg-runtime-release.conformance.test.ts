import { Conformance } from '@systemfsoftware/conformance-spec'
import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Persistence, rawClient } from '@systemfsoftware/example-inventory-fulfillment'
import { ConfigProvider, Context, Effect, Layer, Match, Ref } from 'effect'
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

const noOpenPool = (cell: Ref.Ref<PoolState>): Effect.Effect<void, { readonly reason: string }> =>
  Effect.gen(function*() {
    const state = yield* Ref.get(cell)
    if (state.pool === undefined) return
    yield* Ref.update(cell, (current) => ({ ...current, observed: current.observed + 1 }))
    if (!state.pool.ending) return yield* Effect.fail({ reason: 'the database pool is still open' })
  })

const passing = (report: Conformance.Report<never, never>): number =>
  Match.value(report).pipe(
    Match.tag('Pass', (pass) => pass.histories),
    Match.orElse(() => {
      throw new Error(`expected the service to let go of its pool, but the check read: ${Conformance.render(report)}`)
    }),
  )

Feature('Letting go of the database pool when the service stops early', { timeout: 120_000 })
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'A service stopped while opening its database pool leaves no pool open',
      Gherkin.Do.pipe(
        Given('a place to record the pool the service opens')('cell', () => Ref.make(freshState)),
        When('the service start is stopped at every step')(
          'checked',
          (s) =>
            Conformance.released(startPool(s.cell), {
              probe: noOpenPool(s.cell),
            }),
        ),
        Then('no database pool is left open after any stop')((s) => {
          passing(s.checked)
        }),
        And('the probe saw an open pool at least once')((s) => {
          if (Ref.getUnsafe(s.cell).observed === 0) {
            throw new Error('no probe ever saw an open pool, so the release proves nothing')
          }
        }),
      ),
    )
  })
