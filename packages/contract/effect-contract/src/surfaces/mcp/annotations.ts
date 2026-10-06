import { Schema } from 'effect'
import { dual } from 'effect/Function'
import { Contract } from '../../mod.js'
import { writeGuardPolicy } from './write-guard.js'

export interface ToolAnnotationHints {
  readonly readOnlyHint: boolean
  readonly destructiveHint: boolean
  readonly idempotentHint: boolean
  readonly openWorldHint: boolean
}

const openWorldOf = (egress: Contract.Egress): boolean => Schema.is(Contract.AllowList)(egress)

const toolAnnotationsOfImpl = (access: Contract.Access, egress: Contract.Egress): ToolAnnotationHints => {
  const policy = writeGuardPolicy(access)
  return {
    readOnlyHint: policy.readOnlyHint,
    destructiveHint: policy.destructiveHint,
    idempotentHint: policy.idempotentHint,
    openWorldHint: openWorldOf(egress),
  }
}

export const toolAnnotationsOf: {
  (access: Contract.Access, egress: Contract.Egress): ToolAnnotationHints
  (egress: Contract.Egress): (access: Contract.Access) => ToolAnnotationHints
} = dual(2, toolAnnotationsOfImpl)
