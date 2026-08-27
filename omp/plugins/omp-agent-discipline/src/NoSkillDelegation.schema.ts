/**
 * Command, guard, and verdict types for the no-skill-delegation gate.
 * Declarations live on the owning workflow so `Workflow.make` can see them.
 */
export {
  Allow,
  Block,
  CheckDelegationCommand,
  type ClassifiedInput,
  type CompiledGuard,
  CompiledGuard,
  Delegated,
  type DelegationVerdict,
  DelegationVerdict,
  EmptyPrompt,
  How,
  NoDelegation,
  NoGuard,
  NonDelegatedTool,
  type PromptAnalysis,
  Prompted,
  ProtectedSubagent,
  Referenced,
} from './NoSkillDelegation.workflow.js'
