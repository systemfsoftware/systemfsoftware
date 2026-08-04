import { schema } from '@stryker-mutator/api/core'
import { describe, expect, it } from 'vitest'

import {
  contributionByTestFile,
  judgeTestContribution,
  suffixesToRequire,
  toothlessTestFiles,
} from '../../src/reporters/test-contribution.js'

const LOCATION = { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } }

const mutantOf = (
  id: string,
  status: schema.MutantStatus,
  killedBy?: string[],
): schema.MutantResult => ({
  id,
  status,
  mutatorName: 'BooleanLiteral',
  location: LOCATION,
  ...(killedBy === undefined ? {} : { killedBy }),
})

const reportOf = (
  mutants: schema.MutantResult[],
  testFiles: Record<string, string[]>,
): Pick<schema.MutationTestResult, 'files' | 'testFiles'> => ({
  files: {
    'src/subject.ts': { language: 'typescript', source: 'export const a = 1\n', mutants },
  },
  testFiles: Object.fromEntries(
    Object.entries(testFiles).map(([fileName, testIds]) => [
      fileName,
      { tests: testIds.map((id) => ({ id, name: `test ${id}` })) },
    ]),
  ),
})

const PROPERTY = ['.property.test.ts']
const EXACT = { suffixes: PROPERTY, everyKillerRecorded: true }
const BAILED = { suffixes: PROPERTY, everyKillerRecorded: false }

describe('contributionByTestFile', () => {
  it('credits a sole kill to the only file that killed the mutant', () => {
    const report = reportOf([mutantOf('m1', 'Killed', ['t1'])], {
      'a.property.test.ts': ['t1'],
      'b.property.test.ts': ['t2'],
    })
    expect(Object.fromEntries(contributionByTestFile(report))).toEqual({
      'a.property.test.ts': { soleKills: 1, totalKills: 1 },
      'b.property.test.ts': { soleKills: 0, totalKills: 0 },
    })
  })

  it('credits a shared kill to both files but to neither alone', () => {
    const report = reportOf([mutantOf('m1', 'Killed', ['t1', 't2'])], {
      'a.property.test.ts': ['t1'],
      'b.property.test.ts': ['t2'],
    })
    expect(Object.fromEntries(contributionByTestFile(report))).toEqual({
      'a.property.test.ts': { soleKills: 0, totalKills: 1 },
      'b.property.test.ts': { soleKills: 0, totalKills: 1 },
    })
  })

  it('denies sole credit when a co-killer cannot be placed in any file', () => {
    const report = reportOf([mutantOf('m1', 'Killed', ['t1', 'ghost'])], {
      'a.property.test.ts': ['t1'],
    })
    expect(Object.fromEntries(contributionByTestFile(report))).toEqual({
      'a.property.test.ts': { soleKills: 0, totalKills: 1 },
    })
  })

  it('counts a Timeout as a kill', () => {
    const report = reportOf([mutantOf('m1', 'Timeout', ['t1'])], { 'a.property.test.ts': ['t1'] })
    expect(Object.fromEntries(contributionByTestFile(report))).toEqual({
      'a.property.test.ts': { soleKills: 1, totalKills: 1 },
    })
  })

  it('credits nobody for a mutant that survived', () => {
    const report = reportOf([mutantOf('m1', 'Survived', ['t1'])], { 'a.property.test.ts': ['t1'] })
    expect(Object.fromEntries(contributionByTestFile(report))).toEqual({
      'a.property.test.ts': { soleKills: 0, totalKills: 0 },
    })
  })

  it('credits nobody for a kill that recorded no killing test', () => {
    const report = reportOf([mutantOf('m1', 'Killed')], { 'a.property.test.ts': ['t1'] })
    expect(Object.fromEntries(contributionByTestFile(report))).toEqual({
      'a.property.test.ts': { soleKills: 0, totalKills: 0 },
    })
  })
})

describe('toothlessTestFiles', () => {
  it('accuses a file whose every kill is also made by another file', () => {
    const report = reportOf([mutantOf('m1', 'Killed', ['t1', 't2']), mutantOf('m2', 'Killed', ['t1'])], {
      'earns.property.test.ts': ['t1'],
      'idle.property.test.ts': ['t2'],
    })
    expect(toothlessTestFiles(contributionByTestFile(report), EXACT)).toEqual(['idle.property.test.ts'])
  })

  it('spares a redundant file when the run bailed, because a second killer may be unrecorded', () => {
    const report = reportOf([mutantOf('m1', 'Killed', ['t1', 't2']), mutantOf('m2', 'Killed', ['t1'])], {
      'earns.property.test.ts': ['t1'],
      'idle.property.test.ts': ['t2'],
    })
    expect(toothlessTestFiles(contributionByTestFile(report), BAILED)).toEqual([])
  })

  it('accuses a file that killed nothing at all even when the run bailed', () => {
    const report = reportOf([mutantOf('m1', 'Killed', ['t1'])], {
      'earns.property.test.ts': ['t1'],
      'idle.property.test.ts': ['t2'],
    })
    expect(toothlessTestFiles(contributionByTestFile(report), BAILED)).toEqual(['idle.property.test.ts'])
  })

  it('never accuses a file outside the configured suffixes', () => {
    const report = reportOf([mutantOf('m1', 'Killed', ['t1'])], {
      'earns.property.test.ts': ['t1'],
      'idle.integration.test.ts': ['t2'],
    })
    expect(toothlessTestFiles(contributionByTestFile(report), EXACT)).toEqual([])
  })

  it('returns the accused files sorted', () => {
    const report = reportOf([mutantOf('m1', 'Killed', ['t1'])], {
      'earns.property.test.ts': ['t1'],
      'zebra.property.test.ts': ['t2'],
      'alpha.property.test.ts': ['t3'],
    })
    expect(toothlessTestFiles(contributionByTestFile(report), EXACT)).toEqual([
      'alpha.property.test.ts',
      'zebra.property.test.ts',
    ])
  })
})

