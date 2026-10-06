import { Differential } from '@systemfsoftware/differential-spec'
import { directClient, parity, parityChecks } from '@systemfsoftware/effect-contract/testing'
import { Equal, type Schema } from 'effect'
import { flipsRefusals } from '../__fixtures__/flipping-client.fixture.js'
import { capabilities } from '../__fixtures__/kernel.fixture.js'
import { operationsScenarioEnvironment } from '../__fixtures__/operations-runtime.fixture.js'

const options = { provide: operationsScenarioEnvironment, runBudget: 100 } as const

const client = directClient({ registry: capabilities, provide: operationsScenarioEnvironment })

const disagrees = (expected: Schema.Json, actual: Schema.Json): boolean => !Equal.equals(expected, actual)

parity(capabilities, client, options)

for (const check of parityChecks({ getBalance: capabilities.getBalance }, flipsRefusals(client), options)) {
  Differential.compare({ ...check.comparison, name: `${check.name}: a refusal answered as a rejection is a disparity` })
    .on(check.arbitrary, { runBudget: 100 })
    .assert(disagrees)
}
