import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Array as A, Schema as S } from 'effect'
import { meta, PORT_ROOTS, SCOPED_ROOT_REGEX } from './adapter-single-external-system.config.js'

export type MessageIds = 'multipleExternalSystems'

const isAdapterFile = (filename: string): boolean => filename.endsWith('.adapter.ts')

const SourceSegments = S.NonEmptyArray(S.String)

const packageRootOf = (source: string): string => {
  const scoped = SCOPED_ROOT_REGEX.exec(source)
  if (scoped !== null) return `${scoped[1]}/${scoped[2]}`
  const segments = S.decodeUnknownSync(SourceSegments)(source.split('/'))
  return A.headNonEmpty(segments)
}

const isEffectImport = (source: string): boolean => source === 'effect' || source.startsWith('effect/')

const isNodeRuntimeImport = (source: string): boolean => source.startsWith('node:') || source.startsWith('nodejs:')

const isForeignPackageImport = (source: string): boolean =>
  !source.startsWith('.') && !source.startsWith('/') && !isEffectImport(source) && !isNodeRuntimeImport(source) &&
  PORT_ROOTS[packageRootOf(source)] !== true

export const adapterSingleExternalSystem = defineRule({
  meta,
  create(context: Context) {
    if (!isAdapterFile(context.filename)) return {}

    const seenRoots = new Set<string>()
    let firstForeignRoot: string | null = null

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        const source = node.source.value
        if (!isForeignPackageImport(source)) return
        const root = packageRootOf(source)
        if (seenRoots.has(root)) return
        seenRoots.add(root)
        if (firstForeignRoot === null) {
          firstForeignRoot = root
          return
        }
        context.report({
          node,
          messageId: 'multipleExternalSystems',
          data: {
            name: root,
            expected: `exactly one external system per *.adapter.ts file — this file already wraps ${firstForeignRoot}`,
            actual: `imports of ${firstForeignRoot} and ${root}`,
            fix: 'split each technology into its own *.adapter.ts file, each implementing its own port',
          },
        })
      },
    }
  },
})
