import { Schema as S } from 'effect'

/**
 * A specifier that could not be resolved against a project directory.
 *
 * @since 0.1.0
 */
export class ModuleNotFound extends S.TaggedError<ModuleNotFound>()('ModuleNotFound', {
  specifier: S.String,
  projectDir: S.String,
}) {}
