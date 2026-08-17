/**
 * The fleet — the agent-native introspection surface (R15): lists live and
 * ledgered containers with their port maps and bounded log tails.
 *
 * Derivation rule (R15, U8 step 2): the fleet derives over the live
 * registry (the in-process rows `ContainerHandle.fromRunning` records) +
 * the on-disk hygiene ledger (this run's entries) + `SandboxRuntime`
 * inspect/logs — it adds NO new backend methods.
 *
 * Rows:
 * - `live` — from the registry: full portrait (name, image, port map,
 *   state `running`), with a bounded tail fetched through the runtime;
 * - `ledger` — from this run's ledger entries that carry a recorded
 *   backend id (the ledger is names-only by design, so image and ports are
 *   not recorded there); their state comes from a live `inspect` and their
 *   tail from `logs`. A ledger row that is also in the registry is
 *   de-duplicated against the live row (the registry row wins; the ledger
 *   lacks image/ports).
 *
 * Every backend read here is best-effort: an inspect or logs failure
 * degrades the row (state `unknown`, empty tail) instead of failing the
 * whole listing — the fleet is a diagnostics surface.
 */
import { Effect, HashSet } from 'effect'
import { Option } from 'effect'

import { type LedgerEntry, readLedgerEntries } from '../lifecycle/hygiene/ledger.js'
import type { ContainerSpec } from '../model/container-spec.js'
import { BackendError } from '../model/errors.js'
import type { PortBinding } from '../model/ports.js'
import { newContainerSpec } from '../model/spec-combinators.js'
import { cacheDirFromConfig, RightsizeConfig } from '../runtime/config.js'
import { RunId } from '../runtime/run-id.js'
import type { BackendName, ContainerInspect, SandboxHandle } from '../runtime/runtime.js'
import { SandboxRuntime } from '../runtime/runtime.js'

import { listLiveContainers } from './registry.js'

/** The published host address — every port binds loopback-only (R9). */
export const FLEET_HOST = '127.0.0.1'

/** One fleet row. */
export interface FleetContainer {
  /** Whether the row came from the live registry or this run's on-disk ledger. */
  readonly source: 'live' | 'ledger'
  readonly backend: BackendName
  /** The run-scoped container name («rz-<runId>-<seq>») — the ledger's kill key. */
  readonly name: string
  /** The backend-native container id (id-less ledger markers are skipped, never emitted). */
  readonly id: string
  /** The image the container was launched from — only the live registry records it; ledger rows carry `''`. */
  readonly image: string
  /** Always `127.0.0.1`. */
  readonly host: string
  /** Live rows are always `running`; ledger rows carry the live inspect's verdict. */
  readonly state: 'running' | 'stopped' | 'missing' | 'unknown'
  /** The recorded port map (live rows); ledger rows carry `[]` (the ledger is names-only). */
  readonly ports: ReadonlyArray<PortBinding>
  /** The bounded log tail, most-recent line last; `[]` when the backend read failed. */
  readonly logTail: ReadonlyArray<string>
}

/** The default fleet tail budget — 50 lines, matching the reaper's diagnostic tail. */
export const FLEET_TAIL_LINES = 50

const keyFor = (backend: string, id: string): string => `${backend}:${id}`

/** Splits a backend logs snapshot into at most `budget` most-recent lines. */
export const boundedTail = (logsText: string, budget: number): ReadonlyArray<string> => {
  const lines = logsText.split(/\r?\n/)
  while (lines.length > 0 && (lines[lines.length - 1] ?? '') === '') {
    lines.pop()
  }
  return lines.slice(Math.max(0, lines.length - budget))
}

/** The shell handle the fleet probes with — the inert-spec convention from by-id reconstruction (no spec dereferenced). */
const SHELL: ContainerSpec = { ...newContainerSpec('', ''), name: 'fleet' }

const shellHandle = (id: string): SandboxHandle => ({ id, spec: SHELL })

