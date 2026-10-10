/**
 * The path a failure record prints for a module the run is executing: the module's own file path with the
 * workspace root the run provided stripped off its front the way the renderer strips it from every path it
 * prints, or the absolute path when the run provided no root. A corpus fixture derives its own defect path
 * through this, so the path it names is the path the record names in every checkout layout (KTD5).
 *
 * @since 4.0.0
 */
import { Option } from 'effect'
import { providedRoot } from './provided.js'

const pathOfModuleUrl = (moduleUrl: string): string => decodeURIComponent(new URL(moduleUrl).pathname)

const pathAsRecordPrints = (path: string, workspaceRoot: string | undefined): string =>
  Option.match(Option.fromNullishOr(workspaceRoot), {
    onNone: () => path,
    onSome: (root) => path.replace(`${root}/`, ''),
  })

/** @internal */
export const workspaceRelativePathOf = (moduleUrl: string): string => {
  const path = pathOfModuleUrl(moduleUrl)
  return pathAsRecordPrints(path, providedRoot())
}

if (import.meta.vitest !== void 0) {
  const { it } = await import('@systemfsoftware/vitest')
  const { Schema } = await import('effect')

  it.prop(
    '∀p_PrintedPath_≡PathWithoutItsRoot',
    { of: [Schema.String, Schema.String], subject: pathAsRecordPrints },
    (subject, [path, root]) => subject(`${root}/${path}`, root) === path && subject(path, undefined) === path,
  )
}
