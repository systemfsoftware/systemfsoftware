import { it } from '@effect/vitest'
import { Either, Schema as S } from 'effect'

import { ContainerName, PanicCommand } from '../diagnostic.schema.js'
import {
  ClearPanic,
  decidePanic,
  DestroyVaultPassphrase,
  ExecutePanic,
  KillContainers,
  KillContradiction,
  KillSupervisors,
  NoPanicState,
  PanicStep,
  RaiseShields,
  WritePanicLock,
} from '../panic.workflow.js'

const panicCommand = (
  containers: readonly ContainerName[],
  stop: boolean,
  confirmed: boolean,
  bypass: boolean,
  panicked: boolean,
): PanicCommand => ({
  action: 'panic',
  stop,
  confirmed,
  bypassFirewall: bypass,
  panicked,
  containers,
})

const stepTags = (plan: readonly PanicStep[]): readonly string[] =>
  plan.map((step) => {
    if (S.is(RaiseShields)(step)) return 'RaiseShields'
    if (S.is(KillSupervisors)(step)) return 'KillSupervisors'
    if (S.is(DestroyVaultPassphrase)(step)) return 'DestroyVaultPassphrase'
    if (S.is(WritePanicLock)(step)) return 'WritePanicLock'
    if (S.is(KillContainers)(step)) return 'KillContainers'
    return 'unknown'
  })

/** OPS-SURFACE-24/-25: containers are killed exactly when `--stop` or a confirmed prompt asks for it. */
it.prop('∀c_PanicKill_∈Plan', [S.Array(ContainerName), S.Boolean, S.Boolean], ([containers, stop, confirmed]) => {
  if (stop && !confirmed) return true
  const outcome = decidePanic(panicCommand(containers, stop, confirmed, false, false))
  if (Either.isLeft(outcome)) return false
  if (!S.is(ExecutePanic)(outcome.right)) return false
  const decision = outcome.right
  const expected = (stop || confirmed) && containers.length > 0
  const killInPlan = decision.plan.some((step) => S.is(KillContainers)(step))
  const killedCount = decision.report.containersKilled
  return killInPlan === expected &&
    (expected ? killedCount?.count === containers.length : killedCount === undefined)
})

/** OPS-SURFACE-22: the plan is the canonical sequence — shields, supervisors, vault, lock, then kills. */
it.prop(
  '∀c_PanicPlan_⊆Canonical',
  [S.Array(ContainerName), S.Boolean, S.Boolean, S.Boolean],
  ([containers, stop, confirmed, bypass]) => {
    if (stop && !confirmed) return true
    const outcome = decidePanic(panicCommand(containers, stop, confirmed, bypass, false))
    if (Either.isLeft(outcome)) return false
    if (!S.is(ExecutePanic)(outcome.right)) return false
    const tags = stepTags(outcome.right.plan)
    const canonical: string[] = []
    if (!bypass) canonical.push('RaiseShields')
    canonical.push('KillSupervisors', 'DestroyVaultPassphrase', 'WritePanicLock')
    if ((stop || confirmed) && containers.length > 0) canonical.push('KillContainers')
    return tags.length === canonical.length && tags.every((tag, index) => tag === canonical[index])
  },
)

/** OPS-SURFACE-28: with the firewall bypass the report shows BYPASSED and no shield step is planned. */
it.prop('∀c_PanicBypass_=Bypassed', [S.Array(ContainerName), S.Boolean], ([containers, confirmed]) => {
  const outcome = decidePanic(panicCommand(containers, false, confirmed, true, false))
  if (Either.isLeft(outcome)) return false
  if (!S.is(ExecutePanic)(outcome.right)) return false
  return outcome.right.report.shields.kind === 'bypassed' &&
    outcome.right.plan.every((step) => !S.is(RaiseShields)(step))
})

/** OPS-SURFACE-22/-23: the report counts mirror the discovered containers and the vault is destroyed. */
it.prop(
  '∀c_PanicCounts_=Containers',
  [S.Array(ContainerName), S.Boolean, S.Boolean, S.Boolean],
  ([containers, stop, confirmed, bypass]) => {
    if (stop && !confirmed) return true
    const outcome = decidePanic(panicCommand(containers, stop, confirmed, bypass, false))
    if (Either.isLeft(outcome)) return false
    if (!S.is(ExecutePanic)(outcome.right)) return false
    const report = outcome.right.report
    if (report.shields.kind === 'raised') {
      return report.found === containers.length &&
        report.shields.count === containers.length &&
        report.supervisorsKilled === containers.length &&
        report.vault === 'destroyed'
    }
    return report.found === containers.length &&
      report.supervisorsKilled === containers.length &&
      report.vault === 'destroyed'
  },
)

/** OPS-SURFACE-29/-30: `--clear` decides on the panic state and never plans an execution, even with `--stop`. */
it.prop('∀c_PanicClear_=State', [S.Boolean, S.Boolean], ([stop, panicked]) => {
  const command: PanicCommand = {
    action: 'clear',
    stop,
    confirmed: false,
    bypassFirewall: false,
    panicked,
    containers: [],
  }
  const outcome = decidePanic(command)
  if (Either.isLeft(outcome)) return false
  return panicked ? S.is(ClearPanic)(outcome.right) : S.is(NoPanicState)(outcome.right)
})

/** OPS-SURFACE-27: a panic with no containers still records panic state and reports zero counts. */
it.prop('∀c_PanicEmpty_⊇Lock', [S.Boolean], ([confirmed]) => {
  const outcome = decidePanic(panicCommand([], false, confirmed, false, false))
  if (Either.isLeft(outcome)) return false
  if (!S.is(ExecutePanic)(outcome.right)) return false
  return outcome.right.report.found === 0 &&
    outcome.right.plan.some((step) => S.is(WritePanicLock)(step)) &&
    outcome.right.report.containersKilled === undefined
})

/** Refusal: `--stop` with a recorded prompt decline is contradictory input, never a silent kill. */
it.prop('∀c_PanicStop_=Confirmed', [S.Array(ContainerName)], ([containers]) => {
  const outcome = decidePanic(panicCommand(containers, true, false, false, false))
  return Either.isLeft(outcome) && S.is(KillContradiction)(outcome.left)
})
