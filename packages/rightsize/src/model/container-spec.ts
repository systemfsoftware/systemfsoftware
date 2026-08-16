/**
 * The spec payload family: `ContainerSpec` plus every member it embeds —
 * `FileMount`, `ExecRequest`, `ExecResult`, `EnvPair` and the shared command
 * refinement. Field names and semantics mirror upstream `model.ts` at the
 * fork point exactly, with the port-plan additions R1–R3 name: `entrypoint`,
 * `workingDir`, `requireIsolation`, `startupTimeoutMs` and the in-spec
 * `waitStrategy` (readiness is data here, interpreted by the launch
 * workflow).
 *
 * Construction is pure data transformation: the combinators in
 * `spec-combinators.ts` build values; validation travels on the schema's
 * codec channel (the launch workflow's typed validation, never a throw at
 * construction — KTD3/KTD6).
 */
import { Schema as S } from 'effect'
import { NetworkAlias } from './network.js'
import { PortBinding } from './ports.js'
import { WaitStrategy } from './wait.js'

/**
 * One environment pair — an array of these, never a Map: insertion-ordered,
 * last-write-wins dedup when a builder overwrites a key.
 */
export const EnvPair = S.Tuple([S.String, S.String]).pipe(
  S.annotate({ identifier: 'EnvPair', title: 'EnvPair', description: 'An environment variable key/value pair.' }),
)

export type EnvPair = S.Schema.Type<typeof EnvPair>

/**
 * A finite number — the shared member every numeric spec field defers to
 * (`memoryLimitMb`, `diskLimitMb`, `tmpfsRootMb`, `startupTimeoutMs`,
 * `ExecResult.exitCode`, …): NaN and infinities are never meaningful domain
 * values, and a JSON codec that admit-ted them would emit `null` on the
 * wire. One shared node keeps the finite-check law in a single place.
 */
export const FiniteNumber = S.Finite.pipe(
  S.annotate({ identifier: 'FiniteNumber', title: 'FiniteNumber', description: 'A finite number.' }),
)

export type FiniteNumber = S.Schema.Type<typeof FiniteNumber>

const CommandArray = S.Array(S.String)

/**
 * A command line: at least one argument. `undefined` on the spec (the
 * optional key) means the image's own ENTRYPOINT/CMD runs unmodified; an
 * empty array is refused — an empty command is never something a backend can
 * boot or exec.
 */
export const CommandArguments = S.refine<typeof CommandArray, ReadonlyArray<string>>(
  (value): value is ReadonlyArray<string> => value.length > 0,
)(CommandArray).pipe(
  S.annotate({
    identifier: 'CommandArguments',
    title: 'CommandArguments',
    description: 'A non-empty command line.',
  }),
)

export type CommandArguments = S.Schema.Type<typeof CommandArguments>

/**
 * A host path mounted into the guest before boot. `readOnly` is `false` via
 * the builder (`withCopyFileToContainer`); when `false`, a guest write
 * reaches the host file itself — the mount is a view, not a copy. Mirrors
 * upstream `FileMount` exactly.
 */
export const FileMount = S.Struct({
  hostPath: S.String,
  guestPath: S.String,
  readOnly: S.Boolean,
}).pipe(
  S.annotate({
    identifier: 'FileMount',
    title: 'FileMount',
    description: 'A host path mounted into the container before boot.',
  }),
)

export type FileMount = S.Schema.Type<typeof FileMount>

/**
 * A one-shot `exec` inside a running container. `workingDir` is the absolute
 * guest directory the command starts in — the missing-working-dir trap (F3)
 * is a real backend behavior, and carrying it as data lets the caller say
 * exactly where the command runs.
 */
export const ExecRequest = S.Struct({
  command: CommandArguments,
  workingDir: S.optionalKey(S.String),
  env: S.Array(EnvPair),
}).pipe(
  S.annotate({
    identifier: 'ExecRequest',
    title: 'ExecRequest',
    description: 'A one-shot exec request: command, working directory and environment.',
  }),
)

