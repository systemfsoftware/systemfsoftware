import { Schema } from 'effect'

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
