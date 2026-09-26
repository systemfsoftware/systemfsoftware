import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'

const SplitUstarEntryNameDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/npm-package/SplitUstarEntryNameDecision',
)
type SplitUstarEntryNameDecisionTypeId = typeof SplitUstarEntryNameDecisionTypeId

export class FitsNameField extends Schema.TaggedClass<FitsNameField>()('FitsNameField', {
  nameField: Schema.Uint8Array,
}) {
  readonly [SplitUstarEntryNameDecisionTypeId] = SplitUstarEntryNameDecisionTypeId
}

export class SplitIntoPrefixAndName extends Schema.TaggedClass<SplitIntoPrefixAndName>()(
  'SplitIntoPrefixAndName',
  { prefixField: Schema.Uint8Array, nameField: Schema.Uint8Array },
) {
  readonly [SplitUstarEntryNameDecisionTypeId] = SplitUstarEntryNameDecisionTypeId
}

export const SplitUstarEntryNameDecision = Schema.Union([FitsNameField, SplitIntoPrefixAndName])
export type SplitUstarEntryNameDecision = typeof SplitUstarEntryNameDecision.Type

export class UstarEntryNameTooLong extends Schema.TaggedError<UstarEntryNameTooLong>()(
  'UstarEntryNameTooLong',
  { byteLength: Schema.Finite },
) {
  readonly [SplitUstarEntryNameDecisionTypeId] = SplitUstarEntryNameDecisionTypeId

  override get message(): string {
    return `Entry name is ${this.byteLength} bytes, which no ustar prefix/name split can hold`
  }
}

export class SplitUstarEntryName extends Schema.TaggedClass<SplitUstarEntryName>()('SplitUstarEntryName', {
  nameBytes: Schema.Uint8Array,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const ustarNameFieldBytes = 100
const ustarPrefixFieldBytes = 155
const ustarSeparatorByte = 0x2f

const splitIndexesLongestPrefixFirst: ReadonlyArray<number> = Arr.reverse(
  Arr.range(0, ustarPrefixFieldBytes),
)

const tailFitsNameField = (nameBytes: Uint8Array) => (index: number): boolean =>
  nameBytes.length - index - 1 <= ustarNameFieldBytes

const isUsableSplitAt = (nameBytes: Uint8Array) => (index: number): boolean =>
  Match.value(nameBytes.at(index) === ustarSeparatorByte).pipe(
    Match.when(true, () => tailFitsNameField(nameBytes)(index)),
    Match.when(false, () => false),
    Match.exhaustive,
  )

const splitOrRefuse = (
  nameBytes: Uint8Array,
): Result.Result<SplitUstarEntryNameDecision, UstarEntryNameTooLong> =>
  Option.match(Arr.findFirst(splitIndexesLongestPrefixFirst, isUsableSplitAt(nameBytes)), {
    onNone: () => Result.fail(new UstarEntryNameTooLong({ byteLength: nameBytes.length })),
    onSome: (index) =>
      Result.succeed(
        new SplitIntoPrefixAndName({
          prefixField: nameBytes.subarray(0, index),
          nameField: nameBytes.subarray(index + 1),
        }),
      ),
  })

export const splitUstarEntryName = Workflow.make({
  command: SplitUstarEntryName,
  decision: SplitUstarEntryNameDecision,
  error: UstarEntryNameTooLong,
  decide: (command): Result.Result<SplitUstarEntryNameDecision, UstarEntryNameTooLong> =>
    Match.value(command.nameBytes.length <= ustarNameFieldBytes).pipe(
      Match.when(true, () => Result.succeed(new FitsNameField({ nameField: command.nameBytes }))),
      Match.when(false, () => splitOrRefuse(command.nameBytes)),
      Match.exhaustive,
    ),
})
