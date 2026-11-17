import { readFileSync } from 'node:fs'
import { API, type Checker, type Symbol, type Type, TypeFlags } from 'typescript/unstable/sync'

export interface ExportsOutsideSyntacticPass {
  readonly filePath: string
  readonly source: string
  readonly names: readonly string[]
}

interface ProbeAliases {
  readonly schemaTop: string
  readonly errorSchema: string
}

interface ProbeTypes {
  readonly schemaTop: Type
  readonly errorSchema: Type
}

const probeAliasesAbsentFrom = (source: string): ProbeAliases => {
  let base = '__schemaDiscovery'
  while (source.includes(base)) base = `_${base}`
  return { schemaTop: `${base}Top`, errorSchema: `${base}Error` }
}

const withProbeAliases = (fileName: string, aliases: ProbeAliases): string =>
  [
    readFileSync(fileName, 'utf-8'),
    `export type ${aliases.schemaTop} = import('effect/Schema').Top`,
    `export type ${aliases.errorSchema} = import('effect/Schema').Codec<Error, unknown, unknown, unknown>`,
    '',
  ].join('\n')

const isAssignableToEveryType = (type: Type): boolean => (type.flags & (TypeFlags.Any | TypeFlags.Never)) !== 0

const isResolvedObjectType = (type: Type): boolean => (type.flags & TypeFlags.Object) !== 0

const isDataSchemaType = (checker: Checker, type: Type | undefined, probes: ProbeTypes): boolean =>
  type !== undefined && !isAssignableToEveryType(type) && checker.isTypeAssignableTo(type, probes.schemaTop) &&
  !checker.isTypeAssignableTo(type, probes.errorSchema)

const probeTypesIn = (checker: Checker, moduleSymbol: Symbol, aliases: ProbeAliases): ProbeTypes | undefined => {
  const schemaTop = checker.getMemberInModuleExports(moduleSymbol, aliases.schemaTop)
  const errorSchema = checker.getMemberInModuleExports(moduleSymbol, aliases.errorSchema)
  if (schemaTop === undefined || errorSchema === undefined) return undefined
  return {
    schemaTop: checker.getDeclaredTypeOfSymbol(schemaTop),
    errorSchema: checker.getDeclaredTypeOfSymbol(errorSchema),
  }
}

export const dataSchemaExportsByType = (
  modules: readonly ExportsOutsideSyntacticPass[],
): ReadonlyMap<string, ReadonlySet<string>> => {
  const found = new Map<string, ReadonlySet<string>>()
  if (modules.length === 0) return found

  const aliasesByFile = new Map(modules.map((m) => [m.filePath, probeAliasesAbsentFrom(m.source)]))
  const api = new API({
    fs: {
      readFile: (fileName) => {
        const aliases = aliasesByFile.get(fileName)
        return aliases === undefined ? undefined : withProbeAliases(fileName, aliases)
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
      const aliases = aliasesByFile.get(m.filePath)
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
