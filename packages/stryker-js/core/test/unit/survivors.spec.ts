import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Mutant, PartialStrykerOptions, schema } from '@stryker-mutator/api/core'
import { Effect, Exit } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'

import { createDefaultOptions } from '../../src/config/options-validator.js'
import {
  admitSurvivorsRun,
  serializeSurvivorsHashInput,
  sourceContentHash,
  structuralHash,
  survivorIdentifyingKey,
} from '../../src/mutants/survivors.js'
import { remediationFor, resolveCliExitCode, runStrykerCli, strykerCliEffect } from '../../src/stryker-cli.js'
import type { StrykerRun } from '../../src/stryker-cli.js'
import { strykerVersion } from '../../src/stryker-package.js'

// The bootstrap writes the machine-mode error envelope with `fs.writeSync`;
// the integration-style tests capture those writes through this mock.
const fsMocks = vi.hoisted(() => ({
  writeSync: vi.fn<(fd: number, text: string) => number>(),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, writeSync: fsMocks.writeSync }
})

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/survivors', import.meta.url))
const PROJECT_DIR = path.join(FIXTURE_DIR, 'project')
const SOURCE_FILE = 'src/thing.ts'
const PRIOR_REPORT_PATH = 'reports/mutation-report.json'
const SOURCE = 'export function max(a: number, b: number): number {\n  return a > b ? a : b\n}\n'

/**
 * The fixture project's full mutant list, in the internal 0-based shape a
 * run produces — exactly the mutants the instrumenter creates for the
 * fixture source (verified against `@stryker-mutator/instrumenter`). The
 * prior report carries the same five mutants with 1-based schema locations.
 */
function fullMutantSet(): readonly Mutant[] {
  const fileName = path.resolve(SOURCE_FILE)
  return [
    {
      id: '0',
      fileName,
      mutatorName: 'BlockStatement',
      replacement: '{}',
      location: { start: { line: 0, column: 50 }, end: { line: 2, column: 1 } },
    },
    {
      id: '1',
      fileName,
      mutatorName: 'ConditionalExpression',
      replacement: 'true',
      location: { start: { line: 1, column: 9 }, end: { line: 1, column: 14 } },
    },
    {
      id: '2',
      fileName,
      mutatorName: 'ConditionalExpression',
      replacement: 'false',
      location: { start: { line: 1, column: 9 }, end: { line: 1, column: 14 } },
    },
    {
      id: '3',
      fileName,
      mutatorName: 'EqualityOperator',
      replacement: 'a >= b',
      location: { start: { line: 1, column: 9 }, end: { line: 1, column: 14 } },
    },
    {
      id: '4',
      fileName,
      mutatorName: 'EqualityOperator',
      replacement: 'a <= b',
      location: { start: { line: 1, column: 9 }, end: { line: 1, column: 14 } },
    },
  ]
}

const keyOf = (mutant: Mutant): string =>
  survivorIdentifyingKey({
    file: mutant.fileName,
    location: mutant.location,
    mutatorName: mutant.mutatorName,
    replacement: mutant.replacement,
  })

// The two survivors of the fixture report (ids 1 and 3), keyed in the
// internal 0-based coordinates the run consumes.
const EXPECTED_SURVIVOR_KEYS = [
  'src/thing.ts@1:9-1:14\nConditionalExpression: true',
  'src/thing.ts@1:9-1:14\nEqualityOperator: a >= b',
]

function loadPriorReport(): schema.MutationTestResult {
  return JSON.parse(readFileSync(path.join(PROJECT_DIR, PRIOR_REPORT_PATH), 'utf-8'))
}

function fixtureFrameworkVersion(report: schema.MutationTestResult): string {
  const version = report.framework?.version
  if (version === undefined) {
    throw new Error('fixture report must record a framework version')
  }
  return version
}

function admitAgainstFixture(
  priorReport: schema.MutationTestResult | undefined,
  overrides: {
    currentConfig?: Record<string, unknown>
    frameworkVersion?: string
    sourceContentHashes?: Record<string, string>
  } = {},
) {
  return admitSurvivorsRun({
    priorReport,
    currentConfig: overrides.currentConfig ?? createDefaultOptions(),
    frameworkVersion: overrides.frameworkVersion ??
      (priorReport === undefined ? '0.0.0' : fixtureFrameworkVersion(priorReport)),
    sourceContentHashes: overrides.sourceContentHashes ??
      { [SOURCE_FILE]: sourceContentHash(SOURCE) },
  })
}

