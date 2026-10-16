import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as S from 'effect/Schema'

export class UntaggedCmd extends S.Class<UntaggedCmd>('UntaggedCmd')({
  value: S.Int,
}) {
  static readonly [Workflow.InstrumentationBrand] = { value: 'tests.command.value' } as const
}

export class UnstampedCmd extends S.Class<UnstampedCmd>('UnstampedCmd')({
  value: S.Int,
}) {}

export class BadKeyCmd extends S.Class<BadKeyCmd>('BadKeyCmd')({
  value: S.Int,
}) {
  static readonly [Workflow.InstrumentationBrand] = { nope: 'tests.command.nope' } as const
}

export class BadValueCmd extends S.Class<BadValueCmd>('BadValueCmd')({
  value: S.Int,
}) {
  static readonly [Workflow.InstrumentationBrand] = { value: 'tests.command.Value' } as const
}

export const StructCmd = S.Struct({ value: S.Int })

export const UntaggedEventList = S.Array(StructCmd)

export class CommandRefused extends S.TaggedError<CommandRefused>()('CommandRefused', {
  why: S.String,
}) {}
