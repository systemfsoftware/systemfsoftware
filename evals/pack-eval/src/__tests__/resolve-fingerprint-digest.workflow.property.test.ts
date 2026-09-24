import { it } from '@effect/vitest'
import { Equal, Result, Schema } from 'effect'
import {
  FingerprintCovered,
  FingerprintUncovered,
  resolveFingerprintDigest,
  ResolveFingerprintDigestCommand,
} from '../resolve-fingerprint-digest.workflow.js'

const decisionOf = (command: ResolveFingerprintDigestCommand) => Result.getOrThrow(resolveFingerprintDigest(command))

const isCovered = Schema.is(FingerprintCovered)
const isUncovered = Schema.is(FingerprintUncovered)

it.prop(
  '∀c_fileCount_≡CoveredExactlyWhenPositive',
  [Schema.Int, Schema.String],
  ([fileCount, digest]) => {
    const decision = decisionOf(new ResolveFingerprintDigestCommand({ digest, fileCount }))
    return isCovered(decision) === (fileCount > 0) && isUncovered(decision) === (fileCount <= 0)
  },
)

it.prop(
  '∀c_coveredDecision_≡DigestAndCountCarriedFromTheCommand',
  [Schema.Int, Schema.String],
  ([fileCount, digest]) => {
    const decision = decisionOf(new ResolveFingerprintDigestCommand({ digest, fileCount }))
    return isUncovered(decision) || (decision.digest === digest && decision.fileCount === fileCount)
  },
)

it.prop(
  '∀c_sameCommand_≡SameDecisionTwice',
  [Schema.Int, Schema.String],
  ([fileCount, digest]) => {
    const command = new ResolveFingerprintDigestCommand({ digest, fileCount })
    return Equal.equals(decisionOf(command), decisionOf(command))
  },
)
