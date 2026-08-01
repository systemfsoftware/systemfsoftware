/**
 * Workflow cell — pure dispatch-doctrine verdict.
 *
 * Total decision over a `CheckDispatchCommand` carrying three fields. The
 * verdict is a bare tagged union `Allow | DeliverDoctrine`; there is no
 * domain error the consumer must branch on separately from the decision.
 *
 * The kernel (`isDelegatorTool`) classifies the tool name; this workflow
 * composes it with the gate-enabled flag and the loaded state. The kernel
 * text carried by `DeliverDoctrine.reason` is the compile-time constant
 * `DOCTRINE_KERNEL` below — a template literal that the drift-guard test
 * in U3 will equality-compare against the marked excerpt in the skill file.
 */

import * as Match from 'effect/Match'
import * as S from 'effect/Schema'

import { isDelegatorTool } from './dispatch-doctrine.kernel.js'

// ═══════════════════════════════════════════════════════════
// 1. COMMAND
// ═══════════════════════════════════════════════════════════

const CheckDispatchCommandTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/omp-agent-discipline/CheckDispatchCommand',
)

export class CheckDispatchCommand extends S.TaggedClass<CheckDispatchCommand>()('CheckDispatchCommand', {
  toolName: S.String,
  doctrineLoaded: S.Boolean,
  gateEnabled: S.Boolean,
}) {
  readonly [CheckDispatchCommandTypeId] = CheckDispatchCommandTypeId
}

// ═══════════════════════════════════════════════════════════
// 2. VERDICT — bare tagged union (no error channel — total decision)
// ═══════════════════════════════════════════════════════════

const DispatchDoctrineVerdictTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/omp-agent-discipline/DispatchDoctrineVerdict',
)

export class Allow extends S.TaggedClass<Allow>()('Allow', {}) {
  readonly [DispatchDoctrineVerdictTypeId] = DispatchDoctrineVerdictTypeId
}

export class DeliverDoctrine extends S.TaggedClass<DeliverDoctrine>()('DeliverDoctrine', {
  reason: S.String,
}) {
  readonly [DispatchDoctrineVerdictTypeId] = DispatchDoctrineVerdictTypeId
}

const DispatchDoctrineVerdict = S.Union(Allow, DeliverDoctrine)
export type DispatchDoctrineVerdict = S.Schema.Type<typeof DispatchDoctrineVerdict>

// ═══════════════════════════════════════════════════════════
// 3. DOCTRINE KERNEL — compile-time constant carried by DeliverDoctrine
// ═══════════════════════════════════════════════════════════

export const DOCTRINE_KERNEL =
  `Refuse monolithic dispatches: size the unit, specify it completely, then dispatch — or do the work inline.

rules:
- GATE: decomposition is mandatory when ANY hold — multi-subsystem; exceeds one focused session for the worker's model class; irreversible side effects; verification longer than the work; incompatible reasoning modes. Dispatching monolithically anyway is an invalid dispatch: split, or do it yourself.
- SPEC: every dispatched unit carries objective, write_scope, verify_commands, acceptance, size_estimate, context_paths, rollback, dependencies — written before work starts. Missing any field is undispatchable.
- CHECK: verifier is not the maker. Run each unit's verify commands fresh in your own context; never accept a worker's reported output or completeness claims. A verify failure rejects the unit: record the failure, re-dispatch with the evidence.
- FENCE: parallel units need disjoint write scopes, confirmed by comparing write_scope declarations literally — never inferred from topic. Overlap forces serialization.

Full doctrine: skill://task-decomposition — sizing calibration, the dispatch contract, rejection rules, repair-retry. Refuse monolithic dispatches: size, specify, then dispatch or refuse.`

// ═══════════════════════════════════════════════════════════
// 4. DECIDE — total: every input maps to a named verdict
// ═══════════════════════════════════════════════════════════

const dispatchIsBlocked = (cmd: CheckDispatchCommand): boolean =>
  cmd.gateEnabled && isDelegatorTool(cmd.toolName) && !cmd.doctrineLoaded

export const decideDispatchDoctrine = (cmd: CheckDispatchCommand): DispatchDoctrineVerdict =>
  Match.value(dispatchIsBlocked(cmd)).pipe(
    Match.when(true, () => new DeliverDoctrine({ reason: DOCTRINE_KERNEL })),
    Match.when(false, () => new Allow()),
    Match.exhaustive,
  )
