import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'

const KvOutcomeTypeId: unique symbol = Symbol.for('@systemfsoftware/cloudflare-emulator/KvNamespaceOutcome')
type KvOutcomeTypeId = typeof KvOutcomeTypeId

export const KvJurisdiction = Schema.Literals(['eu', 'fedramp', 'us'])
export type KvJurisdiction = typeof KvJurisdiction.Type

export const KvNamespace = Schema.Struct({
  id: Schema.String,
  jurisdiction: Schema.optional(KvJurisdiction),
  mode: Schema.optional(Schema.Literal('instant')),
  supports_url_encoding: Schema.optional(Schema.Boolean),
  title: Schema.String,
})
export type KvNamespace = typeof KvNamespace.Type

export const KvNamespaceState = Schema.Array(KvNamespace)
export type KvNamespaceState = typeof KvNamespaceState.Type

export class ListNamespaces extends Schema.TaggedClass<ListNamespaces>()('ListNamespaces', {
  page: Schema.optional(Schema.Finite),
  per_page: Schema.optional(Schema.Finite),
}) {}

export class CreateNamespace extends Schema.TaggedClass<CreateNamespace>()('CreateNamespace', {
  title: Schema.String,
  jurisdiction: Schema.optional(KvJurisdiction),
  mode: Schema.optional(Schema.Literal('instant')),
}) {}

export class GetNamespace extends Schema.TaggedClass<GetNamespace>()('GetNamespace', {
  namespace_id: Schema.String,
}) {}

export class RenameNamespace extends Schema.TaggedClass<RenameNamespace>()('RenameNamespace', {
  namespace_id: Schema.String,
  title: Schema.String,
}) {}

export class RemoveNamespace extends Schema.TaggedClass<RemoveNamespace>()('RemoveNamespace', {
  namespace_id: Schema.String,
}) {}

export const KvRequest = Schema.Union([ListNamespaces, CreateNamespace, GetNamespace, RenameNamespace, RemoveNamespace])
export type KvRequest = typeof KvRequest.Type

export class KvApplied extends Schema.TaggedClass<KvApplied>()('KvApplied', {
  state: KvNamespaceState,
  status: Schema.Finite,
  body: Schema.Json,
}) {
  readonly [KvOutcomeTypeId] = KvOutcomeTypeId
}

export class KvRefused extends Schema.TaggedClass<KvRefused>()('KvRefused', {
  state: KvNamespaceState,
  status: Schema.Finite,
  body: Schema.Json,
}) {
  readonly [KvOutcomeTypeId] = KvOutcomeTypeId
}

export const KvOutcome = Schema.Union([KvApplied, KvRefused])
export type KvOutcome = typeof KvOutcome.Type

export class KvCommand extends Schema.TaggedClass<KvCommand>()('KvCommand', {
  now: Schema.String,
  newId: Schema.String,
  state: KvNamespaceState,
  request: KvRequest,
}) {
  static readonly [Workflow.InstrumentationBrand] = {}
}
