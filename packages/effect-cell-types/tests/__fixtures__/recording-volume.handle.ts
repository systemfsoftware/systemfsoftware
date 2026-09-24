import { Handle } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'

import { DeviceLog, recordingDriver, type VolumeSpec } from './recording-driver.js'

export const RecordingVolume = Handle.make({
  name: 'RecordingVolume',
  create: (spec: VolumeSpec) =>
    Effect.map(DeviceLog, (log) => ({
      driver: recordingDriver({ log, failing: [] }),
      data: { label: spec.label },
    })),
  operations: {
    lines: (driver, _volume, since: number) => driver.lines(since),
  },
})

export const lines = RecordingVolume.operations.lines
