import { Handle } from '@systemfsoftware/effect-cell-types'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'

import { DeviceRefused, type Log, ProbeService, recordingDriver, tallyLayer } from './recording-driver.js'
import { RecordingFile } from './recording-file.handle.js'

export interface DeviceInput {
  readonly log: Log
  readonly name: string
  readonly failing: ReadonlyArray<string>
}

const created = (input: DeviceInput) => {
  const driver = recordingDriver(input)
  return Effect.as(driver.record(`create ${input.name}`), { driver, data: { name: input.name } })
}

export const RecordingDevice = Handle.make({
  name: 'RecordingDevice',
  create: (input: DeviceInput) =>
    input.name.length === 0 ? Effect.fail(new DeviceRefused({ name: input.name })) : created(input),
  release: [
    [(driver) => driver.step('stop'), (driver) => driver.step('kill')],
    [(driver) => driver.step('destroy')],
  ],
  operations: {
    ping: (driver) => driver.record('ping'),
    echo: (driver, _device, text: string) => driver.echo(text),
  },
  streams: {
    ticks: (driver, _device, count: number) => Stream.take(Stream.fromEffectRepeat(driver.record('tick')), count),
  },
  children: {
    open: {
      handle: RecordingFile,
      create: (driver, _device, path: string) =>
        Effect.map(driver.open(path), (file) => ({ driver: file, data: { path } })),
    },
  },
  services: (device, members) => Context.make(ProbeService, { ping: members.operations.ping(device) }),
  integration: (driver) => tallyLayer(driver),
})

export const ping = RecordingDevice.operations.ping
export const echo = RecordingDevice.operations.echo
export const ticks = RecordingDevice.streams.ticks
export const open = RecordingDevice.children.open
