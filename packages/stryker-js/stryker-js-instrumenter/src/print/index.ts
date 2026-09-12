/**
 * Owned ESTree/TS-ESTree printer — renders oxc-parser ASTs back to source.
 *
 * Structural codegen: one case per node kind, precedence-aware, no span reliance.
 * Synthesized nodes without start/end print correctly.
 */

// oxlint-disable typescript/no-unsafe-type-assertion typescript/no-unnecessary-type-assertion typescript/no-non-null-assertion typescript/switch-exhaustiveness-check @systemfsoftware/ban-classes

import type {
  AccessorProperty,
  ArrayExpression,
  ArrayPattern,
  ArrowFunctionExpression,
  AssignmentExpression,
  AssignmentPattern,
  BinaryExpression,
  BindingIdentifier,
  BindingProperty,
  BindingRestElement,
  BlockStatement,
  BreakStatement,
  CallExpression,
  CatchClause,
  Class,
  ClassBody,
  ConditionalExpression,
  ContinueStatement,
  Decorator,
  DoWhileStatement,
  ExportAllDeclaration,
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  Expression,
  ExpressionStatement,
  ForInStatement,
  ForOfStatement,
  ForStatement,
  Function as FunctionNode,
  IdentifierName,
  IdentifierReference,
  IfStatement,
  ImportAttribute,
  ImportDeclaration,
  JSDocNonNullableType,
  JSDocNullableType,
  JSXAttribute,
  JSXElement,
  JSXExpressionContainer,
  JSXFragment,
  JSXIdentifier,
  JSXMemberExpression,
  JSXNamespacedName,
  JSXOpeningElement,
  JSXSpreadAttribute,
  JSXSpreadChild,
  JSXText,
  LabeledStatement,
  LabelIdentifier,
  LogicalExpression,
  MemberExpression,
  MetaProperty,
  MethodDefinition,
  NewExpression,
  ObjectExpression,
  ObjectProperty,
  PrivateIdentifier,
  Program,
  PropertyDefinition,
  ReturnStatement,
  SequenceExpression,
  SpreadElement,
  StaticBlock,
  SwitchCase,
  SwitchStatement,
  TaggedTemplateExpression,
  TemplateElement,
  TemplateLiteral,
  ThrowStatement,
  TryStatement,
  TSArrayType,
  TSAsExpression,
  TSCallSignatureDeclaration,
  TSConditionalType,
  TSConstructorType,
  TSConstructSignatureDeclaration,
  TSEnumDeclaration,
  TSExportAssignment,
  TSFunctionType,
  TSImportEqualsDeclaration,
  TSImportType,
  TSIndexedAccessType,
  TSIndexSignature,
  TSInferType,
  TSInstantiationExpression,
  TSInterfaceBody,
  TSInterfaceDeclaration,
  TSIntersectionType,
  TSLiteralType,
  TSMappedType,
  TSMethodSignature,
  TSModuleBlock,
  TSModuleDeclaration,
  TSNamedTupleMember,
  TSNamespaceExportDeclaration,
  TSNonNullExpression,
  TSOptionalType,
  TSParenthesizedType,
  TSPropertySignature,
  TSQualifiedName,
  TSRestType,
  TSSatisfiesExpression,
  TSTemplateLiteralType,
  TSTupleType,
  TSType,
  // TS
  TSTypeAliasDeclaration,
  TSTypeAnnotation,
  TSTypeAssertion,
  TSTypeOperator,
  TSTypeParameterDeclaration,
  TSTypeParameterInstantiation,
  TSTypePredicate,
  TSTypeQuery,
  TSTypeReference,
  TSUnionType,
  UnaryExpression,
  UpdateExpression,
  VariableDeclaration,
  VariableDeclarator,
  WhileStatement,
  WithStatement,
  YieldExpression,
} from '@oxc-project/types'
import type { Program as EstreeProgram } from 'estree'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface Comment {
  readonly type: 'Line' | 'Block'
  readonly value: string
  readonly start: number
  readonly end: number
}

export interface Hashbang {
  readonly type: 'Hashbang'
  readonly value: string
  readonly start: number
}

export interface PrintOptions {
  readonly comments?: readonly Comment[]
  readonly hashbang?: Hashbang | null
}

export interface PrintProgramOptions extends PrintOptions {}

// Primary entry — the Printer.ts replacement and the print property suite's
// entry. Accepts the estree `Program` shape the instrumenter's ASTs carry
// (oxc's serializer output satisfies it); the internal renderer keeps its
// @oxc-project/types view of the same plain objects.
export function printProgram(program: Program | EstreeProgram, opts: PrintProgramOptions = {}): string {
  const state = makePrintState(opts)
  // One boundary: the renderer's oxc-typed view of the same plain node tree.
  return state.printProgram(program as Program)
}

// Convenience: print any single node (used for synthesized replacement snippets)
export function printNode(node: unknown, opts: PrintOptions = {}): string {
  const state = makePrintState(opts)
  return state.printAnyNode(node as { type: string })
}

// ---------------------------------------------------------------------------
// Precedence (higher = tighter binding)
// ---------------------------------------------------------------------------

const PREC = {
  Sequence: 0,
  Assignment: 1, // =, +=, etc.
  Conditional: 2, // ?:
  NullishCoalescing: 3,
  LogicalOR: 4,
  LogicalAND: 5,
  BitwiseOR: 6,
  BitwiseXOR: 7,
  BitwiseAND: 8,
  Equality: 9, // ==, !=, ===, !==
  Relational: 10, // <, >, <=, >=, in, instanceof
  Shift: 11, // <<, >>, >>>
  Additive: 12, // +, -
  Multiplicative: 13, // *, /, %
  Exponential: 14, // **  right-assoc
  Unary: 15,
  Update: 16,
  Call: 17,
  Member: 18,
  Primary: 19,
} as const

function binaryPrec(op: string): number {
  switch (op) {
    case '||':
      return PREC.LogicalOR
    case '&&':
      return PREC.LogicalAND
    case '??':
      return PREC.NullishCoalescing
    case '|':
      return PREC.BitwiseOR
    case '^':
      return PREC.BitwiseXOR
    case '&':
      return PREC.BitwiseAND
    case '==':
    case '!=':
    case '===':
    case '!==':
      return PREC.Equality
    case '<':
    case '>':
    case '<=':
    case '>=':
    case 'in':
    case 'instanceof':
      return PREC.Relational
    case '<<':
    case '>>':
    case '>>>':
      return PREC.Shift
    case '+':
    case '-':
      return PREC.Additive
    case '*':
    case '/':
    case '%':
      return PREC.Multiplicative
    case '**':
      return PREC.Exponential
    default:
      return PREC.Additive
  }
}

const LOGICAL_PRECEDENCE: Readonly<Record<string, number>> = {
  '??': PREC.NullishCoalescing,
  '||': PREC.LogicalOR,
  '&&': PREC.LogicalAND,
}

function logicalPrec(op: string): number {
  return LOGICAL_PRECEDENCE[op] ?? PREC.LogicalAND
}

// ---------------------------------------------------------------------------
// Print state
// ---------------------------------------------------------------------------

