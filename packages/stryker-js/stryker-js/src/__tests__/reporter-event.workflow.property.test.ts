import { describe, it } from '@effect/vitest'
import * as Exit from 'effect/Exit'
import * as S from 'effect/Schema'
import { FastCheck as fc } from 'effect/testing'

import type { StandardSchemaV1Result } from '../Plugin.schema.js'
import type { ReporterEvent } from '../Reporter.schema.js'
import { DryRunCompletedCodec, MutantTestedCodec, ReporterEventCodec, ReporterEventSchema } from '../Reporter.schema.js'

type Validation = StandardSchemaV1Result<ReporterEvent> | 'async'

const validateSync = (input: unknown): Validation => {
  const out = ReporterEventSchema['~standard'].validate(input)
  if (out instanceof Promise) return 'async'
  return out
}

const reencoded = (value: ReporterEvent): string => JSON.stringify(S.encodeSync(ReporterEventCodec)(value))

const withTag = (input: unknown, tag: unknown): unknown => {
  if (typeof input !== 'object' || input === null) return input
  return { ...input, _tag: tag }
}

const withoutTag = (input: unknown): unknown => {
  if (typeof input !== 'object' || input === null) return input
  const rest: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (key !== '_tag') rest[key] = value
  }
  return rest
}

const corruptByDraw = (encoded: unknown): unknown => {
  const fingerprint = JSON.stringify(encoded).length % 3
  if (fingerprint === 1) return withTag(encoded, 'not-a-kind')
  if (fingerprint === 2) return withoutTag(encoded)
  return encoded
}

const injectCoverage = (input: unknown): unknown => {
  if (typeof input !== 'object' || input === null) return input
  return { ...input, mutantCoverage: { perTest: { t1: { m1: 1 } }, static: { m1: 2 } } }
}

const agreesWithDecode = (input: unknown): boolean => {
  const standard = validateSync(input)
  if (standard === 'async') return false
  const decoded = S.decodeUnknownExit(ReporterEventCodec)(input)
  if ('value' in standard) {
    return Exit.isSuccess(decoded) && reencoded(standard.value) === reencoded(decoded.value)
  }
  return Exit.isFailure(decoded) && standard.issues.length > 0
}

const hasResultShape = (result: Validation): boolean => {
  if (result === 'async') return false
  if ('value' in result) return true
  return result.issues.length > 0
}

const stripsMutantCoverage = (encoded: unknown): boolean => {
  const clean = validateSync(encoded)
  if (clean === 'async' || !('value' in clean)) return false
  const stripped = validateSync(injectCoverage(encoded))
  if (stripped === 'async' || !('value' in stripped)) return false
  return !('mutantCoverage' in stripped.value)
}

const rejectsUnknownTag = (result: Validation): boolean => {
  if (result === 'async') return false
  if ('value' in result) return false
  if (result.issues.length === 0) return false
  const fingerprint = JSON.stringify(result.issues.map((issue) => ({ message: issue.message, path: issue.path })))
  return fingerprint.includes('_tag') || fingerprint.includes('Expected')
}

const memberNamesOf = (encoded: object): string => Object.keys(encoded).filter((key) => key !== '_tag').sort().join(',')

const PINNED_MUTANT_MEMBERS = 'completed,file,id,location,mutator,replacement,status,total'

describe('ReporterEvent', () => {
  it.prop(
    '∀e_Event_≡Decode',
    [S.toArbitrary(ReporterEventCodec)(fc)],
    ([event]) => agreesWithDecode(corruptByDraw(S.encodeSync(ReporterEventCodec)(event))),
  )

  it.prop(
    '∀e_Validate_∈Shape',
    [S.toArbitrary(ReporterEventCodec)(fc)],
    ([event]) => hasResultShape(validateSync(corruptByDraw(S.encodeSync(ReporterEventCodec)(event)))),
  )

  it.prop(
    '∀d_DryRun_≠Coverage',
    [S.toArbitrary(DryRunCompletedCodec)(fc)],
    ([event]) => stripsMutantCoverage(S.encodeSync(DryRunCompletedCodec)(event)),
  )

  it.prop(
    '∀e_UnknownTag_⊥Decoded',
    [S.toArbitrary(ReporterEventCodec)(fc)],
    ([event]) => rejectsUnknownTag(validateSync(withTag(S.encodeSync(ReporterEventCodec)(event), 'not-a-kind'))),
  )

  it.prop(
    '∀m_Tested_≡EventShape',
    [S.toArbitrary(MutantTestedCodec)(fc)],
    ([event]) => {
      const encoded = S.encodeSync(MutantTestedCodec)(event)
      return memberNamesOf(encoded) === PINNED_MUTANT_MEMBERS && validateSync(encoded) !== 'async'
    },
  )
})
