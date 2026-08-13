import fc from 'fast-check'
import type { Extractable, ExtractionCommand, ExtractionEither, PairsDecision } from './extraction.ts'
import { extractPairs } from './extraction.ts'
import type { EditCommand } from './schemas.ts'
import { decodeEditCommand } from './schemas.ts'

const makeCommand = (toolName: string, toolInput: Record<string, unknown>, filePath = 'oxlint.json'): EditCommand => {
  const decoded = decodeEditCommand(
    JSON.stringify({ tool_name: toolName, tool_input: { ...toolInput, file_path: filePath } }),
  )
  if (decoded === undefined) {
    throw new Error('test command failed to decode')
  }
  return decoded
}

const commandOf = (command: EditCommand, diskContent: string | undefined): ExtractionCommand => ({
  command,
  diskContent,
})

const diskArb = fc.option(fc.string(), { nil: undefined })

const isPairs = (
  result: ExtractionEither,
): result is { readonly ok: true; readonly value: PairsDecision } => result.ok && result.value._tag === 'Pairs'

const newSideOf = (result: Extract<Extractable, { readonly _tag: 'Pairs' }>): string => result.pairs[0].newSide

const sameOldSideAs = (
  result: Extract<Extractable, { readonly _tag: 'Pairs' }>,
  expected: string | undefined,
): boolean => result.pairs[0].oldSide === expected

Deno.test('Edit shape: ∀e_EditHunkAppliedToDisk_=WholeDocumentPair', () => {
  fc.assert(
    fc.property(fc.string(), fc.string(), fc.string(), (oldString, newString, suffix) => {
      const disk = oldString + suffix
      const result = extractPairs(
        commandOf(makeCommand('Edit', { old_string: oldString, new_string: newString }), disk),
      )
      if (!isPairs(result)) return false
      return result.value.pairs.length === 1 &&
        result.value.pairs[0].oldSide === disk &&
        result.value.pairs[0].newSide === newString + suffix
    }),
  )
})

Deno.test('Edit shape: ∀e_EditFirstOccurrence_=Replaced', () => {
  fc.assert(
    fc.property(fc.string(), fc.string(), (newString, suffix) => {
      const disk = `old ${newString} old${suffix}`
      const result = extractPairs(
        commandOf(makeCommand('Edit', { old_string: 'old', new_string: newString }), disk),
      )
      if (!isPairs(result)) return false
      // Only the FIRST 'old' is replaced; a second occurrence further on survives.
      return result.value.pairs[0].newSide === `${newString} ${newString} old${suffix}`
    }),
  )
})

Deno.test('Edit shape: ∀e_EditWithoutDisk_=Unrecoverable', () => {
  fc.assert(
    fc.property(fc.string(), fc.string(), (oldString, newString) => {
      const result = extractPairs(
        commandOf(makeCommand('Edit', { old_string: oldString, new_string: newString }), undefined),
      )
      return !result.ok
    }),
  )
})

Deno.test('Edit shape: ∀e_EditAbsentHunk_=Unrecoverable', () => {
  fc.assert(
    fc.property(
      fc.array(fc.constantFrom('a', 'b', 'c', ' ', '\n'), { maxLength: 12 }).map((chars) => chars.join('')),
      fc.string({ maxLength: 10 }),
      fc.string({ maxLength: 10 }),
      (disk, oldString, newString) => {
        // Brackets cannot appear in the 'abc' alphabet disk, so the bracketed
        // hunk old_string can never be present: the reconstruction must fail closed.
        const result = extractPairs(
          commandOf(makeCommand('Edit', { old_string: `[${oldString}]`, new_string: newString }), disk),
        )
        return !result.ok
      },
    ),
  )
})

Deno.test('Edit shape: ∀e_EditNeitherSide_=Contentless', () => {
  fc.assert(
    fc.property(fc.record({ unrelated: fc.string() }), (input) => {
      const result = extractPairs(commandOf(makeCommand('Edit', input), undefined))
      return result.ok && result.value._tag === 'Contentless'
    }),
  )
})

Deno.test('Edit shape: ∀e_EditOneSide_=Unrecoverable', () => {
  fc.assert(
    fc.property(
      fc.record({ old_string: fc.string() }),
      fc.record({ new_string: fc.string() }),
      (oldOnly, newOnly) =>
        !extractPairs(commandOf(makeCommand('Edit', oldOnly), undefined)).ok &&
        !extractPairs(commandOf(makeCommand('Edit', newOnly), undefined)).ok,
    ),
  )
})

