declare module 'semver' {
  export interface SemVer {
    readonly version: string
  }
  export function minVersion(range: string): SemVer | null
  export function validRange(range: string): string | null
  export function gt(v1: string | SemVer, v2: string | SemVer): boolean
}
