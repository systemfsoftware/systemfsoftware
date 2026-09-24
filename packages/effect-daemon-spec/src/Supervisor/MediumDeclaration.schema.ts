/// <reference types="vitest/importMeta" />
import { Result, Schema } from 'effect'

/**
 * What a medium can say about why a child died (R16, KTD8): the in-process fiber
 * medium reports a full `Cause`, a process, socket or microVM medium reports the
 * exit status and signal it observed, and the cluster medium's death is only
 * inferred from failed liveness probes (KTD7). The kernel assumes nothing beyond
 * the declared level; the conformance kit projects traces down to it.
 */
export const MediumReporting = Schema.Literals(['full', 'exit', 'inferred'])
export type MediumReporting = typeof MediumReporting.Type

/**
 * The `one_for_all` guarantee a medium can honour (R16, KTD8): `atomic` means no
 * child is left running once the group stop returns, `eventual` means teardown
 * continues on the medium's own clock after the call returns.
 */
export const GroupStopGuarantee = Schema.Literals(['atomic', 'eventual'])
export type GroupStopGuarantee = typeof GroupStopGuarantee.Type

/**
 * A medium's declaration to the kernel (R16). Both fields are required: a
 * declaration without a reporting level or a group-stop guarantee is refused at
 * decode, so the kernel never guesses what a medium can say or honour.
 */
export const MediumDeclaration = Schema.Struct({
  reporting: MediumReporting,
  groupStop: GroupStopGuarantee,
})
export type MediumDeclaration = typeof MediumDeclaration.Type

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this
  // branch is statically dead in the build and a static import would enter the published
  // module graph.
  const { it } = await import('@effect/vitest')

  const MysteryReporting = Schema.Literals(['mystery'])
  const AcceptedReporting = Schema.Union([MysteryReporting, MediumReporting])
  type AcceptedReporting = typeof AcceptedReporting.Type
  const EventuallyGroupStop = Schema.Literals(['eventually'])
  const AcceptedGroupStop = Schema.Union([EventuallyGroupStop, GroupStopGuarantee])
  type AcceptedGroupStop = typeof AcceptedGroupStop.Type
  const UnknownDeclarationDraft = Schema.Struct({
    hasReporting: Schema.Boolean,
    reporting: AcceptedReporting,
    hasGroupStop: Schema.Boolean,
    groupStop: AcceptedGroupStop,
  })
  type UnknownDeclarationDraft = typeof UnknownDeclarationDraft.Type

  const reportingLevelDecodes = (parts: UnknownDeclarationDraft): boolean =>
    Result.isSuccess(Schema.decodeUnknownResult(MediumReporting)(parts.reporting))

  const groupStopLevelDecodes = (parts: UnknownDeclarationDraft): boolean =>
    Result.isSuccess(Schema.decodeUnknownResult(GroupStopGuarantee)(parts.groupStop))

  const carriedDecodes = (parts: UnknownDeclarationDraft): boolean =>
    reportingLevelDecodes(parts) && groupStopLevelDecodes(parts)

  const carriedPresent = (parts: UnknownDeclarationDraft): boolean => parts.hasReporting && parts.hasGroupStop

  const reportingEntryOf = (parts: UnknownDeclarationDraft): Record<string, AcceptedReporting> =>
    parts.hasReporting ? { reporting: parts.reporting } : {}

  const groupStopEntryOf = (parts: UnknownDeclarationDraft): Record<string, AcceptedGroupStop> =>
    parts.hasGroupStop ? { groupStop: parts.groupStop } : {}

  const projectedOf = (parts: UnknownDeclarationDraft): Record<string, AcceptedReporting | AcceptedGroupStop> => ({
    ...reportingEntryOf(parts),
    ...groupStopEntryOf(parts),
  })

  const decodeMediumDeclaration = Schema.decodeUnknownResult(MediumDeclaration)

  it.prop(
    '∀d_DeclarationDecode_≡Presence',
    { of: [UnknownDeclarationDraft], subject: decodeMediumDeclaration },
    (subject, [draft]) =>
      Result.isSuccess(subject(projectedOf(draft))) === (carriedPresent(draft) && carriedDecodes(draft)),
  )
}
