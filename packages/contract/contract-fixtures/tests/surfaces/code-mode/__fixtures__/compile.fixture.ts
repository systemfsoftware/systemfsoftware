import ts from 'tstyche-typescript'

const VIRTUAL_FILE = '/program.ts'

const options: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  skipLibCheck: true,
  types: [],
}

const host = (source: string): ts.CompilerHost => {
  const created = ts.createCompilerHost(options)
  const preview = created.getSourceFile.bind(created)
  created.getSourceFile = (name, languageVersion, onError, createNew) =>
    name === VIRTUAL_FILE
      ? ts.createSourceFile(name, source, languageVersion, true)
      : preview(name, languageVersion, onError, createNew)
  created.readFile = (name) => name === VIRTUAL_FILE ? source : ts.sys.readFile(name)
  created.fileExists = (name) => name === VIRTUAL_FILE || ts.sys.fileExists(name)
  return created
}

export const diagnosticsOf = (source: string): ReadonlyArray<string> =>
  ts.getPreEmitDiagnostics(ts.createProgram([VIRTUAL_FILE], options, host(source)))
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