/** Inspect that degrades to `undefined` instead of failing the listing. */
const safeInspect = (
  effect: Effect.Effect<ContainerInspect, BackendError>,
): Effect.Effect<ContainerInspect | undefined> => effect.pipe(Effect.option, Effect.map(Option.getOrUndefined))

/** A bounded log tail fetch that degrades to `[]` instead of failing the listing. */
const safeLogTail = (
  effect: Effect.Effect<string, BackendError>,
  budget: number,
): Effect.Effect<ReadonlyArray<string>> =>
  effect.pipe(Effect.option, Effect.map((value) => (Option.isNone(value) ? [] : boundedTail(value.value, budget))))

const inspectState = (inspect: ContainerInspect | undefined): FleetContainer['state'] =>
  inspect === undefined
    ? 'unknown'
    : !inspect.exists
    ? 'missing'
    : inspect.running
    ? 'running'
    : 'stopped'

/**
 * Lists live + ledger containers with port maps and bounded log tails.
 * Best effort per row; the listing itself never fails — a backend that
 * cannot be read yields `unknown`/empty rows.
 */
export const listFleetContainers = (
  options: { readonly tailLines?: number | undefined } = {},
): Effect.Effect<ReadonlyArray<FleetContainer>, never, SandboxRuntime | RightsizeConfig> =>
  Effect.gen(function*() {
    const runtime = yield* SandboxRuntime
    const config = yield* RightsizeConfig
    const budget = options.tailLines ?? FLEET_TAIL_LINES

    // Live registry rows — full portrait, always 'running' (the registry
    // holds only started containers; the diagnostics invariant). Tails are
    // independent backend reads, so they run concurrently; `forEach`
    // preserves insertion order for the assembled rows.
    const live = listLiveContainers()
    const liveTails = yield* Effect.forEach(
      live,
      (row) => safeLogTail(runtime.logs(shellHandle(row.id)), budget),
      { concurrency: 'unbounded' },
    )
    const rows: FleetContainer[] = live.map((row, index) => ({
      source: 'live',
      backend: row.backend,
      name: row.name,
      id: row.id,
      image: row.image,
      host: FLEET_HOST,
      state: 'running',
      ports: [...row.ports],
      logTail: liveTails[index] ?? [],
    }))
    let seen = HashSet.empty<string>()
    for (const row of live) {
      seen = HashSet.add(seen, keyFor(row.backend, row.id))
    }

    // Ledger rows — names + recorded ids from this run's entries, state and
    // log tail from the backend; the inspect+tail pair per row is an
    // independent read, so rows resolve concurrently.
    const cacheDir = cacheDirFromConfig(config)
    const entries = (yield* Effect.promise(() => readLedgerEntries(cacheDir, RunId.value)))
      .filter((entry): entry is Extract<LedgerEntry, { readonly kind: 'sandbox' }> => entry.kind === 'sandbox')
      .flatMap((entry): Array<Extract<LedgerEntry, { readonly kind: 'sandbox' }> & { readonly id: string }> => {
        const id = entry.id
        return id !== undefined && id !== '' ? [{ ...entry, id }] : []
      })
      .filter((entry) => !HashSet.has(seen, keyFor(entry.backend, entry.id)))
    const ledgerPortraits = yield* Effect.forEach(
      entries,
      (entry) => {
        const handle = shellHandle(entry.id)
        return Effect.all({
          inspect: safeInspect(runtime.inspect(handle)),
          logTail: safeLogTail(runtime.logs(handle), budget),
        })
      },
      { concurrency: 'unbounded' },
    )
    for (const [index, entry] of entries.entries()) {
      const portrait = ledgerPortraits[index]
      if (portrait === undefined) {
        continue
      }
      rows.push({
        source: 'ledger',
        backend: entry.backend,
        name: entry.name,
        id: entry.id ?? '',
        image: '',
        host: FLEET_HOST,
        state: inspectState(portrait.inspect),
        ports: [],
        logTail: portrait.logTail,
      })
    }
    return rows
  })
