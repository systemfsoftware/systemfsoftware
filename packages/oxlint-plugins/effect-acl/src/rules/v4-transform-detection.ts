import type { ESTree } from '@oxlint/plugins'

/**
 * AST-only (EA3) detection of the effect v4 canonical Schema transform spelling:
 *
 *   export const DomainFromText = S.String.pipe(
 *     S.decodeTo(S.toType(Domain), {
 *       decode: SchemaGetter.transformOrFail((raw) => …),
 *       encode: SchemaGetter.forbidden(() => …),
 *     }),
 *   )
 *
 * and the `SchemaTransformation` variants:
 *
 *   export const DomainFromText = Source.pipe(
 *     S.decodeTo(S.toType(Domain), SchemaTransformation.transformOrFail({ decode, encode })),
 *   )
 *   // or
 *   S.decodeTo(S.toType(Domain), SchemaTransformation.make({
 *     decode: SchemaGetter.transformOrFail((raw) => …),
 *     encode: SchemaGetter.forbidden(() => …),
 *   }))
 *
 * effect v4 removed the direct `S.transformOrFail(from, to, …)` constructor, so
 * both acl-transform-orfail-required and acl-single-transform-export recognize
 * the v4 spellings alongside the v3 `S.transformOrFail(...)` call. Detection is
 * anchored on `S.decodeTo(...)` calls whose transformation argument is or
 * contains a `SchemaGetter.transformOrFail` / `SchemaTransformation.transformOrFail`
 * call — a plain `S.decodeTo` with no transform-bearing getter is not a transform.
 */

/** `SchemaGetter.transformOrFail(…)` / `SchemaTransformation.transformOrFail(…)`. */
const isTransformOrFailGetterCall = (node: ESTree.Node): boolean => {
  if (node.type !== 'CallExpression') return false
  const callee = node.callee
  if (callee.type !== 'MemberExpression') return false
  const object = callee.object
  if (object.type !== 'Identifier') return false
  if (object.name !== 'SchemaGetter' && object.name !== 'SchemaTransformation') return false
  return callee.property.type === 'Identifier' && callee.property.name === 'transformOrFail'
}

/**
 * Walks the container shapes a transformation argument can plausibly take
 * (an options object, a `SchemaTransformation` value, or a piped/composed
 * getter) looking for a transformOrFail getter call.
 */
const containsTransformOrFailGetter = (node: ESTree.Node): boolean => {
  switch (node.type) {
    case 'CallExpression':
      return (
        isTransformOrFailGetterCall(node) ||
        containsTransformOrFailGetter(node.callee) ||
        node.arguments.some((argument) => containsTransformOrFailGetter(argument))
      )
    case 'ObjectExpression':
      return node.properties.some((property) => containsTransformOrFailGetter(property))
    case 'Property':
      return containsTransformOrFailGetter(node.value)
    case 'MemberExpression':
      return containsTransformOrFailGetter(node.object)
    default:
      return false
  }
}

/**
 * `S.decodeTo(to, …)` whose second argument is or contains a
 * `SchemaGetter.transformOrFail` / `SchemaTransformation.transformOrFail` call —
 * the v4 spelling of the ACL transform obligation.
 */
export const isV4DecodeToTransformCall = (node: ESTree.Node): boolean => {
  if (node.type !== 'CallExpression') return false
  const callee = node.callee
  if (callee.type !== 'MemberExpression') return false
  const object = callee.object
  if (object.type !== 'Identifier' || object.name !== 'S') return false
  if (callee.property.type !== 'Identifier' || callee.property.name !== 'decodeTo') return false
  if (node.arguments.length < 2) return false
  const transformation = node.arguments[1]
  return transformation !== undefined && containsTransformOrFailGetter(transformation)
}
