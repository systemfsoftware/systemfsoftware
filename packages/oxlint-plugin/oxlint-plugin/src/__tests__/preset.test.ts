import { describe, expect, it } from 'vitest'

import plugin from '../index.js'
import preset from '../preset.js'

const PLUGIN_NAME = '@systemfsoftware/oxlint-plugin'

describe('preset registration contract', () => {
  it('Should_SelfRegister_When_TheFragmentIsDerivedFromThePlugin', () => {
    expect(preset.jsPlugins).toStrictEqual([import.meta.resolve(PLUGIN_NAME)])
    expect(preset.rules).toStrictEqual(plugin.configs.recommended.rules)
  })

  it('Should_SetNoOtherConfigKey_When_TheFragmentIsPure', () => {
    const keys = Object.keys(preset).sort()
    expect(keys).toStrictEqual(['jsPlugins', 'rules'])
    // @ts-expect-error runtime guard against forbidden keys
    expect(preset.plugins).toBeUndefined()
    // @ts-expect-error runtime guard against forbidden keys
    expect(preset.ignorePatterns).toBeUndefined()
  })
})
