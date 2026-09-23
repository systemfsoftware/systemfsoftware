import { it } from '@effect/vitest'
import { Match } from 'effect'
import * as Result from 'effect/Result'

import { AnnounceRun, resolveVerbosity, type VerbosityDecision } from '../collector/resolve-verbosity.workflow.js'
import type { Verbosity } from '../collector/verbosity.schema.js'

const tagOfDecision = (decision: VerbosityDecision): Verbosity =>
  Match.value(decision).pipe(
    Match.tag('VerbosityDiagnostics', (): Verbosity => 'diagnostics'),
    Match.tag('VerbosityVerbose', (): Verbosity => 'verbose'),
    Match.tag('VerbositySilent', (): Verbosity => 'silent'),
    Match.tag('VerbosityNormal', (): Verbosity => 'normal'),
    Match.exhaustive,
  )

const precedenceModel = (command: AnnounceRun): Verbosity =>
  Match.value(command.cliFlags.diagnostics === true).pipe(
    Match.when(true, (): Verbosity => 'diagnostics'),
    Match.when(false, () =>
      Match.value(command.cliFlags.verbose === true).pipe(
        Match.when(true, (): Verbosity => 'verbose'),
        Match.when(false, () =>
          Match.value(command.cliFlags.quiet === true || command.configQuiet).pipe(
            Match.when(true, (): Verbosity => 'silent'),
            Match.when(false, (): Verbosity => 'normal'),
            Match.exhaustive,
          )),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

it.prop(
  '∀cmd_ResolveVerbosity_≡PrecedenceModel',
  [AnnounceRun],
  ([command]) => tagOfDecision(Result.merge(resolveVerbosity(command))) === precedenceModel(command),
)
