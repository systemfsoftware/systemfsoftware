import babel, { type NodePath, type types } from '@babel/core'

import { createBabelFile } from '../babel/babel-file.js'
import { placeHeaderIfNeeded } from '../babel/instrumentation-header.js'
import { isImportDeclaration, isTypeNode } from '../babel/type-guards.js'
import { allMutantPlacers, type MutantPlacer, throwPlacementError } from '../mutant-placers/index.js'
import { applyMutant, type Mutable, type Mutant } from '../mutant.js'
import { allMutators } from '../mutators/index.js'
import type { MutatorContext } from '../mutators/mutator.js'
import { type ScriptFormat } from '../syntax/index.js'
import { locationIncluded, locationOverlaps } from '../syntax/location.js'

import { findIgnoreReason, processStrykerDirectives, rootRule, type Rule } from './directive-bookkeeper.js'
import { createIgnorerBookkeeper, currentIgnoreMessage, enterNode, leaveNode } from './ignorer-bookkeeper.js'
import { collect } from './mutant-collector.js'

import { type AstTransformer } from './index.js'

const { traverse } = babel

interface MutantsPlacement<TNode extends types.Node> {
  appliedMutants: Map<Mutant, types.Node>
  placer: MutantPlacer<TNode>
}

type PlacementMap = Map<types.Node, MutantsPlacement<types.Node>>

export const transformBabel: AstTransformer<ScriptFormat> = (
  { root, originFileName, rawContent, offset },
  mutantCollector,
  { options, mutateDescription },
  mutators = allMutators,
  mutantPlacers = allMutantPlacers,
) => {
  const file = createBabelFile(originFileName, rawContent, root)

  const placementMap: PlacementMap = new Map()

  let directiveRule: Rule = rootRule
  const mutatorEntries = Object.entries(mutators)
  const allMutatorNames = mutatorEntries.map(([name]) => name.toLowerCase())

  let ignorerState = createIgnorerBookkeeper(options.ignorers)

  const warnings: string[] = []

  traverse(file.ast, {
    enter(path) {
      const result = processStrykerDirectives(
        directiveRule,
        path.node,
        allMutatorNames,
        originFileName,
      )
      directiveRule = result.rule
      warnings.push(...result.warnings)
      if (shouldSkip(path)) {
        path.skip()
      } else {
        ignorerState = enterNode(ignorerState, path)
        addToPlacementMapIfPossible(path)
        if (shouldMutate(path)) {
          const mutantsToPlace = collectMutants(path)
          if (mutantsToPlace.length > 0) {
            const placementPath = path.find((ancestor) => placementMap.has(ancestor.node))
            if (placementPath) {
              const placement = placementMap.get(placementPath.node)
              if (placement === undefined) {
                throw new Error('Placement not found for node')
              }
              const { appliedMutants } = placement
              mutantsToPlace.forEach((mutant) => appliedMutants.set(mutant, applyMutant(mutant, placementPath.node)))
            } else {
              throw new Error(
                `Mutants cannot be placed. This shouldn't happen! Unplaced mutants: ${
                  JSON.stringify(mutantsToPlace, null, 2)
                }`,
              )
            }
          }
        }
      }
    },
    exit(path) {
      placeMutantsIfNeeded(path)
      ignorerState = leaveNode(ignorerState, path)
    },
  })

  placeHeaderIfNeeded(mutantCollector, originFileName, options, root)

  return warnings

  function addToPlacementMapIfPossible(path: NodePath): void {
    const placer = mutantPlacers.find((p) => p.canPlace(path))
    if (placer !== undefined) {
      placementMap.set(path.node, { appliedMutants: new Map(), placer })
    }
  }

  function shouldSkip(path: NodePath): boolean {
    return (
      isTypeNode(path) ||
      isImportDeclaration(path) ||
      path.isDecorator() ||
      !mutateDescription ||
      (Array.isArray(mutateDescription) &&
        mutateDescription.every((range) => !locationOverlaps(range, getNodeLocation(path.node))))
    )
  }

  function shouldMutate(path: NodePath): boolean {
    return (
      mutateDescription === true ||
      (Array.isArray(mutateDescription) &&
        mutateDescription.some((range) => locationIncluded(range, getNodeLocation(path.node))))
    )
  }

  function placeMutantsIfNeeded(path: NodePath): void {
    const mutantsPlacement = placementMap.get(path.node)
    if (mutantsPlacement !== undefined && mutantsPlacement.appliedMutants.size > 0) {
      try {
        mutantsPlacement.placer.place(path, mutantsPlacement.appliedMutants)
        path.skip()
      } catch (error) {
        const normalizedError = toError(error)
        throwPlacementError(
          normalizedError,
          path,
          mutantsPlacement.placer,
          [...mutantsPlacement.appliedMutants.keys()],
          originFileName,
        )
      }
    }
  }

  function collectMutants(path: NodePath): Mutant[] {
    return [...mutate(path)].map((mutable) => collect(mutantCollector, originFileName, path.node, mutable, offset))
      .filter((mutant) => !mutant.ignoreReason)
  }

  function* mutate(path: NodePath): Iterable<Mutable> {
    const context = toMutatorContext(path)
    for (const [mutatorName, mutate] of mutatorEntries) {
      for (const replacement of mutate(path.node, context)) {
        const ignoreReason = findIgnoreReason(directiveRule, mutatorName, getNodeLocation(path.node).start.line) ??
          findExcludedMutatorIgnoreReason(mutatorName) ??
          currentIgnoreMessage(ignorerState)
        yield {
          replacement,
          mutatorName,
          ...(ignoreReason === undefined ? {} : { ignoreReason }),
        }
      }
    }

    function findExcludedMutatorIgnoreReason(mutatorName: string): string | undefined {
      if (options.excludedMutations.includes(mutatorName)) {
        return `Ignored because of excluded mutation "${mutatorName}"`
      } else {
        return undefined
      }
    }
  }
}

function toMutatorContext(path: NodePath): MutatorContext {
  const ancestors: types.Node[] = []
  let current: NodePath | null | undefined = path.parentPath
  while (current !== null && current !== undefined) {
    ancestors.push(current.node)
    current = current.parentPath
  }
  return {
    parent: ancestors[0],
    grandParent: ancestors[1],
    ancestors,
  }
}

function getNodeLocation(
  node: types.Node,
): { start: { line: number; column: number }; end: { line: number; column: number } } {
  const loc = node.loc
  if (
    loc === null || loc === undefined || loc.start === null || loc.start === undefined || loc.end === null ||
    loc.end === undefined
  ) {
    throw new Error('Babel node without location')
  }
  return loc
}

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value
  }
  return new Error('Unexpected error', { cause: value })
}
