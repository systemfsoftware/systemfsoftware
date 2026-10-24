import * as Schema from 'effect/Schema'

import type { ArtifactKind } from '../report/report.schema.js'

/** The file names evidence is written to inside a result directory (design §13.3). */
export const ArtifactFileName = Schema.Literals(['screen.png', 'screen.txt', 'trace.md', 'ai-trace.json'])
export type ArtifactFileName = typeof ArtifactFileName.Type

const FILE_NAMES: { readonly [Kind in ArtifactKind]: ArtifactFileName } = {
  screenshot: 'screen.png',
  'screen-text': 'screen.txt',
  'trace-page': 'trace.md',
  'ai-trace': 'ai-trace.json',
}

export const fileNameOf = (kind: ArtifactKind): ArtifactFileName => FILE_NAMES[kind]

/**
 * The directory one result's evidence lives in, under `<output>/results/`: a slug of the test title and eight
 * hex digits of the result's identity, so no title can climb out of `results/` or share another result's folder.
 */
export const ResultDirectory = Schema.String.check(
  Schema.isPattern(/^(?:[a-z0-9]+-)*[0-9a-f]{8}$/u, {
    message: 'a result directory is lowercase words joined by "-" and ends in eight hex digits',
  }),
).pipe(Schema.brand('ResultDirectory'))
export type ResultDirectory = typeof ResultDirectory.Type

/** One artifact to store: the result it belongs to, what it shows, and its bytes. */
export interface Artifact {
  readonly directory: ResultDirectory
  readonly kind: ArtifactKind
  readonly bytes: Uint8Array
}
