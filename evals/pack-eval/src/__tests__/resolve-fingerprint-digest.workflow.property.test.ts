import { it } from '@effect/vitest'
import { Equal, Result, Schema } from 'effect'
import {
  FingerprintCovered,
  FingerprintUncovered,
  resolveFingerprintDigest,
  ResolveFingerprintDigestCommand,
} from '../resolve-fingerprint-digest.workflow.js'
const isCovered = Schema.is(FingerprintCovered)
const isUncovered = Schema.is(FingerprintUncovered)

const decisionOf = (command: ResolveFingerprintDigestCommand) => Result.getOrThrow(resolveFingerprintDigest(command))

it.prop(
  '∀c_fileCount_≡CoveredExactlyWhenPositive',
  [ResolveFingerprintDigestCommand],
  ([command]) => {
    const decision = decisionOf(command)
    return isCovered(decision) === (command.fileCount > 0) &&
      isUncovered(decision) === (command.fileCount <= 0)
  },
)

it.prop(
  '∀c_positiveFileCount_≡DigestAndCountCarriedFromTheCommand',
  [Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0))), Schema.String],
  ([fileCount, digest]) => {
    const decision = decisionOf(new ResolveFingerprintDigestCommand({ digest, fileCount }))
    return isCovered(decision) && decision.digest === digest && decision.fileCount === fileCount
  },
)

it.prop(
  '∀c_sameCommand_≡SameDecisionTwice',
  [ResolveFingerprintDigestCommand],
  ([command]) => Equal.equals(decisionOf(command), decisionOf(command)),
)
