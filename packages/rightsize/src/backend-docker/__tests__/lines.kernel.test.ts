/**
 * Line-assembler kernel tests: complete-line delivery with split chunks,
 * blank-line preservation, and the one-shot trailing-fragment flush —
 * the exact no-duplicate/no-loss contract `logs`/`followLogs` depend on
 * (R12).
 */
import { describe, expect, it } from 'vitest'
import { createLineAssembler, feedLines, flushLines } from '../lines.kernel.js'

const feedAll = (chunks: readonly string[]): readonly string[] => {
  let assembler = createLineAssembler()
  const lines: string[] = []
  for (const chunk of chunks) {
    const [next, out] = feedLines(assembler, chunk)
    assembler = next
    lines.push(...out)
  }
  return lines
}

describe('line assembly', () => {
  it('Should_DeliverOnlyCompletedLines_When_ChunksSplitMidLine', () => {
    const lines = feedAll(['hel', 'lo\nwor', 'ld\n'])
    expect(lines).toEqual(['hello', 'world'])
  })

  it('Should_NotLoseALine_When_TheChunkEndsExactlyOnANewline', () => {
    const lines = feedAll(['a\n', 'b\n'])
    expect(lines).toEqual(['a', 'b'])
  })

  it('Should_PreserveBlankInteriorLines_When_TheLineIsGenuinelyEmpty', () => {
    const lines = feedAll(['a\n\nb\n'])
    expect(lines).toEqual(['a', '', 'b'])
  })

  it('Should_FlushTheTrailingFragmentOnce_When_TheStreamEnds', () => {
    const [, tail] = flushLines(createLineAssembler())
    expect(tail).toBeUndefined()

    const withPending = feedLines(createLineAssembler(), 'partial')[0]
    expect(flushLines(withPending)[1]).toBe('partial')
    expect(flushLines(flushLines(withPending)[0])[1]).toBeUndefined() // one-shot flush
  })
})
