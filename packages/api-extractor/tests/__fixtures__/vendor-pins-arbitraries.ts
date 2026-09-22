import * as fc from 'fast-check'

export interface CompilerTargetPair {
  readonly target: 'ES2022' | 'ES2020' | 'ESNext'
  readonly module: 'NodeNext' | 'ESNext' | 'CommonJS'
}

export const compilerTargetPairs: fc.Arbitrary<CompilerTargetPair> = fc.record({
  target: fc.constantFrom('ES2022' as const, 'ES2020' as const, 'ESNext' as const),
  module: fc.constantFrom('NodeNext' as const, 'ESNext' as const, 'CommonJS' as const),
})
