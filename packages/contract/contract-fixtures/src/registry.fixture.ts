import { Contract } from '@systemfsoftware/effect-contract'
import { capabilities, type FixtureRequirement } from './capabilities.fixture.js'

const built = Contract.registry(capabilities)

/**
 * Every capability is widened to one requirement. A surface reads its service set off the registry; an
 * intersection of two sets makes inference take the first and refuse the rest, so the fixture publishes one.
 */
export const registry: {
  readonly [K in keyof typeof built]: Contract.Capability<(typeof built)[K]['contract'], FixtureRequirement>
} = built
