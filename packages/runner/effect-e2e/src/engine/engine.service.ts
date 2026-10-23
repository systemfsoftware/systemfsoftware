import * as Context from 'effect/Context'
import type * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

import type {
  ActionFailed,
  AppNotOpen,
  AppUnreachable,
  ArtifactWriteFailed,
  AutomationUnsupported,
  LocatorAmbiguous,
  LocatorNotFound,
} from '../verdict/failure.schema.js'
import type { Action } from './action.schema.js'
import type { EngineCapability } from './capability.schema.js'
import type { LogEntry, ReadRequest, ReadResult, ScreenshotRequest } from './engine.schema.js'
import type { Locator } from './locator.schema.js'
import { memoryEngine } from './memory-engine.js'
import type { MemorySite } from './memory-site.schema.js'
import type { Observation } from './observation.schema.js'
import type { Route } from './route.schema.js'
import type { SemanticNode } from './semantic-node.schema.js'

export type EngineError =
  | LocatorNotFound
  | LocatorAmbiguous
  | ActionFailed
  | AutomationUnsupported
  | AppUnreachable
  | AppNotOpen
  | ArtifactWriteFailed

export interface EngineShape {
  readonly capabilities: ReadonlyArray<EngineCapability>
  readonly open: (url: string) => Effect.Effect<void, AppUnreachable>
  readonly observe: Effect.Effect<Observation, AppNotOpen>
  readonly query: (locator: Locator) => Effect.Effect<ReadonlyArray<SemanticNode>, AutomationUnsupported | AppNotOpen>
  readonly act: (
    action: Action,
  ) => Effect.Effect<
    void,
    LocatorNotFound | LocatorAmbiguous | ActionFailed | AutomationUnsupported | AppUnreachable | AppNotOpen
  >
  readonly read: (
    locator: Locator,
    request: ReadRequest,
  ) => Effect.Effect<ReadResult, LocatorNotFound | LocatorAmbiguous | ActionFailed | AutomationUnsupported | AppNotOpen>
  readonly screenshot: (
    request: ScreenshotRequest,
  ) => Effect.Effect<Uint8Array, AutomationUnsupported | ArtifactWriteFailed | AppNotOpen>
  readonly route: Effect.Effect<Route, AppNotOpen>
  readonly logs: Effect.Effect<ReadonlyArray<LogEntry>, AppNotOpen>
  readonly close: Effect.Effect<void>
}

export class Engine
  extends Context.Service<Engine, EngineShape>()('@systemfsoftware/effect-e2e/engine/engine.service/Engine')
{
  static readonly layerTest = (site: MemorySite): Layer.Layer<Engine> => Layer.effect(this)(memoryEngine(site))
}
