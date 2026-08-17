/// <reference types="vitest/import-meta" />
import path from 'path'

import * as Match from 'effect/Match'

import type { PartialStrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'

/**
 * One step of the `extends` chain, decided as data (KTD1, R7, R8).
 *
 * The original `resolveExtendsChain` interleaved I/O with decisions: it read a
 * file, decided whether it extends, resolved a specifier through
 * `createRequire`, then recursed. Here the decision is a pure function from
 * accumulated state plus one already-read document to the next act; nothing
 * reads a file or resolves a specifier. The shell performs the requested act
 * and feeds the result back.
 *
 * The visited-path accumulation that `resolveExtendsChain` owned as a mutable
 * `Set` lives in the state the decision receives; a cycle is a refusal
 * returned as a value, and an `extends` that is not a string is a refusal too.
 * The decision is total over its state and never throws.
 */

/**
 * State carried between steps: the documents already folded in (child first)
 * and the absolute paths they were read from. The path the shell most recently
 * read is passed alongside the document it yielded, so this state never has to
 * describe an act the shell has not yet handed back.
 */
export interface ExtendsStepState {
  /** absolute paths already processed, in read order — the walker's visited set */
  readonly visited: readonly string[]
  /** already-read documents, in read order (child first), each with the path it came from */
  readonly documents: readonly ExtendsStepDocument[]
}

export interface ExtendsStepDocument {
  readonly path: string
  readonly options: PartialStrykerOptions
}

export const initialExtendsStepState: ExtendsStepState = {
  visited: [],
  documents: [],
}

export type ExtendsRefusalReason = 'cycle' | 'non-string-extends'

/**
 * The next act, returned as data. `read` and `resolve` carry the state the
 * shell must feed back together with the document the act yields; `done`
 * carries the fully merged options; `refused` carries a named reason.
 */
export type ExtendsStepDecision =
  | { readonly _tag: 'done'; readonly options: PartialStrykerOptions }
  | { readonly _tag: 'read'; readonly path: string; readonly state: ExtendsStepState }
  | {
    readonly _tag: 'resolve'
    readonly specifier: string
    readonly directory: string
    readonly state: ExtendsStepState
  }
  | { readonly _tag: 'refused'; readonly reason: ExtendsRefusalReason; readonly file: string }

/**
 * Merge a child config over a parent's resolved options.
 * R2: scalars replace wholesale; objects merge one level deep.
 * R3: a child key set to `null` deletes the inherited key.
 * R4: the `plugins` array is the one exception to wholesale array replacement —
 * the parent's plugin loaders stay inherited and the child's descriptors are
 * appended, with the first occurrence of a descriptor winning.
 *
 * A copy of the precedence logic in `resolve-extends.ts`, moved here with the
 * original staying put. Where the original re-decoded each object through
 * `ConfigDocumentSchema`, this copy spreads the validated objects directly:
 * they already passed that schema at the read boundary, so the re-decode was
 * dead weight and its throw site does not move into this module.
 */
export function mergeConfigs(
  parent: PartialStrykerOptions,
  child: PartialStrykerOptions,
): PartialStrykerOptions {
  const out: Record<string, unknown> = { ...parent }
  for (const [key, value] of Object.entries(child)) {
    if (value === null) {
      delete out[key]
      continue
    }
    const parentValue = parent[key]
    if (key === 'plugins') {
      const parentPlugins: readonly unknown[] = Array.isArray(parentValue) ? parentValue : []
      const childPlugins: readonly unknown[] = Array.isArray(value) ? value : []
      const merged = [...parentPlugins, ...childPlugins]
      out[key] = merged.filter(
        (descriptor, index) => typeof descriptor !== 'string' || !merged.slice(0, index).includes(descriptor),
      )
      continue
    }
    const bothObjects = parentValue !== null &&
      parentValue !== undefined &&
      typeof parentValue === 'object' &&
      !Array.isArray(parentValue) &&
      typeof value === 'object' &&
      !Array.isArray(value)
    out[key] = bothObjects
      ? { ...parentValue, ...value }
      : value
  }
  return out
}

/**
 * A bare package specifier (`pkg`, `@scope/pkg`, `@scope/pkg/sub`) versus a
 * filesystem path. Everything not starting with `./`, `../`, `/` or `\` is
 * treated as a specifier and routed through the Node resolver, so it honours
 * `package.json#exports` the way `@systemfsoftware/tsconfig` does for
 * `tsconfig.json`.
 */
export function isModuleSpecifier(value: string): boolean {
  return !(value.startsWith('./') || value.startsWith('../') ||
    value.startsWith('/') || value.startsWith('\\'))
}

const stripExtends = (document: PartialStrykerOptions): PartialStrykerOptions => {
  const { extends: _ignored, ...rest } = document
  return rest
}

/**
 * Fold the accumulated chain bottom-up, exactly the order `resolveExtendsChain`
 * merged in: the root document first, its child over it, and so on up to the
 * document this step was asked to decide.
 */
const mergeChainDocuments = (documents: readonly ExtendsStepDocument[]): PartialStrykerOptions =>
  documents.reduceRight<PartialStrykerOptions>(
    (merged, entry) => mergeConfigs(merged, stripExtends(entry.options)),
    {},
  )

/**
 * Decide the next act in an `extends` chain. Receives the accumulated state
 * plus the last document read and the absolute path it was read from, and
 * returns exactly one of:
 *
 * - `done` — no further parent: the whole chain is merged and carried.
 * - `resolve` — a bare specifier the shell must resolve from `directory`.
 * - `read` — a relative path, already resolved against the declaring
 *   document's directory (never the process working directory).
 * - `refused` — a cycle (the path is already visited) or an `extends` that is
 *   not a string, naming the offending file.
 *
 * The request performs no read and no resolution; it is data the shell
 * performs and feeds back.
 */
export const decideExtendsStep = (
  state: ExtendsStepState,
  document: PartialStrykerOptions,
  file: string,
): ExtendsStepDecision => {
  if (state.visited.includes(file)) {
    return { _tag: 'refused', reason: 'cycle', file }
  }
  const nextState: ExtendsStepState = {
    visited: [...state.visited, file],
    documents: [...state.documents, { path: file, options: document }],
  }
  return Match.value(document['extends']).pipe(
    Match.when(undefined, (): ExtendsStepDecision => ({
      _tag: 'done',
      options: mergeChainDocuments(nextState.documents),
    })),
    // `null` is "no extends" exactly as in the original, which treated it as absent.
    Match.when(null, (): ExtendsStepDecision => ({
      _tag: 'done',
      options: mergeChainDocuments(nextState.documents),
    })),
    Match.when(Match.string, (extendValue) =>
      Match.value(isModuleSpecifier(extendValue)).pipe(
        Match.when(true, (): ExtendsStepDecision => ({
          _tag: 'resolve',
          specifier: extendValue,
          directory: path.dirname(file),
          state: nextState,
        })),
        Match.when(false, (): ExtendsStepDecision => ({
          _tag: 'read',
          path: path.resolve(path.dirname(file), extendValue),
          state: nextState,
        })),
        Match.exhaustive,
      )),
    // The extends key comes from the open index signature, so its value is
    // `unknown`: no finite family of `when` guards can narrow the remainder to
    // `never`, and `Match.exhaustive` requires exactly that. Everything that is
    // neither absent nor a name is refused — the decision stays total.
    Match.orElse((): ExtendsStepDecision => ({ _tag: 'refused', reason: 'non-string-extends', file })),
  )
}

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`, so this
  // branch is statically dead in the build and never enters the published module graph;
  // a static import would ship the test harness into the published module. This module
  // performs no I/O, so its in-source tests exercise a pure decision as data — no
  // substitute anywhere (R9).
  const { it } = await import('@effect/vitest')
  const { expect } = await import('vitest')

  const unexpected = (tag: string) => (): never => {
    throw new Error(`Unexpected decision tag "${tag}"`)
  }

  it('Should_FoldTheDocument_When_ItCarriesNoExtends', () => {
    Match.value(decideExtendsStep(initialExtendsStepState, { testRunner: 'command' }, '/app/stryker.config.js')).pipe(
      Match.tagsExhaustive({
        done: (done) => {
          expect(done.options).toEqual({ testRunner: 'command' })
          expect(done.options).not.toHaveProperty('extends')
        },
        read: unexpected('read'),
        resolve: unexpected('resolve'),
        refused: unexpected('refused'),
      }),
    )
  })

  it('Should_RequestARead_When_ExtendsIsARelativePath', () => {
    Match.value(
      decideExtendsStep(
        initialExtendsStepState,
        { extends: './base/stryker.config.js' },
        '/app/config/my-config.js',
      ),
    ).pipe(
      Match.tagsExhaustive({
        done: unexpected('done'),
        read: (read) => {
          expect(read.path).toBe('/app/config/base/stryker.config.js')
          expect(read.state.visited).toEqual(['/app/config/my-config.js'])
        },
        resolve: unexpected('resolve'),
        refused: unexpected('refused'),
      }),
    )
  })

  it('Should_RequestAResolve_When_ExtendsIsABareSpecifier', () => {
    Match.value(
      decideExtendsStep(
        initialExtendsStepState,
        { extends: '@scope/preset' },
        '/app/config/my-config.js',
      ),
    ).pipe(
      Match.tagsExhaustive({
        done: unexpected('done'),
        read: unexpected('read'),
        resolve: (resolve) => {
          expect(resolve.specifier).toBe('@scope/preset')
          expect(resolve.directory).toBe('/app/config')
        },
        refused: unexpected('refused'),
      }),
    )
  })

  it('Should_RefuseAReportedCycle_When_PathWasAlreadyVisited', () => {
    const state: ExtendsStepState = {
      visited: ['/app/base/stryker.config.js'],
      documents: [{ path: '/app/base/stryker.config.js', options: { testRunner: 'command' } }],
    }
    Match.value(decideExtendsStep(state, { testRunner: 'jest' }, '/app/base/stryker.config.js')).pipe(
      Match.tagsExhaustive({
        done: unexpected('done'),
        read: unexpected('read'),
        resolve: unexpected('resolve'),
        refused: (refused) => {
          expect(refused.reason).toBe('cycle')
          expect(refused.file).toBe('/app/base/stryker.config.js')
        },
      }),
    )
  })

  it('Should_RefuseANonString_When_ExtendsIsNotAString', () => {
    Match.value(decideExtendsStep(initialExtendsStepState, { extends: 42 }, '/app/config.js')).pipe(
      Match.tagsExhaustive({
        done: unexpected('done'),
        read: unexpected('read'),
        resolve: unexpected('resolve'),
        refused: (refused) => {
          expect(refused.reason).toBe('non-string-extends')
          expect(refused.file).toBe('/app/config.js')
        },
      }),
    )
  })

  it('Should_PreferTheChild_When_BothSetTheSameKey', () => {
    // The first-read document is the top-level config (the child that overrides);
    // the parent arrives last, as the document this step is deciding.
    const state: ExtendsStepState = {
      visited: ['/app/stryker.config.js'],
      documents: [{ path: '/app/stryker.config.js', options: { testRunner: 'jest' } }],
    }
    Match.value(decideExtendsStep(state, { testRunner: 'command' }, '/base/preset.js')).pipe(
      Match.tagsExhaustive({
        done: (done) => {
          expect(done.options['testRunner']).toBe('jest')
        },
        read: unexpected('read'),
        resolve: unexpected('resolve'),
        refused: unexpected('refused'),
      }),
    )
  })

  it('Should_DeleteTheKey_When_TheChildNullsAnInheritedKey', () => {
    // A decoded config document is a `Record<string, unknown>` (ConfigDocumentSchema),
    // so a null value is representable there; the narrowed options type has no null.
    // The nulling child is the first-read (top-level) document; the parent is the
    // document this step is deciding.
    const child: Record<string, unknown> = { coverageAnalysis: null }
    const state: ExtendsStepState = {
      visited: ['/app/stryker.config.js'],
      documents: [{ path: '/app/stryker.config.js', options: child }],
    }
    Match.value(decideExtendsStep(state, { coverageAnalysis: 'all', logLevel: 'debug' }, '/base/preset.js')).pipe(
      Match.tagsExhaustive({
        done: (done) => {
          expect(done.options).not.toHaveProperty('coverageAnalysis')
          expect(done.options['logLevel']).toBe('debug')
        },
        read: unexpected('read'),
        resolve: unexpected('resolve'),
        refused: unexpected('refused'),
      }),
    )
  })

  // mergeConfigs — the R2/R3/R4 merge rules over a child config, relocated from the
  // integration suite as data in / data out (U5). None of these need a file.
  it('Should_ReturnParentVerbatim_When_ChildIsEmpty', () => {
    expect(mergeConfigs({ a: 1, b: 2 }, {})).toEqual({ a: 1, b: 2 })
  })

  it('Should_ReplaceTheInheritedScalar_When_TheChildStatesAScalar', () => {
    expect(mergeConfigs({ a: 1, b: 2 }, { b: 9 })).toEqual({ a: 1, b: 9 })
  })

  it('Should_ReplaceTheInheritedArray_When_TheChildStatesAnArray', () => {
    expect(mergeConfigs({ x: [1, 2, 3] }, { x: [9] })).toEqual({ x: [9] })
  })

  it('Should_NotConcatenateArrays_When_TheChildOverridesAnArray', () => {
    const merged = mergeConfigs({ x: [1, 2, 3] }, { x: [4, 5] })
    expect(merged['x']).toEqual([4, 5])
  })

  it('Should_ConcatenatePluginLists_When_TheChildAddsPluginDescriptors', () => {
    const merged = mergeConfigs({ plugins: ['@base/a', '@base/b'] }, { plugins: ['@child/c'] })
    expect(merged['plugins']).toEqual(['@base/a', '@base/b', '@child/c'])
  })

  it('Should_KeepTheFirstOccurrence_When_ParentAndChildNameTheSamePlugin', () => {
    const merged = mergeConfigs({ plugins: ['@base/a', '@base/b'] }, { plugins: ['@base/b', '@child/c'] })
    expect(merged['plugins']).toEqual(['@base/a', '@base/b', '@child/c'])
  })

  it('Should_StartFromTheChildList_When_TheParentStatesNoPlugins', () => {
    const merged = mergeConfigs({ a: 1 }, { plugins: ['@child/c'] })
    expect(merged['plugins']).toEqual(['@child/c'])
  })

  it('Should_DeleteTheInheritedPluginList_When_TheChildStatesPluginsNull', () => {
    // The nulling child must be a `Record<string, unknown>`: the narrowed options
    // type has no null for `plugins`.
    const child: Record<string, unknown> = { plugins: null }
    const merged = mergeConfigs({ plugins: ['@base/a'] }, child)
    expect('plugins' in merged).toBe(false)
  })

  it('Should_MergeObjectsOneLevelDeep_When_TheChildPartiallyOverrides', () => {
    const merged = mergeConfigs({ x: { a: 1, b: 2, c: 3 } }, { x: { b: 9, d: 4 } })
    expect(merged).toEqual({ x: { a: 1, b: 9, c: 3, d: 4 } })
  })

  it('Should_DeleteAnInheritedKey_When_TheChildSetsItToNull', () => {
    const child: Record<string, unknown> = { b: null }
    expect(mergeConfigs({ a: 1, b: 2 }, child)).toEqual({ a: 1 })
  })

  it('Should_DeleteAnObjectValuedKey_When_TheChildSetsItToNull', () => {
    const child: Record<string, unknown> = { x: null }
    const merged = mergeConfigs({ x: { a: 1 } }, child)
    expect('x' in merged).toBe(false)
  })

  it('Should_NoOp_When_TheChildNullsAKeyTheParentDoesNotHave', () => {
    const child: Record<string, unknown> = { b: null }
    expect(mergeConfigs({ a: 1 }, child)).toEqual({ a: 1 })
  })

  it('Should_KeepTheInheritedRelativePathValue_When_Merging', () => {
    const merged = mergeConfigs({ incrementalFile: 'reports/stryker-incremental.json' }, { mutate: ['src/x.ts'] })
    expect(merged).toEqual({
      incrementalFile: 'reports/stryker-incremental.json',
      mutate: ['src/x.ts'],
    })
  })

  // Full-chain fold — three documents in read order, nearest ancestor wins.
  it('Should_WinTheNearestAncestor_When_ThreeLevelChainExists', () => {
    const state: ExtendsStepState = {
      visited: ['/app/child.json', '/app/parent.json'],
      documents: [
        { path: '/app/child.json', options: { c: 'child' } },
        { path: '/app/parent.json', options: { b: 'parent', c: 'parent' } },
      ],
    }
    Match.value(decideExtendsStep(state, { a: 'gp', b: 'gp', c: 'gp' }, '/app/grand.json')).pipe(
      Match.tagsExhaustive({
        done: (done) => {
          expect(done.options).toEqual({ a: 'gp', b: 'parent', c: 'child' })
        },
        read: unexpected('read'),
        resolve: unexpected('resolve'),
        refused: unexpected('refused'),
      }),
    )
  })

  // extends: null is "no extends" exactly as absent — the document folds as-is.
  it('Should_TreatTopLevelExtendsNull_When_ItMatchesAChainNull', () => {
    const document: Record<string, unknown> = { a: 1, extends: null }
    Match.value(decideExtendsStep(initialExtendsStepState, document, '/app/stryker.config.json')).pipe(
      Match.tagsExhaustive({
        done: (done) => {
          expect(done.options).toEqual({ a: 1 })
          expect(done.options).not.toHaveProperty('extends')
        },
        read: unexpected('read'),
        resolve: unexpected('resolve'),
        refused: unexpected('refused'),
      }),
    )
  })

  // The fold strips the internal `extends` key from every folded document, so the
  // `done` options never carry it even when the child declared a string extends.
  it('Should_StripTheExtendsKey_When_FoldingTheChain', () => {
    const state: ExtendsStepState = {
      visited: ['/app/stryker.config.json'],
      documents: [
        {
          path: '/app/stryker.config.json',
          options: { extends: './base.json', b: 9 },
        },
      ],
    }
    Match.value(decideExtendsStep(state, { a: 1, b: 2, mutate: ['src/a.ts'] }, '/app/base.json')).pipe(
      Match.tagsExhaustive({
        done: (done) => {
          expect(done.options).toEqual({ a: 1, b: 9, mutate: ['src/a.ts'] })
          expect(done.options).not.toHaveProperty('extends')
        },
        read: unexpected('read'),
        resolve: unexpected('resolve'),
        refused: unexpected('refused'),
      }),
    )
  })

  // Routing — a relative target becomes a `read` request resolved against the
  // declaring document's directory; an absolute target passes through unchanged.
  it('Should_ResolveRelativePathsAgainstTheConfigDirectory_When_ResolvingATarget', () => {
    Match.value(
      decideExtendsStep(
        initialExtendsStepState,
        { extends: './base.json' },
        path.join('/somewhere/pkg', 'stryker.config.json'),
      ),
    ).pipe(
      Match.tagsExhaustive({
        done: unexpected('done'),
        read: (read) => {
          expect(read.path).toBe(path.resolve('/somewhere/pkg', './base.json'))
          expect(read.state.visited).toEqual([path.join('/somewhere/pkg', 'stryker.config.json')])
        },
        resolve: unexpected('resolve'),
        refused: unexpected('refused'),
      }),
    )
  })

  it('Should_ResolveAnAbsolutePathUnchanged_When_ResolvingATarget', () => {
    const absolute = path.resolve('/somewhere/base.json')
    Match.value(decideExtendsStep(initialExtendsStepState, { extends: absolute }, '/elsewhere/stryker.config.json'))
      .pipe(
        Match.tagsExhaustive({
          done: unexpected('done'),
          read: (read) => {
            expect(read.path).toBe(absolute)
          },
          resolve: unexpected('resolve'),
          refused: unexpected('refused'),
        }),
      )
  })
}
