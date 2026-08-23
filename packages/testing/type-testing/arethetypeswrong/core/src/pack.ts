import { gzipSync } from 'fflate'
import type { Package } from './CreatePackage.js'

/**
 * In-process ustar + Gzip (fflate) packer.
 *
 * - Sorted entry names
 * - mtime 0
 * - `package/` prefix as npm pack does
 */
export function packPackage(pkg: Package): Uint8Array {
  const prefix = `/node_modules/${pkg.packageName}/`
  const entries: Array<{ name: string; data: Uint8Array }> = []
  for (const path of pkg.listFiles('/')) {
    if (!path.startsWith(prefix)) continue
    const relative = path.slice(prefix.length)
    const tarName = `package/${relative}`
    const content = pkg.tryReadBytes(path)
    const data = content === undefined
      ? new Uint8Array(0)
      : typeof content === 'string'
      ? new TextEncoder().encode(content)
      : content
    entries.push({ name: tarName, data })
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  const tar = buildTar(entries)
  return gzipSync(tar, { mtime: 0 })
}

/**
 * Pack an authored file tree directly. Useful for GlobalSetup and tests that
 * want to avoid the Package mutation of Uint8Array bodies.
 */
export function packTree(
  files: Record<string, string | Uint8Array>,
  packageName: string,
): Uint8Array {
  const prefix = `/node_modules/${packageName}/`
  const entries: Array<{ name: string; data: Uint8Array }> = []
  for (const [key, content] of Object.entries(files)) {
    const normalized = key.startsWith('/') ? key : `/node_modules/${packageName}/${key}`
    if (!normalized.startsWith(prefix)) {
      throw new Error(`Unexpected absolute fixture path: ${key}`)
    }
    const relative = normalized.slice(prefix.length)
    const tarName = `package/${relative}`
    const data = typeof content === 'string' ? new TextEncoder().encode(content) : content
    entries.push({ name: tarName, data })
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return gzipSync(buildTar(entries))
}

function buildTar(entries: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const blocks: Uint8Array[] = []
  const encoder = new TextEncoder()

  for (const entry of entries) {
    const header = new Uint8Array(512)

    let nameField = entry.name
    let prefixField = ''
    if (encoder.encode(entry.name).byteLength > 100) {
      const split = splitUstarName(entry.name)
      nameField = split.name
      prefixField = split.prefix
    }

    const nameBytes = encoder.encode(nameField)
    header.set(nameBytes.subarray(0, 100), 0)

    if (prefixField) {
      const prefixBytes = encoder.encode(prefixField)
      header.set(prefixBytes.subarray(0, 155), 345)
    }

    writeOctal(header, 100, 8, 0o644)
    writeOctal(header, 108, 8, 0)
    writeOctal(header, 116, 8, 0)
    writeOctal(header, 124, 12, entry.data.length)
    writeOctal(header, 136, 12, 0)
    header.fill(0x20, 148, 156)

    header[156] = 0x30

    encoder.encodeInto('ustar\0', header.subarray(257, 263))
    encoder.encodeInto('00', header.subarray(263, 265))

    let sum = 0
    for (let i = 0; i < 512; i++) sum += header[i]
    const chk = sum.toString(8).padStart(6, '0') + '\0 '
    encoder.encodeInto(chk, header.subarray(148, 156))

    blocks.push(header)
    if (entry.data.length > 0) {
      const paddedLen = Math.ceil(entry.data.length / 512) * 512
      const padded = new Uint8Array(paddedLen)
      padded.set(entry.data)
      blocks.push(padded)
    }
  }

  blocks.push(new Uint8Array(1024))

  const total = blocks.reduce((a, b) => a + b.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const b of blocks) {
    out.set(b, off)
    off += b.length
  }
  return out
}

function writeOctal(header: Uint8Array, offset: number, length: number, value: number): void {
  const oct = value.toString(8).padStart(length - 1, '0')
  const enc = new TextEncoder().encode(oct + '\0')
  header.set(enc.subarray(0, length), offset)
}

function splitUstarName(full: string): { prefix: string; name: string } {
  for (let i = Math.min(155, full.length); i >= 0; i--) {
    if (full[i] === '/') {
      const prefix = full.slice(0, i)
      const name = full.slice(i + 1)
      if (new TextEncoder().encode(prefix).byteLength <= 155 && new TextEncoder().encode(name).byteLength <= 100) {
        return { prefix, name }
      }
    }
  }
  throw new Error(`File name too long for ustar without PAX: ${full}`)
}
