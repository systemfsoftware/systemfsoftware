import { API, type Checker, type Symbol, type Type, TypeFlags } from 'typescript/unstable/sync'

export interface ExportsOutsideSyntacticPass {
  readonly filePath: string
  readonly source: string
  readonly names: readonly string[]
}

interface ProbeAliases {
  readonly schemaTop: string
  readonly error: string
}

interface ProbeTypes {
  readonly schemaTop: Type
  readonly error: Type
}

interface ModuleWithAliases {
  readonly source: string
  readonly aliases: ProbeAliases
}

const probeAliasesAbsentFrom = (source: string): ProbeAliases => {
  let base = '__schemaDiscovery'
  while (source.includes(base)) base = `_${base}`
  return { schemaTop: `${base}Top`, error: `${base}Error` }
}

const withProbeAliases = ({ aliases, source }: ModuleWithAliases): string =>
  [
    source,
    `export type ${aliases.schemaTop} = import('effect/Schema').Top`,
    `export type ${aliases.error} = Error`,
    '',
  ].join('\n')

const isAssignableToEveryType = (type: Type): boolean => (type.flags & (TypeFlags.Any | TypeFlags.Never)) !== 0

const isResolvedObjectType = (type: Type): boolean => (type.flags & TypeFlags.Object) !== 0

const decodesToErrors = (checker: Checker, schema: Type, error: Type): boolean => {
  const decodedProperty = checker.getPropertyOfType(schema, 'Type')
  const decoded = decodedProperty && checker.getTypeOfSymbol(decodedProperty)
  return decoded !== undefined && !isAssignableToEveryType(decoded) && checker.isTypeAssignableTo(decoded, error)
}

const isDataSchemaType = (checker: Checker, type: Type | undefined, probes: ProbeTypes): boolean =>
  type !== undefined && !isAssignableToEveryType(type) && checker.isTypeAssignableTo(type, probes.schemaTop) &&
  !decodesToErrors(checker, type, probes.error)

const probeTypesIn = (checker: Checker, moduleSymbol: Symbol, aliases: ProbeAliases): ProbeTypes | undefined => {
  const schemaTop = checker.getMemberInModuleExports(moduleSymbol, aliases.schemaTop)
  const error = checker.getMemberInModuleExports(moduleSymbol, aliases.error)
  if (schemaTop === undefined || error === undefined) return undefined
  return { schemaTop: checker.getDeclaredTypeOfSymbol(schemaTop), error: checker.getDeclaredTypeOfSymbol(error) }
}

export const dataSchemaExportsByType = (
  modules: readonly ExportsOutsideSyntacticPass[],
): ReadonlyMap<string, ReadonlySet<string>> => {
  const found = new Map<string, ReadonlySet<string>>()
  if (modules.length === 0) return found

  const byFile = new Map<string, ModuleWithAliases>(
    modules.map((m) => [m.filePath, { source: m.source, aliases: probeAliasesAbsentFrom(m.source) }]),
  )
  const api = new API({
    fs: {
      readFile: (fileName) => {
        const module = byFile.get(fileName)
        return module === undefined ? undefined : withProbeAliases(module)
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
      const aliases = byFile.get(m.filePath)?.aliases
      const probes = moduleSymbol && aliases && probeTypesIn(checker, moduleSymbol, aliases)
      if (moduleSymbol === undefined || probes === undefined) {
        throw new Error(`TypeScript did not read the Schema aliases appended to ${m.filePath}`)
      }
      if (!isResolvedObjectType(probes.schemaTop)) continue

      const candidates = new Set(m.names)
      const schemas = new Set(
        checker.getExportsOfModule(moduleSymbol)
          .filter((symbol) =>
            candidates.has(symbol.name) && isDataSchemaType(checker, checker.getTypeOfSymbol(symbol), probes)
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
