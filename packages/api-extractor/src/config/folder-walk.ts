import * as Effect from 'effect/Effect'
import type { FileSystem } from 'effect/FileSystem'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import type * as Path from 'effect/Path'

/** The folder above `folder`, absent once the walk reaches the root of the tree. */
export const parentFolderOf = (folder: string, path: Path.Path): Option.Option<string> =>
  Option.filter(Option.fromNullishOr(path.dirname(folder)), (parent) => parent.length > 0 && parent !== folder)

/**
 * The nearest answer at or above `folder`: the probe answers what one folder holds, the walk
 * climbs while it answers nothing, and the whole search answers nothing at the root.
 */
export const searchUpwards = <A>(
  folder: string,
  path: Path.Path,
  probe: (folder: string) => Effect.Effect<Option.Option<A>>,
): Effect.Effect<Option.Option<A>> =>
  probe(folder).pipe(
    Effect.flatMap((found) =>
      Option.match(found, {
        onSome: Effect.succeedSome,
        onNone: () =>
          Option.match(parentFolderOf(folder, path), {
            onNone: () => Effect.succeedNone,
            onSome: (parent) => searchUpwards(parent, path, probe),
          }),
      })
    ),
  )

/** The file the search probes for, when the folder holds it. */
export const filePresent = (filePath: string, fs: FileSystem): Effect.Effect<Option.Option<string>> =>
  fs.exists(filePath).pipe(
    Effect.flatMap((present) =>
      Match.value(present).pipe(
        Match.when(true, () => Effect.succeedSome(filePath)),
        Match.when(false, () => Effect.succeedNone),
        Match.exhaustive,
      )
    ),
    Effect.orElseSucceed(() => Option.none()),
  )
