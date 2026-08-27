/**
 * Command and verdict types for the dispatch-doctrine gate.
 * Declarations live on the owning workflow so `Workflow.make` can see them.
 */
export { Allow, CheckDispatchCommand, DeliverDoctrine, DispatchDoctrineVerdict } from './DispatchDoctrine.workflow.js'
