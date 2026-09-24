import { type Handle, Resource } from '@systemfsoftware/effect-cell-types'
import { pipe } from 'effect'
import type * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import type * as Layer from 'effect/Layer'
import type * as Scope from 'effect/Scope'
import { describe, expect, it } from 'tstyche'

import { RecordingDevice } from '../tests/__fixtures__/recording-device.handle.js'
import type { DeviceLog, DeviceRefused, ProbeService, TallyService } from '../tests/__fixtures__/recording-driver.js'
import { VolumeSpec } from '../tests/__fixtures__/recording-driver.js'
import { RecordingFile } from '../tests/__fixtures__/recording-file.handle.js'
import { RecordingVolume } from '../tests/__fixtures__/recording-volume.handle.js'
import {
  DeviceNotReady,
  DeviceSpec,
  DeviceUnreachable,
  RecordingDevices,
  RecordingVolumes,
} from '../tests/__fixtures__/recording.resource.js'

type Device = Handle.Handle<'RecordingDevice', { name: string }>
type Volume = Handle.Handle<'RecordingVolume', { label: string }>
type DeviceResource = Resource.Of<typeof RecordingDevices>
type VolumeResource = Resource.Of<typeof RecordingVolumes>

declare const deviceResource: DeviceResource
declare const volumeResource: VolumeResource
declare const useDevice: (self: DeviceResource) => void

describe('Resource.make', () => {
  it('Should_RefuseASpec_When_ItsIdentityIsMissing', () => {
    expect(RecordingDevices.of).type.toBeCallableWith({ name: 'alpha', reachable: true, readiness: 'answers' })
    expect(RecordingDevices.of).type.not.toBeCallableWith({ reachable: true, readiness: 'answers' })
  })

  it('Should_RefuseAChildDefinition_When_ItIsGivenAsTheHandle', () => {
    expect(Resource.make).type.toBeCallableWith({ spec: VolumeSpec, handle: RecordingVolume })
    expect(Resource.make).type.not.toBeCallableWith({ spec: VolumeSpec, handle: RecordingFile })
  })

  it('Should_RequireAPrepare_When_TheSpecIsNotTheCreateInput', () => {
    expect(Resource.make).type.toBeCallableWith({ spec: VolumeSpec, handle: RecordingVolume })
    expect(Resource.make).type.not.toBeCallableWith({ spec: DeviceSpec, handle: RecordingDevice })
  })

  it('Should_HandTheHandleToReady_When_TheDriverIsAcquired', () => {
    Resource.make({
      spec: VolumeSpec,
      handle: RecordingVolume,
      ready: (volume, spec) => {
        expect(volume).type.toBe<Volume>()
        expect(spec).type.toBe<VolumeSpec>()
        return Effect.void
      },
    })
  })
})

describe('Resource.Resource', () => {
  it('Should_CarryItsSpecType_When_ADualIsTypedOverOneKind', () => {
    expect(useDevice).type.toBeCallableWith(deviceResource)
    expect(useDevice).type.not.toBeCallableWith(volumeResource)
  })

  it('Should_AcquireInTheCallersScope_When_ScopedRuns', () => {
    expect(deviceResource.scoped).type.toBe<
      Effect.Effect<Device, DeviceRefused | DeviceUnreachable | DeviceNotReady, DeviceLog | Scope.Scope>
    >()
    expect(volumeResource.scoped).type.toBe<Effect.Effect<Volume, never, DeviceLog | Scope.Scope>>()
  })

  it('Should_ProvideTheHandlesServices_When_TheLayerIsBuilt', () => {
    expect(deviceResource.layer).type.toBe<
      Layer.Layer<ProbeService | TallyService, DeviceRefused | DeviceUnreachable | DeviceNotReady, DeviceLog>
    >()
    expect(volumeResource.layer).type.toBe<Layer.Layer<never, never, DeviceLog>>()
  })

  it('Should_BindTheHandle_When_TheKeyCarriesTheHandleType', () => {
    expect(deviceResource.bind(HeldDeviceKey)).type.toBe<
      Layer.Layer<HeldDeviceKey, DeviceRefused | DeviceUnreachable | DeviceNotReady, DeviceLog>
    >()
    expect(deviceResource.bind).type.not.toBeCallableWith(HeldVolumeKey)
  })

  it('Should_PipeTheResource_When_ADualIsApplied', () => {
    expect(pipe(deviceResource, (resource) => resource.spec)).type.toBe<DeviceSpec>()
  })
})

interface HeldDeviceKey {
  readonly held: 'device'
}

interface HeldVolumeKey {
  readonly held: 'volume'
}

declare const HeldDeviceKey: Context.Key<HeldDeviceKey, Device>
declare const HeldVolumeKey: Context.Key<HeldVolumeKey, Volume>
