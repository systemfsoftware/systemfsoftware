import { it } from '@effect/vitest'
import { Arbitrary, FastCheck as fc, Schema as S } from 'effect'
import { dischargedBy, obligationsOf } from '../refutation.kernel.js'

const Hexish = S.String.pipe(S.pattern(/^[0-9a-f]*$/), S.annotations({ identifier: 'Hexish' }))

const Slug = S.String.pipe(S.pattern(/^[a-z][a-z0-9-]*$/), S.annotations({ identifier: 'Slug' }))

const Port = S.Number.pipe(S.between(1, 65535), S.annotations({ identifier: 'Port' }))

const NonEmpty = S.String.pipe(S.minLength(1), S.annotations({ identifier: 'NonEmpty' }))

const Endpoint = S.Struct({ host: Hexish, port: Port })

const Routing = S.Union(
  S.TaggedStruct('Local', { slug: Slug }),
  S.TaggedStruct('Remote', { endpoint: Endpoint }),
)

const Listing = S.Struct({ slugs: S.Array(Slug), label: NonEmpty })

const REFUTABLE_SCHEMAS: readonly S.Schema.AnyNoContext[] = [
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
    const accepted = Arbitrary.make(schema)
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
