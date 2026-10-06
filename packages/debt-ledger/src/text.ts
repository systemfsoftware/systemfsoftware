import { dual } from 'effect/Function'

export const lineAt = dual<
  (offset: number) => (source: string) => number,
  (source: string, offset: number) => number
>(
  2,
  (source, offset) => source.slice(0, Math.max(0, offset)).split('\n').length,
)

export const normalizePath = (value: string): string => value.replaceAll('\\', '/')