export type ExecRequest = S.Schema.Type<typeof ExecRequest>

/**
 * The result of a one-shot exec — data, never an exception: a non-zero exit
 * code is a verdict, and «ran and exited non-zero» is distinguishable from
 * «never ran» (the exit-127-with-empty-stdout trap, F3). Mirrors upstream
 * `ExecResult` exactly.
 */
export const ExecResult = S.Struct({
  exitCode: FiniteNumber,
  stdout: S.String,
  stderr: S.String,
}).pipe(
  S.annotate({
    identifier: 'ExecResult',
    title: 'ExecResult',
    description: 'The result of a one-shot exec: exit code and captured output.',
  }),
)

export type ExecResult = S.Schema.Type<typeof ExecResult>

/**
 * The immutable, backend-agnostic description of a container to launch —
 * built by the pure combinators, handed to the launch workflow, validated
 * through this codec. A spec never changes once built, and building one
 * performs no I/O (R2).
 */
export const ContainerSpec = S.Struct({
  /** The container's name, `rz-<runId>-<seq>` (a reuse spec carries its hash-derived name instead). */
  name: S.String,
  /** The image reference, e.g. `"redis:8.6-alpine"`. */
  image: S.String,
  /**
   * Array of pairs, not a Map: insertion-ordered, with last-write-wins
   * deduping when a combinator overwrites a key.
   */
  env: S.Array(EnvPair),
  /** `undefined` means the image's own ENTRYPOINT/CMD runs unmodified; an empty array is refused. */
  command: S.optionalKey(CommandArguments),
  /** Overrides the image's ENTRYPOINT when set (parity addition, R3 `withEntrypoint`). */
  entrypoint: S.optionalKey(CommandArguments),
  /** The absolute guest working directory the workload starts in (parity addition, R3 `withWorkingDir`). */
  workingDir: S.optionalKey(S.String),
  /** Already-chosen host ports — the core invariant (R7): a backend binds these, it never allocates its own. */
  ports: S.Array(PortBinding),
  /** Host files/directories to copy into the guest before boot. */
  mounts: S.Array(FileMount),
  /** The network this container joins (library-created), if any. */
  networkId: S.optionalKey(S.String),
  /** Names this container answers to on its network. */
  aliases: S.Array(NetworkAlias),
  /** The process-wide run id that named this container. Unset (`""`) before the launch workflow fills it. */
  runId: S.String,
  /** An explicit memory ceiling in MB, if set via `withMemoryLimit`. */
  memoryLimitMb: S.optionalKey(FiniteNumber),
  /** `true` for a container meant to outlive this process — set via `withReuse`/`withKeepAlive`. */
  keepAlive: S.Boolean,
  /** Set by `fromCheckpoint` to the source checkpoint's ref; `undefined` for every ordinary container. */
  checkpointRef: S.optionalKey(S.String),
  /** A writable-root-disk ceiling in MB, set via `withDiskLimit` — msb-only. */
  diskLimitMb: S.optionalKey(FiniteNumber),
  /** A RAM-backed writable root capped at this many MB, set via `withTmpfsRoot` — msb-only. */
  tmpfsRootMb: S.optionalKey(FiniteNumber),
  /** `true` when `withNetworkDisabled()` was called: blocks the guest's public-internet access on msb. */
  networkDisabled: S.Boolean,
  /** `true` when `withRequireIsolation()` was called: the launch workflow demands a hardware-isolated backend (parity addition, R3). */
  requireIsolation: S.Boolean,
  /** The readiness policy to interpret before the container is ready (parity addition: readiness is data). */
  waitStrategy: WaitStrategy,
  /** Startup deadline in ms, set via `withStartupTimeout`; unset means the interpreter default (120s). */
  startupTimeoutMs: S.optionalKey(FiniteNumber),
}).pipe(
  S.annotate({
    identifier: 'ContainerSpec',
    title: 'ContainerSpec',
    description: 'The immutable, backend-agnostic description of a container to launch.',
  }),
)

export type ContainerSpec = S.Schema.Type<typeof ContainerSpec>
