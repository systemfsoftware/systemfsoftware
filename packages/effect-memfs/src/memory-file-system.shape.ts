export interface Stat {
  isFile(): boolean
  isDirectory(): boolean
  isSymbolicLink(): boolean
  isBlockDevice(): boolean
  isCharacterDevice(): boolean
  isFIFO(): boolean
  isSocket(): boolean
  readonly mode: number
  readonly size: number
  readonly blocks: number
  readonly blksize: number
  readonly dev: number
  readonly ino: number
  readonly nlink: number
  readonly uid: number
  readonly gid: number
  readonly rdev: number
  readonly mtime: Date
  readonly atime: Date
  readonly birthtime: Date
}

export interface FileHandle {
  readonly fd: number
  stat(): Promise<Stat>
  sync(): Promise<void>
  read(
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number,
  ): Promise<{ bytesRead: number; buffer: Buffer }>
  write(
    buffer: Uint8Array,
    offset: number | undefined,
    length: number,
    position?: number | null,
  ): Promise<{ bytesWritten: number; buffer: Buffer }>
  truncate(len?: number): Promise<void>
  close(): Promise<void>
}

import type * as memfs from 'memfs'
export type Contents = memfs.DirectoryJSON
