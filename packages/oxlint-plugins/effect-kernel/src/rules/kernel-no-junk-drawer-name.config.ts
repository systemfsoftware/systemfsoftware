import { Schema as S } from 'effect'

export const Options = S.Struct({})

export const KERNEL_SUFFIX = '.kernel.ts' as const

/** KE6's banned layer/junk-drawer list: util.ts, utils/, helper.ts, common.ts, shared.ts, lib.ts, core/, shell/ */
export const BANNED_SEGMENTS: readonly string[] = [
  'util',
  'utils',
  'helper',
  'common',
  'shared',
  'lib',
  'core',
  'shell',
]

export const JUNK_DRAWER_SEGMENT_MESSAGE =
  '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Ban junk-drawer names for *.kernel.ts files (KE6): the base name or any path segment must not be util, utils, helper, common, shared, lib, core, or shell.',
  },
  schema: [Options],
  messages: {
    junkDrawerSegment: JUNK_DRAWER_SEGMENT_MESSAGE,
  },
} as const
