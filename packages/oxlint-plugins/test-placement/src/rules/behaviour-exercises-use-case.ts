import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Schema as S } from 'effect'
import {
  meta,
  NO_SHELL_IMPORT_ACTUAL,
  NO_SHELL_IMPORT_EXPECTED,
  NO_SHELL_IMPORT_FIX,
  NO_SHELL_IMPORT_NAME,
  Options,
} from './behaviour-exercises-use-case.config.js'
import {
  FOREIGN_RUNNERS,
  GHERKIN_PACKAGE,
  INTEGRATION_SUFFIX,
  SHELL_CELL_SUFFIXES,
  SHELL_ENTRY_BASENAMES,
} from './path.config.js'
import { basenameOf } from './path.js'

export type MessageIds = 'noShellImport'

const FOUNDATION_PACKAGES: ReadonlySet<string> = new Set([...FOREIGN_RUNNERS, GHERKIN_PACKAGE, 'effect'])

const SOURCE_EXTENSIONS = ['.js', '.ts', '.tsx', '.mts', '.cts'] as const

const stripSourceExtension = (basename: string): string => {
  for (const ext of SOURCE_EXTENSIONS) {
    if (basename.endsWith(ext)) return basename.slice(0, -ext.length)
  }
  return basename
}

const matchesShellCell = (basename: string): boolean => {
  const stem = stripSourceExtension(basename)
  return SHELL_CELL_SUFFIXES.some((suffix) => stem.endsWith(suffix))
}

const matchesShellEntry = (basename: string): boolean => SHELL_ENTRY_BASENAMES.has(stripSourceExtension(basename))

const isBarePackage = (source: string): boolean => !source.startsWith('.')

const isFoundationPackage = (source: string): boolean => FOUNDATION_PACKAGES.has(source)

const isBehaviourTest = (basename: string): boolean => basename.endsWith(INTEGRATION_SUFFIX)

const specifierBasename = (source: string): string => source.slice(source.lastIndexOf('/') + 1)

const isShellImport = (source: string): boolean => {
  if (isBarePackage(source)) return !isFoundationPackage(source)
  return matchesShellCell(specifierBasename(source)) || matchesShellEntry(specifierBasename(source))
}

export const behaviourExercisesUseCase = defineRule({
  meta,
  create(context: Context) {
    const { admitSrcImports } = S.decodeUnknownSync(Options)(context.options[0] ?? {})
    const isSatisfied = (source: string): boolean =>
      isShellImport(source) || (admitSrcImports && source.startsWith('.'))
    return {
      'Program:exit'(node: ESTree.Program) {
        if (!isBehaviourTest(basenameOf(context.filename))) return
        for (const statement of node.body) {
          if (statement.type !== 'ImportDeclaration') continue
          if (isSatisfied(statement.source.value)) return
        }
        context.report({
          node: node.body[0] ?? node,
          messageId: 'noShellImport',
          data: {
            name: NO_SHELL_IMPORT_NAME,
            expected: NO_SHELL_IMPORT_EXPECTED,
            actual: NO_SHELL_IMPORT_ACTUAL,
            fix: NO_SHELL_IMPORT_FIX,
          },
        })
      },
    }
  },
})
