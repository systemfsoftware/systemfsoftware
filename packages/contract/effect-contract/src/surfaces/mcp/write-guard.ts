import { Match } from 'effect'
import { Contract } from '../../mod.js'

export type RiskLevel = 'Read' | Contract.Risk

export interface WriteGuardPolicy {
  readonly risk: RiskLevel
  readonly readOnlyHint: boolean
  readonly idempotentHint: boolean
  readonly destructiveHint: boolean
  readonly requiresConfirmation: boolean
}

const writePolicy = (risk: Contract.Risk): WriteGuardPolicy => ({
  risk,
  readOnlyHint: false,
  idempotentHint: false,
  destructiveHint: risk === 'Critical',
  requiresConfirmation: true,
})

export const writeGuardPolicy = (access: Contract.Access): WriteGuardPolicy =>
  Match.value(access).pipe(
    Match.tag('Read', (): WriteGuardPolicy => ({
      risk: 'Read',
      readOnlyHint: true,
      idempotentHint: true,
      destructiveHint: false,
      requiresConfirmation: false,
    })),
    Match.tag('Write', ({ risk }) => writePolicy(risk)),
    Match.tag('DurableWrite', ({ risk }) => writePolicy(risk)),
    Match.exhaustive,
  )
