import { type FixtureRequirement, registry } from '@systemfsoftware/contract-fixtures'
import { Contract, Sandbox } from '@systemfsoftware/effect-contract'
import { executeCapability } from '@systemfsoftware/effect-contract/code-mode'

export type ContractSandboxRequirement = FixtureRequirement | Sandbox.Sandbox

export const contractSandboxRegistry: Readonly<
  Record<string, Contract.Capability<Contract.Any, ContractSandboxRequirement>>
> = {
  ...registry,
  execute: executeCapability,
}

export const CATALOG_VERSION = 'contract-fixtures-v1'
