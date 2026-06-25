import { describe } from '@effect/vitest'
import { ruleOfSchemas } from '@systemfsoftware/effect-schema-law'
import { ColonHex, HexString, PrefixedHex, StrictHex } from '../mod.js'

describe('Rule of Schemas', () => {
  ruleOfSchemas('ColonHex', ColonHex)
  ruleOfSchemas('StrictHex', StrictHex)
  ruleOfSchemas('HexString', HexString)
  ruleOfSchemas('PrefixedHex', PrefixedHex)
})
