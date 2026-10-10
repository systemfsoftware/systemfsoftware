import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import { layer } from './drivers/git-diff.js'

export class GitDiff
  extends Context.Service<GitDiff, { readonly changed: Effect.Effect<ReadonlyArray<string>> }>()('app/GitDiff')
{}

export const gitDiff = layer
