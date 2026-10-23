import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'

import type { ArtifactRef } from '../report/report.schema.js'
import type { ArtifactWriteFailed } from '../verdict/failure.schema.js'
import type { Artifact } from './artifact.schema.js'

export interface ArtifactStoreShape {
  /**
   * Stores the artifact at `<output>/results/<directory>/<file of its kind>`, replacing what was there, and answers
   * that suite-relative path. A store that cannot write fails `ARTIFACT_WRITE_FAILED`.
   */
  readonly put: (artifact: Artifact) => Effect.Effect<ArtifactRef, ArtifactWriteFailed>
}

/** Where a run's failure evidence is written (design §5, §13.3). */
export class ArtifactStore extends Context.Service<ArtifactStore, ArtifactStoreShape>()(
  '@systemfsoftware/effect-e2e/ArtifactStore',
) {}
