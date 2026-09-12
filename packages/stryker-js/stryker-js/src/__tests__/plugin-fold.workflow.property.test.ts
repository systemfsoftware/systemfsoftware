import { describe, it } from '@effect/vitest'
import { FastCheck as fc } from 'effect/testing'

import type { AnyPluginContribution, PluginKind } from '../Plugin.js'
import { declarePlugin, foldContributions } from '../Plugin.js'

const KINDS: readonly PluginKind[] = ['Checker', 'Evaluator', 'Ignorer', 'Parser', 'Reporter', 'TestRunner']

interface Declaration {
  readonly kind: PluginKind
  readonly name: string
}

const stubFactories: Record<PluginKind, (name: string) => AnyPluginContribution> = {
  Checker: (name) => declarePlugin('Checker', name, () => ({})),
  Evaluator: (name) => declarePlugin('Evaluator', name, () => () => null),
  Ignorer: (name) => declarePlugin('Ignorer', name, () => () => null),
  Parser: (name) => declarePlugin('Parser', name, () => ({ extensions: ['.txt'], parse: (input: string) => input })),
  Reporter: (name) => declarePlugin('Reporter', name, () => async () => {}),
  TestRunner: (name) => declarePlugin('TestRunner', name, () => ({})),
}

const declarationArbitrary = fc.record({ kind: fc.constantFrom(...KINDS), name: fc.string() })
const declarationsArbitrary = fc.array(declarationArbitrary, { maxLength: 12 })

const nameOf = (declaration: { readonly kind: string; readonly name: string }): string =>
  `${declaration.kind}:${declaration.name}`

const buildContributions = (declarations: readonly Declaration[]): readonly AnyPluginContribution[] =>
  declarations.map((declaration) => stubFactories[declaration.kind](declaration.name))

const lastIndexFor = (declarations: readonly Declaration[], name: string): number =>
  declarations.map(nameOf).findLastIndex((candidate) => candidate === name)

const firstIndexFor = (declarations: readonly Declaration[], name: string): number =>
  declarations.map(nameOf).indexOf(name)

const everySurvivorIsTheLastDeclaration = (
  declarations: readonly Declaration[],
  contributions: readonly AnyPluginContribution[],
  survivors: readonly AnyPluginContribution[],
): boolean =>
  survivors.length === new Set(declarations.map(nameOf)).size &&
  survivors.every((survivor) => survivor === contributions[lastIndexFor(declarations, nameOf(survivor))])

const everyDisplacementIsRecorded = (
  declarations: readonly Declaration[],
  contributions: readonly AnyPluginContribution[],
  shadowings: readonly {
    readonly kind: string
    readonly name: string
    readonly shadowedIndex: number
    readonly winnerIndex: number
  }[],
): boolean =>
  shadowings.length === contributions.length - new Set(declarations.map(nameOf)).size &&
  shadowings.every((shadowing) =>
    nameOf(shadowing) === nameOf(declarations[shadowing.shadowedIndex]) &&
    shadowing.shadowedIndex < shadowing.winnerIndex &&
    shadowing.winnerIndex === lastIndexFor(declarations, nameOf(shadowing))
  ) &&
  new Set(shadowings.map((shadowing) => shadowing.shadowedIndex)).size === shadowings.length

const survivorsKeepFirstDeclarationOrder = (
  declarations: readonly Declaration[],
  survivors: readonly AnyPluginContribution[],
): boolean => {
  const firstIndices = survivors.map((survivor) => firstIndexFor(declarations, nameOf(survivor)))
  return firstIndices.every((value, position) => position === 0 || firstIndices[position - 1] < value)
}

describe('foldContributions', () => {
  it.prop('∀d_Fold_∈LastDeclaration', [declarationsArbitrary], ([declarations]) => {
    const contributions = buildContributions(declarations)
    const folded = foldContributions(contributions)
    return everySurvivorIsTheLastDeclaration(declarations, contributions, folded.contributions)
  })

  it.prop('∀d_Fold_∈Shadowings', [declarationsArbitrary], ([declarations]) => {
    const contributions = buildContributions(declarations)
    const folded = foldContributions(contributions)
    return everyDisplacementIsRecorded(declarations, contributions, folded.shadowings)
  })

  it.prop('∀d_Fold_≡FirstSlotOrder', [declarationsArbitrary], ([declarations]) => {
    const folded = foldContributions(buildContributions(declarations))
    return survivorsKeepFirstDeclarationOrder(declarations, folded.contributions)
  })
})
