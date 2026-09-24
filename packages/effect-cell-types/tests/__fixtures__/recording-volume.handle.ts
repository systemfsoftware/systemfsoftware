import { Handle } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'

import { type Log, recordingDriver } from './recording-driver.js'

export interface VolumeInput {
  readonly log: Log
  readonly label: string
}

export const RecordingVolume = Handle.make({
  name: 'RecordingVolume',
  create: (input: VolumeInput) =>
    Effect.succeed({ driver: recordingDriver({ log: input.log, failing: [] }), data: { label: input.label } }),
  operations: {
    lines: (driver, _volume, since: number) => driver.lines(since),
  },
})

export const lines = RecordingVolume.operations.lines
