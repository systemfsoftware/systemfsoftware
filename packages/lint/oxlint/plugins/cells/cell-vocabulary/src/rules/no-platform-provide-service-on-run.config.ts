import { Cell } from '@systemfsoftware/effect-cell-types'
import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const DESCRIPTION_NAMESPACE = 'Cell' as const

export const MODULE_SOURCE: string = Cell.vocabulary.module

export const RUN_NAME: string = Cell.vocabulary.shell.run

if (Object.values(Cell.vocabulary.shell).some((name) => name.length === 0)) {
  throw new Error(
    `${DESCRIPTION_NAMESPACE}: the vocabulary reports an empty shell name, so this rule would decide nothing`,
  )
}

export const EFFECT_SOURCES: readonly string[] = ['effect/Effect', 'effect'] as const
export const EFFECT_NAMESPACE = 'Effect' as const
export const PROVIDE_SERVICE_NAME = 'provideService' as const
export const PIPE_NAME = 'pipe' as const
export const PIPE_SOURCES: readonly string[] = ['effect', 'effect/Function'] as const

export const BANNED_TAG_BY_SOURCE: Record<string, string> = {
  'effect/FileSystem': 'FileSystem',
  'effect/Path': 'Path',
}

if (Object.keys(BANNED_TAG_BY_SOURCE).length === 0) {
  throw new Error(
    `${DESCRIPTION_NAMESPACE}: the banned-tag classification is empty, so this rule would decide nothing`,
  )
}

export const PLATFORM_PROVIDE_SERVICE_EXPECTED =
  'FileSystem and Path provided once as a Layer at the process composition root, never provideService-d onto the Effect a Cell.run returns' as const

export const PLATFORM_PROVIDE_SERVICE_ACTUAL =
  'a provideService of a FileSystem or Path tag applied to the Effect returned by Cell.run — directly as the data-first first argument, or as a step of a pipe chain rooted at the run call' as const

export const PLATFORM_PROVIDE_SERVICE_FIX =
  'provide FileSystem and Path once as a Layer at the process composition root; do not provideService them onto Cell.run' as const

export const PLATFORM_PROVIDE_SERVICE_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Report Effect.provideService of a FileSystem or Path tag applied to the Effect returned by Cell.run — one diagnostic per call, pipe-step and data-first forms. Tags are recognised by their import binding from effect/FileSystem or effect/Path (namespace or named), provideService by its effect/Effect binding (namespace or named). A provideService applied to an identifier a helper returned is not followed; a helper whose own body contains the chain is reported.',
  },
  schema: [Options],
  messages: {
    platformProvideServiceOnRun: PLATFORM_PROVIDE_SERVICE_MESSAGE,
  },
} as const
