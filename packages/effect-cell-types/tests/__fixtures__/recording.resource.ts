import { Resource } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Schema from 'effect/Schema'

import { ping, RecordingDevice } from './recording-device.handle.js'
import { DeviceLog, VolumeSpec } from './recording-driver.js'
import { RecordingVolume } from './recording-volume.handle.js'

export class DeviceSpec extends Schema.Class<DeviceSpec>('DeviceSpec')({
  name: Schema.String,
  reachable: Schema.Boolean,
  readiness: Schema.Literals(['answers', 'refuses', 'hangs']),
}) {}

export class DeviceUnreachable extends Schema.TaggedError<DeviceUnreachable>()('DeviceUnreachable', {
  name: Schema.String,
}) {}

export class DeviceNotReady extends Schema.TaggedError<DeviceNotReady>()('DeviceNotReady', {
  name: Schema.String,
}) {}

const inputOf = (spec: DeviceSpec) => Effect.map(DeviceLog, (log) => ({ log, name: spec.name, failing: [] }))

export const RecordingDevices = Resource.make({
  spec: DeviceSpec,
  handle: RecordingDevice,
  prepare: (spec) => (spec.reachable ? inputOf(spec) : Effect.fail(new DeviceUnreachable({ name: spec.name }))),
  ready: (device, spec) =>
    Match.value(spec.readiness).pipe(
      Match.when('answers', () => ping(device)),
      Match.when('refuses', () => Effect.fail(new DeviceNotReady({ name: spec.name }))),
      Match.when('hangs', () => Effect.never),
      Match.exhaustive,
    ),
})

export const RecordingVolumes = Resource.make({ spec: VolumeSpec, handle: RecordingVolume })
