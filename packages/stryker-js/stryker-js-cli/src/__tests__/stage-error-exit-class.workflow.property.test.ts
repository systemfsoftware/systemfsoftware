import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import * as S from 'effect/Schema'
import { FastCheck as fc } from 'effect/testing'

import { ParserNotFound } from '../instrument/Parser.schema.js'
import { StageError } from '../run/Run.schema.js'

const STAGE_ARB = fc.constantFrom<StageError['stage']>(
  'prepare',
  'instrument',
  'dryRun',
  'dryRunNoTests',
  'mutationTest',
)

const PARSER_NOT_FOUND_ARB = S.toArbitrary(ParserNotFound)(fc)

describe('StageError', () => {
  it.prop(
    '∀s_DeclaredCauseExitClass_≡OutranksTheStageFallback',
    [STAGE_ARB, PARSER_NOT_FOUND_ARB, fc.string()],
    ([stage, cause, reason]) => new StageError({ stage, reason, cause }).exitClass === 'ConfigError',
  )

  it.prop(
    '∀r_SilentCause_≡TheInstrumentStageKeepsItsOwnClass',
    [fc.string()],
    ([reason]) =>
      new StageError({ stage: 'instrument', reason, cause: new Error('the fixture cause declares no exit class') })
        .exitClass === 'RuntimeError',
  )
})

describe('ParserNotFound', () => {
  it.prop(
    '∀c_ParserNotFound_≡DeclaresAConfigError',
    [PARSER_NOT_FOUND_ARB],
    ([cause]) => {
      const exitClass: string = cause.exitClass
      return exitClass === 'ConfigError'
    },
  )
})
