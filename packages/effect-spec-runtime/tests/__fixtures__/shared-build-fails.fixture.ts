import { Suite } from '@systemfsoftware/effect-spec-runtime'
import { it } from '@systemfsoftware/vitest'
import { Context, Effect, Layer } from 'effect'

class Boom extends Context.Service<Boom, { readonly ready: true }>()(
  '@systemfsoftware/effect-spec-runtime/tests/FailingBuild',
) {}

const failing = Layer.effect(
  Boom,
  Effect.acquireRelease(
    Effect.sync(() => ({ ready: true as const })),
    () => Effect.void,
  ).pipe(Effect.andThen(Effect.die(new Error('shared build exploded')))),
)

Suite.openShared(
  { it },
  { name: 'a build that fails', describe: 'describe', options: undefined },
  { layer: failing },
  (register) => {
    register('a scenario under the failed build', () => Effect.die(new Error('SCENARIO-RAN')), 'run')
  },
)
