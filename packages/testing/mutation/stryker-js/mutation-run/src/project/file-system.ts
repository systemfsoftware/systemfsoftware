import type { Abortable } from 'events'
import fs from 'fs'
import type { Dirent, MakeDirectoryOptions, Mode, ObjectEncodingOptions, PathLike } from 'fs'

import { mergeMap, Subject } from 'rxjs'
import { type Disposable } from 'typed-inject'

const MAX_CONCURRENT_FILE_IO = 256

/**
 * A wrapper around nodejs's 'fs' core module, for dependency injection purposes.
 *
 * Also has build-in buffering support with a concurrency limit (like "graceful-fs").
 */
export class FileSystem implements Disposable {
  /**
   * The buffered work queue: each pending call is a zero-argument thunk that
   * performs the real `fs.promises` call. `mergeMap` with the concurrency
   * limit is the "graceful-fs" hat.
   */
  private readonly todoSubject = new Subject<() => Promise<unknown>>()
  private readonly subscription = this.todoSubject
    .pipe(
      mergeMap(async (work) => {
        await work()
      }, MAX_CONCURRENT_FILE_IO),
    )
    .subscribe()

  public dispose(): void {
    this.subscription.unsubscribe()
  }

  /**
   * The forwarded `fs.promises` surface this package uses. Every call is
   * buffered through `todoSubject` with the `MAX_CONCURRENT_FILE_IO`
   * concurrency limit.
   */
  public readFile(
    path: PathLike,
    options: ({ encoding: BufferEncoding } & Abortable) | BufferEncoding,
  ): Promise<string>
  public readFile(
    path: PathLike,
    options?: (ObjectEncodingOptions & Abortable) | BufferEncoding | null,
  ): Promise<string | Buffer>
  public readFile(
    path: PathLike,
    options?: (ObjectEncodingOptions & Abortable) | BufferEncoding | null,
  ): Promise<string | Buffer> {
    return this.queue(() => fs.promises.readFile(path, options))
  }

  public copyFile(src: PathLike, dest: PathLike, mode?: number): Promise<void> {
    return this.queue(() => fs.promises.copyFile(src, dest, mode))
  }

  public writeFile(
    path: PathLike,
    data: string | Uint8Array,
    options?: (ObjectEncodingOptions & Abortable) | BufferEncoding | null,
  ): Promise<void> {
    return this.queue(() => fs.promises.writeFile(path, data, options))
  }

  public mkdir(
    path: PathLike,
    options?: Mode | MakeDirectoryOptions | null,
  ): Promise<string | undefined> {
    return this.queue(() => fs.promises.mkdir(path, options))
  }

  public readdir(
    path: PathLike,
    options: ObjectEncodingOptions & {
      withFileTypes: true
      recursive?: boolean
    },
  ): Promise<Dirent[]>
  public readdir(
    path: PathLike,
    options?:
      | (ObjectEncodingOptions & {
        withFileTypes?: boolean
        recursive?: boolean
      })
      | BufferEncoding
      | null,
  ): Promise<string[] | Dirent[]>
  public readdir(
    path: PathLike,
    options?: ObjectEncodingOptions | BufferEncoding | null,
  ): Promise<string[] | Dirent[]> {
    return this.queue(() => fs.promises.readdir(path, options))
  }

  /** Buffer one fs call behind the concurrency limit and await its outcome. */
  private queue<TOut>(work: () => Promise<TOut>): Promise<TOut> {
    return new Promise<TOut>((resolve, reject) => {
      this.todoSubject.next(async () => {
        try {
          resolve(await work())
        } catch (err) {
          reject(err)
        }
      })
    })
  }
}
