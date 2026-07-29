import { describe, expect, it } from 'vitest'
import { isHostBound } from '../src/prompt-destination.kernel.js'

const HOST_SIGILS = ['/', '!', '->', '=>', '$ ', '$\t', '$\n', '$\r', '$$ ', '$$\t', '$$\n', '$$\r']

const BARE_SIGILS = ['$', '$$']

const LEADING_GAPS = [' ', '\t', '\n', '\r', '  \t\n']

describe('isHostBound', () => {
  it.for(HOST_SIGILS)('Should_ClassifyHostBound_When_SigilOpensPrompt(%j)', (sigil) => {
    expect(isHostBound(`${sigil}compact now`)).toBe(true)
  })

  it.for(HOST_SIGILS)('Should_ClassifyHostBound_When_SigilAloneOnTheLine(%j)', (sigil) => {
    expect(isHostBound(sigil)).toBe(true)
  })

  it.for(LEADING_GAPS)('Should_ClassifyHostBound_When_SigilBehindLeadingWhitespace(%j)', (gap) => {
    expect(isHostBound(`${gap}/compact`)).toBe(true)
  })

  it.for(BARE_SIGILS)('Should_ClassifyHostBound_When_BareSigilUnaccompanied(%j)', (sigil) => {
    expect(isHostBound(sigil)).toBe(true)
  })

  it.for(HOST_SIGILS)('Should_ClassifyModelBound_When_SigilIsInterior(%j)', (sigil) => {
    expect(isHostBound(`explain x${sigil}y please`)).toBe(false)
  })

  it.for(BARE_SIGILS)('Should_ClassifyModelBound_When_ShellVariableExpansion(%j)', (sigil) => {
    expect(isHostBound(`${sigil}HOME`)).toBe(false)
  })

  it.for(BARE_SIGILS)('Should_ClassifyModelBound_When_BracedExpansion(%j)', (sigil) => {
    expect(isHostBound(`${sigil}{HOME}`)).toBe(false)
  })

  it('Should_ClassifyModelBound_When_PromptIsProse', () => {
    expect(isHostBound('please summarise the changes')).toBe(false)
  })

  it('Should_ClassifyModelBound_When_PromptIsEmpty', () => {
    expect(isHostBound('')).toBe(false)
  })
})
