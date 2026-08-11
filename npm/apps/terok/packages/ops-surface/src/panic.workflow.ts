import * as A from 'effect/Array'
import { type Either, left, right } from 'effect/Either'
import * as Match from 'effect/Match'
import * as S from 'effect/Schema'

import { ContainerName, PanicCommand, PanicReport, ShieldsLine } from './diagnostic.schema.js'

const PanicTypeId: unique symbol = Symbol.for('@terok/ops-surface/Panic')
type PanicTypeId = typeof PanicTypeId

const PanicStepTypeId: unique symbol = Symbol.for('@terok/ops-surface/PanicStep')
type PanicStepTypeId = typeof PanicStepTypeId

/** Raise the egress shield on every running/paused container (OPS-SURFACE-22). */
export class RaiseShields extends S.TaggedClass<RaiseShields>()('RaiseShields', {
  containers: S.Array(ContainerName),
}) {
  readonly [PanicStepTypeId] = PanicStepTypeId
}

/** Kill each per-container supervisor (OPS-SURFACE-22). */
export class KillSupervisors extends S.TaggedClass<KillSupervisors>()('KillSupervisors', {
  containers: S.Array(ContainerName),
}) {
  readonly [PanicStepTypeId] = PanicStepTypeId
}

/** Destroy every stored vault passphrase (OPS-SURFACE-22). */
export class DestroyVaultPassphrase extends S.TaggedClass<DestroyVaultPassphrase>()('DestroyVaultPassphrase', {}) {
  readonly [PanicStepTypeId] = PanicStepTypeId
}

/** Record panic state — the panic lock (OPS-SURFACE-22, -27). */
export class WritePanicLock extends S.TaggedClass<WritePanicLock>()('WritePanicLock', {}) {
  readonly [PanicStepTypeId] = PanicStepTypeId
}

/** Kill containers — only when `--stop` or the prompt confirmed it (OPS-SURFACE-24/-25). */
export class KillContainers extends S.TaggedClass<KillContainers>()('KillContainers', {
  containers: S.Array(ContainerName),
}) {
  readonly [PanicStepTypeId] = PanicStepTypeId
}

export const PanicStep = S.Union(RaiseShields, KillSupervisors, DestroyVaultPassphrase, WritePanicLock, KillContainers)
export type PanicStep = S.Schema.Type<typeof PanicStep>

/** The panic decision: the ordered invalidation plan plus the report it implies. */
export class ExecutePanic extends S.TaggedClass<ExecutePanic>()('ExecutePanic', {
  plan: S.Array(PanicStep),
  report: PanicReport,
}) {
  readonly [PanicTypeId] = PanicTypeId
}

/** `--clear` while panicked: the lock is removed; shields stay raised until a fresh task starts (OPS-SURFACE-29). */
export class ClearPanic extends S.TaggedClass<ClearPanic>()('ClearPanic', {}) {
  readonly [PanicTypeId] = PanicTypeId
}

/** `--clear` while not panicked: `No panic state to clear.`, exit 0 (OPS-SURFACE-29). */
export class NoPanicState extends S.TaggedClass<NoPanicState>()('NoPanicState', {}) {
  readonly [PanicTypeId] = PanicTypeId
}

/** Refusal: `--stop` demands an immediate kill while a recorded prompt decline contradicts it. */
export class KillContradiction extends S.TaggedError<KillContradiction>()('KillContradiction', {}) {
  readonly [PanicTypeId] = PanicTypeId
}

export const PanicDecision = S.Union(ExecutePanic, ClearPanic, NoPanicState)
export type PanicDecision = S.Schema.Type<typeof PanicDecision>

const killRequested = (command: PanicCommand): boolean => command.stop || command.confirmed

/** With the firewall bypass there is no firewall to protect — the shield step is omitted (OPS-SURFACE-28). */
const shieldStep = (command: PanicCommand): readonly PanicStep[] =>
  Match.value(command.bypassFirewall).pipe(
    Match.when(true, (): readonly PanicStep[] => []),
    Match.when(false, (): readonly PanicStep[] => [new RaiseShields({ containers: command.containers })]),
    Match.exhaustive,
  )

const killStep = (command: PanicCommand): readonly PanicStep[] =>
  Match.value(killRequested(command) && command.containers.length > 0).pipe(
    Match.when(true, (): readonly PanicStep[] => [new KillContainers({ containers: command.containers })]),
    Match.when(false, (): readonly PanicStep[] => []),
    Match.exhaustive,
  )

/** The canonical sequence: shields, supervisors, vault, lock, then containers only if asked (OPS-SURFACE-22). */
const panicPlan = (command: PanicCommand): readonly PanicStep[] =>
  A.appendAll(shieldStep(command), [
    new KillSupervisors({ containers: command.containers }),
    new DestroyVaultPassphrase(),
    new WritePanicLock(),
    ...killStep(command),
  ])

const shieldsLine = (command: PanicCommand): ShieldsLine =>
  Match.value(command.bypassFirewall).pipe(
    Match.when(true, (): ShieldsLine => ({ kind: 'bypassed' })),
    Match.when(false, (): ShieldsLine => ({ kind: 'raised', count: command.containers.length })),
    Match.exhaustive,
  )

const killedLine = (command: PanicCommand): { readonly count: number } | undefined =>
  Match.value(killRequested(command) && command.containers.length > 0).pipe(
    Match.when(true, (): { readonly count: number } => ({ count: command.containers.length })),
    Match.when(false, (): undefined => undefined),
    Match.exhaustive,
  )

const panicReport = (command: PanicCommand): PanicReport => ({
  found: command.containers.length,
  shields: shieldsLine(command),
  supervisorsKilled: command.containers.length,
  vault: 'destroyed',
  containersKilled: killedLine(command),
})

const executePanic = (command: PanicCommand): ExecutePanic =>
  new ExecutePanic({ plan: panicPlan(command), report: panicReport(command) })

const panicDecision = (command: PanicCommand): Either<PanicDecision, KillContradiction> =>
  Match.value(command.stop && !command.confirmed).pipe(
    Match.when(true, () => left(new KillContradiction())),
    Match.when(false, () => right(executePanic(command))),
    Match.exhaustive,
  )

const clearDecision = (command: PanicCommand): Either<PanicDecision, KillContradiction> =>
  Match.value(command.panicked).pipe(
    Match.when(true, (): Either<PanicDecision, KillContradiction> => right(new ClearPanic())),
    Match.when(false, (): Either<PanicDecision, KillContradiction> => right(new NoPanicState())),
    Match.exhaustive,
  )

export const decidePanic = (command: PanicCommand): Either<PanicDecision, KillContradiction> =>
  Match.value(command.action).pipe(
    Match.when('clear', () => clearDecision(command)),
    Match.when('panic', () => panicDecision(command)),
    Match.exhaustive,
  )
