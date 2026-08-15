/**
 * The two directions of the `0x`-prefix codec.
 *
 * They live here rather than inline in `Schema.transform` because a codec direction is a
 * function body, and a declaration carries none. Naming them also puts each direction within
 * reach of a property test, which an inline arrow inside a combinator is not - though per
 * HEX-V1 the codec laws for the schema itself stay with the injected law tests rather than
 * being hand-written here.
 */

/** Drops the `0x` marker, leaving the bare hex digits the domain schema validates. */
export const stripHexPrefix = (prefixed: `0x${string}`): string => prefixed.slice(2)

/** Restores the wire form. The literal return type is what makes the encoded side a template literal. */
export const addHexPrefix = (bare: string): `0x${string}` => `0x${bare}`
