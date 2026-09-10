import { describe, it } from '@effect/vitest'
import * as Exit from 'effect/Exit'
import * as S from 'effect/Schema'
import type { StandardSchemaV1 } from 'effect/StandardSchema'
import { FastCheck as fc } from 'effect/testing'

import { DryRunCompleted, MutantTested, ReporterEventSchema, ReporterEventUnion } from '../ReporterEvent.schema.js'
import type { ReporterEvent } from '../ReporterEvent.schema.js'
import { MutantTested as RunMutantTested } from '../Run.schema.js'

type Validation = StandardSchemaV1.Result<ReporterEvent> | 'async'

const validateSync = (input: unknown): Validation => {
  const out = ReporterEventSchema['~standard'].validate(input)
  if (out instanceof Promise) return 'async'
  return out
}

// Test-file fixture encoding — S.encodeSync throws, which is the permitted
// shape for specs: throwing here is fixture construction, not a boundary decode.
const reencoded = (value: ReporterEvent): string => JSON.stringify(S.encodeSync(ReporterEventUnion)(value))

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
  const decoded = S.decodeUnknownExit(ReporterEventUnion)(input)
  if ('value' in standard) {
    if (Exit.isFailure(decoded)) return false
    if ('issues' in standard) return false
    return reencoded(standard.value) === reencoded(decoded.value)
  }
  return Exit.isFailure(decoded) && standard.issues.length > 0
}

const hasResultShape = (result: Validation): boolean => {
  if (result === 'async') return false
  if ('value' in result) return !('issues' in result)
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

describe('ReporterEvent', () => {
  it.prop(
    '∀e_Event_≡Decode',
    [S.toArbitrary(ReporterEventUnion)(fc)],
    ([event]) => agreesWithDecode(corruptByDraw(S.encodeSync(ReporterEventUnion)(event))),
  )

  it.prop(
    '∀e_Validate_≡Shape',
    [S.toArbitrary(ReporterEventUnion)(fc)],
    ([event]) => hasResultShape(validateSync(corruptByDraw(S.encodeSync(ReporterEventUnion)(event)))),
  )

  it.prop(
    '∀d_DryRun_≠Coverage',
    [S.toArbitrary(DryRunCompleted)(fc)],
    ([event]) => stripsMutantCoverage(S.encodeSync(DryRunCompleted)(event)),
  )

  it.prop(
    '∀e_UnknownTag_≡Reject',
    [S.toArbitrary(ReporterEventUnion)(fc)],
    ([event]) => rejectsUnknownTag(validateSync(withTag(S.encodeSync(ReporterEventUnion)(event), 'not-a-kind'))),
  )

  it.prop(
    '∀m_Tested_≡MachineAlphabet',
    [S.toArbitrary(MutantTested)(fc)],
    ([event]) => {
      const encoded = S.encodeSync(MutantTested)(event)
      const members = Object.keys(encoded).filter((key) => key !== '_tag').sort()
      const pinned = ['completed', 'file', 'id', 'location', 'mutator', 'replacement', 'status', 'total']
      if (members.join(',') !== pinned.join(',')) return false
      return Exit.isSuccess(S.decodeUnknownExit(RunMutantTested)({ ...encoded, _tag: 'mutant' }))
    },
  )
})
