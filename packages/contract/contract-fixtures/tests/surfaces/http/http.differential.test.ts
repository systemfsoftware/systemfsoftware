import { Differential } from '@systemfsoftware/differential-spec'
import { Contract } from '@systemfsoftware/effect-contract'
import { mount } from '@systemfsoftware/effect-contract/http'
import { invalidEncodings, parityChecks } from '@systemfsoftware/effect-contract/testing'
import { Equal, Schema } from 'effect'
import { HttpRouter } from 'effect/http'
import type * as fc from 'fast-check'
import {
  capabilitiesLayer,
  capabilityOf,
  environment,
  fixtureRegistry,
  webClientOf,
} from '../../__fixtures__/http.fixture.js'

const web = HttpRouter.toWebHandler(HttpRouter.provideRequest(environment)(mount(fixtureRegistry).layer))
const client = webClientOf(web.handler)

const options = { provide: capabilitiesLayer, runBudget: 100 } as const

const sameCensus = (expected: Schema.Json, actual: Schema.Json): boolean => Equal.equals(expected, actual)

const carriedByQuery = (sample: Schema.Json): boolean => Schema.is(Schema.JsonObject)(sample)

const malformedWireEncoding = (contract: Contract.Any): fc.Arbitrary<Schema.Json> =>
  Schema.is(Contract.Read)(contract.access)
    ? invalidEncodings(contract.input).filter(carriedByQuery)
    : invalidEncodings(contract.input)

for (const check of parityChecks(fixtureRegistry, client, options)) {
  const contract = capabilityOf(check.name).contract
  Differential.compare(check.comparison).on(check.arbitrary, { runBudget: 100 }).assert(sameCensus)
  Differential.compare({
    ...check.comparison,
    name: `${check.name} answers a malformed encoding exactly as its direct call does`,
  })
    .on(malformedWireEncoding(contract), { runBudget: 100 })
    .assert(sameCensus)
}
