import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { StoreMode } from './cache-store.schema.js'

const AdmitEntryDeleteTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-e2e/AdmitEntryDelete')

export class AdmitEntryDelete extends Schema.TaggedClass<AdmitEntryDelete>()('AdmitEntryDelete', {
  mode: StoreMode,
}) {
  static readonly [Workflow.InstrumentationBrand] = { mode: 'app.e2e.cache.store-mode' } as const
}

export class DeleteAdmitted extends Schema.TaggedClass<DeleteAdmitted>()('DeleteAdmitted', {}) {
  readonly [AdmitEntryDeleteTypeId] = AdmitEntryDeleteTypeId
}

export class DeleteRefused extends Schema.TaggedClass<DeleteRefused>()('DeleteRefused', {}) {
  readonly [AdmitEntryDeleteTypeId] = AdmitEntryDeleteTypeId
}

export const DeleteAdmission = Schema.Union([DeleteAdmitted, DeleteRefused])
export type DeleteAdmission = typeof DeleteAdmission.Type

const decide = (command: AdmitEntryDelete): Result.Result<DeleteAdmission, never> =>
  Result.succeed(
    Match.value(command.mode).pipe(
      Match.when('read-only', (): DeleteAdmission => new DeleteRefused({})),
      Match.when('read-write', (): DeleteAdmission => new DeleteAdmitted({})),
      Match.exhaustive,
    ),
  )

export const admitEntryDelete = Workflow.make({
  command: AdmitEntryDelete,
  decision: DeleteAdmission,
  error: Schema.Never,
  decide,
})
