import { describe, expect, it } from '@effect/vitest'
import { FastCheck as fc } from 'effect'
import { CheckRefInjection, decideRefInjection, DEFAULT_NO_INJECT_REFS } from '../src/inject-instructions.workflow.js'

const nameChar = fc.constantFrom('a', 'b', 'c', 'd', 'e', 'A', 'B', 'C', '0', '1', '-', '_')

const fileName = fc.array(nameChar, { minLength: 1, maxLength: 12 }).map((cs) => `${cs.join('')}.md`)

const dirPrefix = fc
  .array(fc.constantFrom('docs', 'packages', 'src', 'a', 'b'), { maxLength: 3 })
  .map((parts) => parts.join('/'))

const resolve = (prefix: string, name: string): string => prefix === '' ? `/root/${name}` : `/root/${prefix}/${name}`

const check = (resolvedPath: string, skipList: ReadonlyArray<string>): CheckRefInjection => ({
  resolvedPath,
  skipList,
})

describe('decideRefInjection (PBT)', () => {
  it.prop(
    '∀name_SkipListContains_→Skip',
    [fileName, fc.array(fileName, { maxLength: 5 }), dirPrefix],
    ([name, others, prefix]) => {
      const verdict = decideRefInjection(check(resolve(prefix, name), [...others, name]))

      expect(verdict._tag).toBe('Skip')
    },
  )

  it.prop(
    '∀name_SkipListOmits_→Inject',
    [fileName, fc.array(fileName, { maxLength: 5 }), dirPrefix],
    ([name, others, prefix]) => {
      const verdict = decideRefInjection(
        check(resolve(prefix, name), others.filter((other) => other !== name)),
      )

      expect(verdict._tag).toBe('Inject')
    },
  )

  it.prop(
    '∀name_EmptySkipList_→Inject',
    [fileName, dirPrefix],
    ([name, prefix]) => {
      const verdict = decideRefInjection(check(resolve(prefix, name), []))

      expect(verdict._tag).toBe('Inject')
    },
  )

  it.prop(
    '∀prefix_DirectoryIgnored_=BareNameVerdict',
    [fileName, fc.array(fileName, { maxLength: 4 }), dirPrefix],
    ([name, skipList, prefix]) => {
      const withDirectory = decideRefInjection(check(resolve(prefix, name), skipList))
      const bare = decideRefInjection(check(name, skipList))

      expect(withDirectory._tag).toBe(bare._tag)
    },
  )

  it.prop(
    '∀prefix_DefaultSkipList_→SkipAgentsMd',
    [dirPrefix],
    ([prefix]) => {
      const verdict = decideRefInjection(
        check(resolve(prefix, 'AGENTS.md'), DEFAULT_NO_INJECT_REFS),
      )

      expect(verdict._tag).toBe('Skip')
    },
  )

  it.prop(
    '∀name_Skip_→CarriesMatchedEntry',
    [fileName, dirPrefix],
    ([name, prefix]) => {
      const verdict = decideRefInjection(check(resolve(prefix, name), [name]))

      expect(verdict).toMatchObject({ _tag: 'Skip', matched: name })
    },
  )
})
