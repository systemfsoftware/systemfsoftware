/**
 * Which projects a `--project` run may leave out and still be judged. The gate's verdict is about
 * the whole package, so only a contract lane — real systems no checker drives — may be missing.
 */
import { describe, expect, it } from 'vitest'

import { leftOutProjectsOf } from '../lib/conformance-coverage.js'

const unit = { extends: true, test: { name: 'unit', include: ['src/**/*.test.ts', 'tests/**/*.test.ts'] } }
const conformance = { extends: true, test: { name: 'conformance', include: ['tests/**/*.conformance.test.ts'] } }
const contract = { extends: true, test: { name: 'contract', include: ['tests/**/*.contract.test.ts'] } }
const declared = [unit, conformance, contract]

describe('projects a filtered run leaves out', () => {
  it('judges a run that left out only the contract lane', () => {
    expect(leftOutProjectsOf(declared, new Set(['unit', 'conformance']))).toEqual([])
  })

  it('names every non-contract project a contract-only run left out', () => {
    expect(leftOutProjectsOf(declared, new Set(['contract']))).toEqual(['unit', 'conformance'])
  })

  it('does not treat a project that mixes contract and other files as a contract lane', () => {
    const mixed = {
      test: { name: 'contract', include: ['tests/**/*.contract.test.ts', 'tests/**/*.conformance.test.ts'] },
    }
    expect(leftOutProjectsOf([unit, mixed], new Set(['unit']))).toEqual(['contract'])
  })

  it('counts a project it cannot read as left out', () => {
    expect(leftOutProjectsOf(['packages/*/vitest.config.ts'], new Set(['unit']))).toEqual([
      'a project declared by path or function',
    ])
  })
})
