import { it } from '@effect/vitest'
import { Schema as S } from 'effect'
import { FastCheck as fc } from 'effect/testing'
import { dischargedBy, obligationsOf } from '../refutation.kernel.js'

const Hexish = S.String.pipe(
  S.check(S.isPattern(/^[0-9a-f]*$/)),
  S.annotate({ identifier: 'Hexish' }),
)

const Slug = S.String.pipe(
  S.check(S.isPattern(/^[a-z][a-z0-9-]*$/)),
  S.annotate({ identifier: 'Slug' }),
)

const Port = S.Finite.pipe(
  S.check(S.isBetween({ minimum: 1, maximum: 65535 })),
  S.annotate({ identifier: 'Port' }),
)

const NonEmpty = S.String.pipe(S.check(S.isMinLength(1)), S.annotate({ identifier: 'NonEmpty' }))

const Endpoint = S.Struct({ host: Hexish, port: Port })

const Routing = S.Union([
  S.TaggedStruct('Local', { slug: Slug }),
  S.TaggedStruct('Remote', { endpoint: Endpoint }),
])

const Listing = S.Struct({ slugs: S.Array(Slug), label: NonEmpty })

const REFUTABLE_SCHEMAS: readonly S.Codec<unknown, unknown>[] = [
  Hexish,
  Slug,
  Port,
  NonEmpty,
  Endpoint,
  Routing,
  Listing,
]

const DRAWS_PER_SCHEMA = 8

const SCHEMA_DRAWS = REFUTABLE_SCHEMAS.length * DRAWS_PER_SCHEMA

it.prop(
  '∀r_EachWitness_≡DischargesItsOwnArm',
  [fc.constantFrom(...REFUTABLE_SCHEMAS)],
  ([schema]) => {
    const obligations = obligationsOf(schema)
    if (obligations.size === 0) return false
    const accepted = S.toArbitrary(schema)(fc)
    return [...obligations.entries()].every(([node, obligation]) => {
      const credits = dischargedBy(schema, new Map([[node, obligation]]), {
        W: fc.constant(obligation.witness),
        ACCEPTED: accepted,
      })
      const discharging = credits.get(node) ?? []
      return discharging.includes('W') && !discharging.includes('ACCEPTED')
    })
  },
  { fastCheck: { numRuns: SCHEMA_DRAWS } },
)
