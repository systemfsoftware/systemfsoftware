import type * as Effect from 'effect/Effect'
import type * as FileSystem from 'effect/FileSystem'
import type * as Path from 'effect/Path'
import type { PlatformError } from 'effect/PlatformError'

import type { Project } from '../project/project.js'

/**
 * A preprocessor refines files before they are written to the sandbox.
 * It rewrites references in tsconfig files or inserts `// @ts-nocheck`.
 * The surface is private and may be published later.
 */
export type FilePreprocessor = (
  project: Project,
) => Effect.Effect<void, unknown, FileSystem.FileSystem | Path.Path>