describe('suffixesToRequire', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty list', []],
    ['a string', '.property.test.ts'],
    ['a list of non-strings', [1, false]],
  ])('treats %s as the check being switched off', (_label, value) => {
    expect(suffixesToRequire(value)).toBeUndefined()
  })

  it('keeps the string entries of a mixed list', () => {
    expect(suffixesToRequire(['.property.test.ts', 7])).toEqual(['.property.test.ts'])
  })
})

describe('judgeTestContribution', () => {
  const twoFiles = reportOf(
    [mutantOf('m1', 'Killed', ['t1', 't2']), mutantOf('m2', 'Killed', ['t1'])],
    { 'earns.property.test.ts': ['t1'], 'idle.property.test.ts': ['t2'] },
  )

  it('fails the run and names the file that earns nothing', () => {
    const verdict = judgeTestContribution(twoFiles, PROPERTY, true)
    expect(verdict?.failed).toBe(true)
    expect(verdict?.message).toContain('idle.property.test.ts')
    expect(verdict?.message).toContain('just as dead')
  })

  it('passes the run when every in-scope file earns its place', () => {
    const clean = reportOf([mutantOf('m1', 'Killed', ['t1']), mutantOf('m2', 'Killed', ['t2'])], {
      'earns.property.test.ts': ['t1'],
      'also.property.test.ts': ['t2'],
    })
    const verdict = judgeTestContribution(clean, PROPERTY, true)
    expect(verdict?.failed).toBe(false)
    expect(verdict?.message).toContain('kills a mutant nothing else kills')
  })

  it('says which precision the answer carries when the run bailed', () => {
    const verdict = judgeTestContribution(twoFiles, PROPERTY, false)
    expect(verdict?.message).toContain('the run bailed at the first killing test')
  })

  it('returns no verdict at all when the check is not configured', () => {
    expect(judgeTestContribution(twoFiles, null, true)).toBeUndefined()
  })

  it('blames the run, not the tests, when no kill was credited to any test file', () => {
    const silent = reportOf([mutantOf('m1', 'Killed'), mutantOf('m2', 'Timeout')], {
      'unjudged.property.test.ts': ['t1'],
    })
    const verdict = judgeTestContribution(silent, PROPERTY, true)
    expect(verdict?.failed).toBe(true)
    expect(verdict?.message).toContain('credited no kill to any test file')
    expect(verdict?.message).not.toContain('unjudged.property.test.ts')
  })

  it('passes without judging anything when no file matches the suffixes', () => {
    const noneInScope = reportOf([mutantOf('m1', 'Killed', ['t1'])], {
      'plain.test.ts': ['t1'],
    })
    const verdict = judgeTestContribution(noneInScope, PROPERTY, true)
    expect(verdict?.failed).toBe(false)
    expect(verdict?.message).toContain('so none was judged')
  })

  it('counts every mutant a file kills, not merely that it killed one', () => {
    const twice = reportOf([mutantOf('m1', 'Killed', ['t1']), mutantOf('m2', 'Killed', ['t1'])], {
      'busy.property.test.ts': ['t1'],
    })
    expect(Object.fromEntries(contributionByTestFile(twice))).toEqual({
      'busy.property.test.ts': { soleKills: 2, totalKills: 2 },
    })
  })

  it('judges a file in scope when it matches any configured suffix, not all of them', () => {
    const mixed = reportOf([mutantOf('m1', 'Killed', ['t1'])], {
      'earns.property.test.ts': ['t1'],
      'idle.law.test.ts': ['t2'],
    })
    const verdict = judgeTestContribution(mixed, ['.property.test.ts', '.law.test.ts'], true)
    expect(verdict?.failed).toBe(true)
    expect(verdict?.message).toContain('idle.law.test.ts')
  })

  it('names every configured suffix in the message when nothing matched', () => {
    const noneInScope = reportOf([mutantOf('m1', 'Killed', ['t1'])], { 'plain.test.ts': ['t1'] })
    const verdict = judgeTestContribution(noneInScope, ['.property.test.ts', '.law.test.ts'], true)
    expect(verdict?.message).toContain('.property.test.ts, .law.test.ts')
  })

  it('says the answer is exact when every killer was recorded', () => {
    expect(judgeTestContribution(twoFiles, PROPERTY, true)?.message).toContain(
      'every killing test was recorded',
    )
  })

  it('lists each accused file on its own bulleted line', () => {
    const bothIdle = reportOf([mutantOf('m1', 'Killed', ['t1'])], {
      'earns.property.test.ts': ['t1'],
      'beta.property.test.ts': ['t2'],
      'alpha.property.test.ts': ['t3'],
    })
    expect(judgeTestContribution(bothIdle, PROPERTY, true)?.message).toContain(
      '  - alpha.property.test.ts\n  - beta.property.test.ts',
    )
  })
})
