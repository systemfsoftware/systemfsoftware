import { Array as A, Schema as S } from 'effect'
import {
  CONTRACT_SUFFIX,
  INTEGRATION_SUFFIX,
  RAW_VITEST_PACKAGES,
  SANCTIONED_TEST_DIRS,
  TEST_BASENAME,
  TEST_TREE_DIRS,
} from './path.config.js'

const PathSegments = S.NonEmptyArray(S.String)

const segmentsOf = (filename: string): A.NonEmptyReadonlyArray<string> =>
  S.decodeUnknownSync(PathSegments)(filename.split('/'))

export const basenameOf = (filename: string): string => A.lastNonEmpty(segmentsOf(filename))

/** Directory segments only — the basename never counts as a directory. */
export const directoriesOf = (filename: string): readonly string[] => A.initNonEmpty(segmentsOf(filename))

export const isUnderSrc = (filename: string): boolean => directoriesOf(filename).includes('src')

export const isRawVitestPackage = (filename: string): boolean =>
  directoriesOf(filename).some((segment) => RAW_VITEST_PACKAGES[segment] === true)

export const isInSanctionedTestDir = (filename: string): boolean =>
  directoriesOf(filename).some((segment) => SANCTIONED_TEST_DIRS.has(segment))

export const isInTestsImportScope = (filename: string): boolean => {
  const segments = segmentsOf(filename)
  const directories = A.initNonEmpty(segments)
  if (directories.some((segment) => segment === 'src')) return false
  return isTestFile(A.lastNonEmpty(segments)) || directories.some((segment) => TEST_TREE_DIRS.has(segment))
}

export const isInConfiguredTestDir = (filename: string, dirs: readonly string[]): boolean =>
  directoriesOf(filename).some((segment) => dirs.includes(segment))

export const isTestFile = (basename: string): boolean => TEST_BASENAME.test(basename)

export const isBehaviourBasename = (basename: string): boolean =>
  basename.endsWith(INTEGRATION_SUFFIX) || basename.endsWith(CONTRACT_SUFFIX)

const CELL_SUFFIX = /\.([^.]+)\.[cm]?tsx?$/

export const cellOf = (basename: string): string | undefined => CELL_SUFFIX.exec(basename)?.[1]
