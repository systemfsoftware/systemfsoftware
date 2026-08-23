/// <reference types="vitest/import-meta" />
import { Schema as S } from 'effect'
import * as AST from 'effect/SchemaAST'
import { FastCheck } from 'effect/testing'

/**
 * One weakening of an Effect schema, produced by `armsOf`. Each arm identifies
 * the AST node it removes; the rebuilt tree is the surrounding schema with
 * that node replaced by its child or, for a dropped refinement, by the same
 * node without that check.
 *
 * Two schemas reaching the same `node` share its identity and therefore its
 * obligation key — the deduplication is the entire point of the shape.
 */
export interface Arm {
  readonly kind: 'drop-refinement' | 'drop-to-arm' | 'drop-from-arm'
  readonly path: string
  /** The node this arm removes — the obligation key. Two arms removing it are one obligation. */
  readonly node: AST.AST
  readonly weakened: AST.AST
}

const DEFAULT_SUSPEND_DEPTH_CAP = 16

/**
 * Walk an Effect schema's AST and return every weakenable arm, recursively
 * through `Objects`, `Union`, `Arrays`, `Declaration`, and `Suspend`, plus
 * the v4 per-node `Checks` (refinements) and encoding `Link` chains
 * (transformations). The walk terminates on `Suspend` cycles at `depthCap`
 * levels; every other AST tag is a leaf whose children cannot hold a
 * refinement, and `Union` over structurally identical members is fine because
 * the walk keys arms by node identity, not shape.
 *
 * The arm's `node` is the AST node its weakening removes; reference identity
 * is the obligation key (R3). `weakened` is the enclosing tree with `node`
 * replaced by its child, ready to be passed to `Schema.make`.
 */
export const armsOf = (schema: S.ConstraintDecoder<unknown>): readonly Arm[] => {
  const out: Arm[] = []
  const visited = new Set<AST.AST>()
  walk(schema.ast, 'root', out, 0, DEFAULT_SUSPEND_DEPTH_CAP, (replacement) => replacement, visited)
  return out
}

type Rebuild = (replacement: AST.AST) => AST.AST

const replaceAt = <A>(items: readonly A[], index: number, item: A): readonly A[] =>
  items.map((existing, i) => (i === index ? item : existing))

/**
 * Clone an AST node, patching selected own properties. This mirrors the v4
 * `SchemaAST` internals (which rebuild checked nodes the same way on
 * `Schema.check`) without depending on non-public exports.
 */
const cloneWith = <A extends AST.AST>(node: A, patch: Record<string, unknown>): A => {
  const target = Object.assign({}, node)
  Object.setPrototypeOf(target, Reflect.getPrototypeOf(node))
  Object.assign(target, patch)
  return target
}

/** The AST with one refinement check removed — dropping a refinement in v4. */
const dropCheck = (node: AST.AST, check: AST.Check<unknown>): AST.AST => {
  const checks = node.checks
  if (checks === undefined) return node
  const rest = checks.filter((existing) => existing !== check)
  return cloneWith(node, { checks: rest.length === 0 ? undefined : rest })
}

/** The AST with its encoding chain removed — the decoded (type-side) view. */
const withoutEncoding = (node: AST.AST): AST.AST =>
  node.encoding === undefined
    ? node
    : cloneWith(node, { encoding: undefined })

/** The AST with the encoding link at `index` retargeted at `to`. */
const replaceLinkAt = (node: AST.AST, index: number, to: AST.AST): AST.AST => {
  const encoding = node.encoding
  if (encoding === undefined) return node
  const link = encoding[index]
  if (link === undefined || link.to === to) return node
  const next = [...encoding.slice(0, index), new AST.Link(to, link.transformation), ...encoding.slice(index + 1)]
  return cloneWith(node, { encoding: next })
}

