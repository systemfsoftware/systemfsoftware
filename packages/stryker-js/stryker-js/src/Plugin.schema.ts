import * as S from 'effect/Schema'

import type * as Layer from 'effect/Layer'

import type { PluginEnvironment, PluginInterfaces } from './Plugin.js'
import type { ReporterFactory } from './ReporterEvent.schema.js'

export const PluginKind = S.Literals(['Checker', 'TestRunner', 'Reporter', 'Ignore', 'Evaluator'])
export type PluginKind = typeof PluginKind.Type

export const PluginLayerKind = S.Literals(['Checker', 'TestRunner', 'Ignore', 'Evaluator'])
export type PluginLayerKind = typeof PluginLayerKind.Type

export class PluginLayerContribution<K extends PluginLayerKind = PluginLayerKind>
  extends S.TaggedClass<PluginLayerContribution<PluginLayerKind>>()('PluginContribution', {
    kind: PluginLayerKind,
    name: S.String,
    layer: S.Unknown,
  })
{
  declare readonly kind: K
  declare readonly name: string
  declare readonly layer: Layer.Layer<PluginInterfaces[K], never, PluginEnvironment>
}

export class PluginReporterContribution extends S.TaggedClass<PluginReporterContribution>()('PluginContribution', {
  kind: PluginKind,
  name: S.String,
  make: S.Unknown,
}) {
  declare readonly kind: 'Reporter'
  declare readonly name: string
  declare readonly make: ReporterFactory
}

export type PluginContribution<K extends PluginKind = PluginKind> = K extends 'Reporter' ? PluginReporterContribution
  : PluginLayerContribution<Extract<K, PluginLayerKind>>

export class Shadowing extends S.TaggedClass<Shadowing>()('Shadowing', {
  kind: S.String,
  name: S.String,
  shadowedIndex: S.Finite,
  winnerIndex: S.Finite,
}) {}
