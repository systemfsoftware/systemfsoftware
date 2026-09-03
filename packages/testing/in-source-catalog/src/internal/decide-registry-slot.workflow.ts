/// <reference types="vitest/import-meta" />
import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { catalog } from '../laws.js'

class DecideRegistrySlotCommand extends S.TaggedClass<DecideRegistrySlotCommand>()('DecideRegistrySlotCommand', {
  tenant: S.String,
  tier: S.String,
  slot: S.String,
}) {}

class RegistrySlotGranted extends S.TaggedClass<RegistrySlotGranted>()('RegistrySlotGranted', {
  root: S.String,
  readOnly: S.Boolean,
}) {}

class SlotRefused extends S.TaggedError<SlotRefused>()('SlotRefused', {
  why: S.String,
}) {}

interface RegistrySlot {
  readonly root: string
  readonly readOnly: boolean
}

/** @internal */
export const decideRegistrySlot = Workflow.make(
  DecideRegistrySlotCommand,
  (command): Result.Result<RegistrySlot, SlotRefused> =>
    Match.value(command).pipe(
      Match.when({ slot: (slot: string) => slot.endsWith('.env') }, () =>
        Result.fail(SlotRefused.make({ why: 'reserved environment file' }))),
      Match.when({ tier: 'primary' }, () =>
        Result.succeed(RegistrySlotGranted.make({ root: '/var/lib/registry', readOnly: true }))),
      Match.orElse(() =>
        Result.succeed(RegistrySlotGranted.make({ root: '/var/opt/registry', readOnly: true }))
      ),
    ),
)

if (import.meta.vitest !== void 0) {
  await catalog.laws({
    id: 'decideRegistrySlot',
    run: decideRegistrySlot,
    reserved: catalog.refuseHomes.reservedEnvFile((envFilePath: string) =>
      DecideRegistrySlotCommand.make({ tenant: 'widgets', tier: 'primary', slot: envFilePath })
    ),
    refused: Result.isFailure,
    published: catalog.contract([
      {
        label: 'primary',
        input: DecideRegistrySlotCommand.make({ tenant: 'widgets', tier: 'primary', slot: 'widgets' }),
        project: (result: Result.Result<RegistrySlot, SlotRefused>) =>
          Result.isSuccess(result) ? { root: result.success.root, readOnly: result.success.readOnly } : {},
        expect: { root: '/var/lib/registry', readOnly: true },
      },
    ]),
  })
}
