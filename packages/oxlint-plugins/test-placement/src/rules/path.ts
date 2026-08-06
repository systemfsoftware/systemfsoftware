import { Array as A, Schema as S } from 'effect'
import { NESTED_TEST_DIR, PROPERTY_SUFFIX, SANCTIONED_TEST_DIRS, TEST_BASENAME } from './path.config.js'

const PathSegments = S.NonEmptyArray(S.String)

const segmentsOf = (filename: string): A.NonEmptyReadonlyArray<string> =>
  S.decodeUnknownSync(PathSegments)(filename.split('/'))

export const basenameOf = (filename: string): string => A.lastNonEmpty(segmentsOf(filename))

/** Directory segments only — the basename never counts as a directory. */
export const directoriesOf = (filename: string): ReadonlyArray<string> => A.initNonEmpty(segmentsOf(filename))

export const isUnderSrc = (filename: string): boolean => directoriesOf(filename).includes('src')

export const isInSanctionedTestDir = (filename: string): boolean =>
  directoriesOf(filename).some((segment) => SANCTIONED_TEST_DIRS.has(segment))

export const isInNestedTestsDir = (filename: string): boolean => directoriesOf(filename).includes(NESTED_TEST_DIR)

export const isTestFile = (basename: string): boolean => TEST_BASENAME.test(basename)

export const propertyStem = (basename: string): string => basename.slice(0, -PROPERTY_SUFFIX.length)
