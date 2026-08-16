import { scanObligations } from '@systemfsoftware/effect-schema-law'
import type { Schema as S } from 'effect'
import { expect, it } from 'vitest'
import { ColonHex } from '../colon-hex.schema.js'
import { HexBytes } from '../hex-bytes.schema.js'
import { HexString } from '../hex-string.schema.js'
import { PrefixedHex } from '../prefixed-hex.schema.js'
import { StrictHex } from '../strict-hex.schema.js'
import { Uint8ArrayFromPrefixedHex } from '../uint8array-from-prefixed-hex.schema.js'

const EXPORTED_SCHEMAS: Readonly<Record<string, S.ConstraintDecoder<unknown>>> = {
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
  expect(scanned).toStrictEqual(RECORDED_MODEL)
})
