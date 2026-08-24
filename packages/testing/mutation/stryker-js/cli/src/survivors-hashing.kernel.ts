import type { PriorReportDocument } from './survivors-report.kernel.js'

const { entries: objectEntries, fromEntries: objectFromEntries } = Object

/**
 * The sha256-hex digest capability the admission comparison needs. Supplied by
 * the caller so this kernel stays runtime-module-free; the shell wires
 * `createHash('sha256').update(content, 'utf-8').digest('hex')`.
 */
export type HashContent = (content: string) => string

/**
 * The content hash of one source file.
 *
 * Thin by design: the digest is the caller's capability, and naming the call
 * keeps every hashing site in the admission path reading the same way.
 */
export function sourceContentHash(content: string, hash: HashContent): string {
  return hash(content)
}

/**
 * The per-file source hashes of the sources a prior report embeds.
 *
 * The current run's side of the comparison is gathered by the shell from disk;
 * this is the recorded side, read back out of the report.
 */
export function priorSourceHashes(
  priorReport: PriorReportDocument,
  hashContent: HashContent,
): Record<string, string> {
  return objectFromEntries(
    objectEntries(priorReport.files).map(([file, fileResult]) => [
      file,
      sourceContentHash(fileResult.source, hashContent),
    ]),
  )
}