// `runStrykerCli` is fire-and-forget; the survivors admission compiles the
// AJV fork schema inside the effect, so the teardown lands well after a fixed
// delay. Poll until the observable side effect (the mocked process.exit)
// happened instead of sleeping a guess.
async function flushUntil(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!condition() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

describe('admitSurvivorsRun', () => {
  const priorReport = loadPriorReport()

  it('admits a matching report and resolves exactly the prior survivor set', () => {
    const admission = admitAgainstFixture(priorReport)
    expect(admission.ok).toBe(true)
    if (admission.ok === false) {
      throw new Error('expected admission')
    }
    const survivorKeys = admission.survivors.map(keyOf)
    expect(survivorKeys).toEqual(EXPECTED_SURVIVOR_KEYS)

    // Every non-survivor in the full set is absent from the resolved set.
    const fullSetKeys = fullMutantSet().map(keyOf)
    for (const key of fullSetKeys) {
      if (!EXPECTED_SURVIVOR_KEYS.includes(key)) {
        expect(survivorKeys).not.toContain(key)
      }
    }
  })

  it('constructs a runnable survivor from a verdict-envelope entry alone', () => {
    // The envelope (U4) carries file, location, mutator and replacement — the
    // survivor matching key (R11) — and nothing from the report file.
    const admission = admitAgainstFixture(priorReport)
    expect(admission.ok).toBe(true)
    if (admission.ok === false) {
      throw new Error('expected admission')
    }
    const survivor = admission.survivors.find(
      (mutant) => mutant.mutatorName === 'ConditionalExpression',
    )
    expect(survivor).toBeDefined()
    expect(survivor?.fileName).toBe(path.resolve(SOURCE_FILE))
    expect(survivor?.replacement).toBe('true')
    // The envelope's 1-based location shifted to the internal 0-based shape.
    expect(survivor?.location).toEqual({
      start: { line: 1, column: 9 },
      end: { line: 1, column: 14 },
    })
    expect(survivor?.status).toBeUndefined()
  })

  it('rejects with no-report and a full-run remediation when no prior report exists', () => {
    const admission = admitAgainstFixture(undefined)
    expect(admission).toEqual({
      ok: false,
      reason: 'no-report',
      remediation: expect.stringContaining('full `stryker run`'),
    })
  })

  it('rejects a report whose resolved config differs — a threshold-only change is caught', () => {
    const thresholdOnlyChange: Record<string, unknown> = {
      ...createDefaultOptions(),
      thresholds: { high: 80, low: 60, break: 100 },
    }
    const admission = admitAgainstFixture(priorReport, { currentConfig: thresholdOnlyChange })
    expect(admission).toEqual({
      ok: false,
      reason: 'mismatch',
      remediation: expect.stringContaining('full `stryker run`'),
    })
  })

  it('rejects a report whose recorded framework version differs', () => {
    const admission = admitAgainstFixture(priorReport, { frameworkVersion: '9.9.9' })
    expect(admission).toEqual({
      ok: false,
      reason: 'mismatch',
      remediation: expect.stringContaining('full `stryker run`'),
    })
  })

  it('rejects a report whose source file content differs', () => {
    const admission = admitAgainstFixture(priorReport, {
      sourceContentHashes: { [SOURCE_FILE]: sourceContentHash(`${SOURCE}\n// drifted\n`) },
    })
    expect(admission).toEqual({
      ok: false,
      reason: 'mismatch',
      remediation: expect.stringContaining('full `stryker run`'),
    })
  })

  it('reports empty when the prior report has zero survivors', () => {
    const noSurvivors = JSON.parse(JSON.stringify(priorReport)) as schema.MutationTestResult
    for (const mutant of noSurvivors.files[SOURCE_FILE].mutants) {
      mutant.status = 'Killed'
    }
    const admission = admitAgainstFixture(noSurvivors)
    expect(admission).toEqual({
      ok: false,
      reason: 'empty',
      remediation: expect.any(String),
    })
  })

  it('never admits a report that a survivors run produced (KTD7)', () => {
    const chained = JSON.parse(JSON.stringify(priorReport)) as schema.MutationTestResult & {
      config: Record<string, unknown>
    }
    chained.config = {
      ...chained.config,
      survivorsPriorReport: 'reports/mutation-report.json',
    }
    const admission = admitAgainstFixture(chained)
    expect(admission).toEqual({
      ok: false,
      reason: 'mismatch',
      remediation: expect.stringContaining('full `stryker run`'),
    })
  })

  it('pins the hash input shape (golden fixture)', () => {
    const input = {
      resolvedOptions: { ...createDefaultOptions() },
      frameworkVersion: fixtureFrameworkVersion(priorReport),
      sourceContentHashes: { [SOURCE_FILE]: sourceContentHash(SOURCE) },
    }
    expect(serializeSurvivorsHashInput(input)).toMatchSnapshot()
    const hash = structuralHash(input)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).toMatchSnapshot()
  })
})

