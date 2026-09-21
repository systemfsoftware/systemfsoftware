import { gzipSync } from 'fflate'
import type { Package } from './Package.js'

const encoder = new TextEncoder()

type TarEntry = { name: string; data: Uint8Array }

function encodeDefinedContent(content: string | Uint8Array): Uint8Array {
  if (typeof content === 'string') return encoder.encode(content)
  return content
}

function encodeContent(content: string | Uint8Array | undefined): Uint8Array {
  if (content === undefined) return new Uint8Array(0)
  return encodeDefinedContent(content)
}

function packRelativeEntry(
  prefix: string,
  path: string,
  content: string | Uint8Array | undefined,
): TarEntry | undefined {
  if (!path.startsWith(prefix)) return undefined
  return { name: `package/${path.slice(prefix.length)}`, data: encodeContent(content) }
}

function pushDefinedEntry(entries: TarEntry[], entry: TarEntry | undefined): void {
  if (entry === undefined) return
  entries.push(entry)
}

/**
 * In-process ustar + Gzip (fflate) packer.
 *
 * - Sorted entry names
 * - mtime 0
 * - `package/` prefix as npm pack does
 */
export function packPackage(pkg: Package): Uint8Array {
  const prefix = `/node_modules/${pkg.packageName}/`
  const entries: TarEntry[] = []
  for (const path of pkg.listFiles('/')) {
    pushDefinedEntry(entries, packRelativeEntry(prefix, path, pkg.tryReadBytes(path)))
  }
  return packEntries(entries)
}

function normalizeTreeKey(key: string, packageName: string): string {
  if (key.startsWith('/')) return key
  return `/node_modules/${packageName}/${key}`
}

function requirePrefixedPath(key: string, prefix: string, packageName: string): string {
  const normalized = normalizeTreeKey(key, packageName)
  if (normalized.startsWith(prefix)) return normalized
  throw new Error(`Unexpected absolute fixture path: ${key}`)
}

/**
 * Pack an authored file tree directly, without building a {@link (Package:interface)} first.
 *
 * Reading a file through `Package` caches its decoded text, so packing a tree
 * that carries binary bodies straight from the map avoids that conversion.
 */
export function packTree(
  files: Record<string, string | Uint8Array>,
  packageName: string,
): Uint8Array {
  const prefix = `/node_modules/${packageName}/`
  const entries: TarEntry[] = []
  for (const [key, content] of Object.entries(files)) {
    const relative = requirePrefixedPath(key, prefix, packageName).slice(prefix.length)
    entries.push({ name: `package/${relative}`, data: encodeDefinedContent(content) })
  }
  return packEntries(entries)
}

function compareGreater(left: string, right: string): number {
  if (left > right) return 1
  return 0
}

function compareEntryNames(a: TarEntry, b: TarEntry): number {
  if (a.name < b.name) return -1
  return compareGreater(a.name, b.name)
}

/** Sort by entry name, lay out the ustar blocks, and gzip with a zeroed mtime. */
function packEntries(entries: TarEntry[]): Uint8Array {
  entries.sort(compareEntryNames)
  return gzipSync(buildTar(entries), { mtime: 0 })
}

function headerByte(header: Uint8Array, i: number): number {
  const value = header[i]
  if (value === undefined) return 0
  return value
}

function headerByteSum(header: Uint8Array): number {
  let sum = 0
  for (let i = 0; i < 512; i++) {
    sum += headerByte(header, i)
  }
  return sum
}

function writeUstarPrefix(header: Uint8Array, prefixField: string): void {
  if (prefixField.length === 0) return
  header.set(encoder.encode(prefixField).subarray(0, 155), 345)
}

function tarNameFields(entryName: string): { nameField: string; prefixField: string } {
  if (encoder.encode(entryName).byteLength <= 100) {
    return { nameField: entryName, prefixField: '' }
  }
  const split = splitUstarName(entryName)
  return { nameField: split.name, prefixField: split.prefix }
}

