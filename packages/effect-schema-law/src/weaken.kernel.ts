import { type FastCheck, Schema as S } from 'effect'
import * as Arbitrary from 'effect/Arbitrary'
import * as AST from 'effect/SchemaAST'

/**
 * One weakening of an Effect schema, produced by `armsOf`. Each arm identifies
 * the AST node it removes; the rebuilt tree is the surrounding schema with
 * that node replaced by its child.
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
 * through `Refinement`, `Transformation`, `TypeLiteral`, `Union`, `TupleType`,
 * `Declaration`, and `Suspend`. The walk terminates on `Suspend` cycles at
 * `depthCap` levels and raises if it meets an AST tag it does not know how
 * to rebuild — that is the R2 signal that a reachable arm is being hidden.
 *
 * The arm's `node` is the AST node its weakening removes; reference identity
 * is the obligation key (R3). `weakened` is the enclosing tree with `node`
 * replaced by its child, ready to be passed to `Schema.make`.
 */
export const armsOf = (schema: S.Schema.Any): readonly Arm[] => {
  const out: Arm[] = []
  walk(schema.ast, 'root', out, 0, DEFAULT_SUSPEND_DEPTH_CAP, (replacement) => replacement)
  return out
}

type Rebuild = (replacement: AST.AST) => AST.AST

const replaceAt = <A>(items: readonly A[], index: number, item: A): readonly A[] =>
  items.map((existing, i) => (i === index ? item : existing))

const walk = (
  node: AST.AST,
  path: string,
  out: Arm[],
  suspendDepth: number,
  depthCap: number,
  rebuild: Rebuild,
): void => {
  if (AST.isRefinement(node)) {
    out.push({
      kind: 'drop-refinement',
      path: `${path}/refinement`,
      node,
      weakened: rebuild(node.from),
    })
    walk(
      node.from,
      `${path}/from`,
      out,
      suspendDepth,
      depthCap,
      (replacement) => rebuild(new AST.Refinement(replacement, node.filter, node.annotations)),
    )
    return
  }
  if (AST.isTransformation(node)) {
    out.push({ kind: 'drop-to-arm', path: `${path}/to`, node: node.from, weakened: rebuild(node.to) })
    out.push({
      kind: 'drop-from-arm',
      path: `${path}/from`,
      node: node.to,
      weakened: rebuild(node.from),
    })
    walk(
      node.from,
      `${path}/from`,
      out,
      suspendDepth,
      depthCap,
      (replacement) => rebuild(new AST.Transformation(replacement, node.to, node.transformation, node.annotations)),
    )
    walk(
      node.to,
      `${path}/to`,
      out,
      suspendDepth,
      depthCap,
      (replacement) => rebuild(new AST.Transformation(node.from, replacement, node.transformation, node.annotations)),
    )
    return
  }
  if (AST.isTypeLiteral(node)) {
    node.propertySignatures.forEach((property, i) => {
      walk(
        property.type,
        `${path}/property/${String(property.name)}`,
        out,
        suspendDepth,
        depthCap,
        (replacement) =>
          rebuild(
            new AST.TypeLiteral(
              replaceAt(
                node.propertySignatures,
                i,
                new AST.PropertySignature(
                  property.name,
                  replacement,
                  property.isOptional,
                  property.isReadonly,
                  property.annotations,
                ),
              ),
              node.indexSignatures,
              node.annotations,
            ),
          ),
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
        (replacement) => rebuild(AST.Union.make(replaceAt(node.types, i, replacement), node.annotations)),
      )
    })
    return
  }
  if (AST.isTupleType(node)) {
    node.elements.forEach((element, i) => {
      walk(element.type, `${path}/element/${i}`, out, suspendDepth, depthCap, (replacement) =>
        rebuild(
          new AST.TupleType(
            replaceAt(
              node.elements,
              i,
              new AST.OptionalType(replacement, element.isOptional, element.annotations),
            ),
            node.rest,
            node.isReadonly,
            node.annotations,
          ),
        ))
    })
    node.rest.forEach((rest, i) => {
      walk(rest.type, `${path}/rest/${i}`, out, suspendDepth, depthCap, (replacement) =>
        rebuild(
          new AST.TupleType(
            node.elements,
            replaceAt(node.rest, i, new AST.Type(replacement, rest.annotations)),
            node.isReadonly,
            node.annotations,
          ),
        ))
    })
    return
  }
  if (AST.isDeclaration(node)) {
    node.typeParameters.forEach((parameter, i) => {
      walk(parameter, `${path}/typeParameter/${i}`, out, suspendDepth, depthCap, (replacement) =>
        rebuild(
          new AST.Declaration(
            replaceAt(node.typeParameters, i, replacement),
            node.decodeUnknown,
            node.encodeUnknown,
            node.annotations,
          ),
        ))
    })
    return
  }
  if (AST.isSuspend(node)) {
    if (suspendDepth >= depthCap) return
    walk(
      node.f(),
      `${path}/suspend`,
      out,
      suspendDepth + 1,
      depthCap,
      (replacement) => rebuild(new AST.Suspend(() => replacement, node.annotations)),
    )
  }
}

/**
 * The fast-check arbitrary for the encoded side of a schema, drawn via
 * `either`-style failure isolation: a schema whose arbitrary construction
 * throws is reported as a thrown error rather than a silent `None`. U2's
 * fallback chain consumes this alongside the type-side arbitrary.
 *
 * @internal
 */
export const safeEncodedArbitrary = (
  schema: S.Schema.Any,
): FastCheck.Arbitrary<unknown> => {
  const encoded = S.encodedSchema(schema)
  return Arbitrary.make(encoded)
}

/**
 * The fast-check arbitrary for the type side of a schema. Safe the same way
 * `safeEncodedArbitrary` is — never returns a placeholder for a thrown
 * arbitrary.
 *
 * @internal
 */
export const safeTypeArbitrary = (schema: S.Schema.Any): FastCheck.Arbitrary<unknown> => Arbitrary.make(schema)
