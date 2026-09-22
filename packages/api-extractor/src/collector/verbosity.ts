import * as Schema from 'effect/Schema'

import type { Verbosity, VerbosityRequest } from './verbosity.schema.js'

export type { CliFlags, Verbosity, VerbosityRequest } from './verbosity.schema.js'

type Signal = 'diagnostics' | 'verbose' | 'cliQuiet' | 'configQuiet'

const precedence: readonly (readonly [Signal, Verbosity])[] = [
  ['diagnostics', 'diagnostics'],
  ['verbose', 'verbose'],
  ['cliQuiet', 'silent'],
  ['configQuiet', 'silent'],
]

const carriers: Readonly<Record<Signal, (request: VerbosityRequest) => boolean>> = {
  diagnostics: (request) => request.cliFlags.diagnostics === true,
  verbose: (request) => request.cliFlags.verbose === true,
  cliQuiet: (request) => request.cliFlags.quiet === true,
  configQuiet: (request) => request.configQuiet === true,
}

const signalWinner = (request: VerbosityRequest): Verbosity | undefined => {
  const match = precedence.find(([signal]) => carriers[signal](request))
  return match === undefined ? undefined : match[1]
}

export const resolveVerbosity = (request: VerbosityRequest): Verbosity => signalWinner(request) ?? 'normal'

if (import.meta.vitest !== void 0) {
  // Exception: in-source tests load @effect/vitest dynamically to avoid bundling test libraries
  const { it } = await import('@effect/vitest')

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

  const requestOfMask = (mask: number): VerbosityRequest => ({
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

  const firstExpected = (
    rows: readonly (VerbosityRequest & { readonly expected: Verbosity })[],
  ): Verbosity | undefined => {
    const first = rows[0]
    return first === undefined ? undefined : first.expected
  }

  const singleExpected = (
    rows: readonly (VerbosityRequest & { readonly expected: Verbosity })[],
  ): Verbosity | undefined => rows.length === 1 ? firstExpected(rows) : undefined

  const expectedWinner = (
    matching: readonly (VerbosityRequest & { readonly expected: Verbosity })[],
    mask: number,
  ): Verbosity | undefined => (mask === 0 ? undefined : singleExpected(matching))

  it.prop('∀m_Precedence_≡Table', [RequestMask], ([mask]) => {
    const request = requestOfMask(mask)
    const matching = precedenceTable.filter((row) => toMask(row) === mask)
    return signalWinner(request) === expectedWinner(matching, mask)
  })

  it.prop('∀m_Resolver_≡Table', [RequestMask], ([mask]) => {
    const request = requestOfMask(mask)
    const matching = precedenceTable.filter((row) => toMask(row) === mask)
    return resolveVerbosity(request) === singleExpected(matching)
  })
}
