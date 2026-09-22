import { it } from '@effect/vitest'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'

import { ResolveVerbosity, resolveVerbosity, type VerbosityDecision } from '../collector/resolve-verbosity.workflow.js'
import type { Verbosity, VerbosityRequest } from '../collector/verbosity.schema.js'

const precedenceTable: readonly (VerbosityRequest & { readonly expected: Verbosity })[] = [
  { cliFlags: {}, configQuiet: false, expected: 'normal' },
  { cliFlags: {}, configQuiet: true, expected: 'silent' },
  { cliFlags: { quiet: true }, configQuiet: false, expected: 'silent' },
  { cliFlags: { quiet: true }, configQuiet: true, expected: 'silent' },
  { cliFlags: { verbose: true }, configQuiet: false, expected: 'verbose' },
  { cliFlags: { verbose: true }, configQuiet: true, expected: 'verbose' },
  { cliFlags: { verbose: true, quiet: true }, configQuiet: false, expected: 'verbose' },
  { cliFlags: { verbose: true, quiet: true }, configQuiet: true, expected: 'verbose' },
  { cliFlags: { diagnostics: true }, configQuiet: false, expected: 'diagnostics' },
  { cliFlags: { diagnostics: true }, configQuiet: true, expected: 'diagnostics' },
  { cliFlags: { diagnostics: true, quiet: true }, configQuiet: false, expected: 'diagnostics' },
  { cliFlags: { diagnostics: true, quiet: true }, configQuiet: true, expected: 'diagnostics' },
  { cliFlags: { diagnostics: true, verbose: true }, configQuiet: false, expected: 'diagnostics' },
  { cliFlags: { diagnostics: true, verbose: true }, configQuiet: true, expected: 'diagnostics' },
  { cliFlags: { diagnostics: true, verbose: true, quiet: true }, configQuiet: false, expected: 'diagnostics' },
  { cliFlags: { diagnostics: true, verbose: true, quiet: true }, configQuiet: true, expected: 'diagnostics' },
]

const RequestMask = Schema.Literals([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const)

const bitOf = (mask: number, shift: number): boolean => ((mask >> shift) & 1) === 1

const commandOfMask = (mask: number): ResolveVerbosity =>
  ResolveVerbosity.make({
    cliFlags: {
      diagnostics: bitOf(mask, 0),
      verbose: bitOf(mask, 1),
      quiet: bitOf(mask, 2),
    },
    configQuiet: bitOf(mask, 3),
  })

const bit = (flag: boolean | undefined): number => Number(flag === true)

const toMask = (r: VerbosityRequest): number =>
  bit(r.cliFlags.diagnostics) |
  (bit(r.cliFlags.verbose) << 1) |
  (bit(r.cliFlags.quiet) << 2) |
  (bit(r.configQuiet) << 3)

const singleExpected = (
  rows: readonly (VerbosityRequest & { readonly expected: Verbosity })[],
): Verbosity | undefined => {
  const first = rows[0]
  return rows.length === 1 && first !== undefined ? first.expected : undefined
}

const tagOfDecision = (decision: VerbosityDecision): Verbosity =>
  Match.value(decision).pipe(
    Match.tag('VerbosityDiagnostics', (): Verbosity => 'diagnostics'),
    Match.tag('VerbosityVerbose', (): Verbosity => 'verbose'),
    Match.tag('VerbositySilent', (): Verbosity => 'silent'),
    Match.tag('VerbosityNormal', (): Verbosity => 'normal'),
    Match.exhaustive,
  )

it.prop('∀m_ResolveVerbosity_≡Table', [RequestMask], ([mask]) => {
  const command = commandOfMask(mask)
  const matching = precedenceTable.filter((row) => toMask(row) === mask)
  const outcome = resolveVerbosity(command)
  const decision = Result.getOrThrow(outcome)
  return tagOfDecision(decision) === singleExpected(matching)
})
