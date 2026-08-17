/**
 * Module presets as data — the catalog's single row type plus the small
 * declaration unions it embeds (R13, KTD11). One preset row carries
 * everything upstream spread across 23 `GenericContainer` subclasses: the
 * default image, the compatibility gate's expected repository, env pairs,
 * command, exposed guest ports, network aliases, the wait-strategy data
 * (from `model/wait.ts`), declared readiness steps (memcached's
 * version probe, mongodb's replica-set initiation), the memory floor,
 * backend restrictions, post-allocation spec transforms (the upstream
 * `customizeSpec` hooks as data), and helper derivations (the upstream
 * connection-URI getters as data + one interpreter).
 *
 * Schema-law note: like `wait.ts`, these members carry base
 * `S.Number` where a domain check belongs to the interpreter/table-author,
 * never a refinement — a refinement embedded through the union's copied
 * member nodes cannot be discriminated by the law kernel, and the port/time
 * ranges are table invariants enforced by the catalog tests.
 */
import { Schema as S } from 'effect'
import { EnvPair } from '../model/container-spec.js'
import { WaitStrategy } from '../model/wait.js'

/**
 * One declared backend restriction: a feature or topology the preset only
 * supports on the named backends. Carried as data so the launch workflow's
 * capability check (upstream `containerIsStarting`) can reject pre-I/O.
 */
export const BackendRestriction = S.Struct({
  /** A noun phrase naming the feature, e.g. "the TaskManager companion". */
  feature: S.String,
  /** Backend names that support the feature ("docker", "microsandbox"). */
  backends: S.Array(S.String),
}).pipe(
  S.annotate({
    identifier: 'BackendRestriction',
    title: 'BackendRestriction',
    description: 'A preset feature restricted to named backends.',
  }),
)

export type BackendRestriction = S.Schema.Type<typeof BackendRestriction>

/**
 * A declared post-readiness step — upstream's `containerIsStarted` hook as
 * data (KTD11). Each member names a pollable condition the launch workflow
 * interprets against the runtime's exec/log capabilities.
 */
export const ExecSucceeds = S.TaggedStruct('ExecSucceeds', {
  /** Human-readable goal, used in timeout messages ("rs.initiate to succeed"). */
  description: S.String,
  /** The in-container command to exec repeatedly until it exits 0. */
  command: S.Array(S.String),
  // Deadline as base Number: the interpreter owns the check. @effect-diagnostics-next-line schemaNumber:off
  timeoutMs: S.Number,
})

export type ExecSucceeds = S.Schema.Type<typeof ExecSucceeds>

export const ExecStdoutEndsWith = S.TaggedStruct('ExecStdoutEndsWith', {
  description: S.String,
  command: S.Array(S.String),
  /** The suffix the trimmed stdout must carry before the step passes. */
  suffix: S.String,
  // Deadline as base Number: the interpreter owns the check. @effect-diagnostics-next-line schemaNumber:off
  timeoutMs: S.Number,
})

export type ExecStdoutEndsWith = S.Schema.Type<typeof ExecStdoutEndsWith>

export const ProtocolReply = S.TaggedStruct('ProtocolReply', {
  description: S.String,
  // Guest port as base Number: the table tests validate the range. @effect-diagnostics-next-line schemaNumber:off
  guestPort: S.Number,
  /** The exact bytes to send once connected (memcached: `version\r\n`). */
  send: S.String,
  /** The prefix the first reply line must carry (memcached: `VERSION`). */
  expectedPrefix: S.String,
  // Deadline as base Number: the interpreter owns the check. @effect-diagnostics-next-line schemaNumber:off
  timeoutMs: S.Number,
})

export type ProtocolReply = S.Schema.Type<typeof ProtocolReply>

/**
 * The closed union of declared readiness steps. A step is read AFTER the
 * wait strategy data passes and before the container is reported ready.
 */
export const ReadinessStep = S.TaggedUnion({
  ExecSucceeds: ExecSucceeds.fields,
  ExecStdoutEndsWith: ExecStdoutEndsWith.fields,
  ProtocolReply: ProtocolReply.fields,
}).pipe(
  S.annotate({
    identifier: 'ReadinessStep',
    title: 'ReadinessStep',
    description: 'A declared post-wait readiness step a preset requires before start() returns.',
  }),
)

export type ReadinessStep = S.Schema.Type<typeof ReadinessStep>

/**
 * A post-port-allocation spec transform — upstream's `customizeSpec` hook
 * as data. `TemplateEnv` appends an env pair with `${port:N}` placeholders
 * substituted from the allocated bindings (Kafka's advertised listener);
 * `TemplateCommand` replaces the command the same way (Redpanda's
 * advertised listeners); `DropEnvWhenKey` removes a preset env pair once an
 * override env key is present (ArangoDB's no-auth default).
 */
export const TemplateEnv = S.TaggedStruct('TemplateEnv', {
  envKey: S.String,
  /** The env value; every `${port:<guestPort>}` marker is substituted with the mapped host port. */
  template: S.String,
})

export type TemplateEnv = S.Schema.Type<typeof TemplateEnv>

export const TemplateCommand = S.TaggedStruct('TemplateCommand', {
  /** The replacement command; `${port:<guestPort>}` markers are substituted like the env template. */
  command: S.Array(S.String),
})

export type TemplateCommand = S.Schema.Type<typeof TemplateCommand>

