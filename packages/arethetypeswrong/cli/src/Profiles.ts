/// <reference types="vitest/import-meta" />
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

if (import.meta.vitest !== void 0) {
  const { describe, expect, it } = import.meta.vitest
  const decisionFor = (
    profileName: CliProfileName,
    ignoreResolutions?: readonly ResolutionKind[],
  ): readonly ResolutionKind[] =>
    applyProfile(
      new ApplyProfileCommand(
        ignoreResolutions === undefined ? { profileName } : { profileName, ignoreResolutions },
      ),
    ).ignoreResolutions

  describe('applyProfile', () => {
    it('Should_KeepOnlyTheCallersList_When_ProfileIsStrict', () => {
      expect(decisionFor('strict', ['bundler'])).toEqual(['bundler'])
    })

    it('Should_ReturnEmpty_When_StrictAndNothingSilenced', () => {
      expect(decisionFor('strict')).toEqual([])
    })

    it('Should_AppendNode10_When_ProfileIsNode16', () => {
      expect(decisionFor('node16', ['bundler'])).toEqual(['bundler', 'node10'])
    })

    it('Should_AppendNode10ThenNode16Cjs_When_ProfileIsEsmOnly', () => {
      expect(decisionFor('esm-only', ['bundler'])).toEqual(['bundler', 'node10', 'node16-cjs'])
    })

    it('Should_ReturnTheProfileListAlone_When_NothingSilenced', () => {
      expect(decisionFor('esm-only')).toEqual(['node10', 'node16-cjs'])
    })

    it('Should_KeepTheDuplicate_When_CallerAlreadySilencedAProfileResolution', () => {
      expect(decisionFor('node16', ['node10'])).toEqual(['node10', 'node10'])
    })
  })
}
