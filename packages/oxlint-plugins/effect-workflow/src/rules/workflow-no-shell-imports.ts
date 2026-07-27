import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Array as A, Schema as S } from 'effect'
import { meta, NODE_BUILTIN_MODULES, Options, SHELL_CELL_SUFFIXES } from './workflow-no-shell-imports.config.js'

export type MessageIds = 'shellCellImport' | 'runtimeModuleImport'

const isWorkflowFile = (filename: string): boolean => filename.endsWith('.workflow.ts')

const PathSegments = S.NonEmptyArray(S.String)

const lastSegmentOf = (source: string): string => {
  const segments = S.decodeUnknownSync(PathSegments)(source.split('/'))
  return A.lastNonEmpty(segments)
}

const SHELL_CELL_SUFFIX_NAMES = SHELL_CELL_SUFFIXES.map((suffix) => suffix.slice(1))

const SHELL_CELL_REGEX = new RegExp(
  `\\.(${SHELL_CELL_SUFFIX_NAMES.join('|')})(\\.js|\\.ts)?$`,
)

const RUNTIME_MODULE_REGEX = new RegExp(
  `^(node:.+|${NODE_BUILTIN_MODULES.join('|')})$`,
)

const shellCellSuffix = (source: string): string | null => {
  const match = SHELL_CELL_REGEX.exec(lastSegmentOf(source))
  if (match === null) return null
  return `.${match[1]}`
}

const isRuntimeModuleImport = (source: string): boolean => RUNTIME_MODULE_REGEX.test(source)

export const workflowNoShellImports = defineRule({
  meta,
  create(context: Context) {
    if (!isWorkflowFile(context.filename)) return {}

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        const source = node.source.value

        const suffix = shellCellSuffix(source)
        if (suffix !== null) {
          context.report({
            node,
            messageId: 'shellCellImport',
            data: {
              name: source,
              expected: 'imports of pure domain modules only',
              actual: `an import of the ${suffix} cell`,
              fix: 'the shell owns I/O — pass the value in as command data, or move this decision to the executor',
            },
          })
          return
        }

        if (isRuntimeModuleImport(source)) {
          context.report({
            node,
            messageId: 'runtimeModuleImport',
            data: {
              name: source,
              expected: 'a pure decision with no runtime dependencies',
              actual: `an import of the Node runtime module ${source}`,
              fix: 'read the value in the shell and pass it as a command field',
            },
          })
        }
      },
    }
  },
})
