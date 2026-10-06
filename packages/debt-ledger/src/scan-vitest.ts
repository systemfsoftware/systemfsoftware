import { Option, Schema } from 'effect'
import { ConfigSeverity, type Entry } from './Entry.schema.js'
import { asRecord, type Raw } from './raw.js'

export interface ImportedConfig {
  readonly file: string
  readonly value: Raw
}

const flagEnabled = (value: Raw): boolean =>
  Option.getOrElse(Schema.decodeUnknownOption(Schema.Boolean)(value), () => false)

export const scanVitestConfig = (input: ImportedConfig): ReadonlyArray<Entry> =>
  Option.match(
    Option.flatMap(asRecord(input.value), (module) => asRecord(module['test'])),
    {
      onNone: () => [],
      onSome: (test) =>
        flagEnabled(test['passWithNoTests'])
          ? [
            ConfigSeverity.make({
              file: input.file,
              channel: 'vitest-config',
              scope: 'passWithNoTests',
              value: 'true',
              files: [],
            }),
          ]
          : [],
    },
  )
