/**
 * Property tests for the Docker stream demux kernel
 * (`src/backend-docker/frames.ts`).
 *
 * The input space here is the docker multiplexed wire format — an 8-byte
 * header (`streamType u8, 0, 0, 0, length u32_be`) followed by `length`
 * payload bytes — chunked at arbitrary boundaries. That is a byte-stream
 * contract, not an Effect Schema, so the arbitraries are generated directly
 * (the frame sequence is the model, its serialization is the input).
 *
 * Verdict discipline: every predicate is a pure boolean — no `expect`
 * inside a property predicate — and per-case cost is bounded by the draw
 * itself: the predicates compare whole outputs in a single module-level
 * fold, never a loop over a drawn value whose body calls a helper.
 */
import { it } from '@effect/vitest'
import { FastCheck as fc } from 'effect/testing'
import { demuxMultiplexed, demuxRaw, push } from '../frames.js'
import type { Demuxer, DemuxOutput, StreamType } from '../frames.js'

// ---------------------------------------------------------------------------
// Model: a frame sequence is ([streamByte, payload]) pairs; serialization is
// the reference encoding of the docker multiplexed wire format.
// ---------------------------------------------------------------------------

const STREAM_BYTES = [0, 1, 2] as const
const MAX_PAYLOAD = 64
const MAX_FRAMES = 24

const streamName = (byte: number): StreamType => byte === 0 ? 'stdin' : byte === 1 ? 'stdout' : 'stderr'

const payloadArb: fc.Arbitrary<Uint8Array> = fc.uint8Array({ minLength: 0, maxLength: MAX_PAYLOAD })
const streamByteArb: fc.Arbitrary<number> = fc.constantFrom(...STREAM_BYTES)

type WireFrame = readonly [stream: number, payload: Uint8Array]

/** Serializes a frame sequence to the exact bytes the daemon would send. */
const serialize = (frames: readonly WireFrame[]): Uint8Array => {
  let total = 0
  for (const [, payload] of frames) total += 8 + payload.length
  const out = new Uint8Array(total)
  let offset = 0
  for (const [stream, payload] of frames) {
    out[offset] = stream
    const len = payload.length
    out[offset + 4] = (len >>> 24) & 0xff
    out[offset + 5] = (len >>> 16) & 0xff
    out[offset + 6] = (len >>> 8) & 0xff
    out[offset + 7] = len & 0xff
    out.set(payload, offset + 8)
    offset += 8 + len
  }
  return out
}

/**
 * Every chunking of `bytes`: arbitrary split points, including zero-length
 * chunks and 1-byte chunks (the daemon owes the stream no relationship to
 * frame boundaries). The collection is bounded by the byte length.
 */
const chunkingsOf = (bytes: Uint8Array): fc.Arbitrary<readonly Uint8Array[]> => {
  const maxChunk = Math.max(Math.min(bytes.length, 5), 1)
  return fc
    .array(fc.nat({ max: maxChunk }), { maxLength: Math.max(bytes.length, 1) + 4 })
    .map((sizes) => {
      const chunks: Uint8Array[] = []
      let offset = 0
      for (const size of sizes) {
        if (offset >= bytes.length) {
          break
        }
        chunks.push(bytes.slice(offset, Math.min(offset + size, bytes.length)))
        offset += size
      }
      if (offset < bytes.length) {
        chunks.push(bytes.slice(offset))
      }
      if (chunks.length === 0) {
        chunks.push(bytes.slice())
      }
      return chunks
    })
}

const bytesEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false
  for (const [i, x] of a.entries()) {
    if (x !== b[i]) return false
  }
  return true
}

const outputsEqual = (a: readonly DemuxOutput[], b: readonly DemuxOutput[]): boolean => {
  if (a.length !== b.length) return false
  for (const [i, x] of a.entries()) {
    const y = b[i]
    if (x.tag !== y?.tag) return false
    if (x.tag === 'frame') {
      if (y.tag !== 'frame' || x.streamType !== y.streamType) return false
      if (!bytesEqual(x.payload, y.payload)) return false
    } else {
      if (y.tag !== 'raw' || !bytesEqual(x.payload, y.payload)) return false
    }
  }
  return true
}

/** Feeds every chunk through the demuxer and collects the outputs. */
const feedOutputs = (demuxer: Demuxer, chunks: readonly Uint8Array[]): readonly DemuxOutput[] => {
  let current = demuxer
  const outputs: DemuxOutput[] = []
  for (const chunk of chunks) {
    const [next, out] = push(current, chunk)
    current = next
    for (const o of out) outputs.push(o)
  }
  return outputs
}

