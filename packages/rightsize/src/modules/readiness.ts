/**
 * Declared readiness behaviors (R13, KTD11 — upstream's `containerIsStarted`
 * hooks as data): memcached's protocol-level `VERSION` probe and mongodb's
 * replica-set initiation + primary election. These builders return the
 * declarative step rows presets embed; the launch workflow interprets them
 * against the runtime's exec/log capabilities. `stepVerdict` is the pure
 * verdict kernel the interpreter keys on.
 */
import { Match } from 'effect'
import type { ReadinessStep } from './preset.js'

/** memcached's upstream `MemcachedRespondsStrategy` as declared data (readiness.ts owns the behavior's data shape). */
export const memcachedVersionProbeStep = (): ReadinessStep => ({
  _tag: 'ProtocolReply',
  description: 'reply to a VERSION probe',
  guestPort: 11211,
  send: 'version\r\n',
  expectedPrefix: 'VERSION',
  timeoutMs: 60_000,
})

/** mongodb's `containerIsStarted`: initiate the one-member replica set, then wait for a PRIMARY. */
export const mongodbReplicaSetSteps = (): ReadonlyArray<ReadinessStep> => [
  {
    _tag: 'ExecSucceeds',
    description: 'rs.initiate to succeed',
    command: ['mongosh', '--quiet', '--eval', 'try { rs.status() } catch (e) { rs.initiate() }'],
    timeoutMs: 180_000,
  },
  {
    _tag: 'ExecStdoutEndsWith',
    description: 'a PRIMARY to be elected',
    command: ['mongosh', '--quiet', '--eval', 'db.hello().isWritablePrimary'],
    suffix: 'true',
    timeoutMs: 180_000,
  },
]

/**
 * The pure verdict for one exec-style step: whether the observed exec
 * outcome satisfies the step's declared condition. `protocolLine` feeds the
 * `ProtocolReply` verdict (the first line of the reply).
 */
export const stepVerdict = (
  step: ReadinessStep,
  outcome: { readonly exitCode: number; readonly stdout: string },
  protocolLine = '',
): boolean =>
  Match.typeTags<ReadinessStep>()({
    ExecSucceeds: () => outcome.exitCode === 0,
    ExecStdoutEndsWith: (exec) => outcome.stdout.trim().endsWith(exec.suffix),
    ProtocolReply: (protocol) => protocolLine.startsWith(protocol.expectedPrefix),
  })(step)
