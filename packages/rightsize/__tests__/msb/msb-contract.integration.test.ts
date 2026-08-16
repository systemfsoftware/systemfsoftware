/**
 * The msb-conditional contract lane (R10, RS-LANE): cases whose observable
 * behavior differs on the microsandbox backend, held behind the
 * `RIGHTSIZE_MSB_IT` gate. Without the gate every case SKIPS — this is the
 * one deliberately gated lane in the package (mirroring upstream's
 * `RIGHTSIZE_IT` discipline); the docker parity lane never skips. Until a
 * KVM-capable runner exists (none in this repo's CI today), these cases
 * pin the msb backend's expected behaviors for when one appears.
 */
import { Gherkin, Given, it, layer, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer, Result, type Scope } from 'effect'
import { expect } from 'vitest'

import { layerMsb } from '../../src/backend-msb/index.js'
import { fromImage } from '../../src/generic-container.js'
import { launchContainer } from '../../src/lifecycle/launch.executor.js'
import type { RuntimeCapabilities } from '../../src/model/capabilities.schema.js'
import { ProvisionError } from '../../src/model/errors.js'
import type { RightsizeConfigService } from '../../src/runtime/config.js'
import { RightsizeConfig } from '../../src/runtime/config.js'
import { layerRuntimeDiscovery, RuntimeDiscovery } from '../../src/runtime/discovery/discovery.adapter.js'
import { CheckpointStore, ImageRegistry, SandboxRuntime, VirtualNetworks } from '../../src/runtime/runtime.js'
import { Selection } from '../../src/runtime/selection.workflow.js'
import type { LaneOutcome } from '../parity/helpers.js'

/**
 * The msb board's full service set, in tag spelling — the form
 * `Effect.provide`'s `Exclude` subtracts, so a provided effect's `R`
 * erases completely.
 */
type MsbBoard =
  | RightsizeConfig
  | Selection
  | RuntimeDiscovery
  | SandboxRuntime
  | VirtualNetworks
  | CheckpointStore
  | ImageRegistry

const msbConfig = (): RightsizeConfigService => ({
  backend: 'msb',
  reaper: 'off',
  cacheDir: '/tmp/rightsize-msb-it-cache',
  reuse: false,
  msbPath: undefined,
  msbSkipDownload: false,
})

/**
 * The msb backend board — built only when the gate is on (skip-gated, so no
 * provisioner runs without it). `provideMerge`, not `mergeAll` membership:
 * `layerMsb` reads `RightsizeConfig`, which `mergeAll` builds in parallel —
 * as a provided dependency the order is structural. The merge provides the
 * full lane context so a provided effect's `R` erases completely.
 */
const msbLayer: Layer.Layer<MsbBoard, ProvisionError> = layerMsb().pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      Layer.succeed(RightsizeConfig, msbConfig()),
      Layer.succeed(Selection, { backend: 'msb', dockerSocketPath: undefined }),
      layerRuntimeDiscovery,
    ),
  ),
)

/** Capture a fallible msb-backed effect as data, mirroring the parity lane's outcome idiom. */
const msbOutcome = <A, E>(
  effect: Effect.Effect<A, E, MsbBoard | Scope.Scope>,
): Effect.Effect<LaneOutcome<A>, never, Scope.Scope> =>
  Effect.map(
    Effect.result(effect.pipe(Effect.provide(msbLayer.pipe(Layer.orDie)))),
    (result): LaneOutcome<A> =>
      Result.isSuccess(result)
        ? { ok: true, value: result.success, failureTag: undefined, failureMessage: undefined }
        : { ok: false, value: undefined, failureTag: undefined, failureMessage: String(result.failure) },
  )

const Feature = makeFeature({ it, layer })

Feature('the microsandbox contract runs only under the RIGHTSIZE_MSB_IT gate').body(({ scenario }) => {
  scenario.skip(
    'Should_report_msb_capabilities_When_hardware_virtualization_is_present',
    Gherkin.Do.pipe(
      Given('the msb backend reports its capabilities')('caps', () =>
        msbOutcome(
          Effect.gen(function*() {
            const runtime = yield* SandboxRuntime
            return runtime.capabilities
          }),
        )),
      Then('hardware isolation and checkpoint-restart are reported')((s) => {
        expect(s.caps.ok).toBe(true)
        const caps: RuntimeCapabilities | undefined = s.caps.value
        expect(caps?.hardwareIsolated).toBe(true)
        expect(caps?.checkpointRestartsWorkload).toBe(true)
      }),
    ),
  )

  scenario.skip(
    'Should_launch_a_container_When_a_real_microvm_boots',
    Gherkin.Do.pipe(
      Given('a container launches through the executor on msb')(
        'launch',
        () => msbOutcome(launchContainer(fromImage('alpine:3.19').withCommand('sleep', '60').spec)),
      ),
      Then('a running handle came back')((s) => {
        expect(s.launch.ok).toBe(true)
      }),
    ),
  )
})
