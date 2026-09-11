import type { CheckerFactory } from './Checker.js'
import type { EvaluatorFactory } from './Evaluator.js'
import type { IgnorerFactory } from './Ignorer.js'
import type { ParserFactory } from './Parser.js'
import type { Shadowing } from './Plugin.schema.js'
import type { PluginKind } from './Plugin.schema.js'
import type { ReporterFactory } from './Reporter.js'
import type { TestRunnerFactory } from './TestRunner.js'

export { PluginDeclarationSchema, PluginKindSchema, PluginModuleSchema, ShadowingSchema } from './Plugin.schema.js'
export type { PluginDeclaration, PluginKind, Shadowing, StandardSchemaV1 } from './Plugin.schema.js'

export type PluginFactory<K extends PluginKind> = K extends 'Checker' ? CheckerFactory
  : K extends 'Evaluator' ? EvaluatorFactory
  : K extends 'Ignorer' ? IgnorerFactory
  : K extends 'Parser' ? ParserFactory
  : K extends 'Reporter' ? ReporterFactory
  : K extends 'TestRunner' ? TestRunnerFactory
  : never

export interface PluginContribution<K extends PluginKind = PluginKind> {
  readonly kind: K
  readonly name: string
  readonly make: PluginFactory<K>
}

export type AnyPluginContribution = PluginContribution<PluginKind>

export interface PluginModule {
  readonly strykerPlugins: readonly AnyPluginContribution[]
}

export const declarePlugin = <K extends PluginKind>(
  kind: K,
  name: string,
  make: PluginFactory<K>,
): PluginContribution<K> => ({ kind, name, make })

export interface FoldedContributions {
  readonly contributions: readonly AnyPluginContribution[]
  readonly shadowings: readonly Shadowing[]
}

interface PositionedContribution {
  readonly contribution: AnyPluginContribution
  readonly index: number
}

const keyOf = (contribution: AnyPluginContribution): string => `${contribution.kind}:${contribution.name}`

const shadowingOf = (
  shadowed: PositionedContribution | undefined,
  contribution: AnyPluginContribution,
  winnerIndex: number,
): readonly Shadowing[] => {
  if (shadowed === undefined) return []
  return [{ kind: contribution.kind, name: contribution.name, shadowedIndex: shadowed.index, winnerIndex }]
}

export const foldContributions = (contributions: readonly AnyPluginContribution[]): FoldedContributions => {
  const winners = new Map<string, PositionedContribution>()
  const shadowings: Shadowing[] = []
  contributions.forEach((contribution, index) => {
    const key = keyOf(contribution)
    shadowings.push(...shadowingOf(winners.get(key), contribution, index))
    winners.set(key, { contribution, index })
  })
  return { contributions: [...winners.values()].map((entry) => entry.contribution), shadowings }
}
