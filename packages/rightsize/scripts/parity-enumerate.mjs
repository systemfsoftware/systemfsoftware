#!/usr/bin/env node
/// <reference types="node" />
/**
 * parity-enumerate.mjs — the testcontainers parity manifest (R16).
 *
 * The public type surface of `testcontainers@12.1.0` is committed FROZEN in
 * `scripts/parity-surface.mjs` — the record. The workspace no longer
 * installs testcontainers (removed 2026-08-16); per the W8 reversing
 * observation (docs/solutions/tooling-decisions/rightsize-own-effect-port.md),
 * the frozen snapshot pins the incumbent's shape the matrix was proven
 * against, so a deliberate future re-comparison is one command, not
 * archaeology. The snapshot was originally enumerated from the installed
 * package's emitted `.d.ts`; `--update-surface` re-derives it from a live
 * install when one is re-added. The matrix renders one row per member, each
 * classified `present` (rightsize exports the same contract) or
 * `superseded-by` (an Effect-native replacement exists and the row
 * documents it; nothing is silently absent).
 *
 * Drift gates (`--check`, wired into `build`):
 *   1. When the pinned package IS found in the pnpm virtual store, gate 0
 *      re-enumerates its `.d.ts` and byte-compares with the committed frozen
 *      surface `scripts/parity-surface.mjs` — a dependency bump that changes
 *      the surface fails here, naming the differing members. When absent
 *      (post-removal), the frozen surface is the record and this gate is
 *      skipped. The frozen surface is a generated JS module (not JSON), so
 *      the gate never parses.
 *   2. Gate 2 re-renders the matrix from the frozen surface + the committed
 *      mapping and byte-compares it with the committed `docs/parity-matrix.md`
 *      — any manual edit of a matrix row (or a mapping/surface edit without
 *      a matching render) fails here, naming the drifting rows.
 *   3. Gate 3: every `src/...` path a MAPPING row names (in `rs` or
 *      `note`) must exist on disk — an M mapping renamed-away file fails here,
 *      so the matrix can never document a dead path.
 *   4. Gate 4: every `present` row's rightsize symbol (the backticked
 *      identifiers in `rs`) must exist in the current published surface —
 *      parsed from the committed api-extractor reports
 *      (`etc/rightsize.api.md`, `etc/modules.api.md`,
 *      `etc/backend-docker.api.md`, `etc/backend-msb.api.md`). This kills
 *      the 'mapping lies green' class: a mapping row cannot name a symbol
 *      the package does not export.
 *
 * Modes:
 *  --check          (default) the drift gates; exit 1 naming the drift.
 *  --write          re-render `docs/parity-matrix.md` from current state.
 *  --update-surface re-derive `scripts/parity-surface.mjs` from an
 *                   installed `.d.ts` (intentional surface refresh; needs
 *                   the pinned package present).
 *
 * Every enumerated member MUST have a mapping row; an unmapped member is a
 * hard error (exit 2), so the committed matrix can never silently forget a
 * new export.
 */
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { surface as FROZEN_SURFACE } from './parity-surface.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = path.resolve(SCRIPT_DIR, '..')
const REPO_ROOT = path.resolve(PKG_ROOT, '../..')
const MATRIX_PATH = path.join(PKG_ROOT, 'docs', 'parity-matrix.md')
const SURFACE_PATH = path.join(SCRIPT_DIR, 'parity-surface.mjs')

const TESTCONTAINERS_VERSION = '12.1.0'

/**
 * @typedef {{ status: 'present' | 'superseded-by', rs: string | null, note: string }} MatrixRow
 * @typedef {{ id: string, title: string, file: string, members: string[] }} SurfaceSection
 * @typedef {{ generator: string, testcontainers: string, sections: SurfaceSection[] }} Surface
 */

// ---------------------------------------------------------------------------
// locating the installed testcontainers build directory
// ---------------------------------------------------------------------------

/** @returns {string | null} The build dir of the installed testcontainers, or null when absent. */
const findTestcontainersBuild = () => {
  /** @type {string[]} */
  const candidates = []
  const pnpmDir = path.join(REPO_ROOT, 'node_modules', '.pnpm')
  /** @type {string[]} */
  let pnpmEntries = []
  try {
    pnpmEntries = fs.readdirSync(pnpmDir)
  } catch {
    pnpmEntries = []
  }
  for (const entry of pnpmEntries) {
    if (entry.startsWith('testcontainers@')) {
      candidates.push(path.join(pnpmDir, entry, 'node_modules', 'testcontainers', 'build'))
    }
  }
  // Hoisted layouts (an install without a pnpm virtual store).
  candidates.push(path.join(REPO_ROOT, 'node_modules', 'testcontainers', 'build'))
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'index.d.ts'))) return candidate
  }
  return null
}

// ---------------------------------------------------------------------------
// enumeration — mechanical extraction of the public surface from `.d.ts`
// ---------------------------------------------------------------------------

/** `export { A, B as C, D } from "..."` → the EXPORTED names (C, not B). @param {string} text @returns {string[]} */
const parseExportNames = (text) => {
  /** @type {string[]} */
  const names = []
  const re = /export\s*\{([\s\S]*?)\}\s*from\s*["'][^"']+["']/g
  /** @type {RegExpExecArray | null} */
  let m = null
  while ((m = re.exec(text)) !== null) {
    for (const raw of m[1].split(',')) {
      const part = raw.trim()
      if (part === '') continue
      const asIndex = part.indexOf(' as ')
      names.push(asIndex === -1 ? part : part.slice(asIndex + 4).trim())
    }
  }
  return names
}

/** `export type X` → X. @param {string} text @returns {string[]} */
const parseTypeAliasNames = (text) => {
  /** @type {string[]} */
  const names = []
  const re = /export\s+type\s+([A-Za-z_$][\w$]*)/g
  /** @type {RegExpExecArray | null} */
  let m = null
  while ((m = re.exec(text)) !== null) names.push(m[1])
  return names
}

