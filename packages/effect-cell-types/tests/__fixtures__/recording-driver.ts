import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Ref from 'effect/Ref'
import * as Schema from 'effect/Schema'

export type Log = Ref.Ref<ReadonlyArray<string>>

export class DeviceRefused extends Schema.TaggedError<DeviceRefused>()('DeviceRefused', {
  name: Schema.String,
}) {}

export class StepFailed extends Schema.TaggedError<StepFailed>()('StepFailed', {
  step: Schema.String,
}) {}

export interface FileDriver {
  readonly read: (length: number) => Effect.Effect<string>
  readonly close: (reason: string) => Effect.Effect<void>
}

/** A driver that records every call it receives into the log its creator was handed. */
export interface RecordingDriver {
  readonly record: (line: string) => Effect.Effect<void>
  readonly step: (line: string) => Effect.Effect<void, StepFailed>
  readonly echo: (text: string) => Effect.Effect<string>
  readonly open: (path: string) => Effect.Effect<FileDriver>
  readonly lines: (since: number) => Effect.Effect<ReadonlyArray<string>>
}

const record = (log: Log, line: string): Effect.Effect<void> => Ref.update(log, (lines) => [...lines, line])

const stepWith = (log: Log, failing: ReadonlyArray<string>) => (line: string): Effect.Effect<void, StepFailed> =>
  Effect.andThen(
    record(log, line),
    failing.includes(line) ? Effect.fail(new StepFailed({ step: line })) : Effect.void,
  )

export interface Recording {
  readonly log: Log
  readonly failing: ReadonlyArray<string>
}

const fileDriver = (log: Log, path: string): FileDriver => ({
  read: (length) => Effect.as(record(log, `read ${path}`), path.slice(0, length)),
  close: (reason) => record(log, `close ${path} on ${reason}`),
})

export const recordingDriver = ({ log, failing }: Recording): RecordingDriver => ({
  record: (line) => record(log, line),
  step: stepWith(log, failing),
  echo: (text) => Effect.as(record(log, `echo ${text}`), text),
  open: (path) => Effect.as(record(log, `open ${path}`), fileDriver(log, path)),
  lines: (since) => Effect.map(Ref.get(log), (lines) => lines.slice(since)),
})

export class DeviceLog extends Context.Service<DeviceLog, Log>()('DeviceLog') {}

export class VolumeSpec extends Schema.Class<VolumeSpec>('VolumeSpec')({
  label: Schema.String,
}) {}

export interface Tally {
  readonly lines: Effect.Effect<ReadonlyArray<string>>
}

export class TallyService extends Context.Service<TallyService, Tally>()('TallyService') {}

/** A third-party library that needs the driver itself to build its service. */
export const tallyLayer = (driver: RecordingDriver): Layer.Layer<TallyService> =>
  Layer.succeed(TallyService, { lines: driver.lines(0) })

export interface Probe {
  readonly ping: Effect.Effect<void>
}

export class ProbeService extends Context.Service<ProbeService, Probe>()('ProbeService') {}
