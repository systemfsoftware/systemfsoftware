import * as S from 'effect/Schema'

import type * as Layer from 'effect/Layer'

import type { PluginEnvironment, PluginInterfaces } from './Plugin.js'

export const PluginKind = S.Literals(['Checker', 'TestRunner', 'Reporter', 'Ignore', 'Evaluator'])
export type PluginKind = typeof PluginKind.Type

export class PluginContribution<K extends PluginKind = PluginKind>
  extends S.TaggedClass<PluginContribution<PluginKind>>()('PluginContribution', {
    kind: PluginKind,
    name: S.String,
    layer: S.Unknown,
  })
{
  declare readonly kind: K
  declare readonly name: string
  declare readonly layer: Layer.Layer<PluginInterfaces[K], never, PluginEnvironment>
}

export class Shadowing extends S.TaggedClass<Shadowing>()('Shadowing', {
  kind: S.String,
  name: S.String,
  shadowedIndex: S.Finite,
  winnerIndex: S.Finite,
}) {}
