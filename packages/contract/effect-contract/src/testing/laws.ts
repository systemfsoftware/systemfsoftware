import { ruleOfSchemas } from '@systemfsoftware/effect-schema-law'
import type { Any, ValueSchema } from '../Contract/contract.js'

export interface ContractLaw {
  readonly name: string
  readonly schema: ValueSchema
}

export interface LawfulCapability {
  readonly contract: Any
}

const subjectsOf = (contract: Any): ReadonlyArray<ContractLaw> => [
  { name: `${contract.name}.input`, schema: contract.input },
  { name: `${contract.name}.output`, schema: contract.output },
  { name: `${contract.name}.completed`, schema: contract.completed },
]

export const contractLaws = (registry: Readonly<Record<string, LawfulCapability>>): ReadonlyArray<ContractLaw> => {
  const laws = Object.values(registry).flatMap((capability) => subjectsOf(capability.contract))
  for (const law of laws) ruleOfSchemas(law.name, law.schema)
  return laws
}