const walk = (
  node: AST.AST,
  path: string,
  out: Arm[],
  suspendDepth: number,
  depthCap: number,
  rebuild: Rebuild,
  visited: Set<AST.AST>,
): void => {
  // v4 shares AST nodes (a suspended union referenced from several fields is
  // one node reached down many paths). R3 splits obligations by visit:
  // - Node-local arms — drop-refinement for `node.checks`, and the
  //   drop-to/drop-from pair for `node.encoding` — emit on EVERY visit:
  //   N struct fields sharing one checked node still yield N arms on that one
  //   node (`∀n_SharedRefinement_≡OneNode`). Each arm's path and enclosing
  //   rebuild differ, so the arms stay distinct even though they remove the
  //   same node.
  // - Subtree arms — everything the walk emits below the node's child edges —
  //   are collected ONCE, on the first visit; a revisit emits the node-local
  //   arms above and then returns. A shared `Suspend` therefore contributes
  //   its inner refinement chain exactly once, no matter how many paths reach
  //   it (`∀n_SharedSuspend_≡OneArm`, `∀n_SharedCheckedStruct_≡NPlusOne`).
  // Walking each subtree once is what terminates v4's shared-union recursion
  // and keeps `armsOf` output deterministic; tree-shaped recipes (the v3
  // world) never share nodes, so this dedup is a no-op there.
  const isNewNode = !visited.has(node)
  if (isNewNode) visited.add(node)
  // Drop-refinement arms: v4 refinements are per-node checks, and `S.check`
  // appends to one node's check array — each check gets its own arm (v3 dealt
  // each refinement its own AST node), so the paths carry the check index.
  if (node.checks) {
    node.checks.forEach((check, index) => {
      out.push({
        kind: 'drop-refinement',
        path: `${path}/refinement/${index}`,
        node,
        weakened: rebuild(dropCheck(node, check)),
      })
    })
  }
  // Drop-transformation arms: v4 transformations are links in the encoding
  // chain, and chained `decodeTo` calls FLATTEN extra links onto the same
  // node. The v3 model made each nesting level its own node and therefore its
  // own arm pair, so each link contributes a pair here.
  if (node.encoding !== undefined) {
    node.encoding.forEach((link, index) => {
      out.push({ kind: 'drop-to-arm', path: `${path}/to/${index}`, node, weakened: rebuild(link.to) })
      out.push({
        kind: 'drop-from-arm',
        path: `${path}/from/${index}`,
        node,
        weakened: rebuild(withoutEncoding(node)),
      })
      walk(
        link.to,
        `${path}/to/${index}`,
        out,
        suspendDepth,
        depthCap,
        (replacement) => rebuild(replaceLinkAt(node, index, replacement)),
        visited,
      )
    })
  }
  // Revisits emitted their node-local arms above; the subtree is walked once.
  if (!isNewNode) return
  if (AST.isObjects(node)) {
    node.propertySignatures.forEach((property, i) => {
      walk(
        property.type,
        `${path}/property/${String(property.name)}`,
        out,
        suspendDepth,
        depthCap,
        (replacement) =>
          rebuild(
            new AST.Objects(
              replaceAt(node.propertySignatures, i, new AST.PropertySignature(property.name, replacement)),
              node.indexSignatures,
              node.annotations,
              node.checks,
              node.encoding,
              node.context,
              node.encodingChecks,
            ),
          ),
        visited,
      )
    })
    return
  }
  if (AST.isUnion(node)) {
    node.types.forEach((member, i) => {
      walk(
        member,
        `${path}/union/${i}`,
        out,
        suspendDepth,
        depthCap,
        (replacement) =>
          rebuild(
            new AST.Union(
              replaceAt(node.types, i, replacement),
              node.mode,
              node.annotations,
              node.checks,
              node.encoding,
              node.context,
              node.encodingChecks,
            ),
          ),
        visited,
      )
    })
    return
  }
  if (AST.isArrays(node)) {
    node.elements.forEach((element, i) => {
      walk(
        element,
        `${path}/element/${i}`,
        out,
        suspendDepth,
        depthCap,
        (replacement) =>
          rebuild(
            new AST.Arrays(
              node.isMutable,
              replaceAt(node.elements, i, replacement),
              node.rest,
              node.annotations,
              node.checks,
              node.encoding,
              node.context,
              node.encodingChecks,
            ),
          ),
        visited,
      )
    })
    node.rest.forEach((rest, i) => {
      walk(
        rest,
        `${path}/rest/${i}`,
        out,
        suspendDepth,
        depthCap,
        (replacement) =>
          rebuild(
            new AST.Arrays(
              node.isMutable,
              node.elements,
              replaceAt(node.rest, i, replacement),
              node.annotations,
              node.checks,
              node.encoding,
              node.context,
              node.encodingChecks,
            ),
          ),
        visited,
      )
    })
    return
  }
  if (AST.isDeclaration(node)) {
    node.typeParameters.forEach((parameter, i) => {
      walk(
        parameter,
        `${path}/typeParameter/${i}`,
        out,
        suspendDepth,
        depthCap,
        (replacement) =>
          rebuild(
            new AST.Declaration(
              replaceAt(node.typeParameters, i, replacement),
              node.run,
              node.annotations,
              node.checks,
              node.encoding,
              node.context,
              node.encodingChecks,
            ),
          ),
        visited,
      )
    })
    return
  }
  if (AST.isSuspend(node)) {
    if (suspendDepth >= depthCap) return
    walk(
      node.thunk(),
      `${path}/suspend`,
      out,
      suspendDepth + 1,
      depthCap,
      (replacement) =>
        rebuild(new AST.Suspend(() => replacement, node.annotations, node.checks, node.encoding, node.context)),
      visited,
    )
  }
}

