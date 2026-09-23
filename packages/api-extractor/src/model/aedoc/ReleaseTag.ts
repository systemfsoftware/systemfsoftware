import * as Match from 'effect/Match'

export const ReleaseTag = {
  None: 0,
  Internal: 1,
  Alpha: 2,
  Beta: 3,
  Public: 4,
  getTagName(releaseTag: ReleaseTag): string {
    return Match.value(releaseTag).pipe(
      Match.when(ReleaseTag.None, () => '(none)'),
      Match.when(ReleaseTag.Internal, () => '@internal'),
      Match.when(ReleaseTag.Alpha, () => '@alpha'),
      Match.when(ReleaseTag.Beta, () => '@beta'),
      Match.when(ReleaseTag.Public, () => '@public'),
      Match.exhaustive,
    )
  },
  compare(left: ReleaseTag, right: ReleaseTag): number {
    return left - right
  },
} as const

export type ReleaseTag = 0 | 1 | 2 | 3 | 4
