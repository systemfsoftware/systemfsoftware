/**
 * @internal The failure of reading the checked-out commit: the directory git was asked in and what it said, so the
 * config that asked for a seed stops with a message that names where it looked.
 */
import { Schema } from 'effect'

/** @internal */
export class GitHeadUnreadable
  extends Schema.TaggedError<GitHeadUnreadable, { readonly brand: unique symbol }>()('GitHeadUnreadable', {
    directory: Schema.String,
    detail: Schema.String,
  })
{
  override get message(): string {
    return `git rev-parse HEAD could not read the commit in ${this.directory}: ${this.detail}`
  }
}
