import { Function, Schema } from 'effect'

export const PackagePath = Schema.String.pipe(
  Schema.annotate({
    identifier: 'PackagePath',
    description: 'A POSIX path inside the in-memory package tree',
    title: 'Package Path',
  }),
  Schema.brand('PackagePath'),
)

export type PackagePath = Schema.Schema.Type<typeof PackagePath>

const FORWARD_SLASH = 47
const BACKSLASH = 92

const isSeparator = (code: number): boolean => code === FORWARD_SLASH || code === BACKSLASH

const withTrailingSeparator = (path: PackagePath): PackagePath => {
  if (isSeparator(path.charCodeAt(path.length - 1))) return path
  return PackagePath.make(`${path}/`)
}

export const ensureTrailingDirectorySeparator = (path: PackagePath): PackagePath => {
  if (path.length === 0) return PackagePath.make('/')
  return withTrailingSeparator(path)
}

const normalizedPath = (path: PackagePath): PackagePath => PackagePath.make(path.replaceAll('\\', '/'))

const joinNormalized = (base: PackagePath, relative: PackagePath): PackagePath => {
  const normalized = normalizedPath(relative)
  if (normalized.startsWith('/')) return normalized
  const rooted = ensureTrailingDirectorySeparator(normalizedPath(base))
  return PackagePath.make(`${rooted}${normalized}`)
}

/**
 * A rooted second segment wins; `.` and `..` segments are left unresolved and repeated
 * separators are not collapsed.
 */
export const combinePaths: {
  (relative: PackagePath): (base: PackagePath) => PackagePath
  (base: PackagePath, relative: PackagePath): PackagePath
} = Function.dual(2, (base: PackagePath, relative: PackagePath): PackagePath => {
  if (relative.length === 0) return base
  return joinNormalized(base, relative)
})

/** Anchors a package-relative path under an absolute base, leaving an already-absolute path alone. */
export const posixJoin: {
  (relative: PackagePath): (base: PackagePath) => PackagePath
  (base: PackagePath, relative: PackagePath): PackagePath
} = Function.dual(2, (base: PackagePath, relative: PackagePath): PackagePath => {
  if (relative.startsWith('/')) return relative
  return PackagePath.make(`${base}/${relative}`)
})