/** Reference decoding: the frame sequence an ideal demuxer would emit. */
const expectedFrames = (frames: readonly WireFrame[]): readonly DemuxOutput[] =>
  frames.map(([stream, payload]) => ({
    tag: 'frame' as const,
    streamType: streamName(stream),
    payload,
  }))

/** Raw mode is a lossless passthrough of exactly the non-empty chunks, in order. */
const rawPassesThrough = (chunks: readonly Uint8Array[], outputs: readonly DemuxOutput[]): boolean => {
  const nonEmpty = chunks.filter((c) => c.length > 0)
  if (outputs.length !== nonEmpty.length) return false
  for (const [i, output] of outputs.entries()) {
    if (output.tag !== 'raw') return false
    const expected = nonEmpty[i]
    if (expected === undefined) return false
    if (!bytesEqual(output.payload, expected)) return false
  }
  return true
}

/** Raw mode output concatenated in emission order reproduces the byte stream. */
const reassemblesStream = (bytes: Uint8Array, outputs: readonly DemuxOutput[]): boolean => {
  let total = 0
  for (const output of outputs) {
    if (output.tag !== 'raw') return false
    total += output.payload.length
  }
  if (total !== bytes.length) return false
  const reassembled = new Uint8Array(total)
  let offset = 0
  for (const output of outputs) {
    if (output.tag !== 'raw') return false
    reassembled.set(output.payload, offset)
    offset += output.payload.length
  }
  return bytesEqual(reassembled, bytes)
}

/** Interleaved stdout/stderr frames keep their per-stream order and content. */
const perStreamContent = (frames: readonly WireFrame[], outputs: readonly DemuxOutput[]): boolean => {
  const stdout: Uint8Array[] = []
  const stderr: Uint8Array[] = []
  for (const output of outputs) {
    if (output.tag !== 'frame') return false
    if (output.streamType === 'stdout') stdout.push(output.payload)
    if (output.streamType === 'stderr') stderr.push(output.payload)
  }
  const expectedStdout = frames.filter(([s]) => s === 1).map(([, p]) => p)
  const expectedStderr = frames.filter(([s]) => s === 2).map(([, p]) => p)
  if (stdout.length !== expectedStdout.length || stderr.length !== expectedStderr.length) return false
  for (const [i, payload] of stdout.entries()) {
    const expected = expectedStdout[i]
    if (expected === undefined) return false
    if (!bytesEqual(payload, expected)) return false
  }
  for (const [i, payload] of stderr.entries()) {
    const expected = expectedStderr[i]
    if (expected === undefined) return false
    if (!bytesEqual(payload, expected)) return false
  }
  return true
}

const sequenceAndChunkingArb: fc.Arbitrary<{
  readonly frames: readonly WireFrame[]
  readonly chunks: readonly Uint8Array[]
}> = fc
  .array(fc.tuple(streamByteArb, payloadArb), { maxLength: MAX_FRAMES })
  .chain((frames) => chunkingsOf(serialize(frames)).map((chunks) => ({ frames, chunks })))

const bytesAndChunkingArb: fc.Arbitrary<{
  readonly bytes: Uint8Array
  readonly chunks: readonly Uint8Array[]
}> = fc
  .uint8Array({ minLength: 0, maxLength: MAX_PAYLOAD * 3 })
  .chain((bytes) => chunkingsOf(bytes).map((chunks) => ({ bytes, chunks })))

// ---------------------------------------------------------------------------
// properties — names follow [∀binder]_[Domain]_[=Operand]
// ---------------------------------------------------------------------------

it.prop(
  '∀c_DemuxFrames_=Reference',
  [sequenceAndChunkingArb],
  ([{ frames, chunks }]) => outputsEqual(feedOutputs(demuxMultiplexed(), chunks), expectedFrames(frames)),
)

it.prop(
  '∀c_RawDemux_=Chunks',
  [bytesAndChunkingArb],
  ([{ chunks }]) => rawPassesThrough(chunks, feedOutputs(demuxRaw(), chunks)),
)

it.prop(
  '∀b_RawReassembly_=Bytes',
  [bytesAndChunkingArb],
  ([{ bytes, chunks }]) => reassemblesStream(bytes, feedOutputs(demuxRaw(), chunks)),
)

it.prop(
  '∀c_StreamSeparation_=PerStream',
  [sequenceAndChunkingArb],
  ([{ frames, chunks }]) => perStreamContent(frames, feedOutputs(demuxMultiplexed(), chunks)),
)
