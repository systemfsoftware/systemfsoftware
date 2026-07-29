import { describe, it } from '@effect/vitest'
import { FastCheck as fc } from 'effect'
import { ClassifyPromptCommand, classifyPromptDestination } from './prompt-destination.workflow.js'

const sigil = fc.constantFrom('/', '!', '->', '=>', '$ ', '$\t', '$\n', '$\r', '$$ ', '$$\t', '$$\n', '$$\r')

const bareSigil = fc.constantFrom('$', '$$')

const proseChar = fc.constantFrom('a', 'b', 'w', 'W', '0', '9', ' ', '?', '.', 'é')

const prose = fc.array(proseChar, { minLength: 1, maxLength: 20 }).map((cs) => cs.join(''))

const leadingSpace = fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 4 })
  .map((cs) => cs.join(''))

const identifierChar = fc.constantFrom('H', 'O', 'M', 'E', 'x', '_', '1')

const identifier = fc.array(identifierChar, { minLength: 1, maxLength: 8 }).map((cs) => cs.join(''))

const destination = (text: string): string => classifyPromptDestination(new ClassifyPromptCommand({ text }))._tag

describe('classifyPromptDestination (PBT)', () => {
  it.prop('∀sigil_OpensPrompt_→Host', [sigil, prose], ([open, rest]) => destination(`${open}${rest}`) === 'Host')

  it.prop('∀sigil_AloneOnTheLine_→Host', [sigil], ([open]) => destination(open) === 'Host')

  it.prop(
    '∀sigil_BehindLeadingWhitespace_→Host',
    [leadingSpace, sigil, prose],
    ([gap, open, rest]) => destination(`${gap}${open}${rest}`) === 'Host',
  )

  it.prop('∀bareSigil_Unaccompanied_→Host', [bareSigil], ([open]) => destination(open) === 'Host')

  it.prop('∀prose_OpensPrompt_→Model', [prose], ([text]) => destination(text) === 'Model')

  it.prop(
    '∀sigil_Interior_→Model',
    [prose, sigil, prose],
    ([lead, open, rest]) => destination(`${lead.trimStart()}x${open}${rest}`) === 'Model',
  )

  it.prop(
    '∀name_ShellVariableExpansion_→Model',
    [bareSigil, identifier],
    ([open, name]) => destination(`${open}${name}`) === 'Model',
  )

  it.prop(
    '∀name_BracedExpansion_→Model',
    [bareSigil, identifier],
    ([open, name]) => destination(`${open}{${name}}`) === 'Model',
  )
})
