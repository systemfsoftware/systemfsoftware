import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'

const SourceSelectionTypeId: unique symbol = Symbol.for('@systemfsoftware/discern/SourceSelection')
type SourceSelectionTypeId = typeof SourceSelectionTypeId

export class AllRecorded extends Schema.TaggedClass<AllRecorded>()('AllRecorded', {}) {
  readonly [SourceSelectionTypeId] = SourceSelectionTypeId
}

export class AskForMissing extends Schema.TaggedClass<AskForMissing>()('AskForMissing', {
  missing: Schema.Array(Schema.String),
}) {
  readonly [SourceSelectionTypeId] = SourceSelectionTypeId
}

export const SourceSelection = Schema.Union([AllRecorded, AskForMissing])

export class SelectObservationSource extends Schema.TaggedClass<SelectObservationSource>()(
  'SelectObservationSource',
  {
    hitIds: Schema.Array(Schema.String),
    missing: Schema.Array(Schema.String),
    onMissing: Schema.Literals(['fail', 'ask']),
  },
) {
  static readonly [Workflow.InstrumentationBrand] = { onMissing: 'app.discern.on_missing' } as const
}

export class RecordingMissing extends Schema.TaggedError<RecordingMissing>()('RecordingMissing', {
  missing: Schema.Array(Schema.String),
  detail: Schema.String,
}) {
  override get message(): string {
    return this.detail
  }
}

const missingDetail = (missing: ReadonlyArray<string>): string =>
  `No recorded observation for ${missing.map((id) => `"${id}"`).join(', ')}. ` +
  'The decision definition or the input changed since the recording.'

const askOrRefuse = (command: SelectObservationSource): Result.Result<AllRecorded | AskForMissing, RecordingMissing> =>
  Match.value(command.onMissing).pipe(
    Match.when('ask', () => Result.succeed(new AskForMissing({ missing: [...command.missing] }))),
    Match.when(
      'fail',
      () =>
        Result.fail(
          new RecordingMissing({ missing: [...command.missing], detail: missingDetail(command.missing) }),
        ),
    ),
    Match.exhaustive,
  )

const decideSource = (
  command: SelectObservationSource,
): Result.Result<AllRecorded | AskForMissing, RecordingMissing> =>
  Match.value(command.missing.length === 0).pipe(
    Match.when(true, () => Result.succeed(new AllRecorded({}))),
    Match.when(false, () => askOrRefuse(command)),
    Match.exhaustive,
  )

export const selectObservationSource = Workflow.make({
  command: SelectObservationSource,
  decision: SourceSelection,
  error: RecordingMissing,
  decide: decideSource,
})
