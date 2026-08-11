import { type FastCheck, Schema as S } from 'effect'
import * as Arbitrary from 'effect/Arbitrary'
import * as AST from 'effect/SchemaAST'
import { dischargedBy, type Obligation, type RefusalGenerators, scanObligations } from './refutation.kernel.js'

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

const replaceAt = <A>(items: ReadonlyArray<A>, index: number, item: A): ReadonlyArray<A> =>
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

/** Verdict for one schema's obligation set, carrying the detail R7 requires in a failure. */
export interface AdequacyReport {
  readonly adequate: boolean
  readonly undischarged: readonly Obligation[]
  readonly message: string
}

const renderWitness = (witness: unknown): string => {
  try {
    return JSON.stringify(witness) ?? String(witness)
  } catch {
    return String(witness)
  }
}

/**
 * Which obligations no declared generator discharges. A bare "adequacy failed" leaves
 * the author nothing to act on, so the message names each node's tag, every path
 * reaching it, and the witness that proves the weakening is permissive.
 */
export const adequacyReport = (
  schema: S.Schema.AnyNoContext,
  generators: RefusalGenerators,
): AdequacyReport => {
  const scan = scanObligations(schema)
  const credits = dischargedBy(schema, scan.obligations, generators)
  const undischarged = [...scan.obligations.values()].filter(
    (obligation) => (credits.get(obligation.node) ?? []).length === 0,
  )
  if (scan.blind.length > 0) {
    return {
      adequate: false,
      undischarged,
      message: `${scan.blind.length} arm(s) could not be searched for a witness:\n` +
        scan.blind.map((b) => `  ${b.message}`).join('\n'),
    }
  }
  if (undischarged.length === 0) return { adequate: true, undischarged, message: '' }

  const detail = undischarged
    .map((o) => `  ${o.tag} reached by [${o.paths.join(' | ')}] — witness ${renderWitness(o.witness)}`)
    .join('\n')
  return {
    adequate: false,
    undischarged,
    message: `${undischarged.length} obligation(s) discharged by no declared generator:\n${detail}`,
  }
}

export const boundedUnion = <
  Base extends readonly [S.Schema.Any, ...ReadonlyArray<S.Schema.Any>],
  Recur extends readonly [S.Schema.Any, ...ReadonlyArray<S.Schema.Any>],
>(
  identifier: string,
  options: {
    readonly base: Base
    readonly recur: Recur
    readonly maxDepth?: number
  },
): S.Schema<
  S.Schema.Type<Base[number] | Recur[number]>,
  S.Schema.Encoded<Base[number] | Recur[number]>,
  S.Schema.Context<Base[number] | Recur[number]>
> => {
  const { base, maxDepth = 2, recur } = options
  const baseArbitraries = base.map((member) => Arbitrary.make(member))
  const recurArbitraries = recur.map((member) => Arbitrary.make(member))
  return S.Union(...base, ...recur).annotations({
    identifier,
    arbitrary: () => (fc: typeof FastCheck) =>
      fc.oneof(
        { depthIdentifier: identifier, maxDepth },
        fc.oneof(...baseArbitraries),
        ...recurArbitraries,
      ),
  })
}
