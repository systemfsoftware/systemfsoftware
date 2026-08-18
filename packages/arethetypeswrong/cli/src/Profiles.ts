import type { ResolutionKind } from '@systemfsoftware/arethetypeswrong-core'

import { ApplyProfileCommand, ApplyProfileDecision } from './Profiles.schema.js'

const profileIgnoreResolutions: Record<'strict' | 'node16' | 'esm-only', readonly ResolutionKind[]> = {
  strict: [],
  node16: ['node10'],
  'esm-only': ['node10', 'node16-cjs'],
}

export type CliProfileName = 'strict' | 'node16' | 'esm-only'

/**
 * Merge the caller's silenced resolutions with the profile's own. Order is the
 * caller's first, then the profile's, and duplicates are kept: the list is a
 * record of what was asked for, not a set.
 */
export const applyProfile = (command: ApplyProfileCommand): ApplyProfileDecision =>
  new ApplyProfileDecision({
    ignoreResolutions: [
      ...(command.ignoreResolutions ?? []),
      ...profileIgnoreResolutions[command.profileName],
    ],
  })
