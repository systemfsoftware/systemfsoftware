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

type SelectSource = typeof selectObservationSource

const verdictOf = (
  select: SelectSource,
  hitIds: ReadonlyArray<string>,
  missing: ReadonlyArray<string>,
  onMissing: 'fail' | 'ask',
): Verdict => select(new SelectObservationSource({ hitIds: [...hitIds], missing: [...missing], onMissing }))

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
  { of: [Schema.Array(Schema.String), Schema.Literals(['fail', 'ask'])], subject: selectObservationSource, runs: 100 },
  (subject, [hitIds, onMissing]) => tagOf(verdictOf(subject, hitIds, [], onMissing)) === 'AllRecorded',
)

it.prop(
  '∀c_SelectSource_=AskForMissing',
  { of: [Schema.NonEmptyArray(Schema.String)], subject: selectObservationSource, runs: 100 },
  (subject, [missing]) =>
    tagOf(verdictOf(subject, [], missing, 'ask')) === 'AskForMissing' &&
    askedIdsOf(verdictOf(subject, [], missing, 'ask')).join('|') === missing.join('|'),
)

it.prop(
  '∀c_SelectSource_=RecordingMissing',
  { of: [Schema.NonEmptyArray(Schema.String)], subject: selectObservationSource, runs: 100 },
  (subject, [missing]) =>
    tagOf(verdictOf(subject, [], missing, 'fail')) === 'RecordingMissing' &&
    refusedIdsOf(verdictOf(subject, [], missing, 'fail')).join('|') === missing.join('|'),
)
