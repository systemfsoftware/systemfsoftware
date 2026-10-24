import * as Schema from 'effect/Schema'

import { ConfigName, SecretRef } from '../Config/names.schema.js'
import { Locator } from './locator.schema.js'

export const CredentialPasswordRef = Schema.Struct({ credential: ConfigName })
export type CredentialPasswordRef = typeof CredentialPasswordRef.Type

export const FillValue = Schema.Union([Schema.String, SecretRef, CredentialPasswordRef])
export type FillValue = typeof FillValue.Type

export const ViewportPoint = Schema.Struct({ x: Schema.Finite, y: Schema.Finite })
export type ViewportPoint = typeof ViewportPoint.Type

export const SelectOption = Schema.Union([
  Schema.TaggedStruct('ByValue', { value: Schema.String }),
  Schema.TaggedStruct('ByLabel', { label: Schema.String }),
]).pipe(Schema.toTaggedUnion('_tag'))
export type SelectOption = typeof SelectOption.Type

export const SwipeDirection = Schema.Literals(['up', 'down', 'left', 'right'])
export type SwipeDirection = typeof SwipeDirection.Type

export const SwipeMomentum = Schema.Literals(['none', 'slow', 'fast'])
export type SwipeMomentum = typeof SwipeMomentum.Type

export const WaitState = Schema.Literals(['visible', 'hidden', 'attached', 'detached'])
export type WaitState = typeof WaitState.Type

const Navigate = Schema.TaggedStruct('Navigate', { url: Schema.String })
const Tap = Schema.TaggedStruct('Tap', { target: Locator })
const Fill = Schema.TaggedStruct('Fill', { target: Locator, value: FillValue })
const Type = Schema.TaggedStruct('Type', { target: Locator, text: Schema.String })
const Press = Schema.TaggedStruct('Press', { target: Locator, key: Schema.String })
const Select = Schema.TaggedStruct('Select', { target: Locator, option: SelectOption })
const Check = Schema.TaggedStruct('Check', { target: Locator, checked: Schema.Boolean })
const Hover = Schema.TaggedStruct('Hover', { target: Locator })
const Drag = Schema.TaggedStruct('Drag', { from: Locator, to: Locator })
const Swipe = Schema.TaggedStruct('Swipe', { direction: SwipeDirection, momentum: SwipeMomentum })
const SwipePath = Schema.TaggedStruct('SwipePath', { path: Schema.Array(ViewportPoint) })
const TapAt = Schema.TaggedStruct('TapAt', { point: ViewportPoint })
const TypeAt = Schema.TaggedStruct('TypeAt', { point: ViewportPoint, text: FillValue })
const Screenshot = Schema.TaggedStruct('Screenshot', { label: Schema.String })
const WaitFor = Schema.TaggedStruct('WaitFor', { locator: Locator, state: WaitState, timeout: Schema.Int })

export const Action = Schema.Union([
  Navigate,
  Tap,
  Fill,
  Type,
  Press,
  Select,
  Check,
  Hover,
  Drag,
  Swipe,
  SwipePath,
  TapAt,
  TypeAt,
  Screenshot,
  WaitFor,
]).pipe(Schema.toTaggedUnion('_tag'))
export type Action = typeof Action.Type
