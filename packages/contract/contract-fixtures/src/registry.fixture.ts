import { Contract } from '@systemfsoftware/effect-contract'
import { capabilities } from './capabilities.fixture.js'

export const registry = Contract.registry(capabilities)
