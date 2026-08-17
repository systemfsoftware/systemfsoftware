/**
 * Pure stream demux for the Docker Engine API's log-stream multiplexing.
 *
 * The daemon multiplexes `exec`/`logs`/`followLogs` output for TTY-less
 * containers into this frame format (behavioral reference: upstream
 * rightsize-node `src/backend-docker/frames.ts`):
 *
 * ```text
 * frame    = header ++ payload
 * header   = [ streamType: u8, 0u8, 0u8, 0u8, len: u32_be ]   (8 bytes)
 * payload  = [u8; len]
 * streamType: 0 = stdin, 1 = stdout, 2 = stderr
 * ```
 *
 * A container created *with* a TTY foregoes the header entirely: the body is
 * one raw byte stream with both streams combined. This kernel serves both
 * shapes; the adapter picks the mode from the container's TTY setting
 * (`multiplexed` for this backend, which never allocates a TTY, and `raw` for
 * tolerance of daemon/podman divergence).
 *
 * Chunk boundaries are a transport artifact: the daemon flushes its write
 * buffer with no relationship to frame boundaries, so a header or payload may
 * straddle any number of chunks. `push` is a total pure state machine — it
 * never mutates its inputs, returns the next state alongside its outputs, and
 * yields only the frames a given chunk completes. A frame whose stream-type
 * byte is unrecognized (daemon drift) is skipped while its length prefix
 * remains honored, matching upstream's tolerant posture: the framing stays
 * trustworthy even when the stream label is not.
 *
 * @since 0.1.0
 */

/** The three multiplexed stream types, in daemon byte order. */
export type StreamType = 'stdin' | 'stdout' | 'stderr'

/** One complete multiplexed frame, attributed to its stream. */
export interface DemuxFrame {
  readonly streamType: StreamType
  readonly payload: Uint8Array
}

/** Anything a single `push` may hand its caller. */
export type DemuxOutput =
  | { readonly tag: 'frame'; readonly streamType: StreamType; readonly payload: Uint8Array }
  | { readonly tag: 'raw'; readonly payload: Uint8Array }

/**
 * The demuxer's mode. `multiplexed` parses the 8-byte header framing;
 * `raw` passes chunks through as-is.
 */
export type DemuxMode = 'multiplexed' | 'raw'

/** Immutable demuxer state: the mode plus bytes awaiting a complete header/frame. */
export interface Demuxer {
  readonly mode: DemuxMode
  readonly pending: Uint8Array
}

const HEADER_LEN = 8
const EMPTY: Uint8Array = new Uint8Array(0)

const bytes = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

/** Reads `len`'s four bytes as an unsigned big-endian 32-bit integer. */
const readUint32BE = (bytes: Uint8Array, offset: number): number =>
  (bytes[offset] ?? 0) * 0x1_00_00_00 + (bytes[offset + 1] ?? 0) * 0x1_00_00 + (bytes[offset + 2] ?? 0) * 0x1_00 +
  (bytes[offset + 3] ?? 0)

const streamTypeFromByte = (byte: number): StreamType | undefined =>
  byte === 0 ? 'stdin' : (byte === 1 ? 'stdout' : (byte === 2 ? 'stderr' : undefined))

/** A fresh multiplexed-mode demuxer. */
export const demuxMultiplexed = (): Demuxer => ({ mode: 'multiplexed', pending: EMPTY })

/** A fresh raw-mode demuxer. */
export const demuxRaw = (): Demuxer => ({ mode: 'raw', pending: EMPTY })

/**
 * Feeds one chunk into the demuxer.
 *
 * Purely functional: the input demuxer and chunk are never mutated; state
 * advances by returning a new demuxer. Multiplexed mode turns complete
 * frames into `frame` outputs (zero-length payloads included) and buffers
 * partial headers/payloads across calls; raw mode passes every non-empty
 * chunk through as a single `raw` output, in order.
 */
export const push = (demuxer: Demuxer, chunk: Uint8Array): readonly [Demuxer, readonly DemuxOutput[]] => {
  if (chunk.length === 0) {
    return [demuxer, []]
  }
  if (demuxer.mode === 'raw') {
    return [demuxer, [{ tag: 'raw', payload: chunk }]]
  }

  // The pending bytes are the demuxer's own; copy the incoming chunk so a
  // caller reusing its buffer can never corrupt frames already handed out.
  const buffered = demuxer.pending.length === 0 ? chunk.slice() : bytes(demuxer.pending, chunk)
  const outputs: DemuxOutput[] = []
  let rest = buffered
  for (;;) {
    if (rest.length < HEADER_LEN) {
      break
    }
    const len = readUint32BE(rest, 4)
    if (rest.length < HEADER_LEN + len) {
      break
    }
    const streamType = streamTypeFromByte(rest[0] ?? 0)
    const payload = rest.subarray(HEADER_LEN, HEADER_LEN + len)
    if (streamType !== undefined) {
      outputs.push({ tag: 'frame', streamType, payload })
    }
    // An unrecognized stream-type byte is dropped rather than throwing: the
    // length prefix is still daemon-trustworthy, so skipping past it cleanly
    // keeps a stray byte from derailing the whole stream.
    rest = rest.subarray(HEADER_LEN + len)
  }
  return [{ mode: 'multiplexed', pending: rest }, outputs]
}
