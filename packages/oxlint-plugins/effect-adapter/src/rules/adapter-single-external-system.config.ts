import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const SCOPED_ROOT_REGEX = /^(@[^/]+)\/([^/]+)/

export const PORT_ROOTS: Record<string, true> = {
  '@effect/platform': true,
  '@effect/platform-browser': true,
  '@effect/platform-bun': true,
  '@effect/platform-node': true,
  '@effect/platform-node-shared': true,
}

export const MULTIPLE_EXTERNAL_SYSTEMS_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.adapter.ts file wraps exactly one external system — the filename names the technology. A second distinct foreign package import means two technologies in one file: split each into its own *.adapter.ts implementing its own port.',
  },
  schema: [Options],
  messages: {
    multipleExternalSystems: MULTIPLE_EXTERNAL_SYSTEMS_MESSAGE,
  },
} as const
