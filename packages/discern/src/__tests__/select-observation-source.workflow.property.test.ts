import { it } from '@effect/vitest'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'
import {
  AllRecorded,
  AskForMissing,
  RecordingMissing,
  SelectObservationSource,
  selectObservationSource,
} from '../select-observation-source.workflow.js'

type Selection = AllRecorded | AskForMissing
type Verdict = Result.Result<Selection, RecordingMissing>

const verdictOf = (
  hitIds: ReadonlyArray<string>,
  missing: ReadonlyArray<string>,
  onMissing: 'fail' | 'ask',
): Verdict =>
  selectObservationSource(new SelectObservationSource({ hitIds: [...hitIds], missing: [...missing], onMissing }))

const tagOf = (verdict: Verdict): string =>
  Result.match(verdict, {
    onSuccess: (selection) => selection._tag,
    onFailure: (refusal) => refusal._tag,
  })

const askedIdsOf = (verdict: Verdict): ReadonlyArray<string> =>
  Result.match(verdict, {
    onSuccess: (selection) =>
      Match.value(selection).pipe(
        Match.tag('AskForMissing', (asked) => asked.missing),
        Match.tag('AllRecorded', () => []),
        Match.exhaustive,
      ),
    onFailure: () => [],
  })

const refusedIdsOf = (verdict: Verdict): ReadonlyArray<string> =>
  Result.match(verdict, {
    onSuccess: () => [],
    onFailure: (refusal) => refusal.missing,
  })

it.prop(
  '∀c_SelectSource_=AllRecorded',
  [Schema.Array(Schema.String), Schema.Literals(['fail', 'ask'])],
  ([hitIds, onMissing]) => tagOf(verdictOf(hitIds, [], onMissing)) === 'AllRecorded',
)

it.prop(
  '∀c_SelectSource_=AskForMissing',
  [Schema.NonEmptyArray(Schema.String)],
  ([missing]) =>
    tagOf(verdictOf([], missing, 'ask')) === 'AskForMissing' &&
    askedIdsOf(verdictOf([], missing, 'ask')).join('|') === missing.join('|'),
)

it.prop(
  '∀c_SelectSource_=RecordingMissing',
  [Schema.NonEmptyArray(Schema.String)],
  ([missing]) =>
    tagOf(verdictOf([], missing, 'fail')) === 'RecordingMissing' &&
    refusedIdsOf(verdictOf([], missing, 'fail')).join('|') === missing.join('|'),
)
