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
 *
 * @internal
 */
export const safeEncodedArbitrary = (
  schema: S.ConstraintDecoder<unknown>,
): FastCheck.Arbitrary<unknown> => S.toArbitrary(S.toEncoded(schema))(FastCheck)

/**
 * The fast-check arbitrary for the type side of a schema. Safe the same way
 * `safeEncodedArbitrary` is — never returns a placeholder for a thrown
 * arbitrary.
 *
 * @internal
 */
export const safeTypeArbitrary = (schema: S.ConstraintDecoder<unknown>): FastCheck.Arbitrary<unknown> =>
  S.toArbitrary(schema)(FastCheck)
