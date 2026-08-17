/**
 * Structured failure diagnostics (R15) — the typed `DiagnosticsReport`
 * (model/diagnostics.ts, R2) built from the live registry, plus a
 * pure renderer replacing upstream's string-only report.
 *
 * The report invariant (upstream's own at the fork point, recorded in the
 * schema): membership and `state` come from the live-container registry —
 * the in-process rows `ContainerHandle.fromRunning` records — never from a
 * backend query. The only backend edge is the per-container bounded log
 * tail (upstream fetches `getLogs` the same way); a logs failure degrades
 * the row to an empty tail rather than failing the report, which exists to
 * diagnose failures.
 *
 * The renderer is a pure, deterministic text projection. Losslessness
 * contract: every row's name, image, state, host, every port binding and
 * every log line appears in the output, in order — nothing is dropped or
 * elided.
 */
import { Effect, Option } from 'effect'

import { type DiagnosticsContainer, DiagnosticsReport } from '../model/diagnostics.js'
import { newContainerSpec } from '../model/spec-combinators.js'
import { SandboxRuntime } from '../runtime/runtime.js'
import { boundedTail, FLEET_HOST } from './fleet.js'
import { listLiveContainers } from './registry.js'

/** The diagnostic tail budget — 50 lines, matching the reaper's tail. */
export const DIAGNOSTICS_TAIL_LINES = 50

/** The inert spec for the tail probe — the same convention as by-id reconstruction (no spec dereferenced). */
const SHELL = { ...newContainerSpec('', ''), name: 'diagnostics' }

/**
 * The typed diagnostics report over every container this process currently
 * has running (live registry, in start order), with a bounded log tail per
 * container. Never fails: a backend that cannot answer yields an empty tail.
 */
export const reportDiagnostics: Effect.Effect<DiagnosticsReport, never, SandboxRuntime> = Effect.gen(function*() {
  const runtime = yield* SandboxRuntime
  const containers: DiagnosticsContainer[] = []
  for (const live of listLiveContainers()) {
    const tail = yield* runtime.logs({ id: live.id, spec: SHELL }).pipe(
      Effect.option,
      Effect.map((value) => (Option.isNone(value) ? [] : boundedTail(value.value, DIAGNOSTICS_TAIL_LINES))),
    )
    containers.push({
      name: live.name,
      image: live.image,
      state: 'running',
      host: FLEET_HOST,
      ports: [...live.ports],
      logTailLines: tail,
    })
  }
  return { containers }
})

/**
 * The pure text renderer — one block per container in report order, every
 * field projected losslessly (see the module doc's losslessness contract).
 */
export const renderDiagnostics = (report: DiagnosticsReport): string => {
  const lines: string[] = []
  lines.push(`rightsize diagnostics — ${report.containers.length} running container(s)`)
  if (report.containers.length === 0) {
    return lines.join('\n')
  }
  report.containers.forEach((container, index) => {
    lines.push('')
    lines.push(`#${index + 1} ${container.image} — ${container.state} on ${container.host}`)
    lines.push(`  name: ${container.name}`)
    lines.push('  ports:')
    if (container.ports.length === 0) {
      lines.push('    (none)')
    }
    for (const binding of container.ports) {
      lines.push(`    ${binding.guestPort}/tcp -> ${container.host}:${binding.hostPort}`)
    }
    lines.push('  log tail:')
    if (container.logTailLines.length === 0) {
      lines.push('    (empty)')
    }
    for (const line of container.logTailLines) {
      lines.push(`    ${line}`)
    }
  })
  return lines.join('\n')
}