Deno.test('Edit shape: ∀e_EditNonStringSide_=Unrecoverable', () => {
  fc.assert(
    fc.property(
      fc.oneof(fc.constant(42), fc.constant(true), fc.constant({ nested: 'x' })),
      fc.constantFrom('old_string', 'new_string'),
      (bad, key) => !extractPairs(commandOf(makeCommand('Edit', { [key]: bad }), undefined)).ok,
    ),
  )
})

Deno.test('Write/Create shape: ∀w_WriteContent_=DiskPair', () => {
  fc.assert(
    fc.property(fc.string(), diskArb, (content, disk) => {
      const result = extractPairs(commandOf(makeCommand('Write', { content }), disk))
      if (!isPairs(result)) return false
      return result.value.pairs[0].newSide === content && sameOldSideAs(result.value, disk)
    }),
  )
})

Deno.test('Write/Create shape: ∀w_WriteNoContent_=Contentless', () => {
  fc.assert(
    fc.property(fc.record({ other: fc.string() }), (input) => {
      const result = extractPairs(commandOf(makeCommand('Write', input), undefined))
      return result.ok && result.value._tag === 'Contentless'
    }),
  )
})

Deno.test('Write/Create shape: ∀c_CreateContent_=DiskPair', () => {
  fc.assert(
    fc.property(fc.string(), diskArb, (content, disk) => {
      const result = extractPairs(commandOf(makeCommand('Create', { content }), disk))
      if (!isPairs(result)) return false
      return newSideOf(result.value) === content && sameOldSideAs(result.value, disk)
    }),
  )
})

const bothSidesEntry = fc.record({ old_string: fc.string(), new_string: fc.string() })

// Entries whose old_strings are pairwise-distinct tokens from a fixed set and
// whose new_strings come from a disjoint alphabet: each hunk targets exactly one
// position in the joined disk and no replacement can disturb a later hunk.
const distinctTokenEntries = fc
  .subarray(['alpha', 'beta', 'gamma', 'delta'], { minLength: 1, maxLength: 4 })
  .chain((tokens) =>
    fc
      .array(fc.array(fc.constantFrom('x', 'y', 'z'), { maxLength: 6 }).map((chars) => chars.join('')), {
        minLength: tokens.length,
        maxLength: tokens.length,
      })
      .map((newStrings) => tokens.map((token, index) => ({ old_string: token, new_string: newStrings[index] })))
  )

Deno.test('MultiEdit/Update shape: ∀m_MultiEditDistinctHunks_=AppliedNewSide', () => {
  fc.assert(
    fc.property(distinctTokenEntries, (entries) => {
      const disk = entries.map((entry) => entry.old_string).join('\n')
      const expected = entries.reduce((acc, entry) => acc.replace(entry.old_string, entry.new_string), disk)
      const result = extractPairs(commandOf(makeCommand('MultiEdit', { edits: entries }), disk))
      if (!isPairs(result)) return false
      return result.value.pairs.length === 1 &&
        result.value.pairs[0].oldSide === disk &&
        result.value.pairs[0].newSide === expected
    }),
  )
})

// Fixed-width delimited tokens over distinct ids: no token can be a substring of
// another, so each hunk has exactly one target and the chain length is what
// varies. Hunk N rewrites the token hunk N-1 produced, so applying the hunks to
// the ORIGINAL buffer in parallel stops at tokens[1] instead of reaching the last.
const chainedTokenHunks = fc
  .uniqueArray(fc.integer({ min: 100, max: 999 }), { minLength: 2, maxLength: 6 })
  .map((ids) => ids.map((id) => `<<${id}>>`))

Deno.test('MultiEdit/Update shape: ∀m_MultiEditChainedHunks_=ChainedNewSide', () => {
  fc.assert(
    fc.property(chainedTokenHunks, fc.string({ maxLength: 8 }), (tokens, suffix) => {
      const first = tokens[0]
      const last = tokens[tokens.length - 1]
      if (first === undefined || last === undefined) {
        return false
      }
      const disk = `rules: { ${first} }${suffix}`
      const edits = tokens
        .slice(0, -1)
        .map((token, index) => ({ old_string: token, new_string: tokens[index + 1] }))
      const result = extractPairs(commandOf(makeCommand('MultiEdit', { edits }), disk))
      if (!isPairs(result)) {
        return false
      }
      return result.value.pairs.length === 1 &&
        result.value.pairs[0].oldSide === disk &&
        result.value.pairs[0].newSide === `rules: { ${last} }${suffix}`
    }),
  )
})

