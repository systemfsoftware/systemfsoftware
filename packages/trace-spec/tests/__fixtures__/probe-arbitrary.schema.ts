import * as fc from 'fast-check'

export const probeInputs: fc.Arbitrary<number> = fc.nat(1000)
