const declarationFileExtensionPattern = /\.d(\.[^./\\]+)?\.(c|m)?ts$/i

export const hasDeclarationFileExtension = (filePath: string): boolean => declarationFileExtensionPattern.test(filePath)
