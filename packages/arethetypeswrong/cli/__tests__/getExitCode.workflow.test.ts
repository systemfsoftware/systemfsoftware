import { it } from '@effect/vitest'
import { Schema } from 'effect'
import { describe, expect } from 'vitest'

import { computeExitCode, ComputeExitCodeCommand, ComputeExitCodeDecision } from '../src/getExitCode.workflow.js'

const typed = (
  problems: ReadonlyArray<{ kind: string; resolutionKind?: string }>,
  options: { ignoreRules?: ReadonlyArray<string>; ignoreResolutions?: ReadonlyArray<string> } = {},
) =>
  new ComputeExitCodeCommand({
    result: {
      types: true,
      packageName: 'pkg',
      packageVersion: '1.0.0',
      entrypoints: {},
      problems: problems.map((p) => ({ ...p })),
    },
    ignoreRules: [...(options.ignoreRules ?? [])],
    ignoreResolutions: [...(options.ignoreResolutions ?? [])],
  })

describe('computeExitCode workflow', () => {
  it('returns 0 for an untyped package regardless of ignore options', () => {
    const command = new ComputeExitCodeCommand({
      result: { packageName: 'pkg', packageVersion: '1.0.0', types: false },
      ignoreRules: ['no-resolution', 'false-cjs'],
      ignoreResolutions: ['node10'],
    })
    expect(computeExitCode(command).exitCode).toBe(0)
  })

  it('returns 0 when a typed package has no problems', () => {
    expect(computeExitCode(typed([])).exitCode).toBe(0)
  })

  it('returns 1 when the only problems are NoResolution', () => {
    expect(computeExitCode(typed([{ kind: 'NoResolution' }])).exitCode).toBe(1)
  })

  it('returns 1 when a NoResolution problem coexists with another kind', () => {
    expect(computeExitCode(typed([{ kind: 'NoResolution' }, { kind: 'FalseCJS' }])).exitCode).toBe(1)
  })

  it('returns 1 when a single non-NoResolution kind is present', () => {
    expect(computeExitCode(typed([{ kind: 'FalseCJS' }])).exitCode).toBe(1)
  })

  it('returns 1 when several distinct non-NoResolution kinds are present', () => {
    expect(
      computeExitCode(typed([{ kind: 'FalseCJS' }, { kind: 'FalseESM' }, { kind: 'NamedExports' }])).exitCode,
    ).toBe(1)
  })

  it('returns 1 when duplicate non-NoResolution problems of one kind are present', () => {
    expect(computeExitCode(typed([{ kind: 'FalseCJS' }, { kind: 'FalseCJS' }])).exitCode).toBe(1)
  })

  it('returns 0 when every problem kind is ignored by flag', () => {
    expect(computeExitCode(typed([{ kind: 'FalseCJS' }], { ignoreRules: ['false-cjs'] })).exitCode).toBe(0)
  })

  it('matches ignore rules by flag name, not kind name', () => {
    expect(computeExitCode(typed([{ kind: 'FalseCJS' }], { ignoreRules: ['FalseCJS'] })).exitCode).toBe(1)
  })

  it('returns 0 when the only problems are ignored by resolution', () => {
    expect(
      computeExitCode(typed([{ kind: 'FalseCJS', resolutionKind: 'node10' }], { ignoreResolutions: ['node10'] }))
        .exitCode,
    ).toBe(0)
  })

  it('returns 1 when a resolution-ignored problem coexists with a visible one', () => {
    expect(
      computeExitCode(
        typed(
          [{ kind: 'FalseCJS', resolutionKind: 'node10' }, { kind: 'FalseESM', resolutionKind: 'bundler' }],
          { ignoreResolutions: ['node10'] },
        ),
      ).exitCode,
    ).toBe(1)
  })

  it('treats problems without a resolutionKind as never resolution-ignored', () => {
    expect(computeExitCode(typed([{ kind: 'NoResolution' }], { ignoreResolutions: ['node10'] })).exitCode).toBe(1)
  })

  it('decodes a wire value carrying the canonical command tag', () => {
    const decoded = Schema.decodeSync(ComputeExitCodeCommand)({
      _tag: 'ComputeExitCodeCommand',
      result: { packageName: 'pkg', packageVersion: '1.0.0', types: false },
      ignoreRules: ['no-resolution'],
      ignoreResolutions: ['node10'],
    })
    expect(decoded.ignoreRules).toEqual(['no-resolution'])
    expect(decoded.ignoreResolutions).toEqual(['node10'])
  })

  it('decodes a wire value carrying the canonical decision tag', () => {
    const decoded = Schema.decodeSync(ComputeExitCodeDecision)({ _tag: 'ComputeExitCodeDecision', exitCode: 1 })
    expect(decoded.exitCode).toBe(1)
  })
})
