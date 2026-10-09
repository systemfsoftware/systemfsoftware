/**
 * The refusal's own suite: a record that breaks the contract is not the failure Vitest prints. The runner throws a
 * `FailureRecordRefused` refusal naming the breach in fixed prose, keeps the original failure as its `cause`, and
 * the original failure — with the record it would have printed — stays beneath it (R10, KTD7).
 *
 * The escape hatch this suite pins is one-way: a refusal is never checked again, so a refusal cannot recurse, and a
 * record that holds its contract is handed to Vitest unchanged.
 */
import { it } from '@systemfsoftware/vitest'
import {
  type FailureRecordInput,
  renderFailureRecord,
  type TestIdentity,
  throwFailureRecord,
} from '@systemfsoftware/vitest/failure'
import { Cause } from 'effect'

const IDENTITY: TestIdentity = {
  package: '@systemfsoftware/vitest',
  file: 'packages/runner/vitest/tests/refusal.test.ts',
  name: 'the scenario under the refusal',
}

const REFUSAL = '✗ refused a failure record:'
const EMPTY_HEADLINE = 'the headline is empty'
const NO_LOCATION = 'the record names no source location'
const REPLAY_ON_BASELINE = 'a replay value names a run no generator chose'

const USER_SITE = 'packages/effect-readiness/src/await-condition.cell.ts:21:5'
const INNER_DETAIL = 'the inner failure the refusal must keep visible'

const raised = (message: string): Error => {
  const error = Object.assign(new Error(message), { _tag: 'LogSourceError' })
  error.stack = `LogSourceError: ${message}\n    at write (${USER_SITE})`
  return error
}

const innerDefect = (): Error => Object.assign(new Error(INNER_DETAIL), { _tag: 'InnerDefect' })

const thrownBy = (throwing: () => never): Error => {
  try {
    throwing()
  } catch (error) {
    return error instanceof Error ? error : new Error('the call threw a value that is not an Error')
  }
  return new Error('nothing was thrown')
}

const stackOf = (error: Error): string => `${error.stack ?? ''}`

const refusalsIn = (text: string): number => text.split(REFUSAL).length - 1

const input = <E>(failure: FailureRecordInput<E>['failure']): FailureRecordInput<E> => ({
  failure,
  spans: [],
  identity: IDENTITY,
  replay: undefined,
})

it('Should_RefuseTheRecord_When_TheHeadlineIsEmpty', function*({ expect }) {
  const defect = innerDefect()
  const failure = Cause.combine(Cause.fail(''), Cause.die(defect))
  const given = input(failure)
  const thrown = thrownBy(() => throwFailureRecord(given))
  yield* expect({
    name: thrown.name,
    namesTheEmptyHeadline: thrown.message.includes(EMPTY_HEADLINE),
    keepsTheOriginalFailure: Reflect.get(thrown, 'cause') === failure,
    keepsTheOriginalCause: stackOf(thrown).includes(INNER_DETAIL),
  }).toEqual({
    name: 'FailureRecordRefused',
    namesTheEmptyHeadline: true,
    keepsTheOriginalFailure: true,
    keepsTheOriginalCause: true,
  })
})

it('Should_RefuseTheRecord_When_NoLocationSurvives', function*({ expect }) {
  const failure = { _tag: 'ScenarioBuildError', field: 1 }
  const given = input(failure)
  const thrown = thrownBy(() => throwFailureRecord(given))
  yield* expect({
    name: thrown.name,
    namesTheMissingLocation: thrown.message.includes(NO_LOCATION),
    namesTheHeadline: thrown.message.includes(EMPTY_HEADLINE),
  }).toEqual({
    name: 'FailureRecordRefused',
    namesTheMissingLocation: true,
    namesTheHeadline: false,
  })
})

it('Should_RefuseTheRecord_When_ReplayValueNamesTheBaseline', function*({ expect }) {
  const given = input(raised('log source "host 127.0.0.1:1" failed'))
  const thrown = thrownBy(() => throwFailureRecord({ ...given, replay: { seed: undefined, path: [0, 0, 0] } }))
  yield* expect({
    name: thrown.name,
    namesTheReplay: thrown.message.includes(REPLAY_ON_BASELINE),
    namesAMissingLocation: thrown.message.includes(NO_LOCATION),
  }).toEqual({
    name: 'FailureRecordRefused',
    namesTheReplay: true,
    namesAMissingLocation: false,
  })
})

it('Should_SurfaceTheRecordUnchanged_When_TheContractHolds', function*({ expect }) {
  const failure = raised('log source "host 127.0.0.1:1" failed')
  const given = input(failure)
  const record = renderFailureRecord(given)
  const thrown = thrownBy(() => throwFailureRecord(given))
  yield* expect({
    breaches: record.breaches,
    name: thrown.name,
    message: thrown.message,
    expectedName: record.name,
    expectedMessage: record.record.slice(`${record.name}: `.length),
  }).toEqual({
    breaches: [],
    name: record.name,
    message: record.record.slice(`${record.name}: `.length),
    expectedName: record.name,
    expectedMessage: record.record.slice(`${record.name}: `.length),
  })
})

it('Should_RenderTheFailureOnce_When_ItsCauseIsItselfARefusal', function*({ expect }) {
  const refusing = input(Cause.fail(''))
  const refusal = thrownBy(() => throwFailureRecord(refusing))
  const again = thrownBy(() => throwFailureRecord(input(refusal)))
  const outer = Object.assign(raised('the outer failure'), { _tag: 'OuterError', cause: refusal })
  const thrown = thrownBy(() => throwFailureRecord(input(outer)))
  yield* expect({
    name: thrown.name,
    refusalsRendered: refusalsIn(stackOf(thrown)),
    theSameRefusal: again === refusal,
    onceOnTheRefusal: refusalsIn(stackOf(again)),
  }).toEqual({
    name: 'OuterError',
    refusalsRendered: 1,
    theSameRefusal: true,
    onceOnTheRefusal: 1,
  })
})
