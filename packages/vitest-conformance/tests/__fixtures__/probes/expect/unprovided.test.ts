import { expect, it } from '@systemfsoftware/vitest'
import { Effect } from 'effect'
import { Context } from 'effect'

class Missing extends Context.Service<Missing, { readonly value: number }>()(
  'vitest-conformance/probes/expect/unprovided/Missing',
) {}

const needsMissing = Effect.gen(function*() {
  const missing = yield* Missing
  return yield* Effect.sync(() => expect(missing.value).toEqual(1))
})

// @ts-expect-error the runtime, not the compiler, refuses a body that needs a service nothing provides
it.effect('Should_RefuseTheUnprovidedBody_When_ServiceIsMissing', () => needsMissing)
