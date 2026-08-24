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

const DoneTag = { _tag: 'done' } as const
type DoneTag = typeof DoneTag
const ReadTag = { _tag: 'read' } as const
type ReadTag = typeof ReadTag
const ResolveTag = { _tag: 'resolve' } as const
type ResolveTag = typeof ResolveTag
const RefusedTag = { _tag: 'refused' } as const
type RefusedTag = typeof RefusedTag

/**
 * The next act, returned as data. `read` and `resolve` carry the state the
 * shell must feed back together with the document the act yields; `done`
 * carries the fully merged options; `refused` carries a named reason.
 * Each variant inherits its `_tag` from a value-space carrier (`...Tag`),
 * so the literal appears in exactly one place per tag.
 */
export type ExtendsStepDecision =
  | DoneTag & { readonly options: PartialStrykerOptions }
  | ReadTag & { readonly path: string; readonly state: ExtendsStepState }
  | ResolveTag & {
    readonly specifier: string
    readonly directory: string
    readonly state: ExtendsStepState
  }
  | RefusedTag & { readonly reason: ExtendsRefusalReason; readonly file: string }

/**
 * Merge a child config over a parent's resolved options.
 * R2: scalars replace wholesale; objects merge one level deep; arrays replace
 * wholesale, `plugins` included.
 * R3: a child key set to `null` deletes the inherited key.
 *
 * `plugins` was once the one array that appended to its parent's instead of
 * replacing it, so an explicit `"plugins": []` could not turn a base preset's
 * loaders off — it read as "add nothing" and every inherited plugin still
 * loaded. Nothing wanted that: every config in this repository that extends a
 * preset and names `plugins` names the whole set it needs. A consumer writing
 * the empty array means it.
 *
 * Where the precedence logic this replaced re-decoded each object through
 * `ConfigDocumentSchema`, this one spreads the validated objects directly:
 * they already passed that schema at the read boundary, so the re-decode was
 * dead weight and its throw site is gone with it.
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
    return { ...RefusedTag, reason: 'cycle', file }
  }
  const nextState: ExtendsStepState = {
    visited: [...state.visited, file],
    documents: [...state.documents, { path: file, options: document }],
  }
  return Match.value(document['extends']).pipe(
    Match.when(undefined, (): ExtendsStepDecision => ({
      ...DoneTag,
      options: mergeChainDocuments(nextState.documents),
    })),
    // `null` is "no extends" exactly as in the original, which treated it as absent.
    Match.when(null, (): ExtendsStepDecision => ({
      ...DoneTag,
      options: mergeChainDocuments(nextState.documents),
    })),
    Match.when(Match.string, (extendValue) =>
      Match.value(isModuleSpecifier(extendValue)).pipe(
        Match.when(true, (): ExtendsStepDecision => ({
          ...ResolveTag,
          specifier: extendValue,
          directory: path.dirname(file),
          state: nextState,
        })),
        Match.when(false, (): ExtendsStepDecision => ({
          ...ReadTag,
          path: path.resolve(path.dirname(file), extendValue),
          state: nextState,
        })),
        Match.exhaustive,
      )),
    // The extends key comes from the open index signature, so its value is
    // `unknown`: no finite family of `when` guards can narrow the remainder to
    // `never`, and `Match.exhaustive` requires exactly that. Everything that is
    // neither absent nor a name is refused — the decision stays total.
    Match.orElse((): ExtendsStepDecision => ({ ...RefusedTag, reason: 'non-string-extends', file })),
  )
}