/**
 * The fast-check arbitrary for the encoded side of a schema, drawn via
 * `throw`-style failure isolation: a schema whose arbitrary construction
 * throws is reported as a thrown error rather than a silent `None`. U2's
 * fallback chain consumes this alongside the type-side arbitrary.
 */
export const safeEncodedArbitrary = (
  schema: S.ConstraintDecoder<unknown>,
): FastCheck.Arbitrary<unknown> => S.toArbitrary(S.toEncoded(schema))(FastCheck)

/**
 * The fast-check arbitrary for the type side of a schema. Safe the same way
 * `safeEncodedArbitrary` is — never returns a placeholder for a thrown
 * arbitrary.
 */
export const safeTypeArbitrary = (schema: S.ConstraintDecoder<unknown>): FastCheck.Arbitrary<unknown> =>
  S.toArbitrary(schema)(FastCheck)

/** Recipe depth cap for the in-source law below. */
const RECIPE_MAX_DEPTH = 3

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`,
  // so this branch is statically dead in the build and the runner never enters
  // the published module graph. A static import would ship it.
  const { it } = await import('@effect/vitest')
  const { Exit, Schema: S } = await import('effect')
  const { FastCheck: fc } = await import('effect/testing')
  const { expectTypeOf } = await import('vitest')

  /**
   * R2 in the only channel that can fire. The walk recurses through exactly the
   * container tags below — plus per-node checks and encoding links, which are
   * attached to any node rather than being AST tags of their own; every other
   * AST tag is a leaf that cannot hold a refinement. When Effect adds a tag,
   * this stops compiling and someone has to decide which side it belongs on.
   */
  type WalkedTag = 'Declaration' | 'Suspend' | 'Arrays' | 'Objects' | 'Union'

  expectTypeOf<Exclude<AST.AST['_tag'], WalkedTag>>().toEqualTypeOf<
    | 'Any'
    | 'BigInt'
    | 'Boolean'
    | 'Enum'
    | 'Literal'
    | 'Never'
    | 'Null'
    | 'Number'
    | 'ObjectKeyword'
    | 'String'
    | 'Symbol'
    | 'TemplateLiteral'
    | 'Undefined'
    | 'UniqueSymbol'
    | 'Unknown'
    | 'Void'
  >()

  /**
   * A construction recipe for a schema, and the arm count that construction
   * implies. The model is derived from the recipe, never re-walked from the
   * AST — a re-walk would only restate the implementation it is checking.
   */
  type Recipe =
    | { readonly kind: 'leaf' }
    | { readonly kind: 'refine'; readonly inner: Recipe }
    | { readonly kind: 'transform'; readonly from: Recipe; readonly to: Recipe }
    | { readonly kind: 'struct'; readonly fields: readonly Recipe[] }
    | { readonly kind: 'sequence'; readonly element: Recipe }
    | { readonly kind: 'suspend'; readonly inner: Recipe }
    | { readonly kind: 'declaration'; readonly inner: Recipe }

  const armCountOf = (recipe: Recipe): number => {
    if (recipe.kind === 'leaf') return 0
    if (recipe.kind === 'refine') return 1 + armCountOf(recipe.inner)
    if (recipe.kind === 'transform') return 2 + armCountOf(recipe.from) + armCountOf(recipe.to)
    if (recipe.kind === 'struct') return recipe.fields.reduce((n, f) => n + armCountOf(f), 0)
    if (recipe.kind === 'sequence') return armCountOf(recipe.element)
    if (recipe.kind === 'declaration') return armCountOf(recipe.inner)
    return armCountOf(recipe.inner)
  }

  const schemaOf = (recipe: Recipe): S.Codec<unknown, unknown> => {
    if (recipe.kind === 'leaf') return S.String
    if (recipe.kind === 'refine') return refineInto(recipe.inner, 1)
    if (recipe.kind === 'transform') {
      // v4 attaches an encoding link to the target node, and a `Suspend` target
      // carries the link on its wrapper — a shape `Schema.check` cannot refine.
      // The canonical recursive-transform spelling suspends the WHOLE transform,
      // putting the link on the inner node where refinement can reach it.
      if (recipe.to.kind === 'suspend') {
        const source = schemaOf(recipe.from)
        const target = schemaOf(recipe.to.inner)
        return S.suspend(() => source.pipe(S.decodeTo(target)))
      }
      return schemaOf(recipe.from).pipe(S.decodeTo(schemaOf(recipe.to)))
    }
    if (recipe.kind === 'struct') {
      const fields: Record<string, S.Codec<unknown, unknown>> = {}
      recipe.fields.forEach((f, i) => {
        fields[`f${i}`] = schemaOf(f)
      })
      return S.Struct(fields)
    }
    if (recipe.kind === 'sequence') return S.Array(schemaOf(recipe.element))
    if (recipe.kind === 'declaration') return S.Option(schemaOf(recipe.inner))
    return S.suspend(() => schemaOf(recipe.inner))
  }

  /**
   * A check cannot be attached to a `Suspend` node in v4, so a refinement chain
   * is pushed down through any suspensions and applied as one check layer on
   * the bottom-most node. The walk sees the same arm count either way.
   */
  const applyChecks = (schema: S.Codec<unknown, unknown>, depth: number): S.Codec<unknown, unknown> => {
    let checked = schema
    for (let i = 0; i < depth; i++) {
      checked = checked.pipe(S.check(S.makeFilter(() => true)))
    }
    return checked
  }

  const refineInto = (recipe: Recipe, depth: number): S.Codec<unknown, unknown> => {
    if (recipe.kind === 'refine') return refineInto(recipe.inner, depth + 1)
    if (recipe.kind === 'suspend') return S.suspend(() => refineInto(recipe.inner, depth))
    const base = schemaOf(recipe)
    if (base.ast instanceof AST.Suspend) {
      const inner = base.ast.thunk()
      return S.suspend(() => applyChecks(S.make(inner), depth))
    }
    return applyChecks(base, depth)
  }

  const recipeArb = fc.letrec<{ node: Recipe }>((tie) => ({
    node: fc.oneof(
      { maxDepth: RECIPE_MAX_DEPTH },
      fc.constant<Recipe>({ kind: 'leaf' }),
      tie('node').map((inner): Recipe => ({ kind: 'refine', inner })),
      fc.tuple(tie('node'), tie('node')).map(([from, to]): Recipe => ({ kind: 'transform', from, to })),
      fc.array(tie('node'), { minLength: 1, maxLength: 3 }).map((fields): Recipe => ({ kind: 'struct', fields })),
      tie('node').map((element): Recipe => ({ kind: 'sequence', element })),
      tie('node').map((inner): Recipe => ({ kind: 'suspend', inner })),
      tie('node').map((inner): Recipe => ({ kind: 'declaration', inner })),
    ),
  })).node

  it.prop('∀r_ArmCount_≡RecipeModel', [recipeArb], ([recipe]) => armsOf(schemaOf(recipe)).length === armCountOf(recipe))

  it.prop('∀r_DistinctArmPaths_≡ArmCount', [recipeArb], ([recipe]) => {
    const arms = armsOf(schemaOf(recipe))
    return new Set(arms.map((a) => a.path)).size === arms.length
  })

  it.prop('∀r_EveryWeakened_≡Constructible', [recipeArb], ([recipe]) =>
    armsOf(schemaOf(recipe)).every((arm) => {
      const rebuilt = S.make(arm.weakened)
      return rebuilt.ast === arm.weakened
    }))

  /**
   * `Union` stays out of the recipe grammar because Effect may collapse
   * structurally identical members, which would make the model wrong for a
   * reason that has nothing to do with the walk. Distinct thresholds keep every
   * member its own node.
   */
  it.prop('∀n_UnionOfDistinctRefinements_≡NArms', [fc.integer({ min: 2, max: 6 })], ([members]) => {
    const branches = Array.from(
      { length: members },
      (_, i) => S.String.pipe(S.check(S.makeFilter((s: string) => s.length >= i))),
    )
    const arms = armsOf(S.Union(branches)).filter((a) => a.kind === 'drop-refinement')
    return arms.length === members
  })

  /**
   * Monotonicity: dropping a refinement only ever adds acceptance. The value is
   * generated long enough to satisfy every threshold, so the antecedent holds by
   * construction and the implication is never vacuous.
   */
  const lengthRefinements = fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 1, maxLength: 4 })
    .chain((thresholds) => {
      const longest = Math.max(...thresholds)
      return fc.tuple(
        fc.constant(thresholds),
        fc.string({ minLength: longest, maxLength: longest + 4 }),
      )
    })

  it.prop('∀tv_DropRefinement_⊇Original', [lengthRefinements], ([[thresholds, value]]) => {
    const schema = thresholds.reduce<S.Codec<string, string>>(
      (acc, min) => acc.pipe(S.check(S.makeFilter((s: string) => s.length >= min))),
      S.String,
    )
    const originalAccepts = Exit.isSuccess(S.decodeExit(schema)(value))
    const weakenedAllAccept = armsOf(schema)
      .filter((arm) => arm.kind === 'drop-refinement')
      .every((arm) =>
        Exit.isSuccess(S.decodeUnknownExit(S.make<S.ConstraintCodec<unknown, unknown>>(arm.weakened))(value))
      )
    return originalAccepts && weakenedAllAccept
  })

  /**
   * R3: obligations are keyed by the node an arm removes, so one refinement
   * reached by many paths is one node. Reference equality is the mechanism.
   */
  it.prop('∀n_SharedRefinement_≡OneNode', [fc.integer({ min: 2, max: 5 })], ([positions]) => {
    const shared = S.String.pipe(S.check(S.makeFilter((s: string) => s.length > 0)))
    const fields: Record<string, S.Codec<unknown, unknown>> = {}
    for (let i = 0; i < positions; i++) fields[`f${i}`] = shared
    const arms = armsOf(S.Struct(fields)).filter((a) => a.kind === 'drop-refinement')
    return arms.length === positions && new Set(arms.map((a) => a.node)).size === 1
  })

  /**
   * R3, subtree side: arms emitted BELOW a shared node are per-node — the
   * subtree is walked only on the first visit, so N struct fields holding the
   * SAME `S.suspend` instance yield exactly one arm for the suspended inner
   * chain, not N. A `Suspend` node cannot carry node-local arms of its own (v4
   * forbids checks on suspend wrappers and `S.suspend` attaches no encoding),
   * so the count below is the whole contract.
   */
  it.prop('∀n_SharedSuspend_≡OneArm', [fc.integer({ min: 2, max: 5 })], ([positions]) => {
    const inner = S.String.pipe(S.check(S.makeFilter((s: string) => s.length > 0)))
    const sharedSuspend = S.suspend(() => inner)
    const fields: Record<string, S.Codec<unknown, unknown>> = {}
    for (let i = 0; i < positions; i++) fields[`f${i}`] = sharedSuspend
    const arms = armsOf(S.Struct(fields)).filter((a) => a.kind === 'drop-refinement')
    return arms.length === 1 && new Set(arms.map((a) => a.node)).size === 1 && arms[0]?.node === inner.ast
  })
}
