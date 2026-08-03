import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const OBSERVER_MODULE_SOURCE = /\.observer(?:\.(?:[cm]?[tj]s))?$/u
export const TEST_FILE_SOURCE = /\.(?:test|spec)(?:\.d)?\.(?:[cm]?[tj]sx?)$/u
export const TEST_PATH_SOURCE = /(?:^|\/)(?:__tests__|tests|test|__fixtures__)(?:\/|$)/u
export const TOOLING_PATH_SOURCE = /(?:^|\/)(?:scripts|tools|tooling|bin)(?:\/|$)/u

export const PRODUCTION_IMPORT_EXPECTED =
  'observer machinery imported only by test files, other observer modules, and tooling entrypoints' as const
export const PRODUCTION_IMPORT_ACTUAL = 'an import of the observer cell from a production file' as const
export const PRODUCTION_IMPORT_FIX =
  'move the harness call into a test or tooling entrypoint, or extract the shared behavior into a production cell so the gate stays independent' as const

export const PRODUCTION_IMPORT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban production imports of *.observer.ts modules. Observer machinery may be imported only by test files, other observer modules, and tooling entrypoints — a production importer inverts the frame, and the gate stops being independent.',
  },
  schema: [Options],
  messages: {
    productionObserverImport: PRODUCTION_IMPORT_MESSAGE,
  },
} as const
