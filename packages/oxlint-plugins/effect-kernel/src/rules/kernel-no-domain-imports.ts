import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Array as A, Schema as S } from 'effect'
import { DOMAIN_CELL_SUFFIXES, meta, NODE_BUILTIN_MODULES, Options } from './kernel-no-domain-imports.config.js'

export type MessageIds = 'domainCellImport' | 'runtimeModuleImport'

const isKernelFile = (filename: string): boolean => filename.endsWith('.kernel.ts')

const PathSegments = S.NonEmptyArray(S.String)

const lastSegmentOf = (source: string): string => {
  const segments = S.decodeUnknownSync(PathSegments)(source.split('/'))
  return A.lastNonEmpty(segments)
}

const DOMAIN_CELL_SUFFIX_NAMES = DOMAIN_CELL_SUFFIXES.map((suffix) => suffix.slice(1))

const DOMAIN_CELL_REGEX = new RegExp(
  `\\.(${DOMAIN_CELL_SUFFIX_NAMES.join('|')})(\\.js|\\.ts)?$`,
)

const RUNTIME_MODULE_REGEX = new RegExp(
  `^(node:.+|${NODE_BUILTIN_MODULES.join('|')})$`,
)

const domainCellSuffix = (source: string): string | null => {
  const match = DOMAIN_CELL_REGEX.exec(lastSegmentOf(source))
  if (match === null) return null
  return `.${match[1]}`
}

const isRuntimeModuleImport = (source: string): boolean => RUNTIME_MODULE_REGEX.test(source)

export const kernelNoDomainImports = defineRule({
  meta,
  create(context: Context) {
    if (!isKernelFile(context.filename)) return {}

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        const source = node.source.value

        const suffix = domainCellSuffix(source)
        if (suffix !== null) {
          context.report({
            node,
            messageId: 'domainCellImport',
            data: {
              name: source,
              expected: 'imports of other kernel modules and language/library primitives only',
              actual: `an import of the ${suffix} domain cell`,
              fix:
                'a kernel is domain-blind — pass the domain value in as a function argument or keep the import in the domain cell that owns it',
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
              expected: 'language/library primitives only',
              actual: `an import of the Node runtime module ${source}`,
              fix: 'read the value in the executor or adapter and pass it into the kernel as an argument',
            },
          })
        }
      },
    }
  },
})
