import { dual } from 'effect/Function'
import * as Match from 'effect/Match'

export const convertToSlashes = (inputPath: string): string => inputPath.replace(/\\/g, '/')

const trimTrailingSlashes = (inputPath: string): string => convertToSlashes(inputPath).replace(/\/+$/, '')

export const isUnderOrEqual = dual<
  (parentFolderPath: string) => (childPath: string) => boolean,
  (childPath: string, parentFolderPath: string) => boolean
>(2, (childPath: string, parentFolderPath: string): boolean => {
  const child = trimTrailingSlashes(childPath)
  const parent = trimTrailingSlashes(parentFolderPath)
  return child === parent || child.startsWith(`${parent}/`)
})

export const dirname = (inputPath: string): string => {
  const normalized = trimTrailingSlashes(inputPath)
  const slash = normalized.lastIndexOf('/')
  return Match.value(slash).pipe(
    Match.when(0, () => '/'),
    Match.when((index) => index < 0, () => '.'),
    Match.orElse((index) => normalized.substring(0, index)),
  )
}

export const resolve = dual<
  (relativePath: string) => (base: string) => string,
  (base: string, relativePath: string) => string
>(2, (base: string, relativePath: string): string => {
  const normalizedBase = trimTrailingSlashes(base)
  const normalizedRelative = convertToSlashes(relativePath).replace(/^\.?\//, '')
  return Match.value(normalizedRelative.startsWith('/')).pipe(
    Match.when(true, () => normalizedRelative),
    Match.orElse(() => `${normalizedBase}/${normalizedRelative}`),
  )
})

export const relative = dual<
  (to: string) => (from: string) => string,
  (from: string, to: string) => string
>(2, (from: string, to: string): string => {
  const normalizedFrom = trimTrailingSlashes(from)
  const normalizedTo = trimTrailingSlashes(to)
  return Match.value(normalizedFrom === normalizedTo).pipe(
    Match.when(true, () => ''),
    Match.orElse(() =>
      Match.value(normalizedTo.startsWith(`${normalizedFrom}/`)).pipe(
        Match.when(true, () => normalizedTo.substring(normalizedFrom.length + 1)),
        Match.orElse(() => normalizedTo),
      )
    ),
  )
})
