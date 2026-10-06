export { CONFIG_FILE, type ConfigError, decodeDiagramConfig, loadDiagramConfig } from './config.js'

export {
  discover,
  type Discovered,
  type DiscoveredMachine,
  type DiscoveredWorkflow,
  type DiscoverOptions,
  type DiscoveryError,
} from './discover.js'

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
export { DiagramId, DiagramKind } from './Diagram.schema.js'
export { DiagramConfig } from './DiagramConfig.schema.js'
export { machineToMermaid } from './machine-to-mermaid.js'
export { renderDiscovered, type RenderedDiagram, type RenderedSet } from './render.js'
export { type DiagramReport, type DiagramRunOptions } from './report.js'
export { type WorkflowDiagramInput, workflowToMermaid } from './workflow-to-mermaid.js'
export { WorkflowSchemasLike } from './WorkflowSchemas.schema.js'