function makeTarHeader(entry: TarEntry): Uint8Array {
  const header = new Uint8Array(512)
  const fields = tarNameFields(entry.name)
  header.set(encoder.encode(fields.nameField).subarray(0, 100), 0)
  writeUstarPrefix(header, fields.prefixField)
  writeOctal(header, 100, 8, 0o644)
  writeOctal(header, 108, 8, 0)
  writeOctal(header, 116, 8, 0)
  writeOctal(header, 124, 12, entry.data.length)
  writeOctal(header, 136, 12, 0)
  header.fill(0x20, 148, 156)
  header[156] = 0x30
  encoder.encodeInto('ustar\0', header.subarray(257, 263))
  encoder.encodeInto('00', header.subarray(263, 265))
  const chk = headerByteSum(header).toString(8).padStart(6, '0') + '\0 '
  encoder.encodeInto(chk, header.subarray(148, 156))
  return header
}

function paddedDataBlock(data: Uint8Array): Uint8Array | undefined {
  if (data.length === 0) return undefined
  const padded = new Uint8Array(Math.ceil(data.length / 512) * 512)
  padded.set(data)
  return padded
}

function appendPadded(blocks: Uint8Array[], data: Uint8Array): void {
  const padded = paddedDataBlock(data)
  if (padded === undefined) return
  blocks.push(padded)
}

function buildEntryBlocks(entry: TarEntry): Uint8Array[] {
  const blocks = [makeTarHeader(entry)]
  appendPadded(blocks, entry.data)
  return blocks
}

function pushAll(blocks: Uint8Array[], extra: Uint8Array[]): void {
  for (const block of extra) {
    blocks.push(block)
  }
}

function totalLength(blocks: Uint8Array[]): number {
  return blocks.reduce((a, b) => a + b.length, 0)
}

function copyBlock(out: Uint8Array, block: Uint8Array, off: number): number {
  out.set(block, off)
  return off + block.length
}

function copyBlocks(out: Uint8Array, blocks: Uint8Array[]): void {
  let off = 0
  for (const block of blocks) {
    off = copyBlock(out, block, off)
  }
}

function concatBlocks(blocks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(totalLength(blocks))
  copyBlocks(out, blocks)
  return out
}

function buildTar(entries: TarEntry[]): Uint8Array {
  const blocks: Uint8Array[] = []
  for (const entry of entries) {
    pushAll(blocks, buildEntryBlocks(entry))
  }
  blocks.push(new Uint8Array(1024))
  return concatBlocks(blocks)
}

function writeOctal(header: Uint8Array, offset: number, length: number, value: number): void {
  const oct = value.toString(8).padStart(length - 1, '0')
  const enc = encoder.encode(`${oct}\0`)
  header.set(enc.subarray(0, length), offset)
}

function fitsUstarSplit(prefix: string, name: string): boolean {
  if (encoder.encode(prefix).byteLength > 155) return false
  return encoder.encode(name).byteLength <= 100
}

function tryUstarSplit(prefix: string, name: string): { prefix: string; name: string } | undefined {
  if (!fitsUstarSplit(prefix, name)) return undefined
  return { prefix, name }
}

function ustarSplitAt(full: string, i: number): { prefix: string; name: string } | undefined {
  if (full.charAt(i) !== '/') return undefined
  return tryUstarSplit(full.slice(0, i), full.slice(i + 1))
}

function ustarIndices(full: string): number[] {
  const indices: number[] = []
  for (let i = Math.min(155, full.length); i >= 0; i--) {
    indices.push(i)
  }
  return indices
}

function isDefinedSplit(
  split: { prefix: string; name: string } | undefined,
): split is { prefix: string; name: string } {
  return split !== undefined
}

function findUstarSplit(full: string): { prefix: string; name: string } | undefined {
  return ustarIndices(full).map((i) => ustarSplitAt(full, i)).find(isDefinedSplit)
}

function splitUstarName(full: string): { prefix: string; name: string } {
  const found = findUstarSplit(full)
  if (found === undefined) {
    throw new Error(`File name too long for ustar without PAX: ${full}`)
  }
  return found
}