/** Public member names of one class/interface block body (dedup'd, order-preserving). @param {string} body @returns {string[]} */
const parseMemberNames = (body) => {
  /** @type {string[]} */
  const names = []
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim()
    if (line === '') continue
    if (/^(protected|private)\b/.test(line)) continue
    /** @type {string | null} */
    let name = null
    const method = /^(?:static\s+)?(?:async\s+)?(?:get\s+)?([A-Za-z_$][\w$]*)\s*(\?)?\s*\(/.exec(line)
    if (method !== null) {
      name = method[1]
    } else if (/^\[Symbol\.asyncDispose\]\s*\(/.test(line)) {
      name = '[Symbol.asyncDispose]'
    }
    if (name === null || name === 'constructor' || name === 'new') continue
    if (!names.includes(name)) names.push(name)
  }
  return names
}

/** Split `export declare class|interface X` blocks; returns `{ className, headerEnd, members }[]` in file order. @param {string} text @returns {Array<{ className: string, headerEnd: number, members: string[] }>} */
const parseClassBlocks = (text) => {
  /** @type {Array<{ className: string, headerEnd: number, members: string[] }>} */
  const blocks = []
  const re = /^export\s+(?:declare\s+)?(?:class|interface)\s+([A-Za-z_$][\w$]*)/gm
  /** @type {RegExpExecArray | null} */
  let m = null
  while ((m = re.exec(text)) !== null) {
    blocks.push({ className: m[1], headerEnd: re.lastIndex, members: [] })
  }
  for (let i = 0; i < blocks.length; i++) {
    const start = blocks[i].headerEnd
    // The member body runs from the header end to the class's closing brace —
    // brace-depth scan, because `extends AsyncDisposable {` bodies can nest.
    let depth = 0
    let end = text.length
    for (let j = start; j < text.length; j++) {
      const ch = text[j]
      if (ch === '{') depth += 1
      else if (ch === '}') {
        depth -= 1
        if (depth === 0) {
          end = j
          break
        }
      }
    }
    blocks[i].members = parseMemberNames(text.slice(start, end))
  }
  return blocks
}

/** @param {string} buildDir @param {string} file @returns {string} */
const readText = (buildDir, file) => fs.readFileSync(path.join(buildDir, file), 'utf8')

/** Where a class/interface surface lives: file, kind, and the block names to take. */
const SURFACE_SECTIONS = [
  { id: 'index', title: 'Top-level exports (`build/index.d.ts`)', file: 'index.d.ts', kind: 'exports' },
  {
    id: 'generic-container',
    title: '`GenericContainer` members (`build/generic-container/generic-container.d.ts`)',
    file: 'generic-container/generic-container.d.ts',
    kind: 'classes',
    classes: ['GenericContainer'],
  },
  {
    id: 'generic-container-builder',
    title: '`GenericContainerBuilder` members (`build/generic-container/generic-container-builder.d.ts`)',
    file: 'generic-container/generic-container-builder.d.ts',
    kind: 'classes',
    classes: ['GenericContainerBuilder'],
  },
  {
    id: 'test-container',
    title: '`TestContainer` interface members (`build/test-container.d.ts`)',
    file: 'test-container.d.ts',
    kind: 'classes',
    classes: ['TestContainer'],
  },
  {
    id: 'started-test-container',
    title: '`StartedTestContainer` members (`build/test-container.d.ts`)',
    file: 'test-container.d.ts',
    kind: 'classes',
    classes: ['StartedTestContainer'],
  },
  {
    id: 'stopped-test-container',
    title: '`StoppedTestContainer` members (`build/test-container.d.ts`)',
    file: 'test-container.d.ts',
    kind: 'classes',
    classes: ['StoppedTestContainer'],
  },
  {
    id: 'network',
    title: '`Network` / `StartedNetwork` / `StoppedNetwork` members (`build/network/network.d.ts`)',
    file: 'network/network.d.ts',
    kind: 'classes',
    classes: ['Network', 'StartedNetwork', 'StoppedNetwork'],
  },
  {
    id: 'test-containers',
    title: '`TestContainers` statics (`build/test-containers.d.ts`)',
    file: 'test-containers.d.ts',
    kind: 'classes',
    classes: ['TestContainers'],
  },
  {
    id: 'docker-compose-environment',
    title: '`DockerComposeEnvironment` members (`build/docker-compose-environment/docker-compose-environment.d.ts`)',
    file: 'docker-compose-environment/docker-compose-environment.d.ts',
    kind: 'classes',
    classes: ['DockerComposeEnvironment'],
  },
  {
    id: 'socat-container',
    title: '`SocatContainer` members (`build/socat/socat-container.d.ts`)',
    file: 'socat/socat-container.d.ts',
    kind: 'classes',
    classes: ['SocatContainer'],
  },
  {
    id: 'wait',
    title: '`Wait` statics (`build/wait-strategies/wait.d.ts`)',
    file: 'wait-strategies/wait.d.ts',
    kind: 'classes',
    classes: ['Wait'],
  },
  {
    id: 'wait-strategy',
    title: '`WaitStrategy` interface members (`build/wait-strategies/wait-strategy.d.ts`)',
    file: 'wait-strategies/wait-strategy.d.ts',
    kind: 'classes',
    classes: ['WaitStrategy'],
  },
  { id: 'types', title: 'Type aliases (`build/types.d.ts`)', file: 'types.d.ts', kind: 'types' },
]

/** The full enumeration: `{ sections: [{ id, title, members }], version }`. @param {string} buildDir @returns {Surface} */
const enumerateSurface = (buildDir) => {
  /** @type {SurfaceSection[]} */
  const sections = []
  for (const section of SURFACE_SECTIONS) {
    const text = readText(buildDir, section.file)
    /** @type {string[]} */
    let members = []
    if (section.kind === 'exports') {
      members = parseExportNames(text)
    } else if (section.kind === 'types') {
      members = parseTypeAliasNames(text)
    } else {
      const wanted = new Set(section.classes)
      const blocks = parseClassBlocks(text).filter((block) => wanted.has(block.className))
      const found = new Set(blocks.map((block) => block.className))
      const missing = section.classes.filter((name) => !found.has(name))
      if (missing.length > 0) {
        throw new Error(
          `surface drift: ${section.file} no longer declares ${missing.join(', ')} — ` +
            `testcontainers changed its shape; refresh with --update-surface after reviewing`,
        )
      }
      for (const block of blocks) members.push(...block.members)
      members = [...new Set(members)]
    }
    sections.push({ id: section.id, title: section.title, file: section.file, members })
  }
  return { generator: 'scripts/parity-enumerate.mjs', testcontainers: TESTCONTAINERS_VERSION, sections }
}

// ---------------------------------------------------------------------------
// the committed semantic mapping: every enumerated member → status + target
// ---------------------------------------------------------------------------
// Status vocabulary: `present` (rightsize exports the same contract under
// this name or the named canonical member) / `superseded-by` (the rightsize
// column documents the Effect-native replacement; the note says why).
// Symbol reference format: `Symbol (src/path.ts)` or `Name (public subpath)`.
// A null `rs` means "no counterpart in scope" — the note must still state why.

/** @type {Record<string, MatrixRow>} */
export const MAPPING = {
  'index::IntervalRetry': {
    status: 'superseded-by',
    rs: '`Effect.retry` / `Effect.schedule` (Effect dependency)',
    note:
      "Upstream's bounded-retry helper class; the port-bind conflict loop retries with the same bounded semantics via Effect combinators (src/lifecycle/launch.ts).",
  },
  'index::RandomUuid': {
    status: 'superseded-by',
    rs: '`RunId` (src/runtime/run-id.ts)',
    note: 'One per-process run identity labels containers/ledger entries; no per-call UUID objects.',
  },
  'index::Retry': {
    status: 'superseded-by',
    rs: '`Effect.retry` / `Effect.schedule`',
    note: 'Retry is an Effect combinator, not a class.',
  },
  'index::Uuid': {
    status: 'superseded-by',
    rs: '`RunId` (src/runtime/run-id.ts)',
    note: 'Session-scoped identity replaces UUID classes.',
  },
  'index::log': {
    status: 'superseded-by',
    rs: '`Effect` logger / `reportDiagnostics` (src/fleet/diagnostics.ts)',
    note: 'Structured Effect logging + the typed diagnostics report replace the logcat builder.',
  },
  'index::randomUuid': {
    status: 'superseded-by',
    rs: '`RunId` (src/runtime/run-id.ts)',
    note: 'See `RandomUuid`.',
  },
  'index::ContainerRuntimeClient': {
    status: 'superseded-by',
    rs: '`ContainerHandle.byId` (src/fleet/handle.ts) + `SandboxRuntime` (src/runtime/runtime.ts)',
    note:
      'KTD7: the mutable docker-flavored client is replaced by sealed service tags and a durable JSON-threadable handle; upstream has no parity obligation for its internal client.',
  },
  'index::ImageName': {
    status: 'superseded-by',
    rs: '`ImageReference` (src/model/docker-image-name.ts)',
    note: 'Schema-decoded immutable reference with the module compatibility gate.',
  },
  'index::getContainerRuntimeClient': {
    status: 'superseded-by',
    rs: '`layerDocker` / `layerMsb` / `layerAuto` (src/runtime/selection.workflow.ts)',
    note: 'Backend access is Layer composition; there is no import-time global client.',
  },
  'index::DockerComposeEnvironment': {
    status: 'superseded-by',
    rs:
      '`GenericContainer` per service + `VirtualNetworks.ensureNetwork` + `withNetwork` (src/generic-container.ts, src/runtime/runtime.ts)',
    note:
      'No compose-file surface is in scope (the enumerated matrix is the closed set for this PR; compose is follow-up work).',
  },
  'index::DownedDockerComposeEnvironment': {
    status: 'superseded-by',
    rs: 'compose-free lifecycle: `GenericContainer` + the teardown executor (src/lifecycle/teardown.workflow.ts)',
    note: 'See `DockerComposeEnvironment`.',
  },
  'index::StartedDockerComposeEnvironment': {
    status: 'superseded-by',
    rs: '`fromImage(...).withNetwork(id).start()` per service (src/generic-container.ts)',
    note: 'See `DockerComposeEnvironment`.',
  },
  'index::StoppedDockerComposeEnvironment': {
    status: 'superseded-by',
    rs: '`RunningContainer.stop` / `remove` (src/generic-container.ts)',
    note: 'See `DockerComposeEnvironment`.',
  },
  'index::AbstractStartedContainer': {
    status: 'superseded-by',
    rs: '`RunningContainer` (src/generic-container.ts)',
    note: 'The dual-surface running handle is an interface, not an inheritable class.',
  },
  'index::AbstractStoppedContainer': {
    status: 'superseded-by',
    rs: '`RunningContainer.stop` / `remove` (src/generic-container.ts)',
    note: 'Stop is idempotent and final; no separate stopped object exists.',
  },
  'index::GenericContainer': {
    status: 'present',
    rs: '`GenericContainer` (src/generic-container.ts)',
    note: 'Same name; immutable copy-on-write chain; `start()` returns an Effect.',
  },
  'index::BuildOptions': {
    status: 'superseded-by',
    rs: '`fromImage` (src/generic-container.ts) + module presets (src/modules)',
    note: 'No dockerfile build surface; images come pre-built or from the module catalog.',
  },
  'index::GenericContainerBuilder': {
    status: 'superseded-by',
    rs: '`fromImage` (src/generic-container.ts)',
    note: 'See `BuildOptions`.',
  },
  'index::Network': {
    status: 'superseded-by',
    rs: '`VirtualNetworks.ensureNetwork(id)` (src/runtime/runtime.ts)',
    note: "The network's identity is the caller-chosen id; `NetworkSpec` (src/model/network.ts) is the data.",
  },
  'index::StartedNetwork': {
    status: 'superseded-by',
    rs: 'the network `id` (passed to `ensureNetwork` / `withNetwork`)',
    note: 'No wrapper object; the started network IS its id.',
  },
  'index::StoppedNetwork': {
    status: 'superseded-by',
    rs: '`VirtualNetworks.removeNetwork(id)` (src/runtime/runtime.ts)',
    note: 'Removal is finalizer-ordered and idempotent.',
  },
  'index::getReaper': {
    status: 'superseded-by',
    rs: '`reap` (src/fleet/reap.ts) + `RIGHTSIZE_REAPER` config',
    note: 'No Ryuk sidecar: the on-disk names-only ledger, sync-exit registry and detached watchdog own reaping.',
  },
  'index::SocatContainer': {
    status: 'superseded-by',
    rs: '`withNetworkAliases` + `withExposedPorts` (src/generic-container.ts); msb network tunnels (backend-msb)',
    note: 'No socat port-forwarder surface; aliases and tunnel emulation cover the reachability contract.',
  },
  'index::StartedSocatContainer': {
    status: 'superseded-by',
    rs: '`RunningContainer` (src/generic-container.ts)',
    note: 'See `SocatContainer`.',
  },
  'index::RestartOptions': {
    status: 'superseded-by',
    rs: 'teardown + re-launch (`stop` then `start`)',
    note: 'Restart is a fresh launch; no restart options object.',
  },
  'index::StartedTestContainer': {
    status: 'superseded-by',
    rs: '`RunningContainer` (src/generic-container.ts)',
    note:
      'Member mapping in the `StartedTestContainer` section; missing members (restart/commit) map to checkpoints/lifecycle.',
  },
  'index::StopOptions': {
    status: 'superseded-by',
    rs: '`RunningContainer.stop` / `remove` (src/generic-container.ts)',
    note: 'Teardown is finalizer-ordered and always removes (R5); named volumes are not modeled, so no options object.',
  },
  'index::StoppedTestContainer': {
    status: 'superseded-by',
    rs: '`RunningContainer.stop` / `remove` + `ContainerHandle` (src/fleet/handle.ts)',
    note: 'Stop removes the container; the durable byId handle survives for inquiry.',
  },
  'index::TestContainer': {
    status: 'superseded-by',
    rs: '`GenericContainer` (src/generic-container.ts)',
    note: 'The builder interface IS the class; interface rows mirror the class rows.',
  },
  'index::TestContainers': {
    status: 'superseded-by',
    rs: '`fromImage` (src/generic-container.ts) + backend layers (src/runtime/selection.workflow.ts)',
    note: '`exposeHostPorts` needs no library knob: every published port pre-binds 127.0.0.1 (R9).',
  },
  'index::CommitOptions': {
    status: 'superseded-by',
    rs: '`checkpointContainer` (src/checkpoint/checkpoint.ts)',
    note: 'Commit-to-image is the checkpoint capture surface (R14).',
  },
  'index::Content': {
    status: 'superseded-by',
    rs: '`withCopyFileToContainer` host-path mounts (src/model/spec-combinators.ts)',
    note: 'Stream/Buffer content copies are not modeled; a host file covers the same contract.',
  },
  'index::CopyToContainerOptions': {
    status: 'superseded-by',
    rs: '`RunningContainer.copyFileToContainer` (src/generic-container.ts)',
    note: 'noOverwrite/copyUIDGID options are not modeled; copy semantics are fixed.',
  },
  'index::ExecOptions': {
    status: 'present',
    rs: '`ExecRequest` (src/model/container-spec.ts)',
    note: 'Same field set (`command`, `workingDir`, `env`); the user field remains the image identity user.',
  },
  'index::ExecResult': {
    status: 'present',
    rs: '`ExecResult` (src/model/container-spec.ts)',
    note:
      '`exitCode`/`stdout`/`stderr`; a non-zero exit is a verdict, never an exception; joining the streams is the caller’s `stdout + stderr`.',
  },
  'index::InspectResult': {
    status: 'superseded-by',
    rs: '`ContainerInspect` (src/runtime/runtime.ts) + `DiagnosticsContainer` (src/model/diagnostics.ts)',
    note: 'Typed data with JSON codecs replaces the dockerode-derived shape.',
  },
  'index::BoundPorts': {
    status: 'superseded-by',
    rs: '`ContainerSpec.ports` — `PortBinding[]` (src/model/ports.ts) + `getMappedPort`',
    note: 'Host ports are pre-allocated before boot (R7); the binding list is the spec data.',
  },
  'index::LABEL_TESTCONTAINERS_SESSION_ID': {
    status: 'superseded-by',
    rs: '`RunId` labels + on-disk ledger (src/lifecycle/hygiene.*, src/runtime/run-id.ts)',
    note: 'Same session-scoped reaping semantics; session identity is a per-process run id + ledger.',
  },
  'index::PortWithBinding': {
    status: 'superseded-by',
    rs: '`PortBinding` (src/model/ports.ts)',
    note: 'Decoded as schema data (guestPort/hostPort).',
  },
  'index::PortWithOptionalBinding': {
    status: 'superseded-by',
    rs: '`PortBinding` with `hostPort: 0` as the unallocated marker (src/model/ports.ts)',
    note: 'R7: the launch pre-allocator replaces the marker before any backend call.',
  },
  'index::getContainerPort': {
    status: 'superseded-by',
    rs: '`PortBinding.guestPort` field',
    note: 'Field access replaces the helper.',
  },
  'index::hasHostBinding': {
    status: 'superseded-by',
    rs: '`PortBinding.hostPort !== 0`',
    note: 'Allocatedness is a data predicate.',
  },
  'index::PortGenerator': {
    status: 'present',
    rs: 'the `FreePorts` allocator kernel (src/runtime/free-ports.ts)',
    note: 'In-process free-port pre-allocation; backends bind what they are given.',
  },
  'index::RandomPortGenerator': {
    status: 'present',
    rs: '`allocate()` (src/runtime/free-ports.ts)',
    note: 'Same allocator surface.',
  },
  'index::ImagePullPolicy': {
    status: 'superseded-by',
    rs: '`ImageRegistry.pull` (src/runtime/runtime.ts)',
    note: 'Pull-on-missing only; the policy knob is not modeled.',
  },
  'index::PullPolicy': {
    status: 'superseded-by',
    rs: '`ImageRegistry.pull` (src/runtime/runtime.ts)',
    note: 'See `ImagePullPolicy`.',
  },
  'index::HttpWaitStrategyOptions': {
    status: 'present',
    rs: '`ForHttp` (src/model/wait.ts)',
    note:
      "Options superset: status/method/headers/body predicate (HttpBodyMatcher); abortOnContainerExit is the interpreter's exit behavior.",
  },
  'index::StartupCheckStrategy': {
    status: 'superseded-by',
    rs: 'the `WaitStrategy` data union (src/model/wait.ts)',
    note:
      'Readiness is data interpreted by one interpreter; one-shot semantics map to `ForShell` exit-0 or no strategy.',
  },
  'index::StartupStatus': {
    status: 'superseded-by',
    rs: '`HealthStatus` + interpreter verdicts (src/wait/verdict.ts)',
    note: 'The status enum is replaced by typed verdicts/`_tag`s.',
  },
  'index::Wait': {
    status: 'superseded-by',
    rs: '`ForPort` / `ForHttp` / `ForLogMessage` / `ForHealthCheck` / `ForShell` constructors (src/model/wait.ts)',
    note: 'Factories become data; the member rows map 1:1.',
  },
  'index::waitForContainer': {
    status: 'superseded-by',
    rs: 'the wait interpreter (src/wait/interpreter.ts)',
    note: 'One interruptible interpreter over the strategy data (R11).',
  },
  'index::WaitStrategy': {
    status: 'present',
    rs: '`WaitStrategy` union (src/model/wait.ts)',
    note: 'Closed JSON-codecable union — a superset of the upstream interface (no open extensibility).',
  },
  'generic-container::fromDockerfile': {
    status: 'superseded-by',
    rs: '`fromImage` (src/generic-container.ts) + module presets (src/modules)',
    note: 'No dockerfile build surface (see `BuildOptions`).',
  },
  'generic-container::start': {
    status: 'present',
    rs: '`GenericContainer.start` (src/generic-container.ts)',
    note: 'Effect-returning; validation runs pre-I/O inside the launch cell.',
  },
  'generic-container::withCommand': {
    status: 'present',
    rs: '`GenericContainer.withCommand(...cmd)` (src/generic-container.ts)',
    note: '',
  },
  'generic-container::withEntrypoint': {
    status: 'present',
    rs: '`GenericContainer.withEntrypoint(...)` (src/generic-container.ts)',
    note: '',
  },
  'generic-container::withName': {
    status: 'superseded-by',
    rs: '`ContainerSpec.name` (src/model/container-spec.ts)',
    note: 'The name is carried on the spec (`newContainerSpec(image, name)`); the launch derives one when unset.',
  },
  'generic-container::withLabels': {
    status: 'superseded-by',
    rs: 'library-owned labels + `reportDiagnostics` (src/fleet/diagnostics.ts)',
    note: "Labels are the library's runId/reaping identity; no user setter.",
  },
  'generic-container::withEnvironment': {
    status: 'present',
    rs: '`withEnv` / `withEnvPairs` (src/model/spec-combinators.ts); exported alias `withEnvironment` on the root',
    note: 'Object form maps 1:1 to `withEnvPairs`; chain form is repeated `withEnv(key, value)`.',
  },
  'generic-container::withPlatform': {
    status: 'superseded-by',
    rs: '— (image manifest property)',
    note: 'The platform is an image-manifest property; not modeled as a spec knob.',
  },
  'generic-container::withTmpFs': {
    status: 'superseded-by',
    rs: '`withTmpfsRoot` (src/model/spec-combinators.ts)',
    note: 'Root tmpfs with an MB cap replaces the arbitrary per-dir map.',
  },
  'generic-container::withUlimits': {
    status: 'superseded-by',
    rs: '— (not modeled)',
    note: 'Host resource limits are out of scope for the parity surface.',
  },
  'generic-container::withSecurityOpt': {
    status: 'superseded-by',
    rs: '`withRequireIsolation` (src/model/spec-combinators.ts)',
    note: 'Isolation demand replaces security-opt strings.',
  },
  'generic-container::withAddedCapabilities': {
    status: 'superseded-by',
    rs: '`RuntimeCapabilities` (src/model/capabilities.ts) + backend defaults',
    note: 'Capability sets are declared data per backend; no additive knob.',
  },
  'generic-container::withDroppedCapabilities': {
    status: 'superseded-by',
    rs: '— (not modeled)',
    note: 'See `withAddedCapabilities`.',
  },
  'generic-container::withNetwork': {
    status: 'present',
    rs: '`GenericContainer.withNetwork(networkId)` (src/generic-container.ts)',
    note: 'The StartedNetwork object is the id in rightsize.',
  },
  'generic-container::withNetworkMode': {
    status: 'superseded-by',
    rs: '`withNetwork` / `withNetworkDisabled` (src/model/spec-combinators.ts)',
    note: 'Mode strings collapse to bridge-default or disabled; no other modes.',
  },
  'generic-container::withNetworkAliases': {
    status: 'present',
    rs: '`GenericContainer.withNetworkAliases(...)` (src/generic-container.ts)',
    note: '',
  },
  'generic-container::withExtraHosts': {
    status: 'superseded-by',
    rs: '— (not modeled)',
    note: 'add-host entries are out of scope; aliases cover guest-to-guest naming.',
  },
  'generic-container::withExposedPorts': {
    status: 'present',
    rs: '`GenericContainer.withExposedPorts(...)` (src/generic-container.ts)',
    note: 'Guest ports; host ports pre-allocated loopback (R7/R9).',
  },
  'generic-container::withBindMounts': {
    status: 'superseded-by',
    rs: '`withCopyFileToContainer` / `withCopyDirectoryToContainer` (src/model/spec-combinators.ts)',
    note: 'Mounts ARE bind views in the copy surface; the `mode` (ro/z/Z) knob is not modeled.',
  },
  'generic-container::withHealthCheck': {
    status: 'superseded-by',
    rs: '`ForHealthCheck` wait (src/model/wait.ts)',
    note: 'The HEALTHCHECK command is an image property; readiness is the wait.',
  },
  'generic-container::withStartupTimeout': {
    status: 'present',
    rs: '`GenericContainer.withStartupTimeout(ms)` (src/generic-container.ts)',
    note: '',
  },
  'generic-container::withWaitStrategy': {
    status: 'present',
    rs: '`GenericContainer.withWaitStrategy` ≡ `waitingFor` (src/generic-container.ts)',
    note: 'same-name alias (R3).',
  },
  'generic-container::withDefaultLogDriver': {
    status: 'superseded-by',
    rs: '— (json-file always)',
    note: 'The log driver is fixed; snapshots/tails read the same stream.',
  },
  'generic-container::withPrivilegedMode': {
    status: 'superseded-by',
    rs: '— (deliberately not modeled)',
    note: 'Privileged mode is refused by design (isolation is the point; `withRequireIsolation` for the microVM path).',
  },
  'generic-container::withUser': {
    status: 'superseded-by',
    rs: '— (image identity user)',
    note: "Workload user is the image's configured identity; no per-container switch.",
  },
  'generic-container::withReuse': {
    status: 'present',
    rs: '`GenericContainer.withReuse` (src/generic-container.ts)',
    note: 'Double opt-in + content-hash adopt-from-running (R14).',
  },
  'generic-container::withAutoCleanup': {
    status: 'superseded-by',
    rs: '`withKeepAlive` (src/model/spec-combinators.ts) + explicit `reap` (src/fleet/reap.ts)',
    note: 'autoCleanup: false ≡ `keepAlive: true`; the cleanup default and the sweep are co-equal surfaces.',
  },
  'generic-container::withAutoRemove': {
    status: 'superseded-by',
    rs: 'the teardown executor (src/lifecycle/teardown.workflow.ts)',
    note: 'Teardown always removes (R5); no knob.',
  },
  'generic-container::withPullPolicy': {
    status: 'superseded-by',
    rs: '`ImageRegistry.pull` (src/runtime/runtime.ts)',
    note: 'Pull-on-missing; policy knob not modeled.',
  },
  'generic-container::withIpcMode': {
    status: 'superseded-by',
    rs: '— (not modeled)',
    note: 'IPC modes are out of scope.',
  },
  'generic-container::withCopyFilesToContainer': {
    status: 'present',
    rs: '`GenericContainer.withCopyFileToContainer(host, guest)` (src/generic-container.ts)',
    note: 'The plural array form maps to one call per file; mounts are read-write views.',
  },
  'generic-container::withCopyDirectoriesToContainer': {
    status: 'present',
    rs: '`GenericContainer.withCopyDirectoryToContainer(host, guest)` (src/generic-container.ts)',
    note: 'See above.',
  },
  'generic-container::withCopyContentToContainer': {
    status: 'superseded-by',
    rs: '`withCopyFileToContainer` (write the content to a temp file first)',
    note: 'Stream/Buffer content copies are not modeled.',
  },
  'generic-container::withCopyArchivesToContainer': {
    status: 'superseded-by',
    rs: '— (not modeled)',
    note: 'Archive-stream copies are not modeled; host file/dir mounts cover the surface.',
  },
  'generic-container::withCopyToContainerOptions': {
    status: 'superseded-by',
    rs: '— (copy semantics fixed)',
    note: 'No per-copy option object; runtime copies create parents and report stderr on failure.',
  },
  'generic-container::withWorkingDir': {
    status: 'present',
    rs: '`GenericContainer.withWorkingDir(dir)` (src/generic-container.ts)',
    note: '',
  },
  'generic-container::withResourcesQuota': {
    status: 'superseded-by',
    rs: '`withMemoryLimit` (src/model/spec-combinators.ts)',
    note: 'Memory half is modeled; cpu quota is not.',
  },
  'generic-container::withSharedMemorySize': {
    status: 'superseded-by',
    rs: '— (not modeled)',
    note: '/dev/shm sizing is out of scope.',
  },
  'generic-container::withLogConsumer': {
    status: 'superseded-by',
    rs: '`RunningContainer.followOutput(consumer)` (src/generic-container.ts)',
    note: 'Ordered, no-duplicate streaming with the never-flushing Close handle.',
  },
  'generic-container::withHostname': {
    status: 'superseded-by',
    rs: '— (derived)',
    note: 'The container hostname follows the derived name; no setter.',
  },
  'generic-container-builder::withBuildArgs': {
    status: 'superseded-by',
    rs: 'module presets (src/modules)',
    note: 'Dockerfile build surface wholesale superseded by `fromImage`.',
  },
  'generic-container-builder::withPullPolicy': {
    status: 'superseded-by',
    rs: '`ImageRegistry.pull` (src/runtime/runtime.ts)',
    note: 'See `ImagePullPolicy`.',
  },
  'generic-container-builder::withCache': {
    status: 'superseded-by',
    rs: '— (no dockerfile build)',
    note: 'See `BuildOptions`.',
  },
  'generic-container-builder::withBuildkit': {
    status: 'superseded-by',
    rs: '— (no dockerfile build)',
    note: 'See `BuildOptions`.',
  },
  'generic-container-builder::withPlatform': {
    status: 'superseded-by',
    rs: '— (image manifest property)',
    note: 'See `GenericContainer.withPlatform`.',
  },
  'generic-container-builder::withTarget': {
    status: 'superseded-by',
    rs: '— (no dockerfile build)',
    note: 'See `BuildOptions`.',
  },
  'generic-container-builder::build': {
    status: 'superseded-by',
    rs: '`fromImage` (src/generic-container.ts)',
    note: 'Build step superseded; images come pre-built or from modules.',
  },
  'test-container::start': {
    status: 'superseded-by',
    rs: '`GenericContainer.start` (src/generic-container.ts)',
    note: 'See the concrete class row (TestContainer is the interface implemented by GenericContainer).',
  },
  'test-container::withEnvironment': { status: 'present', rs: 'see `GenericContainer.withEnvironment`', note: '' },
  'test-container::withCommand': { status: 'present', rs: 'see `GenericContainer.withCommand`', note: '' },
  'test-container::withEntrypoint': { status: 'present', rs: 'see `GenericContainer.withEntrypoint`', note: '' },
  'test-container::withTmpFs': { status: 'superseded-by', rs: 'see `GenericContainer.withTmpFs`', note: '' },
  'test-container::withUlimits': { status: 'superseded-by', rs: 'see `GenericContainer.withUlimits`', note: '' },
  'test-container::withSecurityOpt': {
    status: 'superseded-by',
    rs: 'see `GenericContainer.withSecurityOpt`',
    note: '',
  },
  'test-container::withAddedCapabilities': {
    status: 'superseded-by',
    rs: 'see `GenericContainer.withAddedCapabilities`',
    note: '',
  },
  'test-container::withDroppedCapabilities': {
    status: 'superseded-by',
    rs: 'see `GenericContainer.withDroppedCapabilities`',
    note: '',
  },
  'test-container::withExposedPorts': { status: 'present', rs: 'see `GenericContainer.withExposedPorts`', note: '' },
  'test-container::withBindMounts': { status: 'superseded-by', rs: 'see `GenericContainer.withBindMounts`', note: '' },
  'test-container::withWaitStrategy': { status: 'present', rs: 'see `GenericContainer.withWaitStrategy`', note: '' },
  'test-container::withStartupTimeout': {
    status: 'present',
    rs: 'see `GenericContainer.withStartupTimeout`',
    note: '',
  },
  'test-container::withNetwork': { status: 'present', rs: 'see `GenericContainer.withNetwork`', note: '' },
  'test-container::withNetworkMode': {
    status: 'superseded-by',
    rs: 'see `GenericContainer.withNetworkMode`',
    note: '',
  },
  'test-container::withExtraHosts': { status: 'superseded-by', rs: 'see `GenericContainer.withExtraHosts`', note: '' },
  'test-container::withDefaultLogDriver': {
    status: 'superseded-by',
    rs: 'see `GenericContainer.withDefaultLogDriver`',
    note: '',
  },
  'test-container::withPrivilegedMode': {
    status: 'superseded-by',
    rs: 'see `GenericContainer.withPrivilegedMode`',
    note: '',
  },
  'test-container::withPlatform': { status: 'superseded-by', rs: 'see `GenericContainer.withPlatform`', note: '' },
  'test-container::withUser': { status: 'superseded-by', rs: 'see `GenericContainer.withUser`', note: '' },
  'test-container::withPullPolicy': { status: 'superseded-by', rs: 'see `GenericContainer.withPullPolicy`', note: '' },
  'test-container::withReuse': { status: 'present', rs: 'see `GenericContainer.withReuse`', note: '' },
  'test-container::withAutoCleanup': {
    status: 'superseded-by',
    rs: 'see `GenericContainer.withAutoCleanup`',
    note: '',
  },
  'test-container::withAutoRemove': { status: 'superseded-by', rs: 'see `GenericContainer.withAutoRemove`', note: '' },
  'test-container::withCopyFilesToContainer': {
    status: 'present',
    rs: 'see `GenericContainer.withCopyFilesToContainer`',
    note: '',
  },
  'test-container::withCopyDirectoriesToContainer': {
    status: 'present',
    rs: 'see `GenericContainer.withCopyDirectoriesToContainer`',
    note: '',
  },
  'test-container::withCopyContentToContainer': {
    status: 'superseded-by',
    rs: 'see `GenericContainer.withCopyContentToContainer`',
    note: '',
  },
  'test-container::withCopyArchivesToContainer': {
    status: 'superseded-by',
    rs: 'see `GenericContainer.withCopyArchivesToContainer`',
    note: '',
  },
  'test-container::withCopyToContainerOptions': {
    status: 'superseded-by',
    rs: 'see `GenericContainer.withCopyToContainerOptions`',
    note: '',
  },
  'test-container::withWorkingDir': { status: 'present', rs: 'see `GenericContainer.withWorkingDir`', note: '' },
  'test-container::withResourcesQuota': {
    status: 'superseded-by',
    rs: 'see `GenericContainer.withResourcesQuota`',
    note: '',
  },
  'test-container::withSharedMemorySize': {
    status: 'superseded-by',
    rs: 'see `GenericContainer.withSharedMemorySize`',
    note: '',
  },
  'test-container::withLogConsumer': {
    status: 'superseded-by',
    rs: 'see `GenericContainer.withLogConsumer`',
    note: '',
  },
  'test-container::withHostname': { status: 'superseded-by', rs: 'see `GenericContainer.withHostname`', note: '' },
  'started-test-container::stop': {
    status: 'present',
    rs: '`RunningContainer.stop` (src/generic-container.ts)',
    note: 'Same dual surface; scope-close also finalizes.',
  },
  'started-test-container::restart': {
    status: 'superseded-by',
    rs: '`stop` + a fresh `start` (src/generic-container.ts)',
    note: 'Restart is a re-launch; not modeled as a primitive.',
  },
  'started-test-container::commit': {
    status: 'superseded-by',
    rs: '`checkpointContainer` (src/checkpoint/checkpoint.ts)',
    note: 'Commit-to-image is the checkpoint capture surface.',
  },
  'started-test-container::getHost': {
    status: 'present',
    rs: '`RunningContainer.getHost` (src/generic-container.ts)',
    note: 'Always `127.0.0.1` — loopback-only publishing (R9).',
  },
  'started-test-container::getHostname': {
    status: 'superseded-by',
    rs: '`RunningContainer.spec.name`',
    note: 'Derived name is the domain name.',
  },
  'started-test-container::getFirstMappedPort': {
    status: 'superseded-by',
    rs: '`getMappedPort(spec.ports[0].guestPort)` (src/generic-container.ts)',
    note: "First exposed port's binding is the first mapped port.",
  },
  'started-test-container::getMappedPort': {
    status: 'present',
    rs: '`RunningContainer.getMappedPort(guestPort)` (src/generic-container.ts)',
    note: 'TCP-only publishing; the protocol overload is not modeled.',
  },
  'started-test-container::getName': {
    status: 'superseded-by',
    rs: '`RunningContainer.spec.name`',
    note: 'Field access.',
  },
  'started-test-container::getLabels': {
    status: 'superseded-by',
    rs: '`ContainerInspect` / `DiagnosticsContainer` (src/fleet/diagnostics.ts)',
    note: 'Library-owned labels; diagnostics carry the visible set.',
  },
  'started-test-container::getId': {
    status: 'superseded-by',
    rs: '`RunningContainer.handle.id` (src/runtime/runtime.ts)',
    note: 'The durable byId key (U8).',
  },
  'started-test-container::getNetworkNames': {
    status: 'superseded-by',
    rs: '`RunningContainer.spec.networkId` + `listFleetContainers`',
    note: 'A container joins one library-created network; the id is the name.',
  },
  'started-test-container::getNetworkId': {
    status: 'superseded-by',
    rs: '`RunningContainer.spec.networkId`',
    note: 'Field access.',
  },
  'started-test-container::getIpAddress': {
    status: 'superseded-by',
    rs: '— (not recorded)',
    note: 'Sibling DNS aliasing covers guest-to-guest reachability; guest IPs are not surfaced.',
  },
  'started-test-container::copyArchiveFromContainer': {
    status: 'superseded-by',
    rs: '`RunningContainer.copyFileFromContainer(path, hostPath)` (src/generic-container.ts)',
    note: 'Copies land on a host path (parent created) instead of a raw archive stream.',
  },
  'started-test-container::copyArchiveToContainer': {
    status: 'superseded-by',
    rs: '`RunningContainer.copyFileToContainer(hostPath, guestPath)` (src/generic-container.ts)',
    note: 'Host-path → guest-path; parent dirs created.',
  },
  'started-test-container::copyDirectoriesToContainer': {
    status: 'present',
    rs: '`RunningContainer.copyFileToContainer` dir semantics (src/generic-container.ts)',
    note: 'Recursive-copy destination naming (docker cp semantics).',
  },
  'started-test-container::copyFilesToContainer': {
    status: 'present',
    rs: '`RunningContainer.copyFileToContainer` (src/generic-container.ts)',
    note: 'Runtime copy to a host path.',
  },
  'started-test-container::copyContentToContainer': {
    status: 'superseded-by',
    rs: '`RunningContainer.copyFileToContainer` (temp file first)',
    note: 'Content copies are not modeled.',
  },
  'started-test-container::exec': {
    status: 'present',
    rs: '`RunningContainer.exec` / `execCommand` (src/generic-container.ts)',
    note:
      '`ExecRequest` (`command` + `workingDir` + `env`); exit code is a verdict. Missing-working-dir exits 127 and is distinguishable.',
  },
  'started-test-container::logs': {
    status: 'present',
    rs: '`RunningContainer.logs` (bounded snapshot) + `followOutput` (src/generic-container.ts)',
    note: 'String snapshot instead of a Readable; the streaming surface is the follow handle.',
  },
  'started-test-container::[Symbol.asyncDispose]': {
    status: 'superseded-by',
    rs: '`Scope` + the teardown finalizer (R5)',
    note: 'Close-to-scope finalization is the dual surface.',
  },
  'stopped-test-container::getId': {
    status: 'superseded-by',
    rs: '`RunningContainer.handle.id` (survives stop)',
    note: 'Teardown removes the container; the durable handle id remains for inquiry.',
  },
  'stopped-test-container::copyArchiveFromContainer': {
    status: 'superseded-by',
    rs: '`RunningContainer.copyFileFromContainer` (while started)',
    note: 'The stopped object is not a surface: teardown removes the guest.',
  },
  'network::start': {
    status: 'superseded-by',
    rs: '`VirtualNetworks.ensureNetwork(id)` (src/runtime/runtime.ts)',
    note: 'The id is caller-chosen; created networks join the ledger.',
  },
  'network::getId': {
    status: 'superseded-by',
    rs: 'the network id (the identity itself)',
    note: 'No wrapper object.',
  },
  'network::getName': {
    status: 'superseded-by',
    rs: 'the network id',
    note: 'The id serves as the name.',
  },
  'network::stop': {
    status: 'superseded-by',
    rs: '`VirtualNetworks.removeNetwork(id)` (src/runtime/runtime.ts)',
    note: 'Last-member removal is finalizer-ordered and idempotent (R5).',
  },
  'network::[Symbol.asyncDispose]': {
    status: 'superseded-by',
    rs: '`Scope` + the network finalizer',
    note: 'Library-created network ids join the teardown order.',
  },
  'test-containers::exposeHostPorts': {
    status: 'superseded-by',
    rs: 'loopback pre-allocation (R7/R9)',
    note: 'Every published port binds 127.0.0.1 without a daemon-level host-port exposure API.',
  },
  'docker-compose-environment::withBuild': {
    status: 'superseded-by',
    rs: 'no compose surface (see `DockerComposeEnvironment`)',
    note: '',
  },
  'docker-compose-environment::withAutoCleanup': { status: 'superseded-by', rs: 'no compose surface', note: '' },
  'docker-compose-environment::withEnvironment': { status: 'superseded-by', rs: 'no compose surface', note: '' },
  'docker-compose-environment::withEnvironmentFile': { status: 'superseded-by', rs: 'no compose surface', note: '' },
  'docker-compose-environment::withProfiles': { status: 'superseded-by', rs: 'no compose surface', note: '' },
  'docker-compose-environment::withNoRecreate': { status: 'superseded-by', rs: 'no compose surface', note: '' },
  'docker-compose-environment::withPullPolicy': { status: 'superseded-by', rs: 'no compose surface', note: '' },
  'docker-compose-environment::withDefaultWaitStrategy': {
    status: 'superseded-by',
    rs: 'no compose surface',
    note: '',
  },
  'docker-compose-environment::withWaitStrategy': { status: 'superseded-by', rs: 'no compose surface', note: '' },
  'docker-compose-environment::withStartupTimeout': { status: 'superseded-by', rs: 'no compose surface', note: '' },
  'docker-compose-environment::withProjectName': { status: 'superseded-by', rs: 'no compose surface', note: '' },
  'docker-compose-environment::withClientOptions': { status: 'superseded-by', rs: 'no compose surface', note: '' },
  'docker-compose-environment::up': { status: 'superseded-by', rs: 'no compose surface', note: '' },
  'socat-container::withTarget': {
    status: 'superseded-by',
    rs: 'network aliases / tunnel emulation (backend-msb)',
    note: 'No socat helper; see `SocatContainer`.',
  },
  'socat-container::start': {
    status: 'superseded-by',
    rs: '`GenericContainer.start` (src/lifecycle/launch.ts)',
    note: 'The socat-specific start is the generic launch.',
  },
  'wait::forAll': {
    status: 'superseded-by',
    rs: 'a single `WaitStrategy` per spec (src/model/wait.ts)',
    note: 'Composite/all waits are not modeled; pick the strategy that asserts readiness.',
  },
  'wait::forListeningPorts': {
    status: 'superseded-by',
    rs: '`ForPort` (src/model/wait.ts)',
    note: 'Read-probes every exposed port (R11) — same readiness contract.',
  },
  'wait::forLogMessage': {
    status: 'superseded-by',
    rs: '`ForLogMessage` (`pattern` + `count`)',
    note: 'Regex source + minimum count; count 0 = instantly ready.',
  },
  'wait::forHealthCheck': {
    status: 'superseded-by',
    rs: '`ForHealthCheck` (`status`)',
    note: 'Capability-gated on `healthInspection` before probing.',
  },
  'wait::forOneShotStartup': {
    status: 'superseded-by',
    rs: '`ForShell` (exit-0 probe) or no strategy',
    note: 'One-shot semantics are an exit-0 verdict.',
  },
  'wait::forHttp': {
    status: 'superseded-by',
    rs: '`ForHttp` (src/model/wait.ts)',
    note: 'Status/method/headers/body superset of the options object.',
  },
  'wait::forSuccessfulCommand': {
    status: 'superseded-by',
    rs: '`ForShell` (src/model/wait.ts)',
    note: 'Exit-0 readiness.',
  },
  'wait-strategy::waitUntilReady': {
    status: 'superseded-by',
    rs: 'the wait interpreter (src/wait/interpreter.ts)',
    note: 'Polling is one interruptible interpreter over strategy data.',
  },
  'wait-strategy::withStartupTimeout': {
    status: 'superseded-by',
    rs: '`withStartupTimeout` (spec field `startupTimeoutMs`)',
    note: 'Deadline is data on the spec.',
  },
  'wait-strategy::isStartupTimeoutSet': {
    status: 'superseded-by',
    rs: '`ContainerSpec.startupTimeoutMs` presence',
    note: 'Field presence replaces the flag.',
  },
  'wait-strategy::getStartupTimeout': {
    status: 'superseded-by',
    rs: '`ContainerSpec.startupTimeoutMs`',
    note: 'Field access; unset = interpreter default (120s).',
  },
  'types::InspectResult': {
    status: 'superseded-by',
    rs: '`ContainerInspect` (src/runtime/runtime.ts) + `DiagnosticsContainer` (src/model/diagnostics.ts)',
    note: 'Typed runtime/diagnostics data replaces the dockerode-shaped blob.',
  },
  'types::ContainerRuntime': {
    status: 'superseded-by',
    rs: "`BackendName` = `'docker' | 'msb'` (src/runtime/runtime.ts)",
    note:
      'podman is a `docker` backend (the docker lane answers podman sockets); the enum split is runtime-shaped, not daemon-shaped.',
  },
  'types::Environment': {
    status: 'present',
    rs: '`EnvPair[]` (ContainerSpec.env, src/model/container-spec.ts)',
    note: 'Record form maps to ordered pairs; `withEnv`/`withEnvPairs` preserve insertion order.',
  },
  'types::BindMode': {
    status: 'superseded-by',
    rs: '`Mount.readOnly` flag (src/model/container-spec.ts)',
    note: 'rw/ro only; z/Z semantics are SELinux host concerns out of scope.',
  },
  'types::BindMount': {
    status: 'superseded-by',
    rs: '`ContainerSpec.mounts` entries (src/model/container-spec.ts)',
    note: 'source/target/readOnly as schema data.',
  },
  'types::FileToCopy': {
    status: 'superseded-by',
    rs: '`ContainerSpec.mounts` (source/target pairs)',
    note: 'The `mode` knob is not modeled.',
  },
  'types::DirectoryToCopy': {
    status: 'superseded-by',
    rs: 'see `FileToCopy`',
    note: 'Same shape.',
  },
  'types::Content': {
    status: 'superseded-by',
    rs: 'host-path mounts (src/model/spec-combinators.ts)',
    note: 'See `Content (index)`.',
  },
  'types::ContentToCopy': {
    status: 'superseded-by',
    rs: '`withCopyFileToContainer` + temp file',
    note: 'See `withCopyContentToContainer`.',
  },
  'types::CopyToContainerOptions': {
    status: 'superseded-by',
    rs: '— (copy semantics fixed)',
    note: 'See `CopyToContainerOptions (index)`.',
  },
  'types::ArchiveToCopy': {
    status: 'superseded-by',
    rs: '— (not modeled)',
    note: 'See `withCopyArchivesToContainer`.',
  },
  'types::TmpFs': {
    status: 'superseded-by',
    rs: '`ContainerSpec.tmpfsRootMb`',
    note: 'Root tmpfs cap instead of a per-dir map.',
  },
  'types::Ulimits': {
    status: 'superseded-by',
    rs: '— (not modeled)',
    note: 'See `GenericContainer.withUlimits`.',
  },
  'types::ResourcesQuota': {
    status: 'superseded-by',
    rs: '`ContainerSpec.memoryLimitMb`',
    note: 'Memory half only.',
  },
  'types::HealthCheck': {
    status: 'superseded-by',
    rs: '`ForHealthCheck` (wait) + image property',
    note: 'See `GenericContainer.withHealthCheck`.',
  },
  'types::ExtraHost': {
    status: 'superseded-by',
    rs: '— (not modeled)',
    note: 'See `withExtraHosts`.',
  },
  'types::Labels': {
    status: 'superseded-by',
    rs: 'library labels + diagnostics',
    note: 'See `withLabels`.',
  },
  'types::HostPortBindings': {
    status: 'superseded-by',
    rs: '`PortBinding[]` (src/model/ports.ts)',
    note: 'hostIp fixed to 127.0.0.1 (R9).',
  },
  'types::Ports': {
    status: 'superseded-by',
    rs: '`PortBinding[]` (src/model/ports.ts)',
    note: 'Protocol-keyed map reduced to ordered guest/host pairs.',
  },
  'types::RegistryConfig': {
    status: 'superseded-by',
    rs: '— (not modeled)',
    note: 'Registry auth is out of scope for the parity surface.',
  },
  'types::BuildArgs': {
    status: 'superseded-by',
    rs: '— (no dockerfile build)',
    note: 'See `BuildOptions`.',
  },
  'types::ExecOptions': {
    status: 'present',
    rs: '`ExecRequest` (src/model/container-spec.ts)',
    note: 'workingDir/env carried; the workload user follows the image identity.',
  },
  'types::ExecResult': {
    status: 'present',
    rs: '`ExecResult` (src/model/container-spec.ts)',
    note: 'exitCode/stdout/stderr; joining is the caller’s `stdout + stderr`.',
  },
  'types::CommitOptions': {
    status: 'superseded-by',
    rs: '`checkpointContainer` (src/checkpoint/checkpoint.ts)',
    note: 'See `CommitOptions (index)`.',
  },
  'types::HealthCheckStatus': {
    status: 'superseded-by',
    rs: '`HealthStatus` (src/model/wait.ts)',
    note: '"none"/"starting" fold into the interpreter verdicts.',
  },
  'types::NetworkSettings': {
    status: 'superseded-by',
    rs: '`NetworkSpec` (src/model/network.ts) + handle',
    note: 'networkId/ipAddress live on the spec/lifecycle data, not an inspect blob.',
  },
}

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------

/**
 * The repo's formatter is dprint (`./bin/dprint`, format:check). Generated
 * artifacts are byte-gated, so the generator pipes its raw buffers through
 * the SAME dprint binary the repo gates on — a formatter pass is then
 * idempotent for these files and can never drift the gate. dprint is
 * resolved via PATH (nix develop / direnv) with the repo wrapper as
 * fallback. Absent dprint, `null` returns and each caller decides: write
 * modes fail loudly (never emit bytes format:check would rewrite); the
 * check gate falls back to whitespace-normalized comparison.
 * @param {string} text @param {string} filePath @returns {string | null}
 */
const formatWithDprint = (text, filePath) => {
  const candidates = ['dprint', path.join(REPO_ROOT, 'bin', 'dprint')]
  for (const binary of candidates) {
    const probe = spawnSync(binary, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] })
    if (probe.status !== 0) continue
    const result = spawnSync(binary, ['fmt', '--stdin', filePath], { input: text, encoding: 'utf8' })
    if (result.status !== 0) {
      process.stderr.write(`parity-enumerate: dprint failed on generated ${filePath}: ${result.stderr ?? ''}\n`)
      process.exit(2)
    }
    return result.stdout ?? text
  }
  return null
}

