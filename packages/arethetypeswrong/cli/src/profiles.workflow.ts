import * as S from 'effect/Schema'

import type { ResolutionKind } from '@systemfsoftware/arethetypeswrong-core'

export class ApplyProfileCommand extends S.TaggedClass<ApplyProfileCommand>()('ApplyProfileCommand', {
  profileName: S.Literal('strict', 'node16', 'esm-only'),
  request: S.Unknown,
}) {}

export class ApplyProfileDecision extends S.TaggedClass<ApplyProfileDecision>()('ApplyProfileDecision', {
  ignoreResolutions: S.Array(S.Literal('node10', 'node16-cjs', 'node16-esm', 'bundler')),
}) {}

const profileIgnoreResolutions: Record<'strict' | 'node16' | 'esm-only', ReadonlyArray<ResolutionKind>> = {
  strict: [],
  node16: ['node10'],
  'esm-only': ['node10', 'node16-cjs'],
}

export type CliProfileName = 'strict' | 'node16' | 'esm-only'

export const applyProfile = (command: ApplyProfileCommand): ApplyProfileDecision => {
  const request = command.request as { ignoreResolutions?: ReadonlyArray<ResolutionKind> }
  const fromProfile = profileIgnoreResolutions[command.profileName]
  const merged: ReadonlyArray<ResolutionKind> = [
    ...(request.ignoreResolutions ?? []),
    ...fromProfile,
  ]
  return new ApplyProfileDecision({ ignoreResolutions: [...merged] })
}
