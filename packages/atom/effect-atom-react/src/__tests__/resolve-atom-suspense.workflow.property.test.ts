import { it } from '@systemfsoftware/vitest'
import { Schema } from 'effect'
import { absurd } from 'effect/Function'
import * as Result from 'effect/Result'
import {
  AtomReady,
  AtomRefused,
  AtomSuspended,
  ResolveAtomSuspense,
  resolveAtomSuspense,
  type ResolveAtomSuspenseDecision,
} from '../resolve-atom-suspense.workflow.js'

const decide = (
  initial: boolean,
  waiting: boolean,
  suspendOnWaiting: boolean,
  failure: boolean,
  includeFailure: boolean,
): Result.Result<ResolveAtomSuspenseDecision, never> =>
  resolveAtomSuspense(ResolveAtomSuspense.make({ initial, waiting, suspendOnWaiting, failure, includeFailure }))

const decisionOf = (outcome: Result.Result<ResolveAtomSuspenseDecision, never>): ResolveAtomSuspenseDecision =>
  Result.match(outcome, {
    onFailure: (error: never): ResolveAtomSuspenseDecision => absurd(error),
    onSuccess: (decision) => decision,
  })

it.prop(
  '∀a_InitialAtom_≡Suspended',
  { of: [Schema.Boolean, Schema.Boolean], subject: decide },
  (subject, [suspendOnWaiting, failure]) =>
    Schema.is(AtomSuspended)(subject(true, false, suspendOnWaiting, failure, false).pipe(decisionOf)),
)

it.prop(
  '∀a_WaitingWhileSuspended_≡Suspended',
  { of: [Schema.Boolean, Schema.Boolean], subject: decide },
  (subject, [failure, includeFailure]) =>
    Schema.is(AtomSuspended)(subject(false, true, true, failure, includeFailure).pipe(decisionOf)),
)

it.prop(
  '∀a_SettledWithinSuspend_≡Ready',
  { of: [Schema.Boolean, Schema.Boolean], subject: decide },
  (subject, [suspendOnWaiting, includeFailure]) =>
    Schema.is(AtomReady)(subject(false, false, suspendOnWaiting, false, includeFailure).pipe(decisionOf)),
)

it.prop(
  '∀a_Refused_≡UnexposedFailure',
  { of: [Schema.Boolean], subject: decide },
  (subject, [includeFailure]) =>
    Schema.is(AtomRefused)(subject(false, false, false, true, includeFailure).pipe(decisionOf)) ===
      (includeFailure === false),
)
