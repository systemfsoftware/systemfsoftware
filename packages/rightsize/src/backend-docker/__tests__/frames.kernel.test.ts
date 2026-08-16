/**
 * Directed unit tests for the demux kernel: the boundary shapes properties
 * are weakest at — explicit header splits, payload straddling, zero-length
 * frames, unknown stream-type bytes, and immutability of both inputs and
 * already-emitted outputs.
 */
import { describe, expect, it } from 'vitest'
import { demuxMultiplexed, demuxRaw, push } from '../frames.kernel.js'
import type { Demuxer, DemuxOutput } from '../frames.kernel.js'

/** Serializes one frame: `[streamType, 0, 0, 0, len_be, payload]`. */
const frameBytes = (streamType: number, payload: Uint8Array): Uint8Array => {
  const out = new Uint8Array(8 + payload.length)
  out[0] = streamType
  const len = payload.length
  out[4] = (len >>> 24) & 0xff
  out[5] = (len >>> 16) & 0xff
  out[6] = (len >>> 8) & 0xff
  out[7] = len & 0xff
  out.set(payload, 8)
  return out
}

const feed = (demuxer: Demuxer, chunks: readonly Uint8Array[]): readonly DemuxOutput[] => {
  let current = demuxer
  const outputs: DemuxOutput[] = []
  for (const chunk of chunks) {
    const [next, out] = push(current, chunk)
    current = next
    for (const o of out) outputs.push(o)
  }
  return outputs
}

describe('multiplexed demux', () => {
  it('Should_EmitTheFrame_When_TheHeaderArrivesAcrossAnySplitPoint', () => {
    const bytes = frameBytes(1, new Uint8Array([0x61]))
    for (const split of [1, 3, 5, 7]) {
      const outputs = feed(demuxMultiplexed(), [bytes.slice(0, split), bytes.slice(split)])
      expect(outputs).toEqual([{ tag: 'frame', streamType: 'stdout', payload: new Uint8Array([0x61]) }])
    }
  })

  it('Should_BufferASplitPayload_When_TheFrameStraddlesPushes', () => {
    const bytes = frameBytes(1, new Uint8Array([1, 2, 3, 4]))
    const [first, out1] = push(demuxMultiplexed(), bytes.slice(0, 10))
    const [second, out2] = push(first, bytes.slice(10))
    expect(first.pending.length).toBe(10)
    const outputs = [...out1, ...out2]
    expect(outputs).toEqual([{ tag: 'frame', streamType: 'stdout', payload: new Uint8Array([1, 2, 3, 4]) }])
    expect(second.pending.length).toBe(0)
  })

  it('Should_EmitZeroLengthFrames_When_ThePayloadIsEmpty', () => {
    const [demuxer, outputs] = push(demuxMultiplexed(), frameBytes(2, new Uint8Array(0)))
    expect(outputs).toEqual([{ tag: 'frame', streamType: 'stderr', payload: new Uint8Array(0) }])
    expect(demuxer.pending.length).toBe(0)
  })

  it('Should_PreserveInterleavedStreamOrder_When_FramesShareAChunk', () => {
    const chunk = new Uint8Array([
      ...frameBytes(1, new Uint8Array([0x61, 0x62])),
      ...frameBytes(2, new Uint8Array([0x63])),
      ...frameBytes(1, new Uint8Array(0)),
    ])
    expect(feed(demuxMultiplexed(), [chunk])).toEqual([
      { tag: 'frame', streamType: 'stdout', payload: new Uint8Array([0x61, 0x62]) },
      { tag: 'frame', streamType: 'stderr', payload: new Uint8Array([0x63]) },
      { tag: 'frame', streamType: 'stdout', payload: new Uint8Array(0) },
    ])
  })

  it('Should_SkipUnknownStreamType_When_TheLengthPrefixIsTrustworthy', () => {
    // stream type 9 is unknown; it carries a 1-byte payload (0x01) that must
    // still be consumed so a valid stderr frame behind it decodes.
    const bytes = Uint8Array.from([9, 0, 0, 0, 0, 0, 0, 1, 0x01, ...frameBytes(2, new Uint8Array([0x7a]))])
    expect(feed(demuxMultiplexed(), [bytes])).toEqual([
      { tag: 'frame', streamType: 'stderr', payload: new Uint8Array([0x7a]) },
    ])
  })

  it('Should_BufferAHeader_When_SplitAcrossThreePushes', () => {
    const bytes = frameBytes(2, new Uint8Array([0x44]))
    const [first, out1] = push(demuxMultiplexed(), bytes.slice(0, 2))
    const [second, out2] = push(first, bytes.slice(2, 5))
    expect([...out1, ...out2]).toEqual([])
    const [, out3] = push(second, bytes.slice(5))
    expect(out3).toEqual([{ tag: 'frame', streamType: 'stderr', payload: new Uint8Array([0x44]) }])
  })

  it('Should_NotLetCallerReuseCorruptEmittedPayloads_When_TheCallerMutatesTheChunk', () => {
    const chunk = Uint8Array.from(frameBytes(1, new Uint8Array([0x42])))
    const [, outputs] = push(demuxMultiplexed(), chunk)
    chunk.fill(0xff)
    expect(outputs).toEqual([{ tag: 'frame', streamType: 'stdout', payload: new Uint8Array([0x42]) }])
  })

  it('Should_KeepEarlierFramesValid_When_LaterPushesArrive', () => {
    const [demuxer1, out1] = push(demuxMultiplexed(), frameBytes(1, new Uint8Array([0x11, 0x22])))
    const [, out2] = push(demuxer1, frameBytes(2, new Uint8Array([0x33])))
    expect([...out1, ...out2]).toEqual([
      { tag: 'frame', streamType: 'stdout', payload: new Uint8Array([0x11, 0x22]) },
      { tag: 'frame', streamType: 'stderr', payload: new Uint8Array([0x33]) },
    ])
  })
})

describe('raw demux', () => {
  it('Should_PassEachNonEmptyChunkThrough_When_InRawMode', () => {
    const [demuxer, out1] = push(demuxRaw(), new Uint8Array([1, 2]))
    const [, out2] = push(demuxer, new Uint8Array([3]))
    expect([...out1, ...out2]).toEqual([
      { tag: 'raw', payload: new Uint8Array([1, 2]) },
      { tag: 'raw', payload: new Uint8Array([3]) },
    ])
  })

  it('Should_NotParseHeaderBytesAsFraming_When_InRawMode', () => {
    const [demuxer, outputs] = push(demuxRaw(), frameBytes(1, new Uint8Array([0x01])))
    expect(outputs).toEqual([{ tag: 'raw', payload: new Uint8Array([1, 0, 0, 0, 0, 0, 0, 1, 0x01]) }])
    expect(demuxer.pending.length).toBe(0)
  })

  it('Should_EmitNothing_When_TheChunkIsEmpty', () => {
    const demuxer = demuxRaw()
    const [, outputs] = push(demuxer, new Uint8Array(0))
    expect(outputs).toEqual([])
  })
})
