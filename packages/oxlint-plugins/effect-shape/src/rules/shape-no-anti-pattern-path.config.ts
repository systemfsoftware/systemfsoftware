import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const SHAPE_SUFFIX = '.shape.ts' as const

/** The SH6 lint list; the broader technology-layer ban (entities/, components/, routes/, ...) stays review-gated. */
export const BANNED_PATH_SEGMENTS: ReadonlyArray<string> = [
  'core',
  'shell',
  'util',
  'utils',
  'helper',
  'manager',
  'service',
]

export const ANTI_PATTERN_PATH_EXPECTED =
  'the shape under a capability-named directory (banned path segments: core, shell, util, utils, helper, manager, service)' as const
export const ANTI_PATTERN_PATH_ACTUAL_PREFIX = 'a path segment matching the banned list:' as const
export const ANTI_PATTERN_PATH_FIX =
  'move the file into a directory named for the bounded context the foreign model belongs to — the path should read as a capability, not a technology layer' as const

export const ANTI_PATTERN_PATH_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.shape.ts file must not live under a junk-drawer directory segment (core, shell, util, utils, helper, manager, service) — the path names the bounded context the foreign model belongs to.',
  },
  schema: [Options],
  messages: {
    antiPatternPath: ANTI_PATTERN_PATH_MESSAGE,
  },
} as const
