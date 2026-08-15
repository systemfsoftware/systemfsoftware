import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const ACL_SUFFIX = '.acl.ts' as const

/** The ACL5 lint list — the broader technology-layer ban (entities/, components/, routes/, ...) is convention-only. */
export const BANNED_PATH_SEGMENTS: readonly string[] = [
  'core',
  'shell',
  'util',
  'utils',
  'helper',
  'manager',
  'service',
]

export const ANTI_PATTERN_PATH_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A *.acl.ts file must not live under a junk-drawer directory segment (core, shell, util, utils, helper, manager, service) — the path names the bounded context the ACL translates.',
  },
  schema: [Options],
  messages: {
    antiPatternPath: ANTI_PATTERN_PATH_MESSAGE,
  },
} as const
