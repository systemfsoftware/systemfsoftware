import { readFileSync } from 'node:fs'
import { API, type Checker, type Type, TypeFlags } from 'typescript/unstable/sync'

export interface ExportsOutsideSyntacticPass {
  readonly filePath: string
  readonly source: string
  readonly names: readonly string[]
}

const aliasNameAbsentFrom = (source: string): string => {
  let name = '__schemaDiscoveryTop'
  while (source.includes(name)) name = `_${name}`
  return name
}

const isAssignableToEveryType = (type: Type): boolean => (type.flags & (TypeFlags.Any | TypeFlags.Never)) !== 0

const isResolvedObjectType = (type: Type): boolean => (type.flags & TypeFlags.Object) !== 0

const isSchemaType = (checker: Checker, type: Type | undefined, schemaTop: Type): boolean =>
  type !== undefined && !isAssignableToEveryType(type) && checker.isTypeAssignableTo(type, schemaTop)

const withSchemaTopAlias = (fileName: string, alias: string): string =>
  `${readFileSync(fileName, 'utf-8')}\nexport type ${alias} = import('effect/Schema').Top\n`

export const exportsAssignableToSchemaTop = (
  modules: readonly ExportsOutsideSyntacticPass[],
): ReadonlyMap<string, ReadonlySet<string>> => {
  const found = new Map<string, ReadonlySet<string>>()
  if (modules.length === 0) return found

  const aliases = new Map(modules.map((m) => [m.filePath, aliasNameAbsentFrom(m.source)]))
  const api = new API({
    fs: {
      readFile: (fileName) => {
        const alias = aliases.get(fileName)
        return alias === undefined ? undefined : withSchemaTopAlias(fileName, alias)
      },
    },
  })
  try {
    const snapshot = api.updateSnapshot({ openFiles: modules.map((m) => m.filePath) })
    for (const m of modules) {
      const project = snapshot.getDefaultProjectForFile(m.filePath)
      const sourceFile = project?.program.getSourceFile(m.filePath)
      if (project === undefined || sourceFile === undefined) {
        throw new Error(`TypeScript opened no program containing ${m.filePath}`)
      }
      const { checker } = project
      const moduleSymbol = checker.getSymbolAtLocation(sourceFile)
      const aliasSymbol = moduleSymbol && checker.getMemberInModuleExports(moduleSymbol, aliases.get(m.filePath) ?? '')
      if (moduleSymbol === undefined || aliasSymbol === undefined) {
        throw new Error(`TypeScript did not read the Schema.Top alias appended to ${m.filePath}`)
      }
      const schemaTop = checker.getDeclaredTypeOfSymbol(aliasSymbol)
      if (!isResolvedObjectType(schemaTop)) continue

      const candidates = new Set(m.names)
      const schemas = new Set(
        checker.getExportsOfModule(moduleSymbol)
          .filter((symbol) =>
            candidates.has(symbol.name) && isSchemaType(checker, checker.getTypeOfSymbol(symbol), schemaTop)
          )
          .map((symbol) => symbol.name),
      )
      if (schemas.size > 0) found.set(m.filePath, schemas)
    }
  } finally {
    api.close()
  }
  return found
}