describe('--survivors cli wiring', () => {
  const originalCwd = process.cwd()

  beforeEach(() => {
    process.chdir(PROJECT_DIR)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    vi.restoreAllMocks()
  })

  it('admits against the prior report and restricts the mutant set to the survivor list', async () => {
    let captured: Record<string, unknown> | undefined
    const runMutationTest: StrykerRun = async (options) => {
      captured = { ...options }
      return []
    }
    const exit = await Effect.runPromise(
      Effect.exit(strykerCliEffect(['node', 'stryker', 'run', '--survivors'], runMutationTest)),
    )
    expect(resolveCliExitCode(exit)).toBe(0)
    expect(captured).toBeDefined()
    const expectedAdmission = admitAgainstFixture(loadPriorReport())
    expect(captured?.['survivors']).toEqual(
      expectedAdmission.ok === true ? expectedAdmission.survivors : [],
    )
    // The mechanical scope is the survivor spans, deduplicated.
    expect(captured?.['mutate']).toEqual(['src/thing.ts:2:9-2:14'])
    expect(captured?.['survivorsPriorReport']).toBe(PRIOR_REPORT_PATH)
    expect(captured?.['incremental']).toBe(false)
  })

  it('exits 2 with a full-run remediation when no prior report exists', async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'stryker-survivors-'))
    try {
      process.chdir(tmp)
      const exit = await Effect.runPromise(
        Effect.exit(strykerCliEffect(['node', 'stryker', 'run', '--survivors'], async () => [])),
      )
      expect(resolveCliExitCode(exit)).toBe(2)
      expect(remediationFor(exit, 2)).toContain('full `stryker run`')
    } finally {
      process.chdir(originalCwd)
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('exits 2 when the source content drifted since the prior report', async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'stryker-survivors-'))
    try {
      cpSync(path.join(PROJECT_DIR, 'src'), path.join(tmp, 'src'), { recursive: true })
      cpSync(path.join(PROJECT_DIR, 'reports'), path.join(tmp, 'reports'), { recursive: true })
      writeFileSync(path.join(tmp, SOURCE_FILE), `${SOURCE}\n// drifted\n`)
      process.chdir(tmp)
      const exit = await Effect.runPromise(
        Effect.exit(strykerCliEffect(['node', 'stryker', 'run', '--survivors'], async () => [])),
      )
      expect(resolveCliExitCode(exit)).toBe(2)
      expect(remediationFor(exit, 2)).toContain('full `stryker run`')
    } finally {
      process.chdir(originalCwd)
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('exits 2 when the resolved config differs — a threshold-only change is caught', async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'stryker-survivors-'))
    try {
      cpSync(path.join(PROJECT_DIR, 'src'), path.join(tmp, 'src'), { recursive: true })
      cpSync(path.join(PROJECT_DIR, 'reports'), path.join(tmp, 'reports'), { recursive: true })
      writeFileSync(
        path.join(tmp, 'stryker.config.json'),
        JSON.stringify({ thresholds: { high: 90, low: 70, break: 80 } }),
      )
      process.chdir(tmp)
      const exit = await Effect.runPromise(
        Effect.exit(strykerCliEffect(['node', 'stryker', 'run', '--survivors'], async () => [])),
      )
      expect(resolveCliExitCode(exit)).toBe(2)
    } finally {
      process.chdir(originalCwd)
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('exits 0 on zero survivors without running or touching the prior report', async () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'stryker-survivors-'))
    try {
      cpSync(PROJECT_DIR, tmp, { recursive: true })
      const report = JSON.parse(
        readFileSync(path.join(tmp, PRIOR_REPORT_PATH), 'utf-8'),
      ) as schema.MutationTestResult
      for (const mutant of report.files[SOURCE_FILE].mutants) {
        mutant.status = 'Killed'
      }
      const emptiedReport = JSON.stringify(report)
      writeFileSync(path.join(tmp, PRIOR_REPORT_PATH), emptiedReport)
      process.chdir(tmp)

      vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
      let runCalled = false
      const runMutationTest: StrykerRun = async () => {
        runCalled = true
        return []
      }
      const exit = await Effect.runPromise(
        Effect.exit(strykerCliEffect(['node', 'stryker', 'run', '--survivors'], runMutationTest)),
      )
      expect(resolveCliExitCode(exit)).toBe(0)
      expect(runCalled).toBe(false)
      expect(readFileSync(path.join(tmp, PRIOR_REPORT_PATH), 'utf-8')).toBe(emptiedReport)
    } finally {
      process.chdir(originalCwd)
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('zero-survivor run', () => {
  let exitMock: MockInstance

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {}) as (code?: number) => never)
    process.env['STRYKER_MODE'] = 'machine'
  })

  afterEach(() => {
    delete process.env['STRYKER_MODE']
    vi.restoreAllMocks()
  })

  it('exits 0 with a null-score verdict envelope and no report written', async () => {
    const originalCwd = process.cwd()
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'stryker-survivors-'))
    try {
      cpSync(PROJECT_DIR, tmp, { recursive: true })
      const report = JSON.parse(
        readFileSync(path.join(tmp, PRIOR_REPORT_PATH), 'utf-8'),
      ) as schema.MutationTestResult
      for (const mutant of report.files[SOURCE_FILE].mutants) {
        mutant.status = 'Killed'
      }
      writeFileSync(path.join(tmp, PRIOR_REPORT_PATH), JSON.stringify(report))
      process.chdir(tmp)

      const stdoutWrite = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation(() => true)
      let runCalled = false
      const runMutationTest: StrykerRun = async () => {
        runCalled = true
        return []
      }
      const exit = await Effect.runPromise(
        Effect.exit(strykerCliEffect(['node', 'stryker', 'run', '--survivors'], runMutationTest)),
      )
      expect(resolveCliExitCode(exit)).toBe(0)
      expect(runCalled).toBe(false)
      const stdoutLines = stdoutWrite.mock.calls.map((call) => String(call[0])).join('')
      const envelope = JSON.parse(stdoutLines) as {
        score: number | null
        mutants: unknown[]
        counts: { survived: number }
      }
      expect(envelope.score).toBeNull()
      expect(envelope.mutants).toEqual([])
      expect(envelope.counts.survived).toBe(0)
    } finally {
      process.chdir(originalCwd)
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('machine-mode error envelope for a rejected survivors run', () => {
  let exitMock: MockInstance

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {}) as (code?: number) => never)
    process.env['STRYKER_MODE'] = 'machine'
    fsMocks.writeSync.mockClear()
  })

  afterEach(() => {
    delete process.env['STRYKER_MODE']
    vi.restoreAllMocks()
  })

  const writtenLines = (fd: number): string[] =>
    fsMocks.writeSync.mock.calls.filter((call) => call[0] === fd).map((call) => String(call[1]))

  it('writes one JSON envelope to stderr with code 2 and a remediation naming the full run', async () => {
    const originalCwd = process.cwd()
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'stryker-survivors-'))
    try {
      process.chdir(tmp)
      runStrykerCli(['node', 'stryker', 'run', '--survivors'], async () => [])
      await flushUntil(() => exitMock.mock.calls.length > 0)

      expect(exitMock).toHaveBeenCalledWith(2)
      const stderrLines = writtenLines(2)
      expect(stderrLines).toHaveLength(1)
      const envelope = JSON.parse(stderrLines[0] as string) as {
        schemaVersion: string
        code: number
        error: string
        remediation: string
      }
      expect(envelope.schemaVersion).toBe('1.0')
      expect(envelope.code).toBe(2)
      expect(envelope.remediation).toContain('full `stryker run`')
      expect(writtenLines(1)).toHaveLength(0)
    } finally {
      process.chdir(originalCwd)
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('names the full run in the remediation even for a config mismatch', async () => {
    const originalCwd = process.cwd()
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'stryker-survivors-'))
    try {
      cpSync(path.join(PROJECT_DIR, 'src'), path.join(tmp, 'src'), { recursive: true })
      cpSync(path.join(PROJECT_DIR, 'reports'), path.join(tmp, 'reports'), { recursive: true })
      writeFileSync(path.join(tmp, SOURCE_FILE), `${SOURCE}\n// drifted\n`)
      process.chdir(tmp)
      runStrykerCli(['node', 'stryker', 'run', '--survivors'], async () => [])
      await flushUntil(() => exitMock.mock.calls.length > 0)

      expect(exitMock).toHaveBeenCalledWith(2)
      const envelope = JSON.parse(writtenLines(2)[0] as string) as {
        code: number
        remediation: string
      }
      expect(envelope.code).toBe(2)
      expect(envelope.remediation).toContain('full `stryker run`')
    } finally {
      process.chdir(originalCwd)
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