Deno.test('MultiEdit/Update shape: ∀m_MultiEditWithoutDisk_=Unrecoverable', () => {
  fc.assert(
    fc.property(fc.array(bothSidesEntry, { minLength: 1 }), (entries) => {
      const result = extractPairs(commandOf(makeCommand('MultiEdit', { edits: entries }), undefined))
      return !result.ok
    }),
  )
})

Deno.test('MultiEdit/Update shape: ∀m_MultiEditEmptyEntries_=Contentless', () => {
  fc.assert(
    fc.property(fc.array(fc.record({ other: fc.string() }), { minLength: 1 }), (entries) => {
      const result = extractPairs(commandOf(makeCommand('MultiEdit', { edits: entries }), undefined))
      return result.ok && result.value._tag === 'Contentless'
    }),
  )
})

Deno.test('MultiEdit/Update shape: ∀m_MultiEditPartialEntry_=Unrecoverable', () => {
  fc.assert(
    fc.property(
      fc.array(bothSidesEntry, { minLength: 1 }),
      fc.constantFrom('old_string', 'new_string'),
      (entries, dropped) => {
        const tampered = entries.map((entry) =>
          dropped === 'old_string' ? { new_string: entry.new_string } : { old_string: entry.old_string }
        )
        return !extractPairs(commandOf(makeCommand('MultiEdit', { edits: tampered }), undefined)).ok
      },
    ),
  )
})

Deno.test('MultiEdit/Update shape: ∀m_MultiEditNonRecordEntry_=Unrecoverable', () => {
  fc.assert(
    fc.property(fc.oneof(fc.constant(42), fc.constant('hunk'), fc.constant(['a'])), (entry) => {
      const result = extractPairs(commandOf(makeCommand('Update', { edits: [entry] }), undefined))
      return !result.ok
    }),
  )
})

Deno.test('MultiEdit/Update shape: ∀m_MultiEditNoEditsKey_=TopLevelFallback', () => {
  fc.assert(
    fc.property(fc.string(), fc.string(), (oldString, newString) => {
      const result = extractPairs(
        commandOf(makeCommand('Update', { old_string: oldString, new_string: newString }), oldString),
      )
      if (!isPairs(result)) return false
      return result.value.pairs.length === 1 &&
        result.value.pairs[0].newSide === newString &&
        result.value.pairs[0].oldSide === oldString
    }),
  )
})

Deno.test('MultiEdit/Update shape: ∀m_MultiEditNonArray_=Unrecoverable', () => {
  fc.assert(
    fc.property(fc.oneof(fc.constant(42), fc.constant('edits'), fc.constant({ a: 1 })), (edits) => {
      const result = extractPairs(commandOf(makeCommand('MultiEdit', { edits }), undefined))
      return !result.ok
    }),
  )
})

Deno.test('morph shape: ∀o_MorphFileEditsWithoutDisk_=Unrecoverable', () => {
  fc.assert(
    fc.property(fc.array(fc.record({ find: fc.string(), replace: fc.string() }), { minLength: 1 }), (fileEdits) => {
      const result = extractPairs(commandOf(makeCommand('morph_mcp_edit-file', { file_edits: fileEdits }), undefined))
      return !result.ok
    }),
  )
})

Deno.test('morph shape: ∀o_MorphFileEditsWithDisk_=ReconstructedPair', () => {
  fc.assert(
    fc.property(fc.array(fc.record({ find: fc.string(), replace: fc.string() }), { minLength: 1 }), (fileEdits) => {
      const disk = fileEdits.map((entry) => entry.find).join('\n')
      const result = extractPairs(commandOf(makeCommand('morph_mcp_edit-file', { file_edits: fileEdits }), disk))
      if (!isPairs(result)) return false
      return result.value.pairs.length === 1 && sameOldSideAs(result.value, disk)
    }),
  )
})

Deno.test('morph shape: ∀o_MorphUnrecognizedContent_=Unrecoverable', () => {
  fc.assert(
    fc.property(fc.oneof(fc.constant('edits'), fc.constant({ file_edits: 'raw' })), (content) => {
      const result = extractPairs(commandOf(makeCommand('morph_mcp_edit-file', { content }), 'disk'))
      return !result.ok
    }),
  )
})

Deno.test('morph shape: ∀o_MorphOnlyPath_=Contentless', () => {
  fc.assert(
    fc.property(fc.constantFrom('morph_edit', 'morph_mcp_edit-file'), (toolName) => {
      const result = extractPairs(commandOf(makeCommand(toolName, { file_path: 'oxlint.json' }), undefined))
      return result.ok && result.value._tag === 'Contentless'
    }),
  )
})
