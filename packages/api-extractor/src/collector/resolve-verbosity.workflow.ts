import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { CliFlags, type Verbosity, type VerbosityRequest } from './verbosity.schema.js'

const VerbosityTypeId: unique symbol = Symbol.for('@systemfsoftware/api-extractor/VerbosityDecision')
type VerbosityTypeId = typeof VerbosityTypeId

export class VerbosityDiagnostics extends Schema.TaggedClass<VerbosityDiagnostics>()('VerbosityDiagnostics', {}) {
  readonly [VerbosityTypeId] = VerbosityTypeId
}

export class VerbosityVerbose extends Schema.TaggedClass<VerbosityVerbose>()('VerbosityVerbose', {}) {
  readonly [VerbosityTypeId] = VerbosityTypeId
}

export class VerbositySilent extends Schema.TaggedClass<VerbositySilent>()('VerbositySilent', {}) {
  readonly [VerbosityTypeId] = VerbosityTypeId
}

export class VerbosityNormal extends Schema.TaggedClass<VerbosityNormal>()('VerbosityNormal', {}) {
  readonly [VerbosityTypeId] = VerbosityTypeId
}

export type VerbosityDecision = VerbosityDiagnostics | VerbosityVerbose | VerbositySilent | VerbosityNormal

export class ResolveVerbosity extends Schema.TaggedClass<ResolveVerbosity>()('ResolveVerbosity', {
  cliFlags: CliFlags,
  configQuiet: Schema.Boolean,
}) {
  static readonly [Workflow.InstrumentationBrand] = [] as const
}

type VerbositySignal = 'diagnostics' | 'verbose' | 'cliQuiet' | 'configQuiet'

const signalPrecedence: readonly VerbositySignal[] = ['diagnostics', 'verbose', 'cliQuiet', 'configQuiet']

const signalCarriers: Readonly<Record<VerbositySignal, (command: ResolveVerbosity) => boolean>> = {
  diagnostics: (command) => command.cliFlags.diagnostics === true,
  verbose: (command) => command.cliFlags.verbose === true,
  cliQuiet: (command) => command.cliFlags.quiet === true,
  configQuiet: (command) => command.configQuiet,
}

const winningSignal = (command: ResolveVerbosity): Option.Option<VerbositySignal> =>
  Arr.findFirst(signalPrecedence, (signal) => signalCarriers[signal](command))

export const resolveVerbosity = Workflow.total(
  ResolveVerbosity,
  (command) =>
    Result.succeed(
      Option.match(winningSignal(command), {
        onNone: () => VerbosityNormal.make(),
        onSome: (winner) =>
          Match.value(winner).pipe(
            Match.when('diagnostics', () => VerbosityDiagnostics.make()),
            Match.when('verbose', () => VerbosityVerbose.make()),
            Match.when('cliQuiet', () => VerbositySilent.make()),
            Match.when('configQuiet', () => VerbositySilent.make()),
            Match.exhaustive,
          ),
      }),
    ),
)

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
    const signal = winningSignal(command)
    const outcome = resolveVerbosity(command)
    const decision = Result.getOrThrow(outcome)
    return Option.isOption(signal) && tagOfDecision(decision) === singleExpected(matching)
  })
}
