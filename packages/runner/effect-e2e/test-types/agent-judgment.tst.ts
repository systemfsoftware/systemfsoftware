import type * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import type { StandardSchemaV1 } from 'effect/StandardSchema'
import { describe, expect, it } from 'tstyche'

import type { ExtractContext, ExtractFailure, ExtractRequest, ExtractResult } from '../src/agent/extract.js'
import { extract } from '../src/agent/extract.js'
import type { SecretLedger } from '../src/agent/mod.js'
import type { Engine } from '../src/engine/mod.js'
import type { ModelGateway } from '../src/model/mod.js'

declare const context: ExtractContext

type Count = { readonly count: number }

const countSchema = Schema.Struct({ count: Schema.Finite }).pipe(
  Schema.toStandardSchemaV1,
  Schema.toStandardJSONSchemaV1,
)

describe('extract', () => {
  it('needs exactly the engine, the model gateway and the secret ledger', () => {
    expect(extract({ context, instruction: 'read the count', schema: countSchema })).type.toBe<
      Effect.Effect<ExtractResult<Count>, ExtractFailure, Engine | ModelGateway | SecretLedger>
    >()
  })

  it('accepts a schema that carries both Standard Schema and Standard JSON Schema', () => {
    expect<ExtractRequest<Count, Count>['schema']>().type.toBeAssignableFrom<typeof countSchema>()
  })

  it('refuses a schema that only validates, with no JSON Schema converter', () => {
    expect<ExtractRequest<Count, Count>['schema']>().type.not.toBeAssignableFrom<StandardSchemaV1<Count, Count>>()
  })
})
