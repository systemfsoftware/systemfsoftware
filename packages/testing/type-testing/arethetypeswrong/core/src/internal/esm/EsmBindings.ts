import type { Exports } from 'cjs-module-lexer'
import ts from 'typescript'

// Note: There is a pretty solid module `es-module-lexer` which performs a similar lexing operation
// as `cjs-module-lexer`, but has some limitations in what it can express. This implementation
// should be more complete.

function* extractDestructedNames(node: ts.BindingName): Iterable<string> {
  switch (node.kind) {
    case ts.SyntaxKind.ArrayBindingPattern:
      for (const element of node.elements) {
        if (element.kind === ts.SyntaxKind.BindingElement) {
          yield* extractDestructedNames(element.name)
        }
      }
      break

    case ts.SyntaxKind.Identifier:
      yield node.text
      break

    case ts.SyntaxKind.ObjectBindingPattern:
      for (const element of node.elements) {
        yield* extractDestructedNames(element.name)
      }
      break

    default:
      node satisfies never
  }
}

export function getEsmModuleBindings(sourceText: string): Exports {
  const options: ts.CreateSourceFileOptions = {
    languageVersion: ts.ScriptTarget.ESNext,
    impliedNodeFormat: ts.ModuleKind.ESNext,
  }
  const sourceFile = ts.createSourceFile('module.cjs', sourceText, options, false, ts.ScriptKind.JS)

  const exports: string[] = []
  const reexports: string[] = []

  function collectExportDeclaration(declaration: ts.ExportDeclaration): void {
    if (declaration.isTypeOnly) return
    const { exportClause, moduleSpecifier } = declaration
    if (exportClause) {
      if (exportClause.kind === ts.SyntaxKind.NamedExports) {
        for (const element of exportClause.elements) {
          if (!element.isTypeOnly) exports.push(element.name.text)
        }
      } else {
        exports.push(exportClause.name.text)
      }
    } else if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier)) {
      reexports.push(moduleSpecifier.text)
    }
  }

  function collectExportAssignment(statement: ts.ExportAssignment): void {
    if (!statement.isExportEquals) exports.push('default')
  }

  function collectClassOrFunction(declaration: ts.ClassDeclaration | ts.FunctionDeclaration): void {
    if (ts.hasSyntacticModifier(declaration, ts.ModifierFlags.Export)) {
      if (ts.hasSyntacticModifier(declaration, ts.ModifierFlags.Default)) {
        exports.push('default')
      } else if (declaration.name) {
        exports.push(declaration.name.text)
      }
    }
  }

  function collectVariableStatement(statement: ts.VariableStatement): void {
    if (ts.hasSyntacticModifier(statement, ts.ModifierFlags.Export)) {
      for (const declarator of statement.declarationList.declarations) {
        exports.push(...extractDestructedNames(declarator.name))
      }
    }
  }

  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement)) {
      collectExportDeclaration(statement)
    } else if (ts.isExportAssignment(statement)) {
      collectExportAssignment(statement)
    } else if (ts.isClassDeclaration(statement) || ts.isFunctionDeclaration(statement)) {
      collectClassOrFunction(statement)
    } else if (ts.isVariableStatement(statement)) {
      collectVariableStatement(statement)
    }
  }

  return { exports, reexports }
}
