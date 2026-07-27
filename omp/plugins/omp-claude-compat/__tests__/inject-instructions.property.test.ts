import { describe, expect, it } from '@effect/vitest'
import { FastCheck as fc } from 'effect'
import { CheckRefInjection, decideRefInjection, DEFAULT_NO_INJECT_REFS } from '../src/inject-instructions.workflow.js'

const nameChar = fc.constantFrom('a', 'b', 'c', 'd', 'e', 'A', 'B', 'C', '0', '1', '-', '_')

const fileName = fc.array(nameChar, { minLength: 1, maxLength: 12 }).map((cs) => `${cs.join('')}.md`)

const dirPrefix = fc
  .array(fc.constantFrom('docs', 'packages', 'src', 'a', 'b'), { minLength: 1, maxLength: 3 })
  .map((parts) => parts.join('/'))

const check = (baseName: string, skipList: ReadonlyArray<string>): CheckRefInjection => ({
  baseName,
  skipList,
})

describe('decideRefInjection (PBT)', () => {
  it.prop(
    '∀name_SkipListContains_→Skip',
    [fileName, fc.array(fileName, { maxLength: 5 })],
    ([name, others]) => {
      const verdict = decideRefInjection(check(name, [...others, name]))

      expect(verdict._tag).toBe('Skip')
    },
  )

  it.prop(
    '∀name_SkipListOmits_→Inject',
    [fileName, fc.array(fileName, { maxLength: 5 })],
    ([name, others]) => {
      const verdict = decideRefInjection(
        check(name, others.filter((other) => other !== name)),
      )

      expect(verdict._tag).toBe('Inject')
    },
  )

  it.prop(
    '∀name_EmptySkipList_→Inject',
    [fileName],
    ([name]) => {
      const verdict = decideRefInjection(check(name, []))

      expect(verdict._tag).toBe('Inject')
    },
  )

  it.prop(
    '∀name_DefaultSkipList_→SkipAgentsMd',
    [fc.array(fileName, { maxLength: 4 })],
    ([others]) => {
      const verdict = decideRefInjection(
        check('AGENTS.md', [...others, ...DEFAULT_NO_INJECT_REFS]),
      )

      expect(verdict._tag).toBe('Skip')
    },
  )

  it.prop(
    '∀name_SkipVerdict_→CarriesMatched',
    [fileName],
    ([name]) => {
      const verdict = decideRefInjection(check(name, [name]))

      expect(verdict).toMatchObject({ _tag: 'Skip', matched: name })
    },
  )

  it.prop(
    '∀path_SlashedName_→NoPathParsing',
    [fileName, dirPrefix],
    ([name, prefix]) => {
      const verdict = decideRefInjection(check(`${prefix}/${name}`, [name]))

      expect(verdict._tag).toBe('Inject')
    },
  )
})
