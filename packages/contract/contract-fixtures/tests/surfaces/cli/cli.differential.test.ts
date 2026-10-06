import { registry } from '@systemfsoftware/contract-fixtures'
import { Differential } from '@systemfsoftware/differential-spec'
import { Contract } from '@systemfsoftware/effect-contract'
import { invalidEncodings, parityChecks } from '@systemfsoftware/effect-contract/testing'
import { Equal, Schema } from 'effect'
import { capabilitiesLayer, cliSurfaceClient } from '../../__fixtures__/fixture-cli.js'

const runBudget = 20
const options = { provide: capabilitiesLayer, runBudget } as const

const sameCensus = (expected: Schema.Json, actual: Schema.Json): boolean => Equal.equals(expected, actual)

const contracts: Readonly<Record<string, Contract.Any>> = Object.fromEntries(
  Object.entries(registry).map(([name, capability]) => [name, capability.contract]),
)

for (const check of parityChecks(registry, cliSurfaceClient(), options)) {
  const contract = contracts[check.name]
  if (contract === undefined) throw new Error(`no fixture capability named ${check.name} is registered`)
  Differential.compare(check.comparison).on(check.arbitrary, { runBudget }).assert(sameCensus)
  Differential.compare({
    ...check.comparison,
    name: `${check.name} answers a malformed encoding exactly as its direct call does`,
  })
    .on(invalidEncodings(contract.input), { runBudget })
    .assert(sameCensus)
}
