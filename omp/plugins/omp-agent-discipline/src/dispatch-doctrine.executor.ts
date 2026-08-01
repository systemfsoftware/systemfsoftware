/**
 * Executor cell — I/O shell for the dispatch-doctrine gate.
 *
 * Reads `dispatch_doctrine_skills` from the merged TOML config through
 * the shared `TomlLoader`, returning the skill list. Absent or empty
 * disables the gate per R6 — the handler checks `skills.length > 0` to
 * know whether to fire. Mirrors `no-skill-delegation.executor.ts` shape
 * (`Effect.gen`, `yield* TomlLoader`, sandwiched read).
 *
 * The executor is the only cell that owns the `TomlLoader` dependency
 * for this gate; the handler imports the function and does not touch
 * the loader itself.
 */

import type { PlatformError } from '@effect/platform/Error'
import { TomlLoader } from '@systemfsoftware/omp-utils'
import type { TomlConfig } from '@systemfsoftware/omp-utils'
import { Effect, Match } from 'effect'

import { CheckDispatchCommand, decideDispatchDoctrine } from './dispatch-doctrine.workflow.js'
import type { DispatchDoctrineVerdict } from './dispatch-doctrine.workflow.js'

export function runDispatchDoctrineConfig(
  cwd: string,
): Effect.Effect<readonly string[], PlatformError, TomlLoader> {
  return Effect.gen(function*() {
    const loader = yield* TomlLoader
    const config: TomlConfig = yield* loader.load(cwd)
    return config['dispatch_doctrine_skills'] ?? []
  })
}

export type DispatchGateResult = { readonly block: true; readonly reason: string } | undefined

const gateResult = (verdict: DispatchDoctrineVerdict): DispatchGateResult =>
  Match.value(verdict).pipe(
    Match.tag('DeliverDoctrine', (v) => ({ block: true as const, reason: v.reason })),
    Match.tag('Allow', () => undefined),
    Match.exhaustive,
  )

export function runDispatchDoctrineGate(
  cwd: string,
  toolName: string,
  doctrineLoaded: boolean,
): Effect.Effect<DispatchGateResult, PlatformError, TomlLoader> {
  return Effect.gen(function*() {
    const skills = yield* runDispatchDoctrineConfig(cwd)
    const cmd = new CheckDispatchCommand({
      toolName,
      doctrineLoaded,
      gateEnabled: skills.length > 0,
    })
    return gateResult(decideDispatchDoctrine(cmd))
  })
}
