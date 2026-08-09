import type { ModuleKind } from './problem.schema.js'
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
  if (typesModuleKind.detectedKind === 'ESNext' && implementationModuleKind.detectedKind === 'CommonJS') {
    return {
      kind: 'FalseESM',
      typesFileName,
      implementationFileName,
      typesModuleKind,
      implementationModuleKind,
    }
  }
  if (typesModuleKind.detectedKind === 'CommonJS' && implementationModuleKind.detectedKind === 'ESNext') {
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
