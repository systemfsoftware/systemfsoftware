import type { ModuleKind } from './problem.schema.js'
import { CommonJSModuleKind, ESNextModuleKind } from './problem.schema.js'
import type { FalseCJSProblem, FalseESMProblem } from './problem.schema.js'

export interface ModuleKindDisagreementInput {
  readonly typesFileName: string | undefined
  readonly implementationFileName: string | undefined
  readonly typesModuleKind: ModuleKind | undefined
  readonly implementationModuleKind: ModuleKind | undefined
}

export const detectModuleKindDisagreement = (
  input: ModuleKindDisagreementInput,
): FalseESMProblem | FalseCJSProblem | undefined => {
  const { typesFileName, implementationFileName, typesModuleKind, implementationModuleKind } = input
  if (!typesFileName || !implementationFileName || !typesModuleKind || !implementationModuleKind) {
    return undefined
  }
  if (
    typesModuleKind.detectedKind === ESNextModuleKind && implementationModuleKind.detectedKind === CommonJSModuleKind
  ) {
    return {
      kind: 'FalseESM',
      typesFileName,
      implementationFileName,
      typesModuleKind,
      implementationModuleKind,
    }
  }
  if (
    typesModuleKind.detectedKind === CommonJSModuleKind && implementationModuleKind.detectedKind === ESNextModuleKind
  ) {
    return {
      kind: 'FalseCJS',
      typesFileName,
      implementationFileName,
      typesModuleKind,
      implementationModuleKind,
    }
  }
  return undefined
}
