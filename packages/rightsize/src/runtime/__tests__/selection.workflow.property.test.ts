/**
 * Selection-workflow properties (R8): the first-live-wins law, the verbatim
 * probe recital on failure, and the msb gate — over generated probe records.
 *
 * Predicates are pure booleans — no `expect` inside a property.
 */
import { it } from '@effect/vitest'
import { Result, Schema as S } from 'effect'
import { FastCheck as fc } from 'effect/testing'

import { decideSelection, ProbeRecord, SelectionMsb } from '../selection.workflow.js'

const isMsb = S.is(SelectionMsb)

const probesArb = fc.array(S.toArbitrary(ProbeRecord)(fc), { minLength: 0, maxLength: 6 })
const firstArb = probesArb.chain((probes) =>
  probes.length === 0
    ? fc.constant(undefined)
    : fc.option(fc.constantFrom(...probes), { nil: undefined })
)

it.prop('∀probes_FirstLive_→DockerAtFirstSocket', [probesArb, firstArb], ([probes, first]) => {
  const outcome = decideSelection({ _tag: 'PreferDocker', probes, first })
  if (first === undefined) {
    return true
  }
  return Result.isSuccess(outcome) && outcome.success._tag === 'Docker' &&
    'socketPath' in outcome.success && outcome.success.socketPath === first.socketPath
})

it.prop('∀probes_NothingLive_→FailureRecitingEveryProbe', [probesArb, firstArb], ([probes, first]) => {
  const outcome = decideSelection({ _tag: 'PreferDocker', probes, first })
  if (first !== undefined) {
    return true
  }
  if (Result.isSuccess(outcome)) {
    return false
  }
  const failure = outcome.failure
  return failure._tag === 'BackendUnreachableError' && failure.requested === 'docker' &&
    failure.probes.length === probes.length &&
    failure.probes.every((record, index) =>
      record.id === probes[index]?.id && record.socketPath === probes[index]?.socketPath &&
      record.live === probes[index]?.live
    )
})

it.prop('∀gate_MsbSupported_→Msb', [probesArb, firstArb, fc.boolean()], ([probes, first, msbSupported]) => {
  const outcome = decideSelection({ _tag: 'PreferAuto', probes, first, msbSupported })
  if (!msbSupported) {
    return true
  }
  return Result.isSuccess(outcome) && isMsb(outcome.success)
})

it.prop('∀request_PreferMsb_→Msb', [fc.constant(0)], ([_request]) => {
  const outcome = decideSelection({ _tag: 'PreferMsb' })
  return Result.isSuccess(outcome) && isMsb(outcome.success)
})