const makePrintState = (opts: PrintOptions) => {
  const hashbang = opts.hashbang ?? null
  const sortedComments = [...sortedCommentsWithoutHashbang(opts.comments, hashbang), END_OF_COMMENTS]
  let out = ''
  let indentLevel = 0
  let commentIdx = 0
  // Comments sorted by start position for ordered emission

  const printProgram = (program: Program): string => {
    out = ''
    indentLevel = 0
    commentIdx = 0

    printHashbang()

    // Leading comments: the sweep stops at the first statement, and bounds
    // nothing at all when the program carries none.
    emitCommentsBefore((program.body[0] as { start?: number } | undefined)?.start)
    printProgramBody(program.body)

    // Trailing comments
    emitCommentsBefore(undefined)

    return out
  }

  const printAnyNode = (node: { type: string }): string => {
    out = ''
    indentLevel = 0
    printNode(node, PREC.Sequence)
    return out
  }

  // ---- comment interleaving ----

  const printHashbang = (): void => {
    if (hashbang) out += `#!${hashbang.value}\n`
  }

  const printProgramBody = (body: readonly unknown[]): void => {
    body.forEach((statement) => printProgramStatement(statement as { type: string; start?: number }))
  }

  const printProgramStatement = (statement: { type: string; start?: number }): void => {
    emitCommentsBefore(statement.start ?? -1)
    printStatement(statement as never)
    // Statement terminators: semicolons handled per-statement; ensure newline
    // between statements, and comments may sit between statements.
    out += '\n'
  }

  const printJumpStatement = (keyword: string, label: LabelIdentifier | null): void => {
    out += keyword
    if (label) out += ` ${label.name}`
    out += ';'
  }

  /** Emits every pending comment that starts before `pos`; an absent bound admits every comment. */
  const emitCommentsBefore = (pos: number | undefined): void => {
    emitPendingCommentsBefore(pos ?? EVERY_COMMENT_POSITION)
  }

  const emitPendingCommentsBefore = (pos: number): void => {
    for (
      let comment = sortedComments[commentIdx]!;
      comment.start < pos;
      comment = sortedComments[commentIdx]!
    ) {
      emitComment(comment)
      commentIdx++
    }
  }

  const emitComment = (c: Comment): void => {
    if (c.type === 'Line') {
      // c.value from oxc does NOT include leading //
      // But for Block comments, value is inner content
      // Check: Line value is " hello" for "// hello"
      out += `//${c.value}\n`
    } else {
      out += `/*${c.value}*/\n`
    }
  }

  // ---- indentation ----

  const indent = (): string => {
    return '  '.repeat(indentLevel)
  }
  /** Renders a fragment to a string without disturbing the pending output. */
  const capture = (render: () => void): string => {
    const saved = out
    out = ''
    render()
    const result = out
    out = saved
    return result
  }

  // ---- precedence-aware parens ----

  const needsParens = (childPrec: number, parentPrec: number, isRight: boolean, op?: string): boolean => {
    switch (childPrec === parentPrec) {
      case true:
        return equalPrecedenceNeedsParens(isRight, op)
      default:
        return childPrec < parentPrec
    }
  }

  /** Equal precedence — associativity decides. */
  const equalPrecedenceNeedsParens = (isRight: boolean, op?: string): boolean => {
    switch (op) {
      // right-associative: a ** (b ** c) needs no parens on right, but (a ** b) ** c does
      case '**':
        return !isRight
      // For left-assoc operators, right child with same prec needs parens: a - (b - c) vs a - b - c
      // For assignment (right-assoc), left child with same prec needs parens
      // We call this for binary/logical/conditional/assignment right children as isRight=true
      default:
        return isRight
    }
  }

  const wrapIfNeeded = (
    node: { type: string },
    prec: number,
    parentPrec: number,
    isRight: boolean,
    op?: string,
  ): string => {
    const inner = printExpressionToString(node as never, prec)
    if (needsParens(prec, parentPrec, isRight, op)) return `(${inner})`
    return inner
  }

  const printExpressionToString = (node: Expression, prec: number): string => {
    return capture(() => printNode(node as unknown as { type: string }, prec))
  }

  const sequenceNodeText = (node: { type: string }): string => {
    return capture(() => printNode(node, PREC.Sequence))
  }

  const assignmentNodeText = (node: { type: string }): string => {
    return capture(() => printNode(node, PREC.Assignment))
  }

  const nodeListText = (nodes: readonly { type: string }[], prec: number): string => {
    return nodes.map((node) => capture(() => printNode(node, prec))).join(', ')
  }

  const wrappedExpressionText = (
    node: { type: string },
    prec: number,
    wrappedKinds: Readonly<Record<string, true>>,
  ): string => {
    const printed = printExpressionToString(node as unknown as Expression, prec)
    switch (wrappedKinds[node.type] === true) {
      case true:
        return `(${printed})`
      default:
        return printed
    }
  }

  // ---- generic dispatch ----

  const printNode = (node: { type: string } | null | undefined, prec: number): void => {
    const kind = nodeKind(node)
    switch (kind) {
      case ABSENT_NODE_KIND:
        return
      // oxc uses "Literal" for all literal kinds; delegate to literal printer
      case 'Literal':
        printLiteral(node as never)
        break
      // Expressions
      case 'Identifier':
        printIdentifier(node as never)
        break
      case 'PrivateIdentifier':
        out += `#${(node as PrivateIdentifier).name}`
        break
      case 'ThisExpression':
        out += 'this'
        break
      case 'Super':
        out += 'super'
        break
      case 'ArrayExpression':
        printArrayExpression(node as ArrayExpression)
        break
      case 'ObjectExpression':
        printObjectExpression(node as ObjectExpression)
        break
      case 'Property':
        printProperty(node as never)
        break
      case 'TemplateLiteral':
        printTemplateLiteral(node as TemplateLiteral)
        break
      case 'TemplateElement':
        // handled inside TemplateLiteral / TSTemplateLiteralType
        out += (node as TemplateElement).value.raw
        break
      case 'TaggedTemplateExpression':
        printTaggedTemplate(node as TaggedTemplateExpression)
        break
      case 'MemberExpression':
        printMemberExpression(node as MemberExpression, prec)
        break
      case 'CallExpression':
        printCallExpression(node as CallExpression, prec)
        break
      case 'NewExpression':
        printNewExpression(node as NewExpression, prec)
        break
      case 'MetaProperty':
        printMetaProperty(node as MetaProperty)
        break
      case 'SpreadElement':
        out += '...'
        printNode((node as SpreadElement).argument as unknown as { type: string }, PREC.Assignment)
        break
      case 'RestElement':
        out += '...'
        printNode(
          (node as BindingRestElement).argument as unknown as { type: string },
          PREC.Assignment,
        )
        break
      case 'UpdateExpression':
        printUpdateExpression(node as UpdateExpression, prec)
        break
      case 'UnaryExpression':
        printUnaryExpression(node as UnaryExpression, prec)
        break
      case 'BinaryExpression':
        printBinaryExpression(node as BinaryExpression, prec)
        break
      case 'LogicalExpression':
        printLogicalExpression(node as LogicalExpression, prec)
        break
      case 'ConditionalExpression':
        printConditionalExpression(node as ConditionalExpression, prec)
        break
      case 'AssignmentExpression':
        printAssignmentExpression(node as AssignmentExpression, prec)
        break
      case 'AssignmentPattern':
        printAssignmentPattern(node as AssignmentPattern, prec)
        break
      case 'ObjectPattern':
        printObjectPattern(node as never)
        break
      case 'ArrayPattern':
        printArrayPattern(node as ArrayPattern)
        break
      case 'SequenceExpression':
        printSequenceExpression(node as SequenceExpression, prec)
        break
      case 'AwaitExpression':
        out += 'await '
        printNode(
          (node as YieldExpression & { argument: Expression }).argument as unknown as {
            type: string
          },
          PREC.Unary,
        )
        break
      case 'YieldExpression':
        printYieldExpression(node as YieldExpression, prec)
        break
      case 'ChainExpression':
        printNode(
          (node as unknown as { expression: { type: string } }).expression as { type: string },
          prec,
        )
        break
      case 'ParenthesizedExpression':
        out += '('
        printNode(
          (node as unknown as { expression: { type: string } }).expression as { type: string },
          PREC.Sequence,
        )
        out += ')'
        break
      case 'ImportExpression':
        printImportExpression(node as never)
        break
      case 'V8IntrinsicExpression':
        printV8Intrinsic(node as never)
        break
      case 'ArrowFunctionExpression':
        printArrowFunction(node as ArrowFunctionExpression, prec)
        break
      case 'FunctionExpression':
      case 'FunctionDeclaration':
      case 'TSDeclareFunction':
      case 'TSEmptyBodyFunctionExpression':
        printFunction(node as FunctionNode, prec)
        break
      case 'ClassDeclaration':
      case 'ClassExpression':
        printClass(node as Class, prec)
        break
      case 'JSXElement':
        printJSXElement(node as JSXElement)
        break
      case 'JSXFragment':
        printJSXFragment(node as JSXFragment)
        break
      case 'JSXOpeningElement':
        printJSXOpeningElement(node as JSXOpeningElement)
        break
      case 'JSXClosingElement':
        // handled in JSXElement
        break
      case 'JSXIdentifier':
        out += (node as JSXIdentifier).name
        break
      case 'JSXNamespacedName':
        out += `${(node as JSXNamespacedName).namespace.name}:${(node as JSXNamespacedName).name.name}`
        break
      case 'JSXMemberExpression':
        printJSXMemberExpression(node as JSXMemberExpression)
        break
      case 'JSXAttribute':
        printJSXAttribute(node as JSXAttribute)
        break
      case 'JSXSpreadAttribute':
        out += '{...'
        printNode((node as JSXSpreadAttribute).argument as unknown as { type: string }, PREC.Assignment)
        out += '}'
        break
      case 'JSXExpressionContainer':
        out += '{'
        printNode(
          (node as JSXExpressionContainer).expression as unknown as { type: string },
          PREC.Sequence,
        )
        out += '}'
        break
      case 'JSXEmptyExpression':
        break
      case 'JSXText':
        out += (node as JSXText).value
        break
      case 'JSXSpreadChild':
        out += '{...'
        printNode(
          (node as JSXSpreadChild).expression as unknown as { type: string },
          PREC.Assignment,
        )
        out += '}'
        break
      // TS expressions
      case 'TSAsExpression':
        printTSAsExpression(node as TSAsExpression, prec)
        break
      case 'TSSatisfiesExpression':
        printTSSatisfiesExpression(node as TSSatisfiesExpression, prec)
        break
      case 'TSTypeAssertion':
        printTSTypeAssertion(node as TSTypeAssertion, prec)
        break
      case 'TSNonNullExpression':
        printNode(
          (node as TSNonNullExpression).expression as unknown as { type: string },
          PREC.Member,
        )
        out += '!'
        break
      case 'TSInstantiationExpression':
        printTSInstantiationExpression(node as TSInstantiationExpression, prec)
        break
      // Statements
      case 'BlockStatement':
        printBlockStatement(node as BlockStatement)
        break
      case 'EmptyStatement':
        out += ';'
        break
      case 'ExpressionStatement':
        printExpressionStatement(node as ExpressionStatement)
        break
      case 'IfStatement':
        printIfStatement(node as IfStatement)
        break
      case 'DoWhileStatement':
        printDoWhileStatement(node as DoWhileStatement)
        break
      case 'WhileStatement':
        printWhileStatement(node as WhileStatement)
        break
      case 'ForStatement':
        printForStatement(node as ForStatement)
        break
      case 'ForInStatement':
        printForInStatement(node as ForInStatement)
        break
      case 'ForOfStatement':
        printForOfStatement(node as ForOfStatement)
        break
      case 'ContinueStatement':
        printJumpStatement('continue', (node as ContinueStatement).label)
        break
      case 'BreakStatement':
        printJumpStatement('break', (node as BreakStatement).label)
        break
      case 'ReturnStatement':
        printReturnStatement(node as ReturnStatement)
        break
      case 'WithStatement':
        printWithStatement(node as WithStatement)
        break
      case 'SwitchStatement':
        printSwitchStatement(node as SwitchStatement)
        break
      case 'SwitchCase':
        // handled in switch
        break
      case 'LabeledStatement':
        printLabeledStatement(node as LabeledStatement)
        break
      case 'ThrowStatement':
        out += 'throw '
        printNode((node as ThrowStatement).argument as unknown as { type: string }, PREC.Sequence)
        out += ';'
        break
      case 'TryStatement':
        printTryStatement(node as TryStatement)
        break
      case 'CatchClause':
        // handled in try
        break
      case 'DebuggerStatement':
        out += 'debugger;'
        break
      case 'VariableDeclaration':
        printVariableDeclaration(node as VariableDeclaration)
        break
      case 'VariableDeclarator':
        printVariableDeclarator(node as VariableDeclarator)
        break
      case 'ClassBody':
        printClassBody(node as ClassBody)
        break
      case 'MethodDefinition':
      case 'TSAbstractMethodDefinition':
        printMethodDefinition(node as MethodDefinition)
        break
      case 'PropertyDefinition':
      case 'TSAbstractPropertyDefinition':
        printPropertyDefinition(node as PropertyDefinition)
        break
      case 'AccessorProperty':
      case 'TSAbstractAccessorProperty':
        printAccessorProperty(node as AccessorProperty)
        break
      case 'StaticBlock':
        printStaticBlock(node as StaticBlock)
        break
      case 'ImportDeclaration':
        printImportDeclaration(node as ImportDeclaration)
        break
      case 'ExportNamedDeclaration':
        printExportNamedDeclaration(node as ExportNamedDeclaration)
        break
      case 'ExportDefaultDeclaration':
        printExportDefaultDeclaration(node as ExportDefaultDeclaration)
        break
      case 'ExportAllDeclaration':
        printExportAllDeclaration(node as ExportAllDeclaration)
        break
      case 'Decorator':
        out += '@'
        printNode((node as Decorator).expression as unknown as { type: string }, PREC.Member)
        break
      // TS Declarations / Types
      case 'TSTypeAliasDeclaration':
        printTSTypeAliasDeclaration(node as TSTypeAliasDeclaration)
        break
      case 'TSInterfaceDeclaration':
        printTSInterfaceDeclaration(node as TSInterfaceDeclaration)
        break
      case 'TSEnumDeclaration':
        printTSEnumDeclaration(node as TSEnumDeclaration)
        break
      case 'TSModuleDeclaration':
        printTSModuleDeclaration(node as TSModuleDeclaration)
        break
      case 'TSImportEqualsDeclaration':
        printTSImportEqualsDeclaration(node as TSImportEqualsDeclaration)
        break
      case 'TSExportAssignment':
        out += `export = `
        printNode(
          (node as TSExportAssignment).expression as unknown as { type: string },
          PREC.Sequence,
        )
        out += ';'
        break
      case 'TSNamespaceExportDeclaration':
        out += `export as namespace ${(node as TSNamespaceExportDeclaration).id.name};`
        break
      default:
        printUnclassifiedNode(node, kind)
        break
    }
  }

  /** TS type nodes and the wrappers that carry them, which oxc kinds apart from expressions. */
  const printUnclassifiedNode = (node: { type: string } | null | undefined, kind: string): void => {
    if (isTSTypeNode(kind)) {
      printTSType(node as unknown as TSType)
      return
    }
    printTypeHolderNode(node, kind)
  }

  const printTypeHolderNode = (node: { type: string } | null | undefined, kind: string): void => {
    switch (kind) {
      case 'TSTypeAnnotation':
        out += ': '
        printTSType((node as TSTypeAnnotation).typeAnnotation)
        break
      case 'TSTypeParameterDeclaration':
        printTSTypeParameterDeclaration(node as TSTypeParameterDeclaration)
        break
      case 'TSTypeParameterInstantiation':
        printTSTypeParameterInstantiation(node as TSTypeParameterInstantiation)
        break
      case 'TSTypeParameter':
        printTSTypeParameter(node as never)
        break
      default:
        // Unknown node — emit as comment for debuggability, still valid enough to not crash corpus run
        out += `/* unknown:${kind} */`
        break
    }
  }

  // -----------------------------------------------------------------------
  // Literals
  // -----------------------------------------------------------------------

  const printLiteral = (node: LiteralSource): void => {
    out += literalText(node)
  }

  const printIdentifier = (
    node: IdentifierName | IdentifierReference | BindingIdentifier | LabelIdentifier,
  ): void => {
    out += node.name
  }

  // -----------------------------------------------------------------------
  // Expressions
  // -----------------------------------------------------------------------

  const printArrayExpression = (node: ArrayExpression): void => {
    out += `[${node.elements.map((element) => arrayElementText(element)).join(', ')}]`
  }

  const arrayElementText = (element: unknown): string => {
    switch (element === null) {
      case true:
        return ''
      default:
        return assignmentNodeText(element as { type: string })
    }
  }

  const printObjectExpression = (node: ObjectExpression): void => {
    switch (node.properties.length) {
      case 0:
        out += '{}'
        break
      default:
        out += `{ ${nodeListText(node.properties, PREC.Sequence)} }`
    }
  }

  const printProperty = (
    node:
      | ObjectProperty
      | BindingProperty
      | { type: 'Property'; key: unknown; value: unknown }
        & Record<
          string,
          unknown
        >,
  ): void => {
    const fields = node as unknown as PropertyFields
    switch (propertyForm(fields)) {
      case 'accessor':
        out += `${fields.kind} `
        out += propertyKeyText(fields.key, fields.computed === true, PREC.Assignment)
        printFunctionValue(fields.value as unknown as FunctionNode)
        break
      case 'method':
        out += `${flagText(fields.async, 'async ')}${flagText(fields.generator, '*')}`
        out += propertyKeyText(fields.key, fields.computed === true, PREC.Assignment)
        printFunctionValue(fields.value as unknown as FunctionNode)
        break
      case 'shorthand':
        out += identifierName(fields.key)!
        break
      case 'shorthandDefault':
        printShorthandDefaultProperty(fields)
        break
      default:
        out += propertyKeyText(fields.key, fields.computed === true, PREC.Assignment)
        out += ': '
        printNode(fields.value, PREC.Assignment)
        break
    }
  }

  const printShorthandDefaultProperty = (fields: PropertyFields): void => {
    const right = assignmentNodeText((fields.value as unknown as AssignmentPattern).right as { type: string })
    out += `${identifierName(fields.key)!} = ${right}`
  }

  const propertyKeyText = (key: { type: string }, computed: boolean, computedPrec: number): string => {
    switch (computed) {
      case true:
        return `[${capture(() => printNode(key, computedPrec))}]`
      default:
        return plainPropertyKeyText(key)
    }
  }

  const plainPropertyKeyText = (key: { type: string }): string => {
    switch (key.type) {
      case 'Identifier':
        return (key as IdentifierName).name
      case 'PrivateIdentifier':
        return `#${(key as PrivateIdentifier).name}`
      case 'Literal':
        return capture(() => printLiteral(key as never))
      default:
        return capture(() => printNode(key, PREC.Assignment))
    }
  }

  const printFunctionValue = (fn: FunctionNode): void => {
    // fn is a Function node used as method value
    if (!fn) return
    printFunctionTail(fn)
  }

  const printFunctionTail = (fn: FunctionNode): void => {
    out += typeParametersText(fn.typeParameters)
    out += `(${paramsText(fn.params)})`
    out += typeAnnotationText(fn.returnType)
    out += functionBodyText(fn)
  }

  const functionBodyText = (fn: FunctionNode): string => {
    switch (Boolean(fn.body)) {
      case true:
        return ` ${capture(() => printBlockStatement(fn.body as BlockStatement))}`
      default:
        return ';'
    }
  }

  const paramsText = (params: readonly unknown[]): string => {
    return capture(() => printParams(params))
  }

  const typeParametersText = (params: TSTypeParameterDeclaration | null | undefined): string => {
    switch (Boolean(params)) {
      case true:
        return capture(() => printTSTypeParameterDeclaration(params as TSTypeParameterDeclaration))
      default:
        return ''
    }
  }

  const typeArgumentsText = (args: TSTypeParameterInstantiation | null | undefined): string => {
    switch (Boolean(args)) {
      case true:
        return capture(() => printTSTypeParameterInstantiation(args as TSTypeParameterInstantiation))
      default:
        return ''
    }
  }

  const typeAnnotationText = (annotation: TSTypeAnnotation | null | undefined): string => {
    switch (Boolean(annotation)) {
      case true:
        return capture(() => printTSTypeAnnotation(annotation as TSTypeAnnotation))
      default:
        return ''
    }
  }

  const printTemplateLiteral = (node: TemplateLiteral): void => {
    out += `\`${
      node.quasis
        .map((quasi, index) => quasiText(quasi, node.expressions[index] as unknown as { type: string }))
        .join('')
    }\``
  }

  const quasiText = (quasi: TemplateElement, expression: { type: string }): string => {
    switch (quasi.tail) {
      case true:
        return quasi.value.raw
      default:
        return `${quasi.value.raw}\${${sequenceNodeText(expression)}}`
    }
  }

  const printTaggedTemplate = (node: TaggedTemplateExpression): void => {
    printNode(node.tag as unknown as { type: string }, PREC.Member)
    if (node.typeArguments) printTSTypeParameterInstantiation(node.typeArguments)
    printTemplateLiteral(node.quasi)
  }

  const printMemberExpression = (node: MemberExpression, _prec: number): void => {
    const access = node as unknown as MemberAccess
    out += wrappedExpressionText(access.object, PREC.Member, MEMBER_OBJECT_WRAPPED_KINDS)
    out += flagText(access.optional, '?.')
    out += memberSelectorText(access)
  }

  const memberSelectorText = (access: MemberAccess): string => {
    switch (access.computed) {
      case true:
        return `[${sequenceNodeText(access.property)}]`
      default:
        return `${flagText(!access.optional, '.')}${memberPropertyText(access.property)}`
    }
  }

  const memberPropertyText = (property: { type: string }): string => {
    switch (property.type) {
      case 'Identifier':
        return (property as IdentifierName).name
      case 'PrivateIdentifier':
        return `#${(property as PrivateIdentifier).name}`
      default:
        return sequenceNodeText(property)
    }
  }

  const printCallExpression = (node: CallExpression, _prec: number): void => {
    out += wrappedExpressionText(node.callee as { type: string }, PREC.Member, CALLEE_WRAPPED_KINDS)
    out += flagText(node.optional, '?.')
    out += typeArgumentsText(node.typeArguments)
    out += `(${nodeListText(node.arguments, PREC.Assignment)})`
  }

  const printNewExpression = (node: NewExpression, _prec: number): void => {
    out += 'new '
    out += printExpressionToString(node.callee as Expression, PREC.Member)
    out += typeArgumentsText(node.typeArguments)
    out += `(${nodeListText(node.arguments, PREC.Assignment)})`
  }

  const printMetaProperty = (node: MetaProperty): void => {
    out += `${node.meta.name}.${node.property.name}`
  }

  const printV8Intrinsic = (node: { name: IdentifierName; arguments: unknown[] }): void => {
    out += `%${node.name.name}(${nodeListText(node.arguments as readonly { type: string }[], PREC.Assignment)})`
  }

  const printImportExpression = (
    node: { source: Expression; options: Expression | null; phase: string | null },
  ): void => {
    out += `import${flagText(node.phase, `.${node.phase}`)}(`
    out += assignmentNodeText(node.source as unknown as { type: string })
    out += flagText(node.options, `, ${assignmentNodeText(node.options as unknown as { type: string })}`)
    out += ')'
  }

  const printUpdateExpression = (node: UpdateExpression, _prec: number): void => {
    const operand = wrappedExpressionText(
      node.argument as { type: string },
      PREC.Update,
      MEMBER_OBJECT_WRAPPED_KINDS,
    )
    switch (node.prefix) {
      case true:
        out += `${node.operator}${operand}`
        break
      default:
        out += `${operand}${node.operator}`
    }
  }

  const printUnaryExpression = (node: UnaryExpression, _prec: number): void => {
    out += node.operator
    out += flagText(UNARY_WORD_OPERATORS[node.operator] === true, ' ')
    out += wrappedExpressionText(
      node.argument as { type: string },
      PREC.Unary,
      UNARY_OPERAND_WRAPPED_KINDS,
    )
  }

  const printBinaryExpression = (node: BinaryExpression, prec: number): void => {
    const myPrec = binaryPrec(node.operator)
    const leftStr = wrapIfNeeded(
      node.left as unknown as { type: string },
      precOf(node.left as unknown as Expression),
      myPrec,
      false,
      node.operator,
    )
    const rightStr = wrapIfNeeded(
      node.right as unknown as { type: string },
      precOf(node.right as unknown as Expression),
      myPrec,
      true,
      node.operator,
    )
    // Need to parenthesize the whole if parent prec higher
    const whole = `${leftStr} ${node.operator} ${rightStr}`
    if (myPrec < prec) {
      out += `(${whole})`
    } else {
      out += whole
    }
  }

  const printLogicalExpression = (node: LogicalExpression, prec: number): void => {
    const myPrec = logicalPrec(node.operator)
    const leftStr = wrapIfNeeded(
      node.left as unknown as { type: string },
      precOf(node.left as unknown as Expression),
      myPrec,
      false,
      node.operator,
    )
    const rightStr = wrapIfNeeded(
      node.right as unknown as { type: string },
      precOf(node.right as unknown as Expression),
      myPrec,
      true,
      node.operator,
    )
    const whole = `${leftStr} ${node.operator} ${rightStr}`
    if (myPrec < prec) out += `(${whole})`
    else out += whole
  }

  const printConditionalExpression = (node: ConditionalExpression, prec: number): void => {
    const myPrec = PREC.Conditional
    const testStr = wrapIfNeeded(
      node.test as unknown as { type: string },
      precOf(node.test as Expression),
      myPrec,
      false,
    )
    // consequent and alternate are assignment-prec
    const consStr = printExpressionToString(node.consequent, PREC.Assignment)
    const altStr = printExpressionToString(node.alternate, PREC.Assignment)
    const whole = `${testStr} ? ${consStr} : ${altStr}`
    if (myPrec < prec) out += `(${whole})`
    else out += whole
  }

  const printAssignmentExpression = (node: AssignmentExpression, prec: number): void => {
    const myPrec = PREC.Assignment
    const leftStr = printExpressionToString(node.left as unknown as Expression, myPrec)
    // right is right-associative
    const rightStr = printExpressionToString(node.right, myPrec - 0.1)
    const whole = `${leftStr} ${node.operator} ${rightStr}`
    if (myPrec < prec) out += `(${whole})`
    else out += whole
  }

  const printAssignmentPattern = (node: AssignmentPattern, prec: number): void => {
    const left = node.left as unknown as { typeAnnotation?: TSTypeAnnotation | null }
    const leftText = printExpressionToString(node.left as unknown as Expression, PREC.Assignment) +
      typeAnnotationText(left.typeAnnotation)
    const rightText = printExpressionToString(node.right, PREC.Assignment)
    out += parenthesizedIf(PREC.Assignment < prec, `${leftText} = ${rightText}`)
  }

  const printObjectPattern = (node: { properties: { type: string }[] }): void => {
    switch (node.properties.length) {
      case 0:
        out += '{}'
        break
      default:
        out += `{ ${nodeListText(node.properties, PREC.Sequence)} }`
    }
  }

  const printArrayPattern = (node: ArrayPattern): void => {
    out += `[${node.elements.map((element) => arrayElementText(element)).join(', ')}]`
  }

  const printSequenceExpression = (node: SequenceExpression, prec: number): void => {
    const whole = node.expressions
      .map((expression) => printExpressionToString(expression, PREC.Sequence))
      .join(', ')
    out += parenthesizedIf(PREC.Sequence < prec, whole)
  }

  const printYieldExpression = (node: YieldExpression, _prec: number): void => {
    switch (Boolean(node.delegate)) {
      case true:
        out += 'yield*'
        break
      default:
        out += 'yield'
    }
    out += flagText(node.argument, ` ${assignmentNodeText(node.argument as unknown as { type: string })}`)
  }

  const printArrowFunction = (node: ArrowFunctionExpression, prec: number): void => {
    const arrow = `${flagText(node.async, 'async ')}${typeParametersText(node.typeParameters)}` +
      `${arrowParamsText(node)}${typeAnnotationText(node.returnType)} => ${arrowBodyText(node)}`
    out += parenthesizedIf(PREC.Assignment < prec, arrow)
  }

  const arrowParamsText = (node: ArrowFunctionExpression): string => {
    const bareParam = bareArrowParamName(node)
    switch (bareParam.length) {
      case 0:
        return `(${paramsText(node.params)})`
      default:
        return bareParam
    }
  }

  const arrowBodyText = (node: ArrowFunctionExpression): string => {
    switch (arrowBodyIsBlock(node.body)) {
      case true:
        return capture(() => printBlockStatement(node.body as BlockStatement))
      default:
        return assignmentNodeText(node.body as unknown as { type: string })
    }
  }

  const printFunction = (node: FunctionNode, _prec: number): void => {
    out += functionHeaderText(node)
    printFunctionTail(node)
  }

  const printClass = (node: Class, _prec: number): void => {
    out += capture(() => printDecorators(node.decorators as Decorator[]))
    out += `${flagText(node.declare, 'declare ')}${flagText(node.abstract, 'abstract ')}class${
      namedDeclarationText(node)
    }`
    out += typeParametersText(node.typeParameters)
    out += classHeritageText(node)
    out += classImplementsText(node)
    out += ' '
    printClassBody(node.body)
  }

  const classHeritageText = (node: Class): string => {
    switch (Boolean(node.superClass)) {
      case true:
        return ` extends ${assignmentNodeText(node.superClass as unknown as { type: string })}${
          typeArgumentsText(node.superTypeArguments)
        }`
      default:
        return ''
    }
  }

  const classImplementsText = (node: Class): string => {
    const rendered = (node.implements ?? []).map((heritage) => heritageText(heritage)).join(', ')
    return flagText(rendered, ` implements ${rendered}`)
  }

  const heritageText = (heritage: {
    readonly expression: unknown
    readonly typeArguments?: TSTypeParameterInstantiation | null
  }): string => {
    return `${assignmentNodeText(heritage.expression as { type: string })}${typeArgumentsText(heritage.typeArguments)}`
  }

  const printDecorators = (decorators: readonly Decorator[] | undefined): void => {
    const rendered = (decorators ?? []).map((decorator) => decoratorText(decorator)).join(' ')
    out += flagText(rendered, `${rendered} `)
  }

  const decoratorText = (decorator: Decorator): string => {
    return `@${capture(() => printNode(decorator.expression as unknown as { type: string }, PREC.Member))}`
  }

  // -----------------------------------------------------------------------
  // JSX
  // -----------------------------------------------------------------------

  const printJSXElement = (node: JSXElement): void => {
    printJSXOpeningElement(node.openingElement)
    node.children.forEach((child) => printJSXChild(child))
    printJSXClosingElement(node)
  }

  const printJSXClosingElement = (node: JSXElement): void => {
    if (!node.closingElement) return
    out += `</${jsxElementNameText(node.closingElement.name)}>`
  }

  const printJSXFragment = (node: JSXFragment): void => {
    out += '<>'
    for (const child of node.children) {
      printJSXChild(child)
    }
    out += '</>'
  }

  const printJSXOpeningElement = (node: JSXOpeningElement): void => {
    out += `<${jsxElementNameText(node.name)}`
    out += typeArgumentsText(node.typeArguments)
    out += node.attributes
      .map((attribute) => ` ${sequenceNodeText(attribute as unknown as { type: string })}`)
      .join('')
    switch (node.selfClosing) {
      case true:
        out += ' />'
        break
      default:
        out += '>'
    }
  }

  const jsxElementNameText = (name: JSXIdentifier | JSXNamespacedName | JSXMemberExpression): string => {
    switch (name.type) {
      case 'JSXIdentifier':
        return (name as JSXIdentifier).name
      case 'JSXNamespacedName':
        return `${(name as JSXNamespacedName).namespace.name}:${(name as JSXNamespacedName).name.name}`
      default:
        return capture(() => printJSXMemberExpression(name as JSXMemberExpression))
    }
  }

  const printJSXMemberExpression = (node: JSXMemberExpression): void => {
    const obj = node.object
    if (obj.type === 'JSXIdentifier') {
      out += `${(obj as JSXIdentifier).name}.${node.property.name}`
    } else {
      printJSXMemberExpression(obj as JSXMemberExpression)
      out += `.${node.property.name}`
    }
  }

  const printJSXAttribute = (node: JSXAttribute): void => {
    out += jsxAttributeNameText(node.name)
    out += jsxAttributeValueClauseText(node.value)
  }

  const jsxAttributeValueClauseText = (value: { type: string } | null): string => {
    switch (nodeKind(value)) {
      case ABSENT_NODE_KIND:
        return ''
      default:
        return `=${jsxAttributeValueText(value as { type: string })}`
    }
  }

  const jsxAttributeValueText = (value: { type: string }): string => {
    switch (value.type) {
      case 'Literal':
        return capture(() => printLiteral(value as never))
      case 'JSXExpressionContainer': {
        const container = value as unknown as { readonly expression: { readonly type: string } }
        return `{${sequenceNodeText(container.expression)}}`
      }
      default:
        return sequenceNodeText(value)
    }
  }

  const printJSXChild = (child: { type: string }): void => {
    switch (child.type) {
      case 'JSXText':
        out += (child as JSXText).value
        break
      case 'JSXElement':
        printJSXElement(child as JSXElement)
        break
      case 'JSXFragment':
        printJSXFragment(child as JSXFragment)
        break
      case 'JSXExpressionContainer':
        out += '{'
        printNode(
          (child as JSXExpressionContainer).expression as unknown as { type: string },
          PREC.Sequence,
        )
        out += '}'
        break
      case 'JSXSpreadChild':
        out += '{...'
        printNode((child as JSXSpreadChild).expression as unknown as { type: string }, PREC.Assignment)
        out += '}'
        break
      default:
        printNode(child, PREC.Sequence)
        break
    }
  }

  // -----------------------------------------------------------------------
  // TS expressions
  // -----------------------------------------------------------------------

  const printTSAsExpression = (node: TSAsExpression, prec: number): void => {
    const myPrec = PREC.Relational // as is low
    const exprStr = printExpressionToString(node.expression, myPrec)
    const typeStr = printTSTypeToString(node.typeAnnotation)
    const whole = `${exprStr} as ${typeStr}`
    if (myPrec < prec) out += `(${whole})`
    else out += whole
  }

  const printTSSatisfiesExpression = (node: TSSatisfiesExpression, prec: number): void => {
    const myPrec = PREC.Relational
    const exprStr = printExpressionToString(node.expression, myPrec)
    const typeStr = printTSTypeToString(node.typeAnnotation)
    const whole = `${exprStr} satisfies ${typeStr}`
    if (myPrec < prec) out += `(${whole})`
    else out += whole
  }

  const printTSTypeAssertion = (node: TSTypeAssertion, _prec: number): void => {
    out += `<${printTSTypeToString(node.typeAnnotation)}>`
    printNode(node.expression as unknown as { type: string }, PREC.Unary)
  }

  const printTSInstantiationExpression = (node: TSInstantiationExpression, _prec: number): void => {
    printNode(node.expression as unknown as { type: string }, PREC.Member)
    printTSTypeParameterInstantiation(node.typeArguments)
  }

  // -----------------------------------------------------------------------
  // Statements
  // -----------------------------------------------------------------------

  const printStatement = (node: unknown): void => {
    const n = node as { type: string }
    printAttachedComments(n, 'leadingComments')
    switch (n.type) {
      case 'BlockStatement':
        printBlockStatement(n as BlockStatement)
        break
      case 'VariableDeclaration':
        printVariableDeclaration(n as VariableDeclaration)
        out += ';'
        break
      case 'FunctionDeclaration':
      case 'TSDeclareFunction':
        printFunction(n as FunctionNode, PREC.Sequence)
        break
      case 'ClassDeclaration':
        printClass(n as Class, PREC.Sequence)
        break
      case 'ExpressionStatement':
        printExpressionStatement(n as ExpressionStatement)
        break
      case 'IfStatement':
        printIfStatement(n as IfStatement)
        break
      case 'ForStatement':
        printForStatement(n as ForStatement)
        break
      case 'ForInStatement':
        printForInStatement(n as ForInStatement)
        break
      case 'ForOfStatement':
        printForOfStatement(n as ForOfStatement)
        break
      case 'WhileStatement':
        printWhileStatement(n as WhileStatement)
        break
      case 'DoWhileStatement':
        printDoWhileStatement(n as DoWhileStatement)
        break
      case 'ReturnStatement':
        printReturnStatement(n as ReturnStatement)
        break
      case 'ThrowStatement':
        out += 'throw '
        printNode((n as ThrowStatement).argument as unknown as { type: string }, PREC.Sequence)
        out += ';'
        break
      case 'TryStatement':
        printTryStatement(n as TryStatement)
        break
      case 'SwitchStatement':
        printSwitchStatement(n as SwitchStatement)
        break
      case 'LabeledStatement':
        printLabeledStatement(n as LabeledStatement)
        break
      case 'BreakStatement':
      case 'ContinueStatement':
      case 'DebuggerStatement':
      case 'EmptyStatement':
        printNode(n, PREC.Sequence)
        break
      case 'WithStatement':
        printWithStatement(n as WithStatement)
        break
      case 'ImportDeclaration':
        printImportDeclaration(n as ImportDeclaration)
        break
      case 'ExportNamedDeclaration':
        printExportNamedDeclaration(n as ExportNamedDeclaration)
        break
      case 'ExportDefaultDeclaration':
        printExportDefaultDeclaration(n as ExportDefaultDeclaration)
        break
      case 'ExportAllDeclaration':
        printExportAllDeclaration(n as ExportAllDeclaration)
        break
      case 'TSTypeAliasDeclaration':
        printTSTypeAliasDeclaration(n as TSTypeAliasDeclaration)
        break
      case 'TSInterfaceDeclaration':
        printTSInterfaceDeclaration(n as TSInterfaceDeclaration)
        break
      case 'TSEnumDeclaration':
        printTSEnumDeclaration(n as TSEnumDeclaration)
        break
      case 'TSModuleDeclaration':
        printTSModuleDeclaration(n as TSModuleDeclaration)
        break
      case 'TSImportEqualsDeclaration':
        printTSImportEqualsDeclaration(n as TSImportEqualsDeclaration)
        break
      case 'TSExportAssignment':
      case 'TSNamespaceExportDeclaration':
        printNode(n, PREC.Sequence)
        break
      default:
        printUnhandledStatement(n)
    }
    printAttachedComments(n, 'trailingComments')
  }

  const printUnhandledStatement = (node: { type: string }): void => {
    if (!isTSTypeNode(node.type)) {
      // Silent corruption is worse than a loud failure: instrumented code
      // that dropped a statement would downgrade runs, not crash them.
      throw new Error(`Printer: unhandled statement kind ${node.type}`)
    }
    printTSType(node as unknown as TSType)
    out += ';'
  }

  /**
   * Emits the comments `attachComments` folded into the tree
   * (`leadingComments` before the statement, `trailingComments` on the
   * statement's last line). The flat `opts.comments` path only serves direct
   * `printProgram` calls on freshly parsed trees; instrumented trees carry
   * their comments attached to nodes.
   */
  const printAttachedComments = (node: unknown, field: 'leadingComments' | 'trailingComments'): void => {
    const comments = (node as Record<string, unknown>)[field]
    if (!Array.isArray(comments)) return
    comments.forEach((comment) => printAttachedComment(comment as AttachedComment, field))
  }

  const printAttachedComment = (comment: AttachedComment, field: 'leadingComments' | 'trailingComments'): void => {
    switch (field) {
      case 'leadingComments':
        out += `${indent()}${commentText(comment)}\n`
        break
      default:
        out += `${commentText(comment)} `
    }
  }

  const printBlockStatement = (node: BlockStatement): void => {
    switch (node.body.length) {
      case 0:
        out += '{}'
        break
      default:
        out += '{\n'
        out += indentedBodyText(node.body, (statement) => printStatement(statement as { type: string }))
        out += `${indent()}}`
    }
  }

  const printExpressionStatement = (node: ExpressionStatement): void => {
    // Directive already handled as expression statement with directive field
    if (node.directive) {
      out += JSON.stringify(node.directive) + ';'
      return
    }
    printNode(node.expression as unknown as { type: string }, PREC.Sequence)
    out += ';'
  }

  const printIfStatement = (node: IfStatement): void => {
    out += 'if ('
    printNode(node.test as unknown as { type: string }, PREC.Sequence)
    out += ') '
    printStatementOrBlock(node.consequent as unknown as { type: string })
    if (node.alternate) {
      out += ' else '
      printStatementOrBlock(node.alternate as unknown as { type: string })
    }
  }

  const printStatementOrBlock = (node: { type: string }): void => {
    if (node.type === 'BlockStatement') {
      printBlockStatement(node as BlockStatement)
    } else {
      // Single-statement without braces — indent not needed, but ensure correct
      printStatement(node)
    }
  }

  const printWhileStatement = (node: WhileStatement): void => {
    out += 'while ('
    printNode(node.test as unknown as { type: string }, PREC.Sequence)
    out += ') '
    printStatementOrBlock(node.body as unknown as { type: string })
  }

  const printDoWhileStatement = (node: DoWhileStatement): void => {
    out += 'do '
    printStatementOrBlock(node.body as unknown as { type: string })
    out += ' while ('
    printNode(node.test as unknown as { type: string }, PREC.Sequence)
    out += ');'
  }

  const printForStatement = (node: ForStatement): void => {
    out += 'for ('
    printDeclarationOrExpression(node.init)
    out += '; '
    out += optionalSequenceText(node.test)
    out += '; '
    out += optionalSequenceText(node.update)
    out += ') '
    printStatementOrBlock(node.body as unknown as { type: string })
  }

  const printDeclarationOrExpression = (node: { type: string } | null | undefined): void => {
    switch (nodeKind(node)) {
      case 'VariableDeclaration':
        printVariableDeclaration(node as VariableDeclaration)
        break
      case ABSENT_NODE_KIND:
        break
      default:
        printNode(node, PREC.Sequence)
    }
  }

  const optionalSequenceText = (node: { type: string } | null | undefined): string => {
    switch (nodeKind(node)) {
      case ABSENT_NODE_KIND:
        return ''
      default:
        return sequenceNodeText(node as { type: string })
    }
  }

  const printForInStatement = (node: ForInStatement): void => {
    out += 'for ('
    if ((node.left as { type: string }).type === 'VariableDeclaration') {
      printVariableDeclaration(node.left as VariableDeclaration)
    } else {
      printNode(node.left as unknown as { type: string }, PREC.Sequence)
    }
    out += ' in '
    printNode(node.right as unknown as { type: string }, PREC.Sequence)
    out += ') '
    printStatementOrBlock(node.body as unknown as { type: string })
  }

  const printForOfStatement = (node: ForOfStatement): void => {
    // `for await (const x of y)`: the await keyword sits before the paren.
    switch (node.await) {
      case true:
        out += 'for await ('
        break
      default:
        out += 'for ('
    }
    printDeclarationOrExpression(node.left as unknown as { type: string })
    out += ' of '
    out += sequenceNodeText(node.right as unknown as { type: string })
    out += ') '
    printStatementOrBlock(node.body as unknown as { type: string })
  }

  const printReturnStatement = (node: ReturnStatement): void => {
    if (node.argument) {
      out += 'return '
      printNode(node.argument as unknown as { type: string }, PREC.Sequence)
      out += ';'
    } else {
      out += 'return;'
    }
  }

  const printWithStatement = (node: WithStatement): void => {
    out += 'with ('
    printNode(node.object as unknown as { type: string }, PREC.Sequence)
    out += ') '
    printStatementOrBlock(node.body as unknown as { type: string })
  }

  const printSwitchStatement = (node: SwitchStatement): void => {
    out += `switch (${sequenceNodeText(node.discriminant as { type: string })}) {\n`
    indentLevel++
    out += node.cases
      .map((switchCase) => `${indent()}${capture(() => printSwitchCase(switchCase))}`)
      .join('')
    indentLevel--
    out += `${indent()}}`
  }

  const printSwitchCase = (node: SwitchCase): void => {
    out += switchCaseHeaderText(node)
    out += indentedBodyText(
      node.consequent,
      (statement) => printStatement(statement as { type: string }),
    )
  }

  const switchCaseHeaderText = (node: SwitchCase): string => {
    switch (Boolean(node.test)) {
      case true:
        return `case ${sequenceNodeText(node.test as { type: string })}:\n`
      default:
        return 'default:\n'
    }
  }

  const printLabeledStatement = (node: LabeledStatement): void => {
    out += `${node.label.name}: `
    printStatement(node.body as unknown as { type: string })
  }

  const printTryStatement = (node: TryStatement): void => {
    out += 'try '
    printBlockStatement(node.block)
    printCatchClause(node.handler)
    printFinallyClause(node.finalizer)
  }

  const printCatchClause = (handler: CatchClause | null | undefined): void => {
    if (!handler) return
    out += ` catch${catchParamText(handler.param as { type: string } | null)} `
    printBlockStatement(handler.body)
  }

  const catchParamText = (param: { type: string } | null): string => {
    switch (nodeKind(param)) {
      case ABSENT_NODE_KIND:
        return ''
      default:
        return ` (${catchParamBodyText(param as { type: string })})`
    }
  }

  const catchParamBodyText = (param: { type: string }): string => {
    switch (param.type) {
      case 'Identifier':
        return identifierWithOptionalText(param as unknown as BindingIdFields)
      default:
        return sequenceNodeText(param)
    }
  }

  const printFinallyClause = (finalizer: BlockStatement | null | undefined): void => {
    if (!finalizer) return
    out += ' finally '
    printBlockStatement(finalizer)
  }

  const printVariableDeclaration = (node: VariableDeclaration): void => {
    out += `${flagText(node.declare, 'declare ')}${node.kind} `
    out += node.declarations.map((declaration) => variableDeclaratorText(declaration)).join(', ')
  }

  const variableDeclaratorText = (node: VariableDeclarator): string => {
    return capture(() => printVariableDeclarator(node))
  }

  const printVariableDeclarator = (node: VariableDeclarator): void => {
    const id = node.id as unknown as BindingIdFields
    const declarator = node as unknown as { readonly definite?: boolean }
    out += bindingTargetText(id)
    out += flagText(declarator.definite, '!')
    out += typeAnnotationText(id.typeAnnotation)
    out += initializerText(node.init)
  }

  const bindingTargetText = (id: BindingIdFields): string => {
    switch (id.type) {
      case 'Identifier':
        return `${bindingNameText(id)}${flagText(id.optional, '?')}`
      default:
        return sequenceNodeText(id as { type: string })
    }
  }

  const identifierWithOptionalText = (node: BindingIdFields): string => {
    return `${bindingNameText(node)}${flagText(node.optional, '?')}${typeAnnotationText(node.typeAnnotation)}`
  }

  const printParams = (params: readonly unknown[]): void => {
    out += params.map((param) => paramText(param as Record<string, unknown>)).join(', ')
  }

  const paramText = (param: Record<string, unknown>): string => {
    switch (parameterForm(param)) {
      case 'rest':
        return restParamText(param)
      case 'property':
        return parameterPropertyText(param)
      default:
        return formalParameterText(param)
    }
  }

  const restParamText = (param: Record<string, unknown>): string => {
    return `...${assignmentNodeText(param['argument'] as { type: string })}${
      typeAnnotationText(param['typeAnnotation'] as TSTypeAnnotation | undefined)
    }`
  }

  const parameterPropertyText = (param: Record<string, unknown>): string => {
    return `${capture(() => printDecorators(param['decorators'] as Decorator[] | undefined))}${
      parameterPropertyModifiers(param)
    }${parameterPropertyTargetText(param['parameter'])}`
  }

  const parameterPropertyTargetText = (parameter: unknown): string => {
    switch (nodeKind(parameter as { type: string } | null)) {
      case 'Identifier':
        return identifierWithOptionalText(parameter as BindingIdFields)
      default:
        return sequenceNodeText(parameter as { type: string })
    }
  }

  const formalParameterText = (param: Record<string, unknown>): string => {
    return `${capture(() => printDecorators(param['decorators'] as Decorator[] | undefined))}${
      formalParameterBodyText(param)
    }`
  }

  const formalParameterBodyText = (param: Record<string, unknown>): string => {
    switch (param['type'] === 'Identifier') {
      case true:
        return identifierWithOptionalText(param as unknown as BindingIdFields)
      default:
        return `${assignmentNodeText(param as unknown as { type: string })}${
          typeAnnotationText(param['typeAnnotation'] as TSTypeAnnotation | undefined)
        }`
    }
  }

  const printClassBody = (node: ClassBody): void => {
    switch (node.body.length) {
      case 0:
        out += '{}'
        break
      default:
        out += '{\n'
        out += indentedBodyText(
          node.body,
          (element) => printNode(element as { type: string }, PREC.Sequence),
        )
        out += `${indent()}}`
    }
  }

  const indentedBodyText = (items: readonly unknown[], print: (item: unknown) => void): string => {
    indentLevel++
    const body = items.map((item) => `${indent()}${capture(() => print(item))}\n`).join('')
    indentLevel--
    return body
  }

  const printMethodDefinition = (node: MethodDefinition): void => {
    const fn = node.value as unknown as FunctionNode
    out += capture(() => printDecorators(node.decorators))
    out += methodDefinitionPrefix(node, fn)
    out += propertyKeyText(node.key as unknown as { type: string }, node.computed === true, PREC.Sequence)
    out += flagText(node.optional, '?')
    printFunctionTail(fn)
  }

  const printPropertyDefinition = (node: PropertyDefinition): void => {
    out += capture(() => printDecorators(node.decorators))
    out += propertyDefinitionModifiers(node)
    out += propertyKeyText(node.key as unknown as { type: string }, node.computed === true, PREC.Sequence)
    out += flagText(node.optional, '?')
    out += flagText(node.definite, '!')
    out += typeAnnotationText(node.typeAnnotation)
    out += initializerText(node.value)
    out += ';'
  }

  const printAccessorProperty = (node: AccessorProperty): void => {
    out += capture(() => printDecorators(node.decorators))
    out += flagText(node.accessibility, `${node.accessibility} `)
    out += flagText(node.static, 'static ')
    out += flagText(node.override, 'override ')
    out += 'accessor '
    out += propertyKeyText(node.key as unknown as { type: string }, node.computed === true, PREC.Sequence)
    out += flagText(node.definite, '!')
    out += typeAnnotationText(node.typeAnnotation)
    out += initializerText(node.value)
    out += ';'
  }

  const initializerText = (value: unknown): string => {
    return flagText(value, ` = ${assignmentNodeText(value as { type: string })}`)
  }

  const printStaticBlock = (node: StaticBlock): void => {
    out += 'static {\n'
    indentLevel++
    for (const stmt of node.body) {
      out += indent()
      printStatement(stmt as unknown as { type: string })
      out += '\n'
    }
    indentLevel--
    out += `${indent()}}`
  }

  // -----------------------------------------------------------------------
  // Imports / Exports
  // -----------------------------------------------------------------------

  const printImportDeclaration = (node: ImportDeclaration): void => {
    const source = printImportSource(node.source, node.attributes)
    out += `import ${importKindText(node)}${importClauseText(node, source)};`
  }

  const importClauseText = (node: ImportDeclaration, source: string): string => {
    switch (node.specifiers.length === 0) {
      case true:
        return source
      default:
        return `${importBindingsText(node.specifiers)} from ${source}`
    }
  }

  const printImportSource = (
    source: { value: string; raw: string | null },
    attrs: readonly ImportAttribute[],
  ): string => {
    const raw = source.raw ?? JSON.stringify(source.value)
    return `${raw}${importAttributesText(attrs)}`
  }

  const printExportNamedDeclaration = (node: ExportNamedDeclaration): void => {
    switch (node.declaration === null) {
      case false:
        out += `export ${capture(() => printStatement(node.declaration as unknown as { type: string }))}`
        break
      default:
        out += `export ${flagText(node.exportKind === 'type', 'type ')}{ ${
          node.specifiers.map((specifier) => exportSpecifierText(specifier)).join(', ')
        } }${exportSourceClauseText(node)};`
    }
  }

  const exportSourceClauseText = (node: ExportNamedDeclaration): string => {
    if (!node.source) return ''
    const rendered = ` from ${JSON.stringify(node.source.value)}${importAttributesText(node.attributes)}`
    return rendered
  }

  const printExportDefaultDeclaration = (node: ExportDefaultDeclaration): void => {
    const declaration = node.declaration as { type: string }
    out += 'export default '
    switch (BARE_DEFAULT_EXPORT_KINDS[declaration.type] === true) {
      case true:
        printStatement(declaration as unknown as { type: string })
        break
      default:
        printNode(declaration, PREC.Assignment)
        out += ';'
    }
  }

  const printExportAllDeclaration = (node: ExportAllDeclaration): void => {
    out += `export ${flagText(node.exportKind === 'type', 'type ')}*${exportedNameClauseText(node.exported)}`
    out += ` from ${JSON.stringify(node.source.value)}${importAttributesText(node.attributes)};`
  }

  // -----------------------------------------------------------------------
  // TS Declarations
  // -----------------------------------------------------------------------

  const printTSTypeAliasDeclaration = (node: TSTypeAliasDeclaration): void => {
    out += `${flagText(node.declare, 'declare ')}type ${node.id.name}${typeParametersText(node.typeParameters)} = ${
      printTSTypeToString(node.typeAnnotation)
    };`
  }

  const printTSInterfaceDeclaration = (node: TSInterfaceDeclaration): void => {
    out += `${flagText(node.declare, 'declare ')}interface ${node.id.name}${typeParametersText(node.typeParameters)}`
    out += interfaceExtendsText(node.extends)
    out += ' '
    printTSInterfaceBody(node.body)
  }

  const interfaceExtendsText = (
    extensions: readonly { expression: unknown; typeArguments?: TSTypeParameterInstantiation | null }[],
  ): string => {
    const rendered = extensions.map((heritage) => heritageText(heritage)).join(', ')
    return flagText(rendered, ` extends ${rendered}`)
  }

  const printTSInterfaceBody = (node: TSInterfaceBody): void => {
    switch (node.body.length) {
      case 0:
        out += '{}'
        break
      default:
        out += '{\n'
        out += indentedBodyText(node.body, (member) => printTSSignature(member as { type: string }))
        out += `${indent()}}`
    }
  }

  const printTSSignature = (sig: { type: string }): void => {
    switch (sig.type) {
      case 'TSPropertySignature':
        printTSPropertySignature(sig as unknown as TSPropertySignature)
        break
      case 'TSIndexSignature':
        printTSIndexSignature(sig as unknown as TSIndexSignature)
        break
      case 'TSCallSignatureDeclaration':
        printTSCallSignature(sig as unknown as TSCallSignatureDeclaration)
        break
      case 'TSConstructSignatureDeclaration':
        printTSConstructSignature(sig as unknown as TSConstructSignatureDeclaration)
        break
      case 'TSMethodSignature':
        printTSMethodSignature(sig as unknown as TSMethodSignature)
        break
      default:
        out += `/* sig:${sig.type} */;`
    }
  }

  const printTSPropertySignature = (node: TSPropertySignature): void => {
    out += `${flagText(node.readonly, 'readonly ')}${
      propertyKeyText(node.key as unknown as { type: string }, node.computed === true, PREC.Sequence)
    }${flagText(node.optional, '?')}${typeAnnotationText(node.typeAnnotation)};`
  }

  const printTSIndexSignature = (node: TSIndexSignature): void => {
    const parameters = node.parameters.map((parameter) => indexParameterText(parameter)).join(', ')
    out += `${flagText(node.readonly, 'readonly ')}${flagText(node.static, 'static ')}[${parameters}]${
      typeAnnotationText(node.typeAnnotation)
    };`
  }

  const indexParameterText = (parameter: { name: string; typeAnnotation: unknown }): string => {
    const annotation = parameter.typeAnnotation as TSTypeAnnotation
    return `${parameter.name}: ${printTSTypeToString(annotation.typeAnnotation)}`
  }

  const printTSCallSignature = (node: TSCallSignatureDeclaration): void => {
    out += `${typeParametersText(node.typeParameters)}(${paramsText(node.params)})${
      typeAnnotationText(node.returnType)
    };`
  }

  const printTSConstructSignature = (node: TSConstructSignatureDeclaration): void => {
    out += `new ${typeParametersText(node.typeParameters)}(${paramsText(node.params)})${
      typeAnnotationText(node.returnType)
    };`
  }

  const printTSMethodSignature = (node: TSMethodSignature): void => {
    out += `${methodKindText(node.kind)}${
      propertyKeyText(node.key as unknown as { type: string }, node.computed === true, PREC.Sequence)
    }${flagText(node.optional, '?')}${typeParametersText(node.typeParameters)}(${paramsText(node.params)})${
      typeAnnotationText(node.returnType)
    };`
  }

  const printTSEnumDeclaration = (node: TSEnumDeclaration): void => {
    out += `${flagText(node.declare, 'declare ')}${flagText(node.const, 'const ')}enum ${node.id.name} {\n`
    out += indentedBodyText(node.body.members, (member) => printEnumMember(member as TSEnumMemberShape))
    out += `${indent()}}`
  }

  const printEnumMember = (member: TSEnumMemberShape): void => {
    out += `${identifierOrLiteralNameText(member.id)}${initializerText(member.initializer)},`
  }

  const identifierOrLiteralNameText = (id: { type: string }): string => {
    switch (id.type) {
      case 'Identifier':
        return (id as IdentifierName).name
      case 'Literal':
        return capture(() => printLiteral(id as unknown as LiteralSource))
      default:
        return sequenceNodeText(id)
    }
  }

  const printTSModuleDeclaration = (node: TSModuleDeclaration): void => {
    out += `${flagText(node.declare, 'declare ')}${moduleHeaderText(node)}${moduleBodyText(node)}`
  }

  const moduleHeaderText = (node: TSModuleDeclaration): string => {
    switch (Boolean((node as unknown as { global?: boolean }).global)) {
      case true:
        return 'global '
      default:
        return `${node.kind} ${identifierOrLiteralNameText(node.id as unknown as { type: string })}`
    }
  }

  const moduleBodyText = (node: TSModuleDeclaration): string => {
    switch (Boolean(node.body)) {
      case true:
        return ` ${capture(() => printTSModuleBlock(node.body as TSModuleBlock))}`
      default:
        return ';'
    }
  }

  const printTSModuleBlock = (node: TSModuleBlock): void => {
    out += '{\n'
    out += indentedBodyText(node.body, (statement) => printStatement(statement as { type: string }))
    out += `${indent()}}`
  }

  const printTSImportEqualsDeclaration = (node: TSImportEqualsDeclaration): void => {
    out += `import ${flagText(node.importKind === 'type', 'type ')}${node.id.name} = ${
      moduleReferenceText(node.moduleReference as unknown as { type: string })
    };`
  }

  const moduleReferenceText = (reference: { type: string }): string => {
    switch (reference.type) {
      case 'TSExternalModuleReference': {
        const external = reference as unknown as { readonly expression: { readonly value: string } }
        return `require(${externalModuleArgumentText(external.expression.value)})`
      }
      default:
        return sequenceNodeText(reference)
    }
  }

  // -----------------------------------------------------------------------
  // TS Type printers
  // -----------------------------------------------------------------------

  const printTSType = (node: TSType): void => {
    out += printTSTypeToString(node)
  }

  const printTSTypeToString = (node: TSType): string => {
    const saved = out
    out = ''
    doPrintTSType(node)
    const result = out
    out = saved
    return result
  }

  const doPrintTSType = (node: TSType): void => {
    switch (node.type) {
      case 'TSAnyKeyword':
        out += 'any'
        break
      case 'TSStringKeyword':
        out += 'string'
        break
      case 'TSBooleanKeyword':
        out += 'boolean'
        break
      case 'TSNumberKeyword':
        out += 'number'
        break
      case 'TSBigIntKeyword':
        out += 'bigint'
        break
      case 'TSSymbolKeyword':
        out += 'symbol'
        break
      case 'TSVoidKeyword':
        out += 'void'
        break
      case 'TSUndefinedKeyword':
        out += 'undefined'
        break
      case 'TSNullKeyword':
        out += 'null'
        break
      case 'TSNeverKeyword':
        out += 'never'
        break
      case 'TSUnknownKeyword':
        out += 'unknown'
        break
      case 'TSObjectKeyword':
        out += 'object'
        break
      case 'TSIntrinsicKeyword':
        out += 'intrinsic'
        break
      case 'TSThisType':
        out += 'this'
        break
      case 'TSTypeReference': {
        const n = node as TSTypeReference
        printTSTypeName(n.typeName)
        out += typeArgumentsText(n.typeArguments)
        break
      }
      case 'TSUnionType': {
        const n = node as TSUnionType
        out += tSTypeListText(n.types, ' | ')
        break
      }
      case 'TSIntersectionType': {
        const n = node as TSIntersectionType
        out += tSTypeListText(n.types, ' & ')
        break
      }
      case 'TSArrayType': {
        const n = node as TSArrayType
        out += `${arrayElementTypeText(n.elementType)}[]`
        break
      }
      case 'TSTypeLiteral': {
        const n = node as unknown as { members: { type: string }[] }
        printTSTypeLiteral(n.members)
        break
      }
      case 'TSTupleType': {
        const n = node as TSTupleType
        printTupleType(n.elementTypes)
        break
      }
      case 'TSConditionalType': {
        const n = node as TSConditionalType
        doPrintTSType(n.checkType)
        out += ' extends '
        doPrintTSType(n.extendsType)
        out += ' ? '
        doPrintTSType(n.trueType)
        out += ' : '
        doPrintTSType(n.falseType)
        break
      }
      case 'TSInferType': {
        const n = node as TSInferType
        out += `infer ${n.typeParameter.name.name}`
        printTypeClause(' extends ', n.typeParameter.constraint)
        break
      }
      case 'TSTypeQuery': {
        const n = node as TSTypeQuery
        out += 'typeof '
        printTypeQueryName(n)
        out += typeArgumentsText(n.typeArguments)
        break
      }
      case 'TSImportType': {
        printTSImportType(node as TSImportType)
        break
      }
      case 'TSTypeOperator': {
        const n = node as TSTypeOperator
        out += `${n.operator} `
        doPrintTSType(n.typeAnnotation)
        break
      }
      case 'TSMappedType': {
        printMappedType(node as TSMappedType)
        break
      }
      case 'TSTemplateLiteralType': {
        printTSTemplateLiteral(node as TSTemplateLiteralType)
        break
      }
      case 'TSFunctionType': {
        printTSFunctionType(node as TSFunctionType)
        break
      }
      case 'TSConstructorType': {
        printTSConstructorType(node as TSConstructorType)
        break
      }
      case 'TSTypePredicate': {
        printTSTypePredicate(node as TSTypePredicate)
        break
      }
      case 'TSIndexedAccessType': {
        const n = node as TSIndexedAccessType
        doPrintTSType(n.objectType)
        out += '['
        doPrintTSType(n.indexType)
        out += ']'
        break
      }
      // TSTypeParameter is not a TSType — handled via declarations, not here

      case 'TSLiteralType': {
        printTSLiteralType((node as TSLiteralType).literal)
        break
      }
      case 'TSParenthesizedType': {
        const n = node as TSParenthesizedType
        out += '('
        doPrintTSType(n.typeAnnotation)
        out += ')'
        break
      }
      case 'TSJSDocNullableType': {
        printJSDocPostfixModifier(node as JSDocNullableType, '?')
        break
      }
      case 'TSJSDocNonNullableType': {
        printJSDocPostfixModifier(node as JSDocNonNullableType, '!')
        break
      }
      case 'TSJSDocUnknownType':
        out += '?'
        break
      default:
        out += `/* type:${(node as { type: string }).type} */`
        break
    }
  }

  const tSTypeListText = (types: readonly TSType[], separator: string): string => {
    return types.map((type) => printTSTypeToString(type)).join(separator)
  }

  const arrayElementTypeText = (type: TSType): string => {
    const printed = printTSTypeToString(type)
    switch (ARRAY_ELEMENT_WRAPPED_KINDS[type.type] === true) {
      case true:
        return `(${printed})`
      default:
        return printed
    }
  }

  const printTSTypeLiteral = (members: readonly { type: string }[]): void => {
    const rendered = members.map((member) => signatureText(member)).join('; ')
    switch (members.length) {
      case 0:
        out += '{}'
        break
      default:
        out += `{ ${rendered} }`
    }
  }

  const signatureText = (member: { type: string }): string => {
    const printed = capture(() => printTSSignature(member))
    switch (printed.endsWith(';')) {
      case true:
        return printed.slice(0, -1)
      default:
        return printed
    }
  }

  const printTupleType = (elements: readonly unknown[]): void => {
    out += `[${elements.map((element) => capture(() => printTupleElement(element))).join(', ')}]`
  }

  const printTupleElement = (element: unknown): void => {
    const tupleElement = element as { type: string }
    switch (tupleElement.type) {
      case 'TSRestType':
        out += '...'
        doPrintTSType((tupleElement as unknown as TSRestType).typeAnnotation)
        break
      case 'TSOptionalType':
        doPrintTSType((tupleElement as unknown as TSOptionalType).typeAnnotation)
        out += '?'
        break
      case 'TSNamedTupleMember':
        printNamedTupleMember(tupleElement as unknown as TSNamedTupleMember)
        break
      default:
        doPrintTSType(tupleElement as unknown as TSType)
    }
  }

  const printNamedTupleMember = (member: TSNamedTupleMember): void => {
    out += `${member.label.name}${flagText(member.optional, '?')}: `
    printTupleElement(member.elementType)
  }

  const printTypeClause = (keyword: string, type: TSType | null | undefined): void => {
    if (!type) return
    out += keyword
    doPrintTSType(type)
  }

  const printTypeQueryName = (node: TSTypeQuery): void => {
    switch (node.exprName.type) {
      case 'TSImportType':
        doPrintTSType(node.exprName as unknown as TSType)
        break
      default:
        printTSTypeName(node.exprName as unknown as IdentifierReference)
    }
  }

  const printTSImportType = (node: TSImportType): void => {
    printTSImportTypeSource(node)
    if (node.qualifier) {
      out += '.'
      printTSImportTypeQualifier(node.qualifier)
    }
    out += typeArgumentsText(node.typeArguments)
  }

  const printTSImportTypeSource = (node: TSImportType): void => {
    out += `import(${JSON.stringify(node.source.value)}`
    out += flagText(node.options, `, ${assignmentNodeText(node.options as unknown as { type: string })}`)
    out += ')'
  }

  const printMappedType = (node: TSMappedType): void => {
    out += '{ '
    printMappedTypeModifier(node.readonly, 'readonly ')
    out += `[${node.key.name} in `
    doPrintTSType(node.constraint)
    printTypeClause(' as ', node.nameType)
    out += ']'
    printMappedTypeModifier(node.optional, '?')
    printTypeClause(': ', node.typeAnnotation)
    out += ' }'
  }

  const printMappedTypeModifier = (modifier: unknown, rendered: string): void => {
    switch (modifier) {
      case true:
        out += rendered
        break
      case '+':
        out += `+${rendered}`
        break
      case '-':
        out += `-${rendered}`
        break
      default:
        break
    }
  }

  const printTSTemplateLiteral = (node: TSTemplateLiteralType): void => {
    out += `\`${
      node.quasis
        .map((quasi, index) => templateTypeQuasiText(quasi, node.types[index]!))
        .join('')
    }\``
  }

  const templateTypeQuasiText = (quasi: TemplateElement, type: TSType): string => {
    switch (quasi.tail) {
      case true:
        return quasi.value.raw
      default:
        return `${quasi.value.raw}\${${printTSTypeToString(type)}}`
    }
  }

  const printTSFunctionType = (node: TSFunctionType): void => {
    out += `${typeParametersText(node.typeParameters)}(${paramsText(node.params)}) => ${
      printTSTypeToString((node.returnType as TSTypeAnnotation).typeAnnotation)
    }`
  }

  const printTSConstructorType = (node: TSConstructorType): void => {
    out += `${flagText(node.abstract, 'abstract ')}new ${typeParametersText(node.typeParameters)}(${
      paramsText(node.params)
    }) => ${printTSTypeToString((node.returnType as TSTypeAnnotation).typeAnnotation)}`
  }

  const printTSTypePredicate = (node: TSTypePredicate): void => {
    out += flagText(node.asserts, 'asserts ')
    out += typePredicateParameterText(node.parameterName as unknown as { type: string })
    printPredicateAnnotation(node)
  }

  const printPredicateAnnotation = (node: TSTypePredicate): void => {
    if (!node.typeAnnotation) return
    printTypeClause(' is ', node.typeAnnotation.typeAnnotation)
  }

  const printTSLiteralType = (literal: unknown): void => {
    switch (nodeKind(literal as { type: string } | null)) {
      case 'Literal':
        printLiteral(literal as LiteralSource)
        break
      case 'TemplateLiteral':
        printTemplateLiteral(literal as unknown as TemplateLiteral)
        break
      case 'UnaryExpression':
        printTSLiteralUnary(literal as unknown as UnaryExpression)
        break
      default:
        printNode(literal as { type: string }, PREC.Sequence)
    }
  }

  const printTSLiteralUnary = (unary: UnaryExpression): void => {
    out += unary.operator
    printLiteral(unary.argument as unknown as LiteralSource)
  }

  const printJSDocPostfixModifier = (
    node: { readonly postfix?: boolean | null; readonly typeAnnotation: TSType },
    marker: string,
  ): void => {
    switch (Boolean(node.postfix)) {
      case true:
        doPrintTSType(node.typeAnnotation)
        out += marker
        break
      default:
        out += marker
        doPrintTSType(node.typeAnnotation)
    }
  }

  const printTSTypeName = (name: IdentifierReference | TSQualifiedName | { type: string }): void => {
    switch (nodeKind(name)) {
      case 'TSQualifiedName': {
        const qualified = name as TSQualifiedName
        printTSTypeName(qualified.left)
        out += `.${qualified.right.name}`
        break
      }
      default:
        out += tSTypeNameLeafText(name)
    }
  }

  const tSTypeNameLeafText = (name: IdentifierReference | { type: string }): string => {
    switch (nodeKind(name)) {
      case 'Identifier':
        return (name as IdentifierReference).name
      case 'ThisExpression':
        return 'this'
      default:
        return sequenceNodeText(name as { type: string })
    }
  }

  const printTSImportTypeQualifier = (qualifier: TSImportType['qualifier']): void => {
    switch (nodeKind(qualifier as { type: string } | null)) {
      case ABSENT_NODE_KIND:
        break
      case 'Identifier':
        out += (qualifier as IdentifierName).name
        break
      default: {
        const qualified = qualifier as unknown as {
          readonly left: TSImportType['qualifier']
          readonly right: IdentifierName
        }
        printTSImportTypeQualifier(qualified.left)
        out += `.${qualified.right.name}`
      }
    }
  }

  const printTSTypeAnnotation = (node: TSTypeAnnotation): void => {
    out += ': '
    doPrintTSType(node.typeAnnotation)
  }

  const printTSTypeParameterDeclaration = (node: TSTypeParameterDeclaration): void => {
    out += `<${node.params.map((param) => capture(() => printTSTypeParameter(param))).join(', ')}>`
  }

  const printTSTypeParameterInstantiation = (node: TSTypeParameterInstantiation): void => {
    out += `<${node.params.map((param) => printTSTypeToString(param)).join(', ')}>`
  }

  const printTSTypeParameter = (node: TSTypeParameterFields): void => {
    out += typeParameterModifiersText(node)
    out += node.name.name
    printTypeClause(' extends ', node.constraint)
    printTypeClause(' = ', node.default)
  }
  return { printProgram, printAnyNode, printTSType, printTSTypeToString }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TS_TYPE_NODE_KINDS: Readonly<Record<string, true>> = {
  TSAnyKeyword: true,
  TSStringKeyword: true,
  TSBooleanKeyword: true,
  TSNumberKeyword: true,
  TSBigIntKeyword: true,
  TSSymbolKeyword: true,
  TSVoidKeyword: true,
  TSUndefinedKeyword: true,
  TSNullKeyword: true,
  TSNeverKeyword: true,
  TSUnknownKeyword: true,
  TSObjectKeyword: true,
  TSIntrinsicKeyword: true,
  TSThisType: true,
  TSTypeReference: true,
  TSUnionType: true,
  TSIntersectionType: true,
  TSArrayType: true,
  TSTypeLiteral: true,
  TSTupleType: true,
  TSNamedTupleMember: true,
  TSOptionalType: true,
  TSRestType: true,
  TSConditionalType: true,
  TSInferType: true,
  TSTypeQuery: true,
  TSImportType: true,
  TSTypeOperator: true,
  TSMappedType: true,
  TSTemplateLiteralType: true,
  TSFunctionType: true,
  TSConstructorType: true,
  TSTypePredicate: true,
  TSIndexedAccessType: true,
  TSLiteralType: true,
  TSParenthesizedType: true,
  TSJSDocNullableType: true,
  TSJSDocNonNullableType: true,
  TSJSDocUnknownType: true,
}

function isTSTypeNode(kind: string): boolean {
  return TS_TYPE_NODE_KINDS[kind] === true
}

function precOf(node: Expression): number {
  switch (node.type) {
    case 'SequenceExpression':
      return PREC.Sequence
    case 'AssignmentExpression':
      return PREC.Assignment
    case 'ConditionalExpression':
      return PREC.Conditional
    case 'LogicalExpression':
      return logicalPrec((node as LogicalExpression).operator)
    case 'BinaryExpression':
      return binaryPrec((node as BinaryExpression).operator)
    case 'UnaryExpression':
    case 'AwaitExpression':
    case 'YieldExpression':
      return PREC.Unary
    case 'UpdateExpression':
      return PREC.Update
    case 'CallExpression':
    case 'NewExpression':
    case 'TaggedTemplateExpression':
    case 'ImportExpression':
      return PREC.Call
    case 'MemberExpression':
    case 'ChainExpression':
      return PREC.Member
    default:
      return PREC.Primary
  }
}

const EVERY_COMMENT_POSITION = Number.POSITIVE_INFINITY

const END_OF_COMMENTS: Comment = {
  type: 'Line',
  value: '',
  start: EVERY_COMMENT_POSITION,
  end: EVERY_COMMENT_POSITION,
}

function sortedCommentsWithoutHashbang(
  comments: readonly Comment[] | undefined,
  hashbang: Hashbang | null,
): readonly Comment[] {
  const list = comments ?? []
  return [...withoutHashbangComment(list, hashbang)].sort((a, b) => a.start - b.start)
}

function withoutHashbangComment(comments: readonly Comment[], hashbang: Hashbang | null): readonly Comment[] {
  switch (hashbang) {
    case null:
      return comments
    default: {
      const { start } = hashbang
      return comments.filter((comment) => !(comment.type === 'Line' && comment.start === start))
    }
  }
}

const ABSENT_NODE_KIND = '\u0000absent'
const ABSENT_NODE: { type: string } = { type: ABSENT_NODE_KIND }

function nodeKind(node: { type: string } | null | undefined): string {
  return (node ?? ABSENT_NODE).type
}

type PropertyFields = {
  readonly kind?: string
  readonly method?: boolean
  readonly shorthand?: boolean
  readonly computed?: boolean
  readonly async?: boolean
  readonly generator?: boolean
  readonly key: { readonly type: string }
  readonly value: { readonly type: string } | null
}

function propertyForm(fields: PropertyFields): string {
  switch (true) {
    case fields.kind === 'get':
    case fields.kind === 'set':
      return 'accessor'
    case fields.method === true:
      return 'method'
    case isShorthandMatch(fields):
      return 'shorthand'
    case isShorthandDefaultMatch(fields):
      return 'shorthandDefault'
    default:
      return 'verbose'
  }
}

function isShorthandMatch(fields: PropertyFields): boolean {
  return fields.shorthand === true && namesMatch(identifierName(fields.key), identifierName(fields.value))
}

function isShorthandDefaultMatch(fields: PropertyFields): boolean {
  return fields.shorthand === true && namesMatch(identifierName(fields.key), defaultTargetName(fields.value))
}

function identifierName(node: { type: string } | null): string | undefined {
  switch (nodeKind(node)) {
    case 'Identifier':
      return (node as IdentifierName).name
    default:
      return undefined
  }
}

function defaultTargetName(node: { type: string } | null): string | undefined {
  switch (nodeKind(node)) {
    case 'AssignmentPattern':
      return identifierName((node as AssignmentPattern).left as { type: string })
    default:
      return undefined
  }
}

function namesMatch(key: string | undefined, value: string | undefined): boolean {
  switch (value) {
    case undefined:
      return false
    default:
      return key === value
  }
}

type AttachedComment = { readonly type: string; readonly value: string }

type MemberAccess = {
  readonly computed: boolean
  readonly optional: boolean
  readonly object: { readonly type: string }
  readonly property: { readonly type: string }
}

const MEMBER_OBJECT_WRAPPED_KINDS: Readonly<Record<string, true>> = {
  SequenceExpression: true,
  AssignmentExpression: true,
  ConditionalExpression: true,
  LogicalExpression: true,
  BinaryExpression: true,
  UnaryExpression: true,
  UpdateExpression: true,
  AwaitExpression: true,
  YieldExpression: true,
}

const CALLEE_WRAPPED_KINDS: Readonly<Record<string, true>> = {
  SequenceExpression: true,
  ConditionalExpression: true,
}

const UNARY_OPERAND_WRAPPED_KINDS: Readonly<Record<string, true>> = {
  BinaryExpression: true,
  LogicalExpression: true,
  ConditionalExpression: true,
  SequenceExpression: true,
}

const UNARY_WORD_OPERATORS: Readonly<Record<string, true>> = {
  typeof: true,
  void: true,
  delete: true,
}

function parenthesizedIf(wrap: boolean, text: string): string {
  switch (wrap) {
    case true:
      return `(${text})`
    default:
      return text
  }
}

function jsxAttributeNameText(name: JSXIdentifier | JSXNamespacedName): string {
  switch (name.type) {
    case 'JSXIdentifier':
      return (name as JSXIdentifier).name
    default:
      return `${(name as JSXNamespacedName).namespace.name}:${(name as JSXNamespacedName).name.name}`
  }
}

const BARE_DEFAULT_EXPORT_KINDS: Readonly<Record<string, true>> = {
  FunctionDeclaration: true,
  ClassDeclaration: true,
  TSInterfaceDeclaration: true,
}

const ARRAY_ELEMENT_WRAPPED_KINDS: Readonly<Record<string, true>> = {
  TSUnionType: true,
  TSIntersectionType: true,
}

type TSEnumMemberShape = { readonly id: { readonly type: string }; readonly initializer: unknown }

type TSTypeParameterFields = {
  readonly name: { readonly name: string }
  readonly constraint: TSType | null
  readonly default: TSType | null
  readonly in?: boolean
  readonly out?: boolean
  readonly const?: boolean
}

function typeParameterModifiersText(node: TSTypeParameterFields): string {
  return `${flagText(node.in, 'in ')}${flagText(node.out, 'out ')}${flagText(node.const, 'const ')}`
}

function typePredicateParameterText(parameterName: { type: string }): string {
  switch (parameterName.type) {
    case 'TSThisType':
      return 'this'
    default:
      return (parameterName as unknown as { name: string }).name
  }
}

function externalModuleArgumentText(value: string): string {
  switch (Boolean(value)) {
    case true:
      return JSON.stringify(value)
    default:
      return '""'
  }
}

type ExportNameNode = { readonly type: string; readonly name?: string; readonly value?: string }

const EXPORT_NAME_TEXTS: Readonly<Record<string, (name: ExportNameNode) => string>> = {
  Identifier: (name) => name.name ?? '',
  Literal: (name) => name.value ?? '',
}

function exportNameToString(name: ExportNameNode): string {
  const reader = EXPORT_NAME_TEXTS[name.type] ?? ((exported: ExportNameNode) => exported.value ?? '')
  return reader(name)
}

function importKindText(node: ImportDeclaration): string {
  return flagText(node.importKind === 'type', 'type ')
}

type ImportBinding = {
  readonly type: string
  readonly local: { readonly name: string }
  readonly imported?: { readonly type: string; readonly name?: string; readonly value?: string }
  readonly importKind?: string
}

function importBindingsText(specifiers: readonly ImportBinding[]): string {
  const parts = [
    defaultSpecifierText(specifiers),
    namespaceSpecifierText(specifiers),
    namedSpecifiersText(specifiers),
  ]
  return parts.filter((text) => text.length > 0).join(', ')
}

function defaultSpecifierText(specifiers: readonly ImportBinding[]): string {
  return importLocalName(specifiers.find((specifier) => specifier.type === 'ImportDefaultSpecifier'))
}

function namespaceSpecifierText(specifiers: readonly ImportBinding[]): string {
  const name = importLocalName(specifiers.find((specifier) => specifier.type === 'ImportNamespaceSpecifier'))
  return flagText(name, `* as ${name}`)
}

function namedSpecifiersText(specifiers: readonly ImportBinding[]): string {
  const rendered = specifiers
    .filter((specifier) => specifier.type === 'ImportSpecifier')
    .map((specifier) => namedSpecifierText(specifier))
    .join(', ')
  return flagText(rendered, `{ ${rendered} }`)
}

function namedSpecifierText(specifier: ImportBinding): string {
  const alias = exportAliasText(importedNameText(specifier.imported), specifier.local.name)
  return `${flagText(specifier.importKind === 'type', 'type ')}${alias}`
}

function importLocalName(specifier: ImportBinding | undefined): string {
  switch (nodeKind(specifier as { type: string } | null)) {
    case ABSENT_NODE_KIND:
      return ''
    default:
      return (specifier as ImportBinding).local.name
  }
}

function importedNameText(imported: ImportBinding['imported']): string {
  switch (nodeKind(imported as { type: string } | null)) {
    case 'Identifier':
      return (imported as { name: string }).name
    default:
      return (imported as { value: string }).value
  }
}

function exportAliasText(localName: string, exportedName: string): string {
  switch (localName === exportedName) {
    case true:
      return localName
    default:
      return `${localName} as ${exportedName}`
  }
}

function exportSpecifierText(specifier: {
  readonly local: ExportNameNode
  readonly exported: ExportNameNode
  readonly exportKind?: string
}): string {
  const alias = exportAliasText(exportNameToString(specifier.local), exportNameToString(specifier.exported))
  return `${flagText(specifier.exportKind === 'type', 'type ')}${alias}`
}

function exportedNameClauseText(exported: ExportNameNode | null | undefined): string {
  switch (nodeKind(exported as { type: string } | null)) {
    case ABSENT_NODE_KIND:
      return ''
    default:
      return ` as ${exportNameToString(exported as ExportNameNode)}`
  }
}

function importAttributesText(attrs: readonly ImportAttribute[]): string {
  const rendered = attrs.map((attribute) => importAttributeText(attribute)).join(', ')
  return flagText(rendered, ` with { ${rendered} }`)
}

function importAttributeText(attribute: ImportAttribute): string {
  return `${importAttrKeyText(attribute.key)}: ${JSON.stringify(attribute.value.value)}`
}

function importAttrKeyText(key: ImportAttribute['key']): string {
  switch (key.type) {
    case 'Identifier':
      return (key as IdentifierName).name
    default:
      return JSON.stringify((key as { value: string }).value)
  }
}

function bareArrowParamName(node: ArrowFunctionExpression): string {
  const name = singleParamName(node)
  switch (name) {
    case '':
      return ''
    default:
      return flagText(node.returnType == null, name)
  }
}

function singleParamName(node: ArrowFunctionExpression): string {
  switch (node.params.length) {
    case 1:
      return bareParameterName(node.params[0])
    default:
      return ''
  }
}

function bareParameterName(param: unknown): string {
  const fields = param as
    | { readonly type?: string; readonly typeAnnotation?: unknown; readonly name?: string }
    | undefined
  switch (true) {
    case fields === undefined:
      return ''
    case fields!.type !== 'Identifier':
      return ''
    case fields!.typeAnnotation != null:
      return ''
    case fields!.name === undefined:
      return ''
    default:
      return fields!.name
  }
}

function arrowBodyIsBlock(body: unknown): boolean {
  return nodeKind(body as { type: string } | null) === 'BlockStatement'
}

function functionHeaderText(node: FunctionNode): string {
  return `${flagText(node.declare, 'declare ')}${flagText(node.async, 'async ')}function${
    flagText(node.generator, '*')
  }${namedDeclarationText(node)}`
}

function namedDeclarationText(node: { readonly id?: { readonly name: string } | null }): string {
  switch (Boolean(node.id)) {
    case true:
      return ` ${(node.id as { name: string }).name}`
    default:
      return ''
  }
}

type BindingIdFields = {
  readonly type?: string
  readonly name?: string
  readonly optional?: boolean
  readonly typeAnnotation?: TSTypeAnnotation | null
}

function bindingNameText(node: { readonly name?: string }): string {
  switch (node.name) {
    case undefined:
      return ''
    default:
      return node.name
  }
}

function parameterForm(param: Record<string, unknown>): string {
  switch (true) {
    case param['type'] === 'RestElement':
      return 'rest'
    case param['type'] === 'TSParameterProperty':
      return 'property'
    default:
      return 'formal'
  }
}

function parameterPropertyModifiers(param: Record<string, unknown>): string {
  const accessibility = param['accessibility'] as string | null | undefined
  return `${flagText(accessibility, `${accessibility} `)}${flagText(param['readonly'], 'readonly ')}${
    flagText(param['override'], 'override ')
  }${flagText(param['static'], 'static ')}`
}

function commentText(comment: AttachedComment): string {
  switch (comment.type) {
    case 'Block':
      return `/*${comment.value}*/`
    default:
      return `//${comment.value}`
  }
}

function methodDefinitionPrefix(node: MethodDefinition, fn: FunctionNode): string {
  return `${flagText(node.accessibility, `${node.accessibility} `)}${flagText(node.static, 'static ')}${
    flagText(node.override, 'override ')
  }${flagText(fn.async, 'async ')}${flagText(fn.generator, '*')}${methodKindText(node.kind)}`
}

function methodKindText(kind: string): string {
  switch (kind) {
    case 'get':
      return 'get '
    case 'set':
      return 'set '
    default:
      return ''
  }
}

function propertyDefinitionModifiers(node: PropertyDefinition): string {
  return `${flagText(node.declare, 'declare ')}${flagText(node.accessibility, `${node.accessibility} `)}${
    flagText(node.static, 'static ')
  }${flagText(node.readonly, 'readonly ')}${flagText(node.override, 'override ')}`
}

type LiteralSource = {
  readonly value: unknown
  readonly raw: string | null
  readonly bigint?: string
  readonly regex?: { readonly pattern: string; readonly flags: string }
}

function literalText(node: LiteralSource): string {
  switch (true) {
    case node.raw != null:
      return node.raw
    case node.regex != null:
      return `/${node.regex.pattern}/${node.regex.flags}`
    case node.bigint != null:
      return node.bigint
    default:
      return valueLiteralText(node.value)
  }
}

function valueLiteralText(value: unknown): string {
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value)
    case 'number':
    case 'boolean':
      return String(value)
    case 'bigint':
      return `${value}n`
    default:
      return 'null'
  }
}

function flagText(present: unknown, text: string): string {
  switch (Boolean(present)) {
    case true:
      return text
    default:
      return ''
  }
}
