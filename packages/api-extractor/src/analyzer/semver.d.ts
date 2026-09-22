declare module 'semver' {
  export class SemVer {
    constructor(version: string)
  }
  export class Range {
    constructor(range: string)
  }
  export function minVersion(range: string | Range): SemVer | null
  export function gt(v1: string | SemVer, v2: string | SemVer): boolean
  export function valid(version: string): string | null
  export function major(version: string): number
  export function minor(version: string): number
}
