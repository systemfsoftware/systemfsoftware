import * as AST from 'effect/SchemaAST'

export interface Arm {
  readonly kind: 'drop-refinement' | 'drop-to-arm' | 'drop-from-arm'
  readonly path: string
  readonly node: AST.AST
  readonly weakened: AST.AST
}

export interface UnsupportedShape {
  readonly tag: string
  readonly reason: string
  readonly coverageRoute: string
}

export const UNSUPPORTED_SHAPES: readonly UnsupportedShape[] = [
  {
    tag: 'Unknown',
    reason: 'Unknown accepts everything by definition; a bare Unknown carries no refinement slot the walk can remove',
    coverageRoute: 'U1 bare-primitive rule (schema-boundary: bare Unknown in domain position is forbidden)',
  },
]

export const unsupportedShapeOf = (ast: AST.AST): UnsupportedShape | undefined => {
  if (AST.isUnknown(ast)) return UNSUPPORTED_SHAPES[0]
  return undefined
}

const SUSPEND_DEPTH_CAP = 16

export const armsOf = (schema: { readonly ast: AST.AST }): readonly Arm[] => {
  const out: Arm[] = []
  const visited = new Set<AST.AST>()
  walk(schema.ast, 'root', out, 0, SUSPEND_DEPTH_CAP, (replacement) => replacement, visited)
  return out
}

const replaceAt = <A>(items: ReadonlyArray<A>, index: number, item: A): ReadonlyArray<A> =>
  items.map((existing, i) => (i === index ? item : existing))

const cloneWith = <A extends AST.AST>(node: A, patch: Record<string, unknown>): A => {
  const copy = Object.assign({}, node, patch)
  const prototype = Reflect.getPrototypeOf(node)
  if (prototype !== null && prototype !== Object.prototype) {
    Object.setPrototypeOf(copy, prototype)
  }
  return copy
}

const toNonEmpty = <C>(items: ReadonlyArray<C>): readonly [C, ...Array<C>] | undefined => {
  const first = items[0]
  if (first === undefined) return undefined
  return [first, ...items.slice(1)]
}

const toEncoding = (links: ReadonlyArray<AST.Link>): AST.Encoding => {
  const first = links[0]
  if (first === undefined) throw new Error('weaken: encoding link list was empty')
  return [first, ...links.slice(1)]
}

const dropOneCheck = (node: AST.AST, check: unknown): AST.AST => {
  const checks = node.checks
  if (checks === undefined) return node
  return cloneWith(node, { checks: toNonEmpty(checks.filter((existing) => existing !== check)) })
}

const withoutEncoding = (node: AST.AST): AST.AST => cloneWith(node, { encoding: undefined })

const replaceLinkAt = (node: AST.AST, index: number, to: AST.AST): AST.AST => {
  const encoding = node.encoding
  if (encoding === undefined) return node
  const link = encoding[index]
  if (link === undefined || link.to === to) return node
  return cloneWith(node, {
    encoding: toEncoding([
      ...encoding.slice(0, index),
      new AST.Link(to, link.transformation),
      ...encoding.slice(index + 1),
    ]),
  })
}

const walk = (
  node: AST.AST,
  path: string,
  out: Arm[],
  suspendDepth: number,
  depthCap: number,
  rebuild: (replacement: AST.AST) => AST.AST,
  visited: Set<AST.AST>,
): void => {
  const isNewNode = !visited.has(node)
  if (isNewNode) visited.add(node)
  if (node.checks !== undefined) {
    node.checks.forEach((check, index) => {
      out.push({
        kind: 'drop-refinement',
        path: `${path}/refinement/${index}`,
        node,
        weakened: rebuild(dropOneCheck(node, check)),
      })
    })
  }
  if (node.encoding !== undefined) {
    node.encoding.forEach((link, index) => {
      out.push({ kind: 'drop-to-arm', path: `${path}/to/${index}`, node, weakened: rebuild(link.to) })
      out.push({ kind: 'drop-from-arm', path: `${path}/from/${index}`, node, weakened: rebuild(withoutEncoding(node)) })
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
    node.indexSignatures.forEach((signature, i) => {
      walk(signature.type, `${path}/index/${i}`, out, suspendDepth, depthCap, (replacement) =>
        rebuild(
          new AST.Objects(
            node.propertySignatures,
            replaceAt(node.indexSignatures, i, new AST.IndexSignature(signature.parameter, replacement)),
            node.annotations,
            node.checks,
            node.encoding,
            node.context,
            node.encodingChecks,
          ),
        ), visited)
      walk(signature.parameter, `${path}/param/${i}`, out, suspendDepth, depthCap, (replacement) =>
        rebuild(
          new AST.Objects(
            node.propertySignatures,
            replaceAt(node.indexSignatures, i, new AST.IndexSignature(replacement, signature.type)),
            node.annotations,
            node.checks,
            node.encoding,
            node.context,
            node.encodingChecks,
          ),
        ), visited)
    })
    return
  }
  if (AST.isUnion(node)) {
    node.types.forEach((member, i) => {
      walk(member, `${path}/union/${i}`, out, suspendDepth, depthCap, (replacement) =>
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
        ), visited)
    })
    return
  }
  if (AST.isArrays(node)) {
    node.elements.forEach((element, i) => {
      walk(element, `${path}/element/${i}`, out, suspendDepth, depthCap, (replacement) =>
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
        ), visited)
    })
    node.rest.forEach((rest, i) => {
      walk(rest, `${path}/rest/${i}`, out, suspendDepth, depthCap, (replacement) =>
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
        ), visited)
    })
    return
  }
  if (AST.isDeclaration(node)) {
    node.typeParameters.forEach((parameter, i) => {
      walk(parameter, `${path}/typeParameter/${i}`, out, suspendDepth, depthCap, (replacement) =>
        rebuild(
          new AST.Declaration(
            replaceAt(node.typeParameters, i, replacement),
            node.run,
            node.annotations,
            node.checks,
            node.encoding,
            node.context,
            node.encodingChecks,
            node.encodingRun,
          ),
        ), visited)
    })
    return
  }
  if (AST.isTemplateLiteral(node)) {
    node.parts.forEach((part, i) => {
      walk(part, `${path}/part/${i}`, out, suspendDepth, depthCap, (replacement) =>
        rebuild(
          new AST.TemplateLiteral(
            replaceAt(node.parts, i, replacement),
            node.annotations,
            node.checks,
            node.encoding,
            node.context,
          ),
        ), visited)
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
        rebuild(new AST.Suspend(() => replacement, node.annotations, undefined, node.encoding, node.context)),
      visited,
    )
  }
}
