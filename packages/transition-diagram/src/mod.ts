export { CONFIG_FILE, type ConfigError, decodeDiagramConfig, loadDiagramConfig } from './config.js'

export { decodeTransitionDiagram } from './decode-diagram.js'

export { diagramToMermaid } from './diagram-to-mermaid.js'

export type { DiagramDefect } from './diagram-defects.js'

export {
  DanglingTransitionSource,
  DanglingTransitionTarget,
  DiagramShapeInvalid,
  DuplicateStateId,
  MissingInitialState,
} from './DiagramDefect.schema.js'

export {
  ArtifactMissingError,
  ArtifactOrphanError,
  ArtifactStaleError,
  ConfigDecodeError,
  ConfigFileMissingError,
  DiagramRenderError,
  ModuleImportError,
  UnrecognizedModuleError,
} from './DiagramError.schema.js'

export { build, type DiagramError } from './build.js'
export { check } from './check.js'
export { DiagramId } from './Diagram.schema.js'
export { DiagramConfig } from './DiagramConfig.schema.js'

export { discover, type DiscoveredWorkflow, type DiscoverOptions, type DiscoveryError } from './discover.js'

export { renderDiagram, renderDiscovered, type RenderedDiagram, type RenderedSet } from './render.js'
export type { DiagramReport, DiagramRunOptions } from './report.js'

export {
  DiagramEdgeKind,
  DiagramNodeKind,
  DiagramState,
  DiagramTransition,
  StateId,
  TransitionDiagram,
} from './TransitionDiagram.schema.js'

export { WorkflowSchemasLike } from './WorkflowSchemas.schema.js'
