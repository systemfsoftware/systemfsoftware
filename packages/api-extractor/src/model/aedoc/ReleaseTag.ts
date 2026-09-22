export enum ReleaseTag {
  None = 0,
  Internal = 1,
  Alpha = 2,
  Beta = 3,
  Public = 4,
}

export namespace ReleaseTag {
  export function getTagName(releaseTag: ReleaseTag): string {
    switch (releaseTag) {
      case ReleaseTag.None:
        return '(none)'
      case ReleaseTag.Internal:
        return '@internal'
      case ReleaseTag.Alpha:
        return '@alpha'
      case ReleaseTag.Beta:
        return '@beta'
      case ReleaseTag.Public:
        return '@public'
    }
  }

  export function compare(a: ReleaseTag, b: ReleaseTag): number {
    return a - b
  }
}
