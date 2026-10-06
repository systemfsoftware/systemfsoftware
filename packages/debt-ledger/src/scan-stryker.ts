import { Option, Schema } from 'effect'
import { ConfigSeverity, type Entry } from './Entry.schema.js'
import { asRecord, type Raw } from './raw.js'

export interface StrykerConfig {
  readonly file: string
  readonly value: Raw
}

const flagEnabled = (value: Raw): boolean =>
  Option.getOrElse(Schema.decodeUnknownOption(Schema.Boolean)(value), () => false)

export const scanStrykerConfig = (input: StrykerConfig): ReadonlyArray<Entry> =>
  Option.match(asRecord(input.value), {
    onNone: () => [],
    onSome: (module) =>
      flagEnabled(module['disableTypeChecks'])
        ? [
          ConfigSeverity.make({
            file: input.file,
            channel: 'stryker-config',
            scope: 'disableTypeChecks',
            value: 'true',
            files: [],
          }),
        ]
        : [],
  })