export const DropEnvWhenKey = S.TaggedStruct('DropEnvWhenKey', {
  /** The env key to drop from the spec (e.g. `ARANGO_NO_AUTH`). */
  dropKey: S.String,
  /** The env key whose presence triggers the drop (e.g. `ARANGO_ROOT_PASSWORD`). */
  whenKey: S.String,
})

export type DropEnvWhenKey = S.Schema.Type<typeof DropEnvWhenKey>

export const SpecTransform = S.TaggedUnion({
  TemplateEnv: TemplateEnv.fields,
  TemplateCommand: TemplateCommand.fields,
  DropEnvWhenKey: DropEnvWhenKey.fields,
}).pipe(
  S.annotate({
    identifier: 'SpecTransform',
    title: 'SpecTransform',
    description: 'A post-port-allocation spec transform (upstream customizeSpec as data).',
  }),
)

export type SpecTransform = S.Schema.Type<typeof SpecTransform>

/**
 * A helper declaration — a named connection helper the one interpreter
 * (`helpers.ts`) builds from the started container's port map and env.
 * `Url` assembles `scheme://[user:pass@]host:port[/path][?query]` with the
 * credential/database components drawn from the spec env when declared;
 * `Address` is `host:port`; `PortValue` is the mapped host port number;
 * `Constant` is a fixed string.
 */
export const UrlHelper = S.TaggedStruct('Url', {
  scheme: S.String,
  // Guest port as base Number: the table invariants own the range. @effect-diagnostics-next-line schemaNumber:off
  guestPort: S.Number,
  path: S.optionalKey(S.String),
  query: S.optionalKey(S.String),
  usernameEnv: S.optionalKey(S.String),
  passwordEnv: S.optionalKey(S.String),
  databaseEnv: S.optionalKey(S.String),
})

export type UrlHelper = S.Schema.Type<typeof UrlHelper>

export const AddressHelper = S.TaggedStruct('Address', {
  // GuestPort as base Number: the table invariants own the range. @effect-diagnostics-next-line schemaNumber:off
  guestPort: S.Number,
})

export type AddressHelper = S.Schema.Type<typeof AddressHelper>

export const PortValueHelper = S.TaggedStruct('PortValue', {
  // GuestPort as base Number: the table invariants own the range. @effect-diagnostics-next-line schemaNumber:off
  guestPort: S.Number,
})

export type PortValueHelper = S.Schema.Type<typeof PortValueHelper>

export const ConstantHelper = S.TaggedStruct('Constant', {
  value: S.String,
})

export type ConstantHelper = S.Schema.Type<typeof ConstantHelper>

export const PresetHelper = S.TaggedUnion({
  Url: UrlHelper.fields,
  Address: AddressHelper.fields,
  PortValue: PortValueHelper.fields,
  Constant: ConstantHelper.fields,
}).pipe(
  S.annotate({
    identifier: 'PresetHelper',
    title: 'PresetHelper',
    description: 'A named helper declaration, interpreted against the started container port map.',
  }),
)

export type PresetHelper = S.Schema.Type<typeof PresetHelper>

/**
 * One module preset row: the full data surface of an upstream module class,
 * with names matching upstream's field sets. The row is immutable data;
 * `presets/*.ts` author the 23 rows and `index.ts` exposes the registry.
 */
export const ModulePreset = S.Struct({
  /** The registry key, e.g. `redis`, `floci-gcp`. */
  id: S.String,
  /** One-line human summary of the module (the upstream class doc, truncated). */
  description: S.String,
  /** The float-in default image; absent means an explicit image is required (elasticsearch). */
  image: S.optionalKey(S.String),
  /** The repository the image-compat gate expects (`IncompatibleImageError` on mismatch). */
  expectedRepository: S.String,
  /** Default env pairs (insertion-ordered, last-write-wins when overridden). */
  env: S.Array(EnvPair),
  /** The command override, if the module boots with one. */
  command: S.optionalKey(S.Array(S.String)),
  /** Exposed guest ports — the launch workflow allocates host ports for each (R7). */
  // Ports as base Numbers — the table invariants own the range. @effect-diagnostics-next-line schemaNumber:off
  ports: S.Array(S.Number),
  /** Network aliases the container answers to when a caller attaches it to a library network. */
  aliases: S.Array(S.String),
  /** The readiness policy, interpreted by the wait interpreter (R11). */
  waitStrategy: WaitStrategy,
  /** Declared post-wait steps (memcached version probe; mongodb replica-set init). */
  readinessSteps: S.Array(ReadinessStep),
  /** Startup deadline in ms; unset means the interpreter default (120s). */
  // base Number: the interpreter owns the check. @effect-diagnostics-next-line schemaNumber:off
  startupTimeoutMs: S.optionalKey(S.Number),
  /** The memory floor in MB a heavyweight image cannot boot under. */
  // base Number: the table invariants own the floor. @effect-diagnostics-next-line schemaNumber:off
  memoryLimitMb: S.optionalKey(S.Number),
  /** Features the module's companion topologies only support on named backends. */
  backendRestrictions: S.Array(BackendRestriction),
  /** Post-port-allocation customizeSpec hooks as data. */
  specTransforms: S.Array(SpecTransform),
  /** Named helper declarations interpreted by `helpers.ts` against the port map. */
  helpers: S.Record(S.String, PresetHelper),
}).pipe(
  S.annotate({
    identifier: 'ModulePreset',
    title: 'ModulePreset',
    description:
      'A module preset: the image, env, ports, wait data, memory floor, restrictions, transforms and helper declarations of one upstream module.',
  }),
)

export type ModulePreset = S.Schema.Type<typeof ModulePreset>
