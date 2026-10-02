import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { ExtractorConfig } from '../config/extractor-config.schema.js'
import { ExtractorRunOptions } from '../extraction-request.schema.js'

import { CliFlags } from './verbosity.schema.js'

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

export const VerbosityDecision = Schema.Union([
  VerbosityDiagnostics,
  VerbosityVerbose,
  VerbositySilent,
  VerbosityNormal,
])
export type VerbosityDecision = typeof VerbosityDecision.Type

export class AnnounceRun extends Schema.TaggedClass<AnnounceRun>()('AnnounceRun', {
  cliFlags: CliFlags,
  configQuiet: Schema.Boolean,
  config: ExtractorConfig,
  options: ExtractorRunOptions,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

type VerbositySignal = 'diagnostics' | 'verbose' | 'cliQuiet' | 'configQuiet'

const signalPrecedence: readonly VerbositySignal[] = ['diagnostics', 'verbose', 'cliQuiet', 'configQuiet']

const signalCarriers: Readonly<Record<VerbositySignal, (command: AnnounceRun) => boolean>> = {
  diagnostics: (command) => command.cliFlags.diagnostics === true,
  verbose: (command) => command.cliFlags.verbose === true,
  cliQuiet: (command) => command.cliFlags.quiet === true,
  configQuiet: (command) => command.configQuiet,
}

const winningSignal = (command: AnnounceRun): Option.Option<VerbositySignal> =>
  Arr.findFirst(signalPrecedence, (signal) => signalCarriers[signal](command))

export const resolveVerbosity = Workflow.make({
  command: AnnounceRun,
  decision: VerbosityDecision,
  error: Schema.Never,
  decide: (command: AnnounceRun): Result.Result<VerbosityDecision, never> =>
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
})
