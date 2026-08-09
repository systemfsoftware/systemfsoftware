import { readFile } from 'node:fs/promises'
import { resolve as resolvePath } from 'node:path'

import { schema } from '@systemfsoftware/stryker-js-plugin-api/core'
import { describe, expect, it } from 'vitest'

import { forkCoreSchema } from '../../src/config/fork-schema.js'
import {
  contributionByTestFile,
  judgeTestContribution,
  suffixesToRequire,
  toothlessTestFiles,
} from '../../src/test-contribution.js'

const LOCATION = { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } }

const mutantOf = (
  id: string,
  status: schema.MutantStatus,
  killedBy?: string[],
  coveredBy?: string[],
): schema.MutantResult => ({
  id,
  status,
  mutatorName: 'BooleanLiteral',
  location: LOCATION,
  ...(killedBy === undefined ? {} : { killedBy }),
  ...(coveredBy === undefined ? {} : { coveredBy }),
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
      'a.property.test.ts': { soleKills: 1, totalKills: 1, coversUnattributedKill: false },
      'b.property.test.ts': { soleKills: 0, totalKills: 0, coversUnattributedKill: false },
    })
  })

  it('credits a shared kill to both files but to neither alone', () => {
    const report = reportOf([mutantOf('m1', 'Killed', ['t1', 't2'])], {
      'a.property.test.ts': ['t1'],
      'b.property.test.ts': ['t2'],
    })
    expect(Object.fromEntries(contributionByTestFile(report))).toEqual({
      'a.property.test.ts': { soleKills: 0, totalKills: 1, coversUnattributedKill: false },
      'b.property.test.ts': { soleKills: 0, totalKills: 1, coversUnattributedKill: false },
    })
  })

  it('denies sole credit when a co-killer cannot be placed in any file', () => {
    const report = reportOf([mutantOf('m1', 'Killed', ['t1', 'ghost'])], {
      'a.property.test.ts': ['t1'],
    })
    expect(Object.fromEntries(contributionByTestFile(report))).toEqual({
      'a.property.test.ts': { soleKills: 0, totalKills: 1, coversUnattributedKill: false },
    })
  })

  it('counts a Timeout as a kill', () => {
    const report = reportOf([mutantOf('m1', 'Timeout', ['t1'])], { 'a.property.test.ts': ['t1'] })
    expect(Object.fromEntries(contributionByTestFile(report))).toEqual({
      'a.property.test.ts': { soleKills: 1, totalKills: 1, coversUnattributedKill: false },
    })
  })

  it('credits nobody for a mutant that survived', () => {
    const report = reportOf([mutantOf('m1', 'Survived', ['t1'])], { 'a.property.test.ts': ['t1'] })
    expect(Object.fromEntries(contributionByTestFile(report))).toEqual({
      'a.property.test.ts': { soleKills: 0, totalKills: 0, coversUnattributedKill: false },
    })
  })

  it('credits nobody for a kill that recorded no killing test', () => {
    const report = reportOf([mutantOf('m1', 'Killed')], { 'a.property.test.ts': ['t1'] })
    expect(Object.fromEntries(contributionByTestFile(report))).toEqual({
      'a.property.test.ts': { soleKills: 0, totalKills: 0, coversUnattributedKill: false },
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

  it('spares a file covering a kill credited to nobody, because deleting it may resurrect that kill', () => {
    // A Timeout is a kill the runner cannot attribute: it arrives with `killedBy: []`, so the
    // test that hung is never named. The coverer may be the one causing it.
    const report = reportOf([mutantOf('m1', 'Killed', ['t1']), mutantOf('m2', 'Timeout', [], ['t2'])], {
      'earns.property.test.ts': ['t1'],
      'hangs.property.test.ts': ['t2'],
    })
    expect(toothlessTestFiles(contributionByTestFile(report), EXACT)).toEqual([])
  })

  it('still accuses a file that covers no unattributed kill when a sibling does', () => {
    const report = reportOf([mutantOf('m1', 'Killed', ['t1']), mutantOf('m2', 'Timeout', [], ['t2'])], {
      'earns.property.test.ts': ['t1'],
      'hangs.property.test.ts': ['t2'],
      'idle.property.test.ts': ['t3'],
    })
    expect(toothlessTestFiles(contributionByTestFile(report), EXACT)).toEqual(['idle.property.test.ts'])
  })

  it('treats an absent killedBy like an empty one, sparing the file that covers the kill', () => {
    // The report may omit `killedBy` entirely rather than send an empty array. Both say the
    // same thing — no killer was recorded — so both must leave the coverer unmeasurable.
    const report = reportOf([mutantOf('m1', 'Killed', ['t1']), mutantOf('m2', 'Timeout', undefined, ['t2'])], {
      'earns.property.test.ts': ['t1'],
      'hangs.property.test.ts': ['t2'],
    })
    expect(toothlessTestFiles(contributionByTestFile(report), EXACT)).toEqual([])
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

  it('fails the run with a configuration error when bail is on and an in-scope file ran', () => {
    const verdict = judgeTestContribution(twoFiles, PROPERTY, false)
    expect(verdict?.failed).toBe(true)
    expect(verdict?.message).toContain('bail')
    expect(verdict?.message).toContain('disableBail: true')
  })

  it('judges the same package normally once disableBail: true is set, and a zero-kill file is still accused', () => {
    const verdict = judgeTestContribution(twoFiles, PROPERTY, true)
    expect(verdict?.failed).toBe(true)
    expect(verdict?.message).toContain('idle.property.test.ts')
    expect(verdict?.message).not.toContain('disableBail: true')
  })

  it('stays silent under bail when no file matches the configured suffixes', () => {
    const noneInScope = reportOf([mutantOf('m1', 'Killed', ['t1'])], { 'plain.test.ts': ['t1'] })
    const verdict = judgeTestContribution(noneInScope, PROPERTY, false)
    expect(verdict?.failed).toBe(false)
    expect(verdict?.message).toContain('so none was judged')
    expect(verdict?.message).not.toContain('disableBail: true')
  })

  it('does not single out a zero-killing file when bail is on: the configuration error names no test file', () => {
    const soleKiller = reportOf([mutantOf('m1', 'Killed', ['t1']), mutantOf('m2', 'Killed', ['t1'])], {
      'sole.workflow.property.test.ts': ['t1'],
      'idle.workflow.property.test.ts': ['t2'],
    })
    const WORKFLOW = ['.workflow.property.test.ts']
    const verdict = judgeTestContribution(soleKiller, WORKFLOW, false)
    expect(verdict?.message).not.toContain('sole.workflow.property.test.ts')
    expect(verdict?.message).not.toContain('idle.workflow.property.test.ts')
    expect(verdict?.message).toContain('disableBail: true')
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
      'busy.property.test.ts': { soleKills: 2, totalKills: 2, coversUnattributedKill: false },
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

describe('requireTestContribution default suffix list', () => {
  const props = forkCoreSchema.properties as Record<string, { default?: unknown; description?: string }>
  const defaultSuffixes = (props.requireTestContribution?.default ?? []) as string[]

  it('retains .workflow.property.test.ts so the gate applies to workflow property tests', () => {
    expect(defaultSuffixes).toContain('.workflow.property.test.ts')
  })

  it('retains .policy.property.test.ts so the gate applies to policy property tests', () => {
    expect(defaultSuffixes).toContain('.policy.property.test.ts')
  })

  it('retains .kernel.property.test.ts so the gate applies to kernel property tests', () => {
    expect(defaultSuffixes).toContain('.kernel.property.test.ts')
  })

  it('does not retain .schema.property.test.ts — the mutator cannot express schema refusals', () => {
    expect(defaultSuffixes).not.toContain('.schema.property.test.ts')
  })

  it('produces no contribution verdict for a run whose only property tests are schema tests', () => {
    const report = reportOf([mutantOf('m1', 'Killed', ['t1'])], {
      'earns.schema.property.test.ts': ['t1'],
      'idle.schema.property.test.ts': ['t2'],
    })
    expect(judgeTestContribution(report, defaultSuffixes, true)?.message).toContain('so none was judged')
  })

  it('still produces a verdict for a package that contains a workflow property test', () => {
    const report = reportOf([mutantOf('m1', 'Killed', ['t1'])], {
      'earns.workflow.property.test.ts': ['t1'],
      'idle.workflow.property.test.ts': ['t2'],
    })
    expect(judgeTestContribution(report, defaultSuffixes, true)?.failed).toBe(true)
  })

  it('an explicit requireTestContribution in a config still overrides the default', () => {
    const report = reportOf([mutantOf('m1', 'Killed', ['t1'])], {
      'earns.schema.property.test.ts': ['t1'],
      'idle.schema.property.test.ts': ['t2'],
    })
    expect(judgeTestContribution(report, ['.schema.property.test.ts'], true)?.failed).toBe(true)
  })

  it('description in fork-schema.ts and stryker-schema.json are identical and do not claim files are accused under bail', async () => {
    const forkDescription = props.requireTestContribution?.description ?? ''
    const schemaRaw = await readFile(
      resolvePath(import.meta.dirname, '../../schema/stryker-schema.json'),
      'utf-8',
    )
    const schemaJson = JSON.parse(schemaRaw) as {
      properties?: Record<string, { description?: string }>
    }
    const schemaDescription = schemaJson.properties?.requireTestContribution?.description ?? ''
    expect(forkDescription).toBe(schemaDescription)
    expect(forkDescription).not.toContain('Under bail only files that killed nothing at all are accused')
    expect(forkDescription).not.toContain('provably toothless')
  })
})
