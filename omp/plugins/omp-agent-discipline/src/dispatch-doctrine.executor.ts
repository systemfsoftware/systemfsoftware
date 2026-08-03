/**
 * Executor cell — I/O shell for the dispatch-doctrine gate.
 *
 * One operation: `runDispatchDoctrineCheck` reads `dispatch_doctrine_skills`
 * from the merged TOML config through the shared `TomlLoader`, composes the
 * pure decision (`decideDispatchDoctrine`, private) with the loaded state,
 * and returns both the skills list (the handler caches it for read-tracking)
 * and the gate result. Absent or empty skills disable the gate per R6.
 *
 * The decision core lives here with its only production consumer: the
 * verdict is a total decision with no error channel (a bare tagged union),
 * so it is not a workflow under the project doctrine. `DOCTRINE_KERNEL` is
 * the compile-time constant carried by `DeliverDoctrine.reason`; the
 * drift-guard test equality-compares it against the marked excerpt in the
 * skill file. The pure matchers the handler needs (`extractSpecShape`,
 * `matchesDoctrineSkillPath`) are re-exposed through `dispatchDoctrinePure`
 * because a handler may import only the transport, schema codecs, and its
 * single executor.
 */

import type { PlatformError } from '@effect/platform/Error'
import { TomlLoader } from '@systemfsoftware/omp-utils'
import type { TomlConfig } from '@systemfsoftware/omp-utils'
import { Context, Effect, Match } from 'effect'
import * as S from 'effect/Schema'

import { extractSpecShape, isDelegatorTool, matchesDoctrineSkillPath } from './dispatch-doctrine.kernel.js'

// ═══════════════════════════════════════════════════════════
// 0. DEPENDENCIES — consumer-owned tag
// ═══════════════════════════════════════════════════════════

export class DispatchDoctrineExecutorDeps extends Context.Tag('DispatchDoctrineExecutorDeps')<
  DispatchDoctrineExecutorDeps,
  Context.Tag.Service<TomlLoader>
>() {}

// ═══════════════════════════════════════════════════════════
// 1. COMMAND + VERDICT — decision core (private)
// ═══════════════════════════════════════════════════════════

const CheckDispatchCommandTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/omp-agent-discipline/CheckDispatchCommand',
)

class CheckDispatchCommand extends S.TaggedClass<CheckDispatchCommand>()('CheckDispatchCommand', {
  toolName: S.String,
  doctrineLoaded: S.Boolean,
  gateEnabled: S.Boolean,
}) {
  readonly [CheckDispatchCommandTypeId] = CheckDispatchCommandTypeId
}

const DispatchDoctrineVerdictTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/omp-agent-discipline/DispatchDoctrineVerdict',
)

class Allow extends S.TaggedClass<Allow>()('Allow', {}) {
  readonly [DispatchDoctrineVerdictTypeId] = DispatchDoctrineVerdictTypeId
}

class DeliverDoctrine extends S.TaggedClass<DeliverDoctrine>()('DeliverDoctrine', {
  reason: S.String,
}) {
  readonly [DispatchDoctrineVerdictTypeId] = DispatchDoctrineVerdictTypeId
}

const DispatchDoctrineVerdict = S.Union(Allow, DeliverDoctrine)
type DispatchDoctrineVerdict = S.Schema.Type<typeof DispatchDoctrineVerdict>

// ═══════════════════════════════════════════════════════════
// 2. DOCTRINE KERNEL — compile-time constant carried by DeliverDoctrine
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
// 3. DECIDE — total: every input maps to a named verdict
// ═══════════════════════════════════════════════════════════

const dispatchIsBlocked = (cmd: CheckDispatchCommand): boolean =>
  cmd.gateEnabled && isDelegatorTool(cmd.toolName) && !cmd.doctrineLoaded

const decideDispatchDoctrine = (cmd: CheckDispatchCommand): DispatchDoctrineVerdict =>
  Match.value(dispatchIsBlocked(cmd)).pipe(
    Match.when(true, () => new DeliverDoctrine({ reason: DOCTRINE_KERNEL })),
    Match.when(false, () => new Allow()),
    Match.exhaustive,
  )

export type DispatchGateResult = { readonly block: true; readonly reason: string } | undefined

const gateResult = (verdict: DispatchDoctrineVerdict): DispatchGateResult =>
  Match.value(verdict).pipe(
    Match.tag('DeliverDoctrine', (v) => ({ block: true as const, reason: v.reason })),
    Match.tag('Allow', () => undefined),
    Match.exhaustive,
  )

const readDoctrineSkills = (
  cwd: string,
): Effect.Effect<readonly string[], PlatformError, DispatchDoctrineExecutorDeps> =>
  Effect.gen(function*() {
    const loader = yield* DispatchDoctrineExecutorDeps
    const config: TomlConfig = yield* loader.load(cwd)
    return config['dispatch_doctrine_skills'] ?? []
  })

// ═══════════════════════════════════════════════════════════
// 4. SINGLE OPERATION
// ═══════════════════════════════════════════════════════════

export type DispatchDoctrineCheck = {
  readonly skills: readonly string[]
  readonly gate: DispatchGateResult
}

export function runDispatchDoctrineCheck(
  cwd: string,
  toolName: string,
  doctrineLoaded: boolean,
): Effect.Effect<DispatchDoctrineCheck, PlatformError, DispatchDoctrineExecutorDeps> {
  return Effect.gen(function*() {
    const skills = yield* readDoctrineSkills(cwd)
    const cmd = new CheckDispatchCommand({
      toolName,
      doctrineLoaded,
      gateEnabled: skills.length > 0,
    })
    return { skills, gate: gateResult(decideDispatchDoctrine(cmd)) }
  })
}

// ═══════════════════════════════════════════════════════════
// 5. PURE MATCHERS — re-exposed for the handler's single import
// ═══════════════════════════════════════════════════════════

export const dispatchDoctrinePure = { extractSpecShape, matchesDoctrineSkillPath } as const
