import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  meta,
  RELATIVE_ESCAPE_EXPECTED,
  RELATIVE_ESCAPE_FIX,
  RELATIVE_ESCAPE_NAME,
  SUBJECT_IMPORT_EXPECTED,
  SUBJECT_IMPORT_FIX,
  SUBJECT_IMPORT_NAME,
} from './model-fixture-imports-subject.config.js'
import { MODEL_SUFFIX, TEST_TREE_DIRS } from './path.config.js'
import { basenameOf, directoriesOf } from './path.js'

export type MessageIds = 'subjectImport' | 'relativeEscape'

/**
 * The basename of the directory whose tests tree the fixture lives in. A
 * `*.model.ts` serves that package's tests, so the directory name is the
 * unscoped name of the package under test. Read lexically, the way every rule
 * here reads a path: one file cannot know what else is on disk (OX-TS2), and
 * with no tests tree in the path the subject is unknown — an unknown subject is
 * never reported.
 */
const packageDirOf = (filename: string): string | undefined => {
  const dirs = directoriesOf(filename)
  const index = dirs.findIndex((segment) => TEST_TREE_DIRS.has(segment))
  return index <= 0 ? undefined : dirs[index - 1]
}

/**
 * The unscoped, subpath-stripped head of a package specifier:
 * `@systemfsoftware/effect-lock/testing` -> `effect-lock`. A subpath is still
 * the same dependency, and admitting it would let a fixture reach the
 * implementation through a nested entry.
 */
const packageHeadOf = (source: string): string => {
  const unscoped = source.startsWith('@') ? source.slice(source.indexOf('/') + 1) : source
  return unscoped.includes('/') ? unscoped.slice(0, unscoped.indexOf('/')) : unscoped
}

const importsSubject = (source: string, subjectDir: string | undefined): boolean =>
  subjectDir !== undefined && packageHeadOf(source) === subjectDir

const specifierOf = (node: ESTree.Node | undefined): string | undefined =>
  node !== undefined && node.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined

const isRelativeSpecifier = (source: string): boolean => source.startsWith('./') || source.startsWith('../')

/**
 * The directory stack a relative specifier resolves to against the linted
 * file's own directory, `..` segments collapsed. Existence is never checked:
 * one file cannot know what else is on disk (OX-TS2), so only the lexical
 * identity is decided.
 */
const resolveRelative = (source: string, filename: string): readonly string[] => {
  const stack = [...directoriesOf(filename)]
  for (const segment of source.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      stack.pop()
      continue
    }
    stack.push(segment)
  }
  return stack
}

const inTestsTree = (segments: readonly string[]): boolean => segments.some((segment) => TEST_TREE_DIRS.has(segment))

export const modelFixtureImportsSubject = defineRule({
  meta,
  create(context: Context) {
    if (!basenameOf(context.filename).endsWith(MODEL_SUFFIX)) return {}
    const subjectDir = packageDirOf(context.filename)
    const fixtureInTestsTree = inTestsTree(directoriesOf(context.filename))

    const checkSource = (node: ESTree.Node, source: ESTree.Node | undefined): void => {
      const specifier = specifierOf(source)
      if (specifier === undefined) return
      if (importsSubject(specifier, subjectDir)) {
        context.report({
          node,
          messageId: 'subjectImport',
          data: {
            name: SUBJECT_IMPORT_NAME,
            expected: SUBJECT_IMPORT_EXPECTED,
            actual: `a dependency on ${specifier} in a *.model.ts fixture`,
            fix: SUBJECT_IMPORT_FIX,
          },
        })
        return
      }
      if (
        fixtureInTestsTree && isRelativeSpecifier(specifier) &&
        !inTestsTree(resolveRelative(specifier, context.filename))
      ) {
        context.report({
          node,
          messageId: 'relativeEscape',
          data: {
            name: RELATIVE_ESCAPE_NAME,
            expected: RELATIVE_ESCAPE_EXPECTED,
            actual: `a relative import of ${specifier}, resolving outside the tests tree`,
            fix: RELATIVE_ESCAPE_FIX,
          },
        })
      }
    }

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        checkSource(node, node.source)
      },
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        if (node.source !== null) checkSource(node, node.source)
      },
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        checkSource(node, node.source)
      },
      ImportExpression(node: ESTree.ImportExpression) {
        checkSource(node, node.source)
      },
      TSImportEqualsDeclaration(node: ESTree.TSImportEqualsDeclaration) {
        if (node.moduleReference.type === 'TSExternalModuleReference') {
          checkSource(node, node.moduleReference.expression)
        }
      },
    }
  },
})
