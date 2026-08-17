/**
 * The two directions of the `0x`-prefix codec.
 *
 * They live here rather than inline in `Schema.transform` because naming each direction puts
 * it within reach of a property test, which an inline arrow inside a combinator is not -
 * though per HEX-V1 the codec laws for the schema itself stay with the injected law tests
 * rather than being hand-written here.
 */

/** Drops the `0x` marker, leaving the bare hex digits the domain schema validates. */
export const stripHexPrefix = (prefixed: `0x${string}`): string => prefixed.slice(2)

/** Restores the wire form. The literal return type is what makes the encoded side a template literal. */
export const addHexPrefix = (bare: string): `0x${string}` => `0x${bare}`

/** The recorded obligation model's row count; module scope so the in-source block touches a private binding. */
const EXPORTED_SCHEMA_COUNT = 6

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`,
  // so this branch is statically dead in the build and the runner never enters
  // the published module graph. A static import would ship it.
  const { scanObligations } = await import('@systemfsoftware/effect-schema-law')
  const { expect, it } = await import('vitest')
  const { ColonHex } = await import('./colon-hex.schema.js')
  const { HexBytes } = await import('./hex-bytes.schema.js')
  const { HexString } = await import('./hex-string.schema.js')
  const { PrefixedHex } = await import('./prefixed-hex.schema.js')
  const { StrictHex } = await import('./strict-hex.schema.js')
  const { Uint8ArrayFromPrefixedHex } = await import('./uint8array-from-prefixed-hex.schema.js')

  const EXPORTED_SCHEMAS = {
    ColonHex,
    HexBytes,
    HexString,
    PrefixedHex,
    StrictHex,
    Uint8ArrayFromPrefixedHex,
  }

  const RECORDED_MODEL = {
    ColonHex: { obligations: 3, blind: [] },
    HexBytes: { obligations: 1, blind: [] },
    HexString: { obligations: 1, blind: [] },
    PrefixedHex: { obligations: 1, blind: [] },
    StrictHex: { obligations: 1, blind: [] },
    Uint8ArrayFromPrefixedHex: { obligations: 2, blind: [] },
  }

  it('Should_MatchTheRecordedObligationModel_When_ScanningEveryExportedSchema', () => {
    const scanned = Object.fromEntries(
      Object.entries(EXPORTED_SCHEMAS).map(([name, schema]) => {
        const scan = scanObligations(schema)
        return [name, {
          obligations: scan.obligations.size,
          blind: scan.blind.map((arm) => `${arm.kind} at ${arm.path}`),
        }]
      }),
    )
    expect(Object.keys(scanned)).toHaveLength(EXPORTED_SCHEMA_COUNT)
    expect(scanned).toStrictEqual(RECORDED_MODEL)
  })
}