/** @param {string} value @returns {string} */
const esc = (value) => String(value).replace(/\|/g, '\\|')

/** @param {Surface} surface @returns {string} */
const renderMatrix = (surface) => {
  /** @type {string[]} */
  const lines = []
  lines.push(`# Parity matrix — testcontainers@${TESTCONTAINERS_VERSION} → @systemfsoftware/rightsize`)
  lines.push(``)
  lines.push(`> **DO NOT EDIT THIS FILE BY HAND.** Generated by \`scripts/parity-enumerate.mjs\` from the`)
  lines.push(`> installed \`testcontainers@${TESTCONTAINERS_VERSION}\` type declarations (its emitted \`.d.ts\` in the`)
  lines.push(`> pnpm virtual store) plus the committed mapping in that script. Regenerate with:`)
  lines.push(`>`)
  lines.push(`>     pnpm --filter @systemfsoftware/rightsize parity:write`)
  lines.push(`>`)
  lines.push(
    `> \`pnpm --filter @systemfsoftware/rightsize parity:check\` (also wired into \`build\`) re-enumerates the`,
  )
  lines.push(
    `> installed \`.d.ts\` when present (a dependency bump that changes the surface fails there), re-renders this`,
  )
  lines.push(`> matrix from the frozen surface + mapping, and exits 1 naming any byte drift. R16.`)
  lines.push(`>`)
  lines.push(`> Status vocabulary — **present**: rightsize exports the same contract (same name or the documented`)
  lines.push(`> canonical name); **superseded-by**: an Effect-native replacement exists and is documented in the`)
  lines.push(`> "rightsize symbol / replacement" column. Nothing is silently absent.`)
  lines.push(``)
  for (const { id, title, members } of surface.sections) {
    lines.push(`## ${title}`)
    lines.push(``)
    lines.push(`| member | status | rightsize symbol / replacement | note |`)
    lines.push(`| --- | --- | --- | --- |`)
    for (const member of members) {
      const key = `${id}::${member}`
      const row = MAPPING[key]
      if (row === undefined) {
        throw new Error(
          `mapping is missing a row for \`${key}\` (enumerated from ${id}); ` + 'add it to the MAPPING table',
        )
      }
      const rs = row.rs === null || row.rs === undefined ? '—' : row.rs
      lines.push(`| \`${esc(member)}\` | ${row.status} | ${rs} | ${row.note} |`)
    }
    lines.push(``)
  }
  lines.push(`---`)
  lines.push(``)
  lines.push(
    `*${
      surface.sections.reduce((n, s) => n + s.members.length, 0)
    } members — every one present or superseded with a documented replacement.*`,
  )
  lines.push(
    `*Enumerated from testcontainers@${TESTCONTAINERS_VERSION}; refresh the frozen surface deliberately with \`--update-surface\` after an intentional dependency bump.*`,
  )
  lines.push(``)
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// modes
// ---------------------------------------------------------------------------

/** @param {string} text @returns {string} */
const normalize = (text) => text.replace(/\r\n/g, '\n').trimEnd() + '\n'

/** Line-diff two texts for the drift gate; used only for reporting. @param {string} filePath @param {string} expected @param {string} actual @returns {{ drifted: boolean, hunks: string[] }} */
const diffLines = (filePath, expected, actual) => {
  const a = normalize(expected).split('\n')
  const b = normalize(actual).split('\n')
  const max = Math.max(a.length, b.length)
  /** @type {string[]} */
  const hunks = []
  for (let i = 0; i < max; i++) {
    if (a[i] !== b[i]) {
      hunks.push(
        `- line ${i + 1}: committed ${JSON.stringify(a[i] ?? '')} vs regenerated ${JSON.stringify(b[i] ?? '')}`,
      )
      if (hunks.length >= 10) {
        hunks.push(`- … (${max - i - 1} more differing lines)`)
        break
      }
    }
  }
  return { drifted: hunks.length > 0, hunks }
}

/** The generated surface-module bytes — dprint-formatted so the committed snapshot and the gate are formatter-stable. Write modes refuse to emit unformatted bytes. @param {Surface} surface @returns {string} */
const renderSurfaceModule = (surface) => {
  const header = [
    '// Generated by scripts/parity-enumerate.mjs --update-surface from the installed',
    '// testcontainers@12.1.0 .d.ts. DO NOT EDIT BY HAND.',
    '',
    '/** @type {{ generator: string, testcontainers: string, sections: Array<{ id: string, title: string, file: string, members: string[] }> }} */',
    'export const surface = ',
  ].join('\n')
  const formatted = formatWithDprint(`${header}${JSON.stringify(surface, null, 2)}\n`, SURFACE_PATH)
  if (formatted === null) {
    process.stderr.write(
      'parity-enumerate: dprint is required to write the parity artifacts (they are byte-gated against the repo format:check contract)\n' +
        '  enter the dev shell (nix develop), or put dprint on PATH\n',
    )
    process.exit(2)
  }
  return formatted
}

/** The surface the current state resolves to — the live enumeration when it exists, else the frozen snapshot. @param {Surface | null} installed @returns {Surface} */
const loadSurface = (installed) => installed ?? FROZEN_SURFACE

/** Gate 0: the committed frozen surface module is byte-identical to the live enumeration's regeneration. @param {Surface | null} installed @returns {number} 0 when synced, 1 when drifted */
const checkInstalledSurface = (installed) => {
  if (installed === null) {
    process.stdout.write('parity:check — no installed testcontainers .d.ts (post-removal); only the matrix gate runs\n')
    return 0
  }
  const committed = fs.existsSync(SURFACE_PATH) ? fs.readFileSync(SURFACE_PATH, 'utf8') : ''
  const rendered = renderSurfaceModule(installed)
  if (normalize(committed) === normalize(rendered)) return 0
  process.stderr.write(
    'parity:check FAIL — the installed testcontainers .d.ts surface drifts from the frozen snapshot\n',
  )
  for (const section of installed.sections) {
    const frozenSection = FROZEN_SURFACE.sections.find((s) => s.id === section.id)
    const missing = section.members.filter((m) => !(frozenSection?.members ?? []).includes(m))
    const gone = (frozenSection?.members ?? []).filter((m) => !section.members.includes(m))
    if (missing.length > 0) process.stderr.write(`  added in ${section.id}: ${missing.join(', ')}\n`)
    if (gone.length > 0) process.stderr.write(`  removed in ${section.id}: ${gone.join(', ')}\n`)
  }
  process.stderr.write('  refresh deliberately with: pnpm --filter @systemfsoftware/rightsize parity:update-surface\n')
  return 1
}

/** Gate 2: the committed matrix vs regeneration. With dprint the comparison is byte-exact; without it (CI runners) whitespace is normalized so only content drift fails here — formatting drift is the repo format:check gate's to catch. @param {Surface} surface @returns {number} 0 when synced, 1 when drifted */
const checkMatrix = (surface) => {
  const committed = fs.existsSync(MATRIX_PATH) ? fs.readFileSync(MATRIX_PATH, 'utf8') : ''
  const raw = renderMatrix(surface)
  const formatted = formatWithDprint(raw, MATRIX_PATH)
  /** Compare content, not layout: trim line edges and compare table rows cell-by-cell (dprint pads columns; the raw render does not). @param {string} text @returns {string} */
  const normalize = (text) =>
    text
      .split('\n')
      .map((line) => {
        const trimmed = line.trim()
        if (!trimmed.startsWith('|')) return trimmed
        return trimmed.split('|').map((cell) => cell.trim()).join('|')
      })
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
  const diff = formatted === null
    ? diffLines(MATRIX_PATH, normalize(committed), normalize(raw))
    : diffLines(MATRIX_PATH, committed, formatted)
  if (!diff.drifted) return 0
  process.stderr.write('parity:check FAIL — docs/parity-matrix.md drifts from regeneration\n')
  for (const line of diff.hunks) process.stderr.write(`  ${line}\n`)
  process.stderr.write('  regenerate with: pnpm --filter @systemfsoftware/rightsize parity:write\n')
  return 1
}

const main = () => {
  const mode = process.argv.includes('--write')
    ? 'write'
    : process.argv.includes('--update-surface')
    ? 'update-surface'
    : 'check'

  const buildDir = findTestcontainersBuild()
  const installed = buildDir !== null ? enumerateSurface(buildDir) : null

  if (mode === 'update-surface') {
    if (installed === null) {
      process.stderr.write('parity-enumerate: --update-surface needs the installed testcontainers .d.ts (not found)\n')
      process.exit(2)
    }
    fs.writeFileSync(SURFACE_PATH, renderSurfaceModule(installed))
    const count = installed.sections.reduce((n, s) => n + s.members.length, 0)
    process.stdout.write(`parity-enumerate: wrote ${path.relative(REPO_ROOT, SURFACE_PATH)} (${count} members)\n`)
    return
  }

  if (mode === 'write') {
    if (checkInstalledSurface(installed) !== 0) {
      process.stderr.write(
        'parity-enumerate: refusing --write while the live surface drifts; run --update-surface first\n',
      )
      process.exit(1)
    }
    const formattedMatrix = formatWithDprint(renderMatrix(loadSurface(installed)), MATRIX_PATH)
    if (formattedMatrix === null) {
      process.stderr.write(
        'parity-enumerate: dprint is required to write the parity matrix (byte-gated against format:check)\n',
      )
      process.exit(2)
    }
    fs.writeFileSync(MATRIX_PATH, formattedMatrix)
    process.stdout.write(`parity-enumerate: wrote ${path.relative(REPO_ROOT, MATRIX_PATH)}\n`)
    return
  }

  const failures = checkInstalledSurface(installed) + checkMatrix(loadSurface(installed))
  if (failures !== 0) {
    process.exit(1)
  }
  process.stdout.write('parity:check ok — surface and matrix are in sync\n')
}

main()
