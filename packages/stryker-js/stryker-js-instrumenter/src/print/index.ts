/**
 * Owned ESTree/TS-ESTree printer — renders oxc-parser ASTs back to source.
 *
 * Structural codegen: one case per node kind, precedence-aware, no span reliance.
 * Synthesized nodes without start/end print correctly.
 */

// oxlint-disable typescript/no-unsafe-type-assertion typescript/no-unnecessary-type-assertion typescript/no-non-null-assertion typescript/switch-exhaustiveness-check @systemfsoftware/structure/ban-classes

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
  const state = new PrintState(opts)
  // One boundary: the renderer's oxc-typed view of the same plain node tree.
  return state.printProgram(program as Program)
}

// Convenience: print any single node (used for synthesized replacement snippets)
export function printNode(node: unknown, opts: PrintOptions = {}): string {
  const state = new PrintState(opts)
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

class PrintState {
  private out = ''
  private indentLevel = 0
  private readonly hashbang: Hashbang | null
  private commentIdx = 0
  // Comments sorted by start position for ordered emission
  private readonly sortedComments: readonly Comment[]

  constructor(opts: PrintOptions) {
    this.hashbang = opts.hashbang ?? null
    this.sortedComments = [...sortedCommentsWithoutHashbang(opts.comments, this.hashbang), END_OF_COMMENTS]
  }

  printProgram(program: Program): string {
    this.out = ''
    this.indentLevel = 0
    this.commentIdx = 0

    this.printHashbang()

    // Leading comments: the sweep stops at the first statement, and bounds
    // nothing at all when the program carries none.
    this.emitCommentsBefore((program.body[0] as { start?: number } | undefined)?.start)
    this.printProgramBody(program.body)

    // Trailing comments
    this.emitCommentsBefore(undefined)

    return this.out
  }

  printAnyNode(node: { type: string }): string {
    this.out = ''
    this.indentLevel = 0
    this.printNode(node, PREC.Sequence)
    return this.out
  }

  // ---- comment interleaving ----

  private printHashbang(): void {
    if (this.hashbang) this.out += `#!${this.hashbang.value}\n`
  }

  private printProgramBody(body: readonly unknown[]): void {
    body.forEach((statement) => this.printProgramStatement(statement as { type: string; start?: number }))
  }

  private printProgramStatement(statement: { type: string; start?: number }): void {
    this.emitCommentsBefore(statement.start ?? -1)
    this.printStatement(statement as never)
    // Statement terminators: semicolons handled per-statement; ensure newline
    // between statements, and comments may sit between statements.
    this.out += '\n'
  }

  private printJumpStatement(keyword: string, label: LabelIdentifier | null): void {
    this.out += keyword
    if (label) this.out += ` ${label.name}`
    this.out += ';'
  }

  /** Emits every pending comment that starts before `pos`; an absent bound admits every comment. */
  private emitCommentsBefore(pos: number | undefined): void {
    this.emitPendingCommentsBefore(pos ?? EVERY_COMMENT_POSITION)
  }

  private emitPendingCommentsBefore(pos: number): void {
    for (
      let comment = this.sortedComments[this.commentIdx]!;
      comment.start < pos;
      comment = this.sortedComments[this.commentIdx]!
    ) {
      this.emitComment(comment)
      this.commentIdx++
    }
  }

  private emitComment(c: Comment): void {
    if (c.type === 'Line') {
      // c.value from oxc does NOT include leading //
      // But for Block comments, value is inner content
      // Check: Line value is " hello" for "// hello"
      this.out += `//${c.value}\n`
    } else {
      this.out += `/*${c.value}*/\n`
    }
  }

  // ---- indentation ----

  private indent(): string {
    return '  '.repeat(this.indentLevel)
  }

  private nl(): void {
    this.out += '\n'
  }

  /** Renders a fragment to a string without disturbing the pending output. */
  private capture(render: () => void): string {
    const saved = this.out
    this.out = ''
    render()
    const result = this.out
    this.out = saved
    return result
  }

  // ---- precedence-aware parens ----

  private needsParens(childPrec: number, parentPrec: number, isRight: boolean, op?: string): boolean {
    switch (childPrec === parentPrec) {
      case true:
        return this.equalPrecedenceNeedsParens(isRight, op)
      default:
        return childPrec < parentPrec
    }
  }

  /** Equal precedence — associativity decides. */
  private equalPrecedenceNeedsParens(isRight: boolean, op?: string): boolean {
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

  private wrapIfNeeded(
    node: { type: string },
    prec: number,
    parentPrec: number,
    isRight: boolean,
    op?: string,
  ): string {
    const inner = this.printExpressionToString(node as never, prec)
    if (this.needsParens(prec, parentPrec, isRight, op)) return `(${inner})`
    return inner
  }

  private printExpressionToString(node: Expression, prec: number): string {
    return this.capture(() => this.printNode(node as unknown as { type: string }, prec))
  }

  private sequenceNodeText(node: { type: string }): string {
    return this.capture(() => this.printNode(node, PREC.Sequence))
  }

  private assignmentNodeText(node: { type: string }): string {
    return this.capture(() => this.printNode(node, PREC.Assignment))
  }

  private nodeListText(nodes: readonly { type: string }[], prec: number): string {
    return nodes.map((node) => this.capture(() => this.printNode(node, prec))).join(', ')
  }

  private wrappedExpressionText(
    node: { type: string },
    prec: number,
    wrappedKinds: Readonly<Record<string, true>>,
  ): string {
    const printed = this.printExpressionToString(node as unknown as Expression, prec)
    switch (wrappedKinds[node.type] === true) {
      case true:
        return `(${printed})`
      default:
        return printed
    }
  }

  // ---- generic dispatch ----

  private printNode(node: { type: string } | null | undefined, prec: number): void {
    const kind = nodeKind(node)
    switch (kind) {
      case ABSENT_NODE_KIND:
        return
      // oxc uses "Literal" for all literal kinds; delegate to literal printer
      case 'Literal':
        this.printLiteral(node as never)
        break
      // Expressions
      case 'Identifier':
        this.printIdentifier(node as never)
        break
      case 'PrivateIdentifier':
        this.out += `#${(node as PrivateIdentifier).name}`
        break
      case 'ThisExpression':
        this.out += 'this'
        break
      case 'Super':
        this.out += 'super'
        break
      case 'ArrayExpression':
        this.printArrayExpression(node as ArrayExpression)
        break
      case 'ObjectExpression':
        this.printObjectExpression(node as ObjectExpression)
        break
      case 'Property':
        this.printProperty(node as never)
        break
      case 'TemplateLiteral':
        this.printTemplateLiteral(node as TemplateLiteral)
        break
      case 'TemplateElement':
        // handled inside TemplateLiteral / TSTemplateLiteralType
        this.out += (node as TemplateElement).value.raw
        break
      case 'TaggedTemplateExpression':
        this.printTaggedTemplate(node as TaggedTemplateExpression)
        break
      case 'MemberExpression':
        this.printMemberExpression(node as MemberExpression, prec)
        break
      case 'CallExpression':
        this.printCallExpression(node as CallExpression, prec)
        break
      case 'NewExpression':
        this.printNewExpression(node as NewExpression, prec)
        break
      case 'MetaProperty':
        this.printMetaProperty(node as MetaProperty)
        break
      case 'SpreadElement':
        this.out += '...'
        this.printNode((node as SpreadElement).argument as unknown as { type: string }, PREC.Assignment)
        break
      case 'RestElement':
        this.out += '...'
        this.printNode(
          (node as BindingRestElement).argument as unknown as { type: string },
          PREC.Assignment,
        )
        break
      case 'UpdateExpression':
        this.printUpdateExpression(node as UpdateExpression, prec)
        break
      case 'UnaryExpression':
        this.printUnaryExpression(node as UnaryExpression, prec)
        break
      case 'BinaryExpression':
        this.printBinaryExpression(node as BinaryExpression, prec)
        break
      case 'LogicalExpression':
        this.printLogicalExpression(node as LogicalExpression, prec)
        break
      case 'ConditionalExpression':
        this.printConditionalExpression(node as ConditionalExpression, prec)
        break
      case 'AssignmentExpression':
        this.printAssignmentExpression(node as AssignmentExpression, prec)
        break
      case 'AssignmentPattern':
        this.printAssignmentPattern(node as AssignmentPattern, prec)
        break
      case 'ObjectPattern':
        this.printObjectPattern(node as never)
        break
      case 'ArrayPattern':
        this.printArrayPattern(node as ArrayPattern)
        break
      case 'SequenceExpression':
        this.printSequenceExpression(node as SequenceExpression, prec)
        break
      case 'AwaitExpression':
        this.out += 'await '
        this.printNode(
          (node as YieldExpression & { argument: Expression }).argument as unknown as {
            type: string
          },
          PREC.Unary,
        )
        break
      case 'YieldExpression':
        this.printYieldExpression(node as YieldExpression, prec)
        break
      case 'ChainExpression':
        this.printNode(
          (node as unknown as { expression: { type: string } }).expression as { type: string },
          prec,
        )
        break
      case 'ParenthesizedExpression':
        this.out += '('
        this.printNode(
          (node as unknown as { expression: { type: string } }).expression as { type: string },
          PREC.Sequence,
        )
        this.out += ')'
        break
      case 'ImportExpression':
        this.printImportExpression(node as never)
        break
      case 'V8IntrinsicExpression':
        this.printV8Intrinsic(node as never)
        break
      case 'ArrowFunctionExpression':
        this.printArrowFunction(node as ArrowFunctionExpression, prec)
        break
      case 'FunctionExpression':
      case 'FunctionDeclaration':
      case 'TSDeclareFunction':
      case 'TSEmptyBodyFunctionExpression':
        this.printFunction(node as FunctionNode, prec)
        break
      case 'ClassDeclaration':
      case 'ClassExpression':
        this.printClass(node as Class, prec)
        break
      case 'JSXElement':
        this.printJSXElement(node as JSXElement)
        break
      case 'JSXFragment':
        this.printJSXFragment(node as JSXFragment)
        break
      case 'JSXOpeningElement':
        this.printJSXOpeningElement(node as JSXOpeningElement)
        break
      case 'JSXClosingElement':
        // handled in JSXElement
        break
      case 'JSXIdentifier':
        this.out += (node as JSXIdentifier).name
        break
      case 'JSXNamespacedName':
        this.out += `${(node as JSXNamespacedName).namespace.name}:${(node as JSXNamespacedName).name.name}`
        break
      case 'JSXMemberExpression':
        this.printJSXMemberExpression(node as JSXMemberExpression)
        break
      case 'JSXAttribute':
        this.printJSXAttribute(node as JSXAttribute)
        break
      case 'JSXSpreadAttribute':
        this.out += '{...'
        this.printNode((node as JSXSpreadAttribute).argument as unknown as { type: string }, PREC.Assignment)
        this.out += '}'
        break
      case 'JSXExpressionContainer':
        this.out += '{'
        this.printNode(
          (node as JSXExpressionContainer).expression as unknown as { type: string },
          PREC.Sequence,
        )
        this.out += '}'
        break
      case 'JSXEmptyExpression':
        break
      case 'JSXText':
        this.out += (node as JSXText).value
        break
      case 'JSXSpreadChild':
        this.out += '{...'
        this.printNode(
          (node as JSXSpreadChild).expression as unknown as { type: string },
          PREC.Assignment,
        )
        this.out += '}'
        break
      // TS expressions
      case 'TSAsExpression':
        this.printTSAsExpression(node as TSAsExpression, prec)
        break
      case 'TSSatisfiesExpression':
        this.printTSSatisfiesExpression(node as TSSatisfiesExpression, prec)
        break
      case 'TSTypeAssertion':
        this.printTSTypeAssertion(node as TSTypeAssertion, prec)
        break
      case 'TSNonNullExpression':
        this.printNode(
          (node as TSNonNullExpression).expression as unknown as { type: string },
          PREC.Member,
        )
        this.out += '!'
        break
      case 'TSInstantiationExpression':
        this.printTSInstantiationExpression(node as TSInstantiationExpression, prec)
        break
      // Statements
      case 'BlockStatement':
        this.printBlockStatement(node as BlockStatement)
        break
      case 'EmptyStatement':
        this.out += ';'
        break
      case 'ExpressionStatement':
        this.printExpressionStatement(node as ExpressionStatement)
        break
      case 'IfStatement':
        this.printIfStatement(node as IfStatement)
        break
      case 'DoWhileStatement':
        this.printDoWhileStatement(node as DoWhileStatement)
        break
      case 'WhileStatement':
        this.printWhileStatement(node as WhileStatement)
        break
      case 'ForStatement':
        this.printForStatement(node as ForStatement)
        break
      case 'ForInStatement':
        this.printForInStatement(node as ForInStatement)
        break
      case 'ForOfStatement':
        this.printForOfStatement(node as ForOfStatement)
        break
      case 'ContinueStatement':
        this.printJumpStatement('continue', (node as ContinueStatement).label)
        break
      case 'BreakStatement':
        this.printJumpStatement('break', (node as BreakStatement).label)
        break
      case 'ReturnStatement':
        this.printReturnStatement(node as ReturnStatement)
        break
      case 'WithStatement':
        this.printWithStatement(node as WithStatement)
        break
      case 'SwitchStatement':
        this.printSwitchStatement(node as SwitchStatement)
        break
      case 'SwitchCase':
        // handled in switch
        break
      case 'LabeledStatement':
        this.printLabeledStatement(node as LabeledStatement)
        break
      case 'ThrowStatement':
        this.out += 'throw '
        this.printNode((node as ThrowStatement).argument as unknown as { type: string }, PREC.Sequence)
        this.out += ';'
        break
      case 'TryStatement':
        this.printTryStatement(node as TryStatement)
        break
      case 'CatchClause':
        // handled in try
        break
      case 'DebuggerStatement':
        this.out += 'debugger;'
        break
      case 'VariableDeclaration':
        this.printVariableDeclaration(node as VariableDeclaration)
        break
      case 'VariableDeclarator':
        this.printVariableDeclarator(node as VariableDeclarator)
        break
      case 'ClassBody':
        this.printClassBody(node as ClassBody)
        break
      case 'MethodDefinition':
      case 'TSAbstractMethodDefinition':
        this.printMethodDefinition(node as MethodDefinition)
        break
      case 'PropertyDefinition':
      case 'TSAbstractPropertyDefinition':
        this.printPropertyDefinition(node as PropertyDefinition)
        break
      case 'AccessorProperty':
      case 'TSAbstractAccessorProperty':
        this.printAccessorProperty(node as AccessorProperty)
        break
      case 'StaticBlock':
        this.printStaticBlock(node as StaticBlock)
        break
      case 'ImportDeclaration':
        this.printImportDeclaration(node as ImportDeclaration)
        break
      case 'ExportNamedDeclaration':
        this.printExportNamedDeclaration(node as ExportNamedDeclaration)
        break
      case 'ExportDefaultDeclaration':
        this.printExportDefaultDeclaration(node as ExportDefaultDeclaration)
        break
      case 'ExportAllDeclaration':
        this.printExportAllDeclaration(node as ExportAllDeclaration)
        break
      case 'Decorator':
        this.out += '@'
        this.printNode((node as Decorator).expression as unknown as { type: string }, PREC.Member)
        break
      // TS Declarations / Types
      case 'TSTypeAliasDeclaration':
        this.printTSTypeAliasDeclaration(node as TSTypeAliasDeclaration)
        break
      case 'TSInterfaceDeclaration':
        this.printTSInterfaceDeclaration(node as TSInterfaceDeclaration)
        break
      case 'TSEnumDeclaration':
        this.printTSEnumDeclaration(node as TSEnumDeclaration)
        break
      case 'TSModuleDeclaration':
        this.printTSModuleDeclaration(node as TSModuleDeclaration)
        break
      case 'TSImportEqualsDeclaration':
        this.printTSImportEqualsDeclaration(node as TSImportEqualsDeclaration)
        break
      case 'TSExportAssignment':
        this.out += `export = `
        this.printNode(
          (node as TSExportAssignment).expression as unknown as { type: string },
          PREC.Sequence,
        )
        this.out += ';'
        break
      case 'TSNamespaceExportDeclaration':
        this.out += `export as namespace ${(node as TSNamespaceExportDeclaration).id.name};`
        break
      default:
        this.printUnclassifiedNode(node, kind)
        break
    }
  }

  /** TS type nodes and the wrappers that carry them, which oxc kinds apart from expressions. */
  private printUnclassifiedNode(node: { type: string } | null | undefined, kind: string): void {
    if (isTSTypeNode(kind)) {
      this.printTSType(node as unknown as TSType)
      return
    }
    this.printTypeHolderNode(node, kind)
  }

  private printTypeHolderNode(node: { type: string } | null | undefined, kind: string): void {
    switch (kind) {
      case 'TSTypeAnnotation':
        this.out += ': '
        this.printTSType((node as TSTypeAnnotation).typeAnnotation)
        break
      case 'TSTypeParameterDeclaration':
        this.printTSTypeParameterDeclaration(node as TSTypeParameterDeclaration)
        break
      case 'TSTypeParameterInstantiation':
        this.printTSTypeParameterInstantiation(node as TSTypeParameterInstantiation)
        break
      case 'TSTypeParameter':
        this.printTSTypeParameter(node as never)
        break
      default:
        // Unknown node — emit as comment for debuggability, still valid enough to not crash corpus run
        this.out += `/* unknown:${kind} */`
        break
    }
  }

  // -----------------------------------------------------------------------
  // Literals
  // -----------------------------------------------------------------------

  private printLiteral(node: LiteralSource): void {
    this.out += literalText(node)
  }

  private printIdentifier(
    node: IdentifierName | IdentifierReference | BindingIdentifier | LabelIdentifier,
  ): void {
    this.out += node.name
  }

  // -----------------------------------------------------------------------
  // Expressions
  // -----------------------------------------------------------------------

  private printArrayExpression(node: ArrayExpression): void {
    this.out += `[${node.elements.map((element) => this.arrayElementText(element)).join(', ')}]`
  }

  private arrayElementText(element: unknown): string {
    switch (element === null) {
      case true:
        return ''
      default:
        return this.assignmentNodeText(element as { type: string })
    }
  }

  private printObjectExpression(node: ObjectExpression): void {
    switch (node.properties.length) {
      case 0:
        this.out += '{}'
        break
      default:
        this.out += `{ ${this.nodeListText(node.properties, PREC.Sequence)} }`
    }
  }

  private printProperty(
    node:
      | ObjectProperty
      | BindingProperty
      | { type: 'Property'; key: unknown; value: unknown }
        & Record<
          string,
          unknown
        >,
  ): void {
    const fields = node as unknown as PropertyFields
    switch (propertyForm(fields)) {
      case 'accessor':
        this.out += `${fields.kind} `
        this.out += this.propertyKeyText(fields.key, fields.computed === true, PREC.Assignment)
        this.printFunctionValue(fields.value as unknown as FunctionNode)
        break
      case 'method':
        this.out += `${flagText(fields.async, 'async ')}${flagText(fields.generator, '*')}`
        this.out += this.propertyKeyText(fields.key, fields.computed === true, PREC.Assignment)
        this.printFunctionValue(fields.value as unknown as FunctionNode)
        break
      case 'shorthand':
        this.out += identifierName(fields.key)!
        break
      case 'shorthandDefault':
        this.printShorthandDefaultProperty(fields)
        break
      default:
        this.out += this.propertyKeyText(fields.key, fields.computed === true, PREC.Assignment)
        this.out += ': '
        this.printNode(fields.value, PREC.Assignment)
        break
    }
  }

  private printShorthandDefaultProperty(fields: PropertyFields): void {
    const right = this.assignmentNodeText((fields.value as unknown as AssignmentPattern).right as { type: string })
    this.out += `${identifierName(fields.key)!} = ${right}`
  }

  private propertyKeyText(key: { type: string }, computed: boolean, computedPrec: number): string {
    switch (computed) {
      case true:
        return `[${this.capture(() => this.printNode(key, computedPrec))}]`
      default:
        return this.plainPropertyKeyText(key)
    }
  }

  private plainPropertyKeyText(key: { type: string }): string {
    switch (key.type) {
      case 'Identifier':
        return (key as IdentifierName).name
      case 'PrivateIdentifier':
        return `#${(key as PrivateIdentifier).name}`
      case 'Literal':
        return this.capture(() => this.printLiteral(key as never))
      default:
        return this.capture(() => this.printNode(key, PREC.Assignment))
    }
  }

  private printPropertyKeyForClass(key: { type: string }, computed: boolean): void {
    this.out += this.propertyKeyText(key, computed, PREC.Sequence)
  }

  private printFunctionValue(fn: FunctionNode): void {
    // fn is a Function node used as method value
    if (!fn) return
    this.printFunctionTail(fn)
  }

  private printFunctionTail(fn: FunctionNode): void {
    this.out += this.typeParametersText(fn.typeParameters)
    this.out += `(${this.paramsText(fn.params)})`
    this.out += this.typeAnnotationText(fn.returnType)
    this.out += this.functionBodyText(fn)
  }

  private functionBodyText(fn: FunctionNode): string {
    switch (Boolean(fn.body)) {
      case true:
        return ` ${this.capture(() => this.printBlockStatement(fn.body as BlockStatement))}`
      default:
        return ';'
    }
  }

  private paramsText(params: readonly unknown[]): string {
    return this.capture(() => this.printParams(params))
  }

  private typeParametersText(params: TSTypeParameterDeclaration | null | undefined): string {
    switch (Boolean(params)) {
      case true:
        return this.capture(() => this.printTSTypeParameterDeclaration(params as TSTypeParameterDeclaration))
      default:
        return ''
    }
  }

  private typeArgumentsText(args: TSTypeParameterInstantiation | null | undefined): string {
    switch (Boolean(args)) {
      case true:
        return this.capture(() => this.printTSTypeParameterInstantiation(args as TSTypeParameterInstantiation))
      default:
        return ''
    }
  }

  private typeAnnotationText(annotation: TSTypeAnnotation | null | undefined): string {
    switch (Boolean(annotation)) {
      case true:
        return this.capture(() => this.printTSTypeAnnotation(annotation as TSTypeAnnotation))
      default:
        return ''
    }
  }

  private printTemplateLiteral(node: TemplateLiteral): void {
    this.out += `\`${
      node.quasis
        .map((quasi, index) => this.quasiText(quasi, node.expressions[index] as unknown as { type: string }))
        .join('')
    }\``
  }

  private quasiText(quasi: TemplateElement, expression: { type: string }): string {
    switch (quasi.tail) {
      case true:
        return quasi.value.raw
      default:
        return `${quasi.value.raw}\${${this.sequenceNodeText(expression)}}`
    }
  }

  private printTaggedTemplate(node: TaggedTemplateExpression): void {
    this.printNode(node.tag as unknown as { type: string }, PREC.Member)
    if (node.typeArguments) this.printTSTypeParameterInstantiation(node.typeArguments)
    this.printTemplateLiteral(node.quasi)
  }

  private printMemberExpression(node: MemberExpression, _prec: number): void {
    const access = node as unknown as MemberAccess
    this.out += this.wrappedExpressionText(access.object, PREC.Member, MEMBER_OBJECT_WRAPPED_KINDS)
    this.out += flagText(access.optional, '?.')
    this.out += this.memberSelectorText(access)
  }

  private memberSelectorText(access: MemberAccess): string {
    switch (access.computed) {
      case true:
        return `[${this.sequenceNodeText(access.property)}]`
      default:
        return `${flagText(!access.optional, '.')}${this.memberPropertyText(access.property)}`
    }
  }

  private memberPropertyText(property: { type: string }): string {
    switch (property.type) {
      case 'Identifier':
        return (property as IdentifierName).name
      case 'PrivateIdentifier':
        return `#${(property as PrivateIdentifier).name}`
      default:
        return this.sequenceNodeText(property)
    }
  }

  private printCallExpression(node: CallExpression, _prec: number): void {
    this.out += this.wrappedExpressionText(node.callee as { type: string }, PREC.Member, CALLEE_WRAPPED_KINDS)
    this.out += flagText(node.optional, '?.')
    this.out += this.typeArgumentsText(node.typeArguments)
    this.out += `(${this.nodeListText(node.arguments, PREC.Assignment)})`
  }

  private printNewExpression(node: NewExpression, _prec: number): void {
    this.out += 'new '
    this.out += this.printExpressionToString(node.callee as Expression, PREC.Member)
    this.out += this.typeArgumentsText(node.typeArguments)
    this.out += `(${this.nodeListText(node.arguments, PREC.Assignment)})`
  }

  private printMetaProperty(node: MetaProperty): void {
    this.out += `${node.meta.name}.${node.property.name}`
  }

  private printV8Intrinsic(node: { name: IdentifierName; arguments: unknown[] }): void {
    this.out += `%${node.name.name}(${
      this.nodeListText(node.arguments as readonly { type: string }[], PREC.Assignment)
    })`
  }

  private printImportExpression(node: { source: Expression; options: Expression | null; phase: string | null }): void {
    this.out += `import${flagText(node.phase, `.${node.phase}`)}(`
    this.out += this.assignmentNodeText(node.source as unknown as { type: string })
    this.out += flagText(node.options, `, ${this.assignmentNodeText(node.options as unknown as { type: string })}`)
    this.out += ')'
  }

  private printUpdateExpression(node: UpdateExpression, _prec: number): void {
    const operand = this.wrappedExpressionText(
      node.argument as { type: string },
      PREC.Update,
      MEMBER_OBJECT_WRAPPED_KINDS,
    )
    switch (node.prefix) {
      case true:
        this.out += `${node.operator}${operand}`
        break
      default:
        this.out += `${operand}${node.operator}`
    }
  }

  private printUnaryExpression(node: UnaryExpression, _prec: number): void {
    this.out += node.operator
    this.out += flagText(UNARY_WORD_OPERATORS[node.operator] === true, ' ')
    this.out += this.wrappedExpressionText(
      node.argument as { type: string },
      PREC.Unary,
      UNARY_OPERAND_WRAPPED_KINDS,
    )
  }

  private printBinaryExpression(node: BinaryExpression, prec: number): void {
    const myPrec = binaryPrec(node.operator)
    const leftStr = this.wrapIfNeeded(
      node.left as unknown as { type: string },
      precOf(node.left as unknown as Expression),
      myPrec,
      false,
      node.operator,
    )
    const rightStr = this.wrapIfNeeded(
      node.right as unknown as { type: string },
      precOf(node.right as unknown as Expression),
      myPrec,
      true,
      node.operator,
    )
    // Need to parenthesize the whole if parent prec higher
    const whole = `${leftStr} ${node.operator} ${rightStr}`
    if (myPrec < prec) {
      this.out += `(${whole})`
    } else {
      this.out += whole
    }
  }

  private printLogicalExpression(node: LogicalExpression, prec: number): void {
    const myPrec = logicalPrec(node.operator)
    const leftStr = this.wrapIfNeeded(
      node.left as unknown as { type: string },
      precOf(node.left as unknown as Expression),
      myPrec,
      false,
      node.operator,
    )
    const rightStr = this.wrapIfNeeded(
      node.right as unknown as { type: string },
      precOf(node.right as unknown as Expression),
      myPrec,
      true,
      node.operator,
    )
    const whole = `${leftStr} ${node.operator} ${rightStr}`
    if (myPrec < prec) this.out += `(${whole})`
    else this.out += whole
  }

  private printConditionalExpression(node: ConditionalExpression, prec: number): void {
    const myPrec = PREC.Conditional
    const testStr = this.wrapIfNeeded(
      node.test as unknown as { type: string },
      precOf(node.test as Expression),
      myPrec,
      false,
    )
    // consequent and alternate are assignment-prec
    const consStr = this.printExpressionToString(node.consequent, PREC.Assignment)
    const altStr = this.printExpressionToString(node.alternate, PREC.Assignment)
    const whole = `${testStr} ? ${consStr} : ${altStr}`
    if (myPrec < prec) this.out += `(${whole})`
    else this.out += whole
  }

  private printAssignmentExpression(node: AssignmentExpression, prec: number): void {
    const myPrec = PREC.Assignment
    const leftStr = this.printExpressionToString(node.left as unknown as Expression, myPrec)
    // right is right-associative
    const rightStr = this.printExpressionToString(node.right, myPrec - 0.1)
    const whole = `${leftStr} ${node.operator} ${rightStr}`
    if (myPrec < prec) this.out += `(${whole})`
    else this.out += whole
  }

  private printAssignmentPattern(node: AssignmentPattern, prec: number): void {
    const left = node.left as unknown as { typeAnnotation?: TSTypeAnnotation | null }
    const leftText = this.printExpressionToString(node.left as unknown as Expression, PREC.Assignment) +
      this.typeAnnotationText(left.typeAnnotation)
    const rightText = this.printExpressionToString(node.right, PREC.Assignment)
    this.out += parenthesizedIf(PREC.Assignment < prec, `${leftText} = ${rightText}`)
  }

  private printObjectPattern(node: { properties: { type: string }[] }): void {
    switch (node.properties.length) {
      case 0:
        this.out += '{}'
        break
      default:
        this.out += `{ ${this.nodeListText(node.properties, PREC.Sequence)} }`
    }
  }

  private printArrayPattern(node: ArrayPattern): void {
    this.out += `[${node.elements.map((element) => this.arrayElementText(element)).join(', ')}]`
  }

  private printSequenceExpression(node: SequenceExpression, prec: number): void {
    const whole = node.expressions
      .map((expression) => this.printExpressionToString(expression, PREC.Sequence))
      .join(', ')
    this.out += parenthesizedIf(PREC.Sequence < prec, whole)
  }

  private printYieldExpression(node: YieldExpression, _prec: number): void {
    switch (Boolean(node.delegate)) {
      case true:
        this.out += 'yield*'
        break
      default:
        this.out += 'yield'
    }
    this.out += flagText(node.argument, ` ${this.assignmentNodeText(node.argument as unknown as { type: string })}`)
  }

  private printArrowFunction(node: ArrowFunctionExpression, prec: number): void {
    const arrow = `${flagText(node.async, 'async ')}${this.typeParametersText(node.typeParameters)}` +
      `${this.arrowParamsText(node)}${this.typeAnnotationText(node.returnType)} => ${this.arrowBodyText(node)}`
    this.out += parenthesizedIf(PREC.Assignment < prec, arrow)
  }

  private arrowParamsText(node: ArrowFunctionExpression): string {
    const bareParam = bareArrowParamName(node)
    switch (bareParam.length) {
      case 0:
        return `(${this.paramsText(node.params)})`
      default:
        return bareParam
    }
  }

  private arrowBodyText(node: ArrowFunctionExpression): string {
    switch (arrowBodyIsBlock(node.body)) {
      case true:
        return this.capture(() => this.printBlockStatement(node.body as BlockStatement))
      default:
        return this.assignmentNodeText(node.body as unknown as { type: string })
    }
  }

  private printFunction(node: FunctionNode, _prec: number): void {
    this.out += functionHeaderText(node)
    this.printFunctionTail(node)
  }

  private printClass(node: Class, _prec: number): void {
    this.out += this.capture(() => this.printDecorators(node.decorators as Decorator[]))
    this.out += `${flagText(node.declare, 'declare ')}${flagText(node.abstract, 'abstract ')}class${
      namedDeclarationText(node)
    }`
    this.out += this.typeParametersText(node.typeParameters)
    this.out += this.classHeritageText(node)
    this.out += this.classImplementsText(node)
    this.out += ' '
    this.printClassBody(node.body)
  }

  private classHeritageText(node: Class): string {
    switch (Boolean(node.superClass)) {
      case true:
        return ` extends ${this.assignmentNodeText(node.superClass as unknown as { type: string })}${
          this.typeArgumentsText(node.superTypeArguments)
        }`
      default:
        return ''
    }
  }

  private classImplementsText(node: Class): string {
    const rendered = (node.implements ?? []).map((heritage) => this.heritageText(heritage)).join(', ')
    return flagText(rendered, ` implements ${rendered}`)
  }

  private heritageText(heritage: {
    readonly expression: unknown
    readonly typeArguments?: TSTypeParameterInstantiation | null
  }): string {
    return `${this.assignmentNodeText(heritage.expression as { type: string })}${
      this.typeArgumentsText(heritage.typeArguments)
    }`
  }

  private printDecorators(decorators: readonly Decorator[] | undefined): void {
    const rendered = (decorators ?? []).map((decorator) => this.decoratorText(decorator)).join(' ')
    this.out += flagText(rendered, `${rendered} `)
  }

  private decoratorText(decorator: Decorator): string {
    return `@${this.capture(() => this.printNode(decorator.expression as unknown as { type: string }, PREC.Member))}`
  }

  // -----------------------------------------------------------------------
  // JSX
  // -----------------------------------------------------------------------

  private printJSXElement(node: JSXElement): void {
    this.printJSXOpeningElement(node.openingElement)
    node.children.forEach((child) => this.printJSXChild(child))
    this.printJSXClosingElement(node)
  }

  private printJSXClosingElement(node: JSXElement): void {
    if (!node.closingElement) return
    this.out += `</${this.jsxElementNameText(node.closingElement.name)}>`
  }

  private printJSXFragment(node: JSXFragment): void {
    this.out += '<>'
    for (const child of node.children) {
      this.printJSXChild(child)
    }
    this.out += '</>'
  }

  private printJSXOpeningElement(node: JSXOpeningElement): void {
    this.out += `<${this.jsxElementNameText(node.name)}`
    this.out += this.typeArgumentsText(node.typeArguments)
    this.out += node.attributes
      .map((attribute) => ` ${this.sequenceNodeText(attribute as unknown as { type: string })}`)
      .join('')
    switch (node.selfClosing) {
      case true:
        this.out += ' />'
        break
      default:
        this.out += '>'
    }
  }

  private jsxElementNameText(name: JSXIdentifier | JSXNamespacedName | JSXMemberExpression): string {
    switch (name.type) {
      case 'JSXIdentifier':
        return (name as JSXIdentifier).name
      case 'JSXNamespacedName':
        return `${(name as JSXNamespacedName).namespace.name}:${(name as JSXNamespacedName).name.name}`
      default:
        return this.capture(() => this.printJSXMemberExpression(name as JSXMemberExpression))
    }
  }

  private printJSXMemberExpression(node: JSXMemberExpression): void {
    const obj = node.object
    if (obj.type === 'JSXIdentifier') {
      this.out += `${(obj as JSXIdentifier).name}.${node.property.name}`
    } else {
      this.printJSXMemberExpression(obj as JSXMemberExpression)
      this.out += `.${node.property.name}`
    }
  }

  private printJSXAttribute(node: JSXAttribute): void {
    this.out += jsxAttributeNameText(node.name)
    this.out += this.jsxAttributeValueClauseText(node.value)
  }

  private jsxAttributeValueClauseText(value: { type: string } | null): string {
    switch (nodeKind(value)) {
      case ABSENT_NODE_KIND:
        return ''
      default:
        return `=${this.jsxAttributeValueText(value as { type: string })}`
    }
  }

  private jsxAttributeValueText(value: { type: string }): string {
    switch (value.type) {
      case 'Literal':
        return this.capture(() => this.printLiteral(value as never))
      case 'JSXExpressionContainer': {
        const container = value as unknown as { readonly expression: { readonly type: string } }
        return `{${this.sequenceNodeText(container.expression)}}`
      }
      default:
        return this.sequenceNodeText(value)
    }
  }

  private printJSXChild(child: { type: string }): void {
    switch (child.type) {
      case 'JSXText':
        this.out += (child as JSXText).value
        break
      case 'JSXElement':
        this.printJSXElement(child as JSXElement)
        break
      case 'JSXFragment':
        this.printJSXFragment(child as JSXFragment)
        break
      case 'JSXExpressionContainer':
        this.out += '{'
        this.printNode(
          (child as JSXExpressionContainer).expression as unknown as { type: string },
          PREC.Sequence,
        )
        this.out += '}'
        break
      case 'JSXSpreadChild':
        this.out += '{...'
        this.printNode((child as JSXSpreadChild).expression as unknown as { type: string }, PREC.Assignment)
        this.out += '}'
        break
      default:
        this.printNode(child, PREC.Sequence)
        break
    }
  }

  // -----------------------------------------------------------------------
  // TS expressions
  // -----------------------------------------------------------------------

  private printTSAsExpression(node: TSAsExpression, prec: number): void {
    const myPrec = PREC.Relational // as is low
    const exprStr = this.printExpressionToString(node.expression, myPrec)
    const typeStr = this.printTSTypeToString(node.typeAnnotation)
    const whole = `${exprStr} as ${typeStr}`
    if (myPrec < prec) this.out += `(${whole})`
    else this.out += whole
  }

  private printTSSatisfiesExpression(node: TSSatisfiesExpression, prec: number): void {
    const myPrec = PREC.Relational
    const exprStr = this.printExpressionToString(node.expression, myPrec)
    const typeStr = this.printTSTypeToString(node.typeAnnotation)
    const whole = `${exprStr} satisfies ${typeStr}`
    if (myPrec < prec) this.out += `(${whole})`
    else this.out += whole
  }

  private printTSTypeAssertion(node: TSTypeAssertion, _prec: number): void {
    this.out += `<${this.printTSTypeToString(node.typeAnnotation)}>`
    this.printNode(node.expression as unknown as { type: string }, PREC.Unary)
  }

  private printTSInstantiationExpression(node: TSInstantiationExpression, _prec: number): void {
    this.printNode(node.expression as unknown as { type: string }, PREC.Member)
    this.printTSTypeParameterInstantiation(node.typeArguments)
  }

  // -----------------------------------------------------------------------
  // Statements
  // -----------------------------------------------------------------------

  private printStatement(node: unknown): void {
    const n = node as { type: string }
    this.printAttachedComments(n, 'leadingComments')
    switch (n.type) {
      case 'BlockStatement':
        this.printBlockStatement(n as BlockStatement)
        break
      case 'VariableDeclaration':
        this.printVariableDeclaration(n as VariableDeclaration)
        this.out += ';'
        break
      case 'FunctionDeclaration':
      case 'TSDeclareFunction':
        this.printFunction(n as FunctionNode, PREC.Sequence)
        break
      case 'ClassDeclaration':
        this.printClass(n as Class, PREC.Sequence)
        break
      case 'ExpressionStatement':
        this.printExpressionStatement(n as ExpressionStatement)
        break
      case 'IfStatement':
        this.printIfStatement(n as IfStatement)
        break
      case 'ForStatement':
        this.printForStatement(n as ForStatement)
        break
      case 'ForInStatement':
        this.printForInStatement(n as ForInStatement)
        break
      case 'ForOfStatement':
        this.printForOfStatement(n as ForOfStatement)
        break
      case 'WhileStatement':
        this.printWhileStatement(n as WhileStatement)
        break
      case 'DoWhileStatement':
        this.printDoWhileStatement(n as DoWhileStatement)
        break
      case 'ReturnStatement':
        this.printReturnStatement(n as ReturnStatement)
        break
      case 'ThrowStatement':
        this.out += 'throw '
        this.printNode((n as ThrowStatement).argument as unknown as { type: string }, PREC.Sequence)
        this.out += ';'
        break
      case 'TryStatement':
        this.printTryStatement(n as TryStatement)
        break
      case 'SwitchStatement':
        this.printSwitchStatement(n as SwitchStatement)
        break
      case 'LabeledStatement':
        this.printLabeledStatement(n as LabeledStatement)
        break
      case 'BreakStatement':
      case 'ContinueStatement':
      case 'DebuggerStatement':
      case 'EmptyStatement':
        this.printNode(n, PREC.Sequence)
        break
      case 'WithStatement':
        this.printWithStatement(n as WithStatement)
        break
      case 'ImportDeclaration':
        this.printImportDeclaration(n as ImportDeclaration)
        break
      case 'ExportNamedDeclaration':
        this.printExportNamedDeclaration(n as ExportNamedDeclaration)
        break
      case 'ExportDefaultDeclaration':
        this.printExportDefaultDeclaration(n as ExportDefaultDeclaration)
        break
      case 'ExportAllDeclaration':
        this.printExportAllDeclaration(n as ExportAllDeclaration)
        break
      case 'TSTypeAliasDeclaration':
        this.printTSTypeAliasDeclaration(n as TSTypeAliasDeclaration)
        break
      case 'TSInterfaceDeclaration':
        this.printTSInterfaceDeclaration(n as TSInterfaceDeclaration)
        break
      case 'TSEnumDeclaration':
        this.printTSEnumDeclaration(n as TSEnumDeclaration)
        break
      case 'TSModuleDeclaration':
        this.printTSModuleDeclaration(n as TSModuleDeclaration)
        break
      case 'TSImportEqualsDeclaration':
        this.printTSImportEqualsDeclaration(n as TSImportEqualsDeclaration)
        break
      case 'TSExportAssignment':
      case 'TSNamespaceExportDeclaration':
        this.printNode(n, PREC.Sequence)
        break
      default:
        this.printUnhandledStatement(n)
    }
    this.printAttachedComments(n, 'trailingComments')
  }

  private printUnhandledStatement(node: { type: string }): void {
    if (!isTSTypeNode(node.type)) {
      // Silent corruption is worse than a loud failure: instrumented code
      // that dropped a statement would downgrade runs, not crash them.
      throw new Error(`Printer: unhandled statement kind ${node.type}`)
    }
    this.printTSType(node as unknown as TSType)
    this.out += ';'
  }

  /**
   * Emits the comments `attachComments` folded into the tree
   * (`leadingComments` before the statement, `trailingComments` on the
   * statement's last line). The flat `opts.comments` path only serves direct
   * `printProgram` calls on freshly parsed trees; instrumented trees carry
   * their comments attached to nodes.
   */
  private printAttachedComments(node: unknown, field: 'leadingComments' | 'trailingComments'): void {
    const comments = (node as Record<string, unknown>)[field]
    if (!Array.isArray(comments)) return
    comments.forEach((comment) => this.printAttachedComment(comment as AttachedComment, field))
  }

  private printAttachedComment(comment: AttachedComment, field: 'leadingComments' | 'trailingComments'): void {
    switch (field) {
      case 'leadingComments':
        this.out += `${this.indent()}${commentText(comment)}\n`
        break
      default:
        this.out += `${commentText(comment)} `
    }
  }

  private printBlockStatement(node: BlockStatement): void {
    switch (node.body.length) {
      case 0:
        this.out += '{}'
        break
      default:
        this.out += '{\n'
        this.out += this.indentedBodyText(node.body, (statement) => this.printStatement(statement as { type: string }))
        this.out += `${this.indent()}}`
    }
  }

  private printExpressionStatement(node: ExpressionStatement): void {
    // Directive already handled as expression statement with directive field
    if (node.directive) {
      this.out += JSON.stringify(node.directive) + ';'
      return
    }
    this.printNode(node.expression as unknown as { type: string }, PREC.Sequence)
    this.out += ';'
  }

  private printIfStatement(node: IfStatement): void {
    this.out += 'if ('
    this.printNode(node.test as unknown as { type: string }, PREC.Sequence)
    this.out += ') '
    this.printStatementOrBlock(node.consequent as unknown as { type: string })
    if (node.alternate) {
      this.out += ' else '
      this.printStatementOrBlock(node.alternate as unknown as { type: string })
    }
  }

  private printStatementOrBlock(node: { type: string }): void {
    if (node.type === 'BlockStatement') {
      this.printBlockStatement(node as BlockStatement)
    } else {
      // Single-statement without braces — indent not needed, but ensure correct
      this.printStatement(node)
    }
  }

  private printWhileStatement(node: WhileStatement): void {
    this.out += 'while ('
    this.printNode(node.test as unknown as { type: string }, PREC.Sequence)
    this.out += ') '
    this.printStatementOrBlock(node.body as unknown as { type: string })
  }

  private printDoWhileStatement(node: DoWhileStatement): void {
    this.out += 'do '
    this.printStatementOrBlock(node.body as unknown as { type: string })
    this.out += ' while ('
    this.printNode(node.test as unknown as { type: string }, PREC.Sequence)
    this.out += ');'
  }

  private printForStatement(node: ForStatement): void {
    this.out += 'for ('
    this.printDeclarationOrExpression(node.init)
    this.out += '; '
    this.out += this.optionalSequenceText(node.test)
    this.out += '; '
    this.out += this.optionalSequenceText(node.update)
    this.out += ') '
    this.printStatementOrBlock(node.body as unknown as { type: string })
  }

  private printDeclarationOrExpression(node: { type: string } | null | undefined): void {
    switch (nodeKind(node)) {
      case 'VariableDeclaration':
        this.printVariableDeclaration(node as VariableDeclaration)
        break
      case ABSENT_NODE_KIND:
        break
      default:
        this.printNode(node, PREC.Sequence)
    }
  }

  private optionalSequenceText(node: { type: string } | null | undefined): string {
    switch (nodeKind(node)) {
      case ABSENT_NODE_KIND:
        return ''
      default:
        return this.sequenceNodeText(node as { type: string })
    }
  }

  private printForInStatement(node: ForInStatement): void {
    this.out += 'for ('
    if ((node.left as { type: string }).type === 'VariableDeclaration') {
      this.printVariableDeclaration(node.left as VariableDeclaration)
    } else {
      this.printNode(node.left as unknown as { type: string }, PREC.Sequence)
    }
    this.out += ' in '
    this.printNode(node.right as unknown as { type: string }, PREC.Sequence)
    this.out += ') '
    this.printStatementOrBlock(node.body as unknown as { type: string })
  }

  private printForOfStatement(node: ForOfStatement): void {
    // `for await (const x of y)`: the await keyword sits before the paren.
    switch (node.await) {
      case true:
        this.out += 'for await ('
        break
      default:
        this.out += 'for ('
    }
    this.printDeclarationOrExpression(node.left as unknown as { type: string })
    this.out += ' of '
    this.out += this.sequenceNodeText(node.right as unknown as { type: string })
    this.out += ') '
    this.printStatementOrBlock(node.body as unknown as { type: string })
  }

  private printReturnStatement(node: ReturnStatement): void {
    if (node.argument) {
      this.out += 'return '
      this.printNode(node.argument as unknown as { type: string }, PREC.Sequence)
      this.out += ';'
    } else {
      this.out += 'return;'
    }
  }

  private printWithStatement(node: WithStatement): void {
    this.out += 'with ('
    this.printNode(node.object as unknown as { type: string }, PREC.Sequence)
    this.out += ') '
    this.printStatementOrBlock(node.body as unknown as { type: string })
  }

  private printSwitchStatement(node: SwitchStatement): void {
    this.out += `switch (${this.sequenceNodeText(node.discriminant as { type: string })}) {\n`
    this.indentLevel++
    this.out += node.cases
      .map((switchCase) => `${this.indent()}${this.capture(() => this.printSwitchCase(switchCase))}`)
      .join('')
    this.indentLevel--
    this.out += `${this.indent()}}`
  }

  private printSwitchCase(node: SwitchCase): void {
    this.out += this.switchCaseHeaderText(node)
    this.out += this.indentedBodyText(
      node.consequent,
      (statement) => this.printStatement(statement as { type: string }),
    )
  }

  private switchCaseHeaderText(node: SwitchCase): string {
    switch (Boolean(node.test)) {
      case true:
        return `case ${this.sequenceNodeText(node.test as { type: string })}:\n`
      default:
        return 'default:\n'
    }
  }

  private printLabeledStatement(node: LabeledStatement): void {
    this.out += `${node.label.name}: `
    this.printStatement(node.body as unknown as { type: string })
  }

  private printTryStatement(node: TryStatement): void {
    this.out += 'try '
    this.printBlockStatement(node.block)
    this.printCatchClause(node.handler)
    this.printFinallyClause(node.finalizer)
  }

  private printCatchClause(handler: CatchClause | null | undefined): void {
    if (!handler) return
    this.out += ` catch${this.catchParamText(handler.param as { type: string } | null)} `
    this.printBlockStatement(handler.body)
  }

  private catchParamText(param: { type: string } | null): string {
    switch (nodeKind(param)) {
      case ABSENT_NODE_KIND:
        return ''
      default:
        return ` (${this.catchParamBodyText(param as { type: string })})`
    }
  }

  private catchParamBodyText(param: { type: string }): string {
    switch (param.type) {
      case 'Identifier':
        return this.identifierWithOptionalText(param as unknown as BindingIdFields)
      default:
        return this.sequenceNodeText(param)
    }
  }

  private printFinallyClause(finalizer: BlockStatement | null | undefined): void {
    if (!finalizer) return
    this.out += ' finally '
    this.printBlockStatement(finalizer)
  }

  private printVariableDeclaration(node: VariableDeclaration): void {
    this.out += `${flagText(node.declare, 'declare ')}${node.kind} `
    this.out += node.declarations.map((declaration) => this.variableDeclaratorText(declaration)).join(', ')
  }

  private variableDeclaratorText(node: VariableDeclarator): string {
    return this.capture(() => this.printVariableDeclarator(node))
  }

  private printVariableDeclarator(node: VariableDeclarator): void {
    const id = node.id as unknown as BindingIdFields
    const declarator = node as unknown as { readonly definite?: boolean }
    this.out += this.bindingTargetText(id)
    this.out += flagText(declarator.definite, '!')
    this.out += this.typeAnnotationText(id.typeAnnotation)
    this.out += this.initializerText(node.init)
  }

  private bindingTargetText(id: BindingIdFields): string {
    switch (id.type) {
      case 'Identifier':
        return `${bindingNameText(id)}${flagText(id.optional, '?')}`
      default:
        return this.sequenceNodeText(id as { type: string })
    }
  }

  private identifierWithOptionalText(node: BindingIdFields): string {
    return `${bindingNameText(node)}${flagText(node.optional, '?')}${this.typeAnnotationText(node.typeAnnotation)}`
  }

  private printParams(params: readonly unknown[]): void {
    this.out += params.map((param) => this.paramText(param as Record<string, unknown>)).join(', ')
  }

  private paramText(param: Record<string, unknown>): string {
    switch (parameterForm(param)) {
      case 'rest':
        return this.restParamText(param)
      case 'property':
        return this.parameterPropertyText(param)
      default:
        return this.formalParameterText(param)
    }
  }

  private restParamText(param: Record<string, unknown>): string {
    return `...${this.assignmentNodeText(param['argument'] as { type: string })}${
      this.typeAnnotationText(param['typeAnnotation'] as TSTypeAnnotation | undefined)
    }`
  }

  private parameterPropertyText(param: Record<string, unknown>): string {
    return `${this.capture(() => this.printDecorators(param['decorators'] as Decorator[] | undefined))}${
      parameterPropertyModifiers(param)
    }${this.parameterPropertyTargetText(param['parameter'])}`
  }

  private parameterPropertyTargetText(parameter: unknown): string {
    switch (nodeKind(parameter as { type: string } | null)) {
      case 'Identifier':
        return this.identifierWithOptionalText(parameter as BindingIdFields)
      default:
        return this.sequenceNodeText(parameter as { type: string })
    }
  }

  private formalParameterText(param: Record<string, unknown>): string {
    return `${this.capture(() => this.printDecorators(param['decorators'] as Decorator[] | undefined))}${
      this.formalParameterBodyText(param)
    }`
  }

  private formalParameterBodyText(param: Record<string, unknown>): string {
    switch (param['type'] === 'Identifier') {
      case true:
        return this.identifierWithOptionalText(param as unknown as BindingIdFields)
      default:
        return `${this.assignmentNodeText(param as unknown as { type: string })}${
          this.typeAnnotationText(param['typeAnnotation'] as TSTypeAnnotation | undefined)
        }`
    }
  }

  private printClassBody(node: ClassBody): void {
    switch (node.body.length) {
      case 0:
        this.out += '{}'
        break
      default:
        this.out += '{\n'
        this.out += this.indentedBodyText(
          node.body,
          (element) => this.printNode(element as { type: string }, PREC.Sequence),
        )
        this.out += `${this.indent()}}`
    }
  }

  private indentedBodyText(items: readonly unknown[], print: (item: unknown) => void): string {
    this.indentLevel++
    const body = items.map((item) => `${this.indent()}${this.capture(() => print(item))}\n`).join('')
    this.indentLevel--
    return body
  }

  private printMethodDefinition(node: MethodDefinition): void {
    const fn = node.value as unknown as FunctionNode
    this.out += this.capture(() => this.printDecorators(node.decorators))
    this.out += methodDefinitionPrefix(node, fn)
    this.out += this.propertyKeyText(node.key as unknown as { type: string }, node.computed === true, PREC.Sequence)
    this.out += flagText(node.optional, '?')
    this.printFunctionTail(fn)
  }

  private printPropertyDefinition(node: PropertyDefinition): void {
    this.out += this.capture(() => this.printDecorators(node.decorators))
    this.out += propertyDefinitionModifiers(node)
    this.out += this.propertyKeyText(node.key as unknown as { type: string }, node.computed === true, PREC.Sequence)
    this.out += flagText(node.optional, '?')
    this.out += flagText(node.definite, '!')
    this.out += this.typeAnnotationText(node.typeAnnotation)
    this.out += this.initializerText(node.value)
    this.out += ';'
  }

  private printAccessorProperty(node: AccessorProperty): void {
    this.out += this.capture(() => this.printDecorators(node.decorators))
    this.out += flagText(node.accessibility, `${node.accessibility} `)
    this.out += flagText(node.static, 'static ')
    this.out += flagText(node.override, 'override ')
    this.out += 'accessor '
    this.out += this.propertyKeyText(node.key as unknown as { type: string }, node.computed === true, PREC.Sequence)
    this.out += flagText(node.definite, '!')
    this.out += this.typeAnnotationText(node.typeAnnotation)
    this.out += this.initializerText(node.value)
    this.out += ';'
  }

  private initializerText(value: unknown): string {
    return flagText(value, ` = ${this.assignmentNodeText(value as { type: string })}`)
  }

  private printStaticBlock(node: StaticBlock): void {
    this.out += 'static {\n'
    this.indentLevel++
    for (const stmt of node.body) {
      this.out += this.indent()
      this.printStatement(stmt as unknown as { type: string })
      this.out += '\n'
    }
    this.indentLevel--
    this.out += `${this.indent()}}`
  }

  // -----------------------------------------------------------------------
  // Imports / Exports
  // -----------------------------------------------------------------------

  private printImportDeclaration(node: ImportDeclaration): void {
    const source = this.printImportSource(node.source, node.attributes)
    this.out += `import ${importKindText(node)}${this.importClauseText(node, source)};`
  }

  private importClauseText(node: ImportDeclaration, source: string): string {
    switch (node.specifiers.length === 0) {
      case true:
        return source
      default:
        return `${importBindingsText(node.specifiers)} from ${source}`
    }
  }

  private printImportSource(source: { value: string; raw: string | null }, attrs: readonly ImportAttribute[]): string {
    const raw = source.raw ?? JSON.stringify(source.value)
    return `${raw}${importAttributesText(attrs)}`
  }

  private printExportNamedDeclaration(node: ExportNamedDeclaration): void {
    switch (node.declaration === null) {
      case false:
        this.out += `export ${this.capture(() => this.printStatement(node.declaration as unknown as { type: string }))}`
        break
      default:
        this.out += `export ${flagText(node.exportKind === 'type', 'type ')}{ ${
          node.specifiers.map((specifier) => exportSpecifierText(specifier)).join(', ')
        } }${this.exportSourceClauseText(node)};`
    }
  }

  private exportSourceClauseText(node: ExportNamedDeclaration): string {
    if (!node.source) return ''
    const rendered = ` from ${JSON.stringify(node.source.value)}${importAttributesText(node.attributes)}`
    return rendered
  }

  private printExportDefaultDeclaration(node: ExportDefaultDeclaration): void {
    const declaration = node.declaration as { type: string }
    this.out += 'export default '
    switch (BARE_DEFAULT_EXPORT_KINDS[declaration.type] === true) {
      case true:
        this.printStatement(declaration as unknown as { type: string })
        break
      default:
        this.printNode(declaration, PREC.Assignment)
        this.out += ';'
    }
  }

  private printExportAllDeclaration(node: ExportAllDeclaration): void {
    this.out += `export ${flagText(node.exportKind === 'type', 'type ')}*${exportedNameClauseText(node.exported)}`
    this.out += ` from ${JSON.stringify(node.source.value)}${importAttributesText(node.attributes)};`
  }

  // -----------------------------------------------------------------------
  // TS Declarations
  // -----------------------------------------------------------------------

  private printTSTypeAliasDeclaration(node: TSTypeAliasDeclaration): void {
    this.out += `${flagText(node.declare, 'declare ')}type ${node.id.name}${
      this.typeParametersText(node.typeParameters)
    } = ${this.printTSTypeToString(node.typeAnnotation)};`
  }

  private printTSInterfaceDeclaration(node: TSInterfaceDeclaration): void {
    this.out += `${flagText(node.declare, 'declare ')}interface ${node.id.name}${
      this.typeParametersText(node.typeParameters)
    }`
    this.out += this.interfaceExtendsText(node.extends)
    this.out += ' '
    this.printTSInterfaceBody(node.body)
  }

  private interfaceExtendsText(
    extensions: readonly { expression: unknown; typeArguments?: TSTypeParameterInstantiation | null }[],
  ): string {
    const rendered = extensions.map((heritage) => this.heritageText(heritage)).join(', ')
    return flagText(rendered, ` extends ${rendered}`)
  }

  private printTSInterfaceBody(node: TSInterfaceBody): void {
    switch (node.body.length) {
      case 0:
        this.out += '{}'
        break
      default:
        this.out += '{\n'
        this.out += this.indentedBodyText(node.body, (member) => this.printTSSignature(member as { type: string }))
        this.out += `${this.indent()}}`
    }
  }

  private printTSSignature(sig: { type: string }): void {
    switch (sig.type) {
      case 'TSPropertySignature':
        this.printTSPropertySignature(sig as unknown as TSPropertySignature)
        break
      case 'TSIndexSignature':
        this.printTSIndexSignature(sig as unknown as TSIndexSignature)
        break
      case 'TSCallSignatureDeclaration':
        this.printTSCallSignature(sig as unknown as TSCallSignatureDeclaration)
        break
      case 'TSConstructSignatureDeclaration':
        this.printTSConstructSignature(sig as unknown as TSConstructSignatureDeclaration)
        break
      case 'TSMethodSignature':
        this.printTSMethodSignature(sig as unknown as TSMethodSignature)
        break
      default:
        this.out += `/* sig:${sig.type} */;`
    }
  }

  private printTSPropertySignature(node: TSPropertySignature): void {
    this.out += `${flagText(node.readonly, 'readonly ')}${
      this.propertyKeyText(node.key as unknown as { type: string }, node.computed === true, PREC.Sequence)
    }${flagText(node.optional, '?')}${this.typeAnnotationText(node.typeAnnotation)};`
  }

  private printTSIndexSignature(node: TSIndexSignature): void {
    const parameters = node.parameters.map((parameter) => this.indexParameterText(parameter)).join(', ')
    this.out += `${flagText(node.readonly, 'readonly ')}${flagText(node.static, 'static ')}[${parameters}]${
      this.typeAnnotationText(node.typeAnnotation)
    };`
  }

  private indexParameterText(parameter: { name: string; typeAnnotation: unknown }): string {
    const annotation = parameter.typeAnnotation as TSTypeAnnotation
    return `${parameter.name}: ${this.printTSTypeToString(annotation.typeAnnotation)}`
  }

  private printTSCallSignature(node: TSCallSignatureDeclaration): void {
    this.out += `${this.typeParametersText(node.typeParameters)}(${this.paramsText(node.params)})${
      this.typeAnnotationText(node.returnType)
    };`
  }

  private printTSConstructSignature(node: TSConstructSignatureDeclaration): void {
    this.out += `new ${this.typeParametersText(node.typeParameters)}(${this.paramsText(node.params)})${
      this.typeAnnotationText(node.returnType)
    };`
  }

  private printTSMethodSignature(node: TSMethodSignature): void {
    this.out += `${methodKindText(node.kind)}${
      this.propertyKeyText(node.key as unknown as { type: string }, node.computed === true, PREC.Sequence)
    }${flagText(node.optional, '?')}${this.typeParametersText(node.typeParameters)}(${this.paramsText(node.params)})${
      this.typeAnnotationText(node.returnType)
    };`
  }

  private printTSEnumDeclaration(node: TSEnumDeclaration): void {
    this.out += `${flagText(node.declare, 'declare ')}${flagText(node.const, 'const ')}enum ${node.id.name} {\n`
    this.out += this.indentedBodyText(node.body.members, (member) => this.printEnumMember(member as TSEnumMemberShape))
    this.out += `${this.indent()}}`
  }

  private printEnumMember(member: TSEnumMemberShape): void {
    this.out += `${this.identifierOrLiteralNameText(member.id)}${this.initializerText(member.initializer)},`
  }

  private identifierOrLiteralNameText(id: { type: string }): string {
    switch (id.type) {
      case 'Identifier':
        return (id as IdentifierName).name
      case 'Literal':
        return this.capture(() => this.printLiteral(id as unknown as LiteralSource))
      default:
        return this.sequenceNodeText(id)
    }
  }

  private printTSModuleDeclaration(node: TSModuleDeclaration): void {
    this.out += `${flagText(node.declare, 'declare ')}${this.moduleHeaderText(node)}${this.moduleBodyText(node)}`
  }

  private moduleHeaderText(node: TSModuleDeclaration): string {
    switch (Boolean((node as unknown as { global?: boolean }).global)) {
      case true:
        return 'global '
      default:
        return `${node.kind} ${this.identifierOrLiteralNameText(node.id as unknown as { type: string })}`
    }
  }

  private moduleBodyText(node: TSModuleDeclaration): string {
    switch (Boolean(node.body)) {
      case true:
        return ` ${this.capture(() => this.printTSModuleBlock(node.body as TSModuleBlock))}`
      default:
        return ';'
    }
  }

  private printTSModuleBlock(node: TSModuleBlock): void {
    this.out += '{\n'
    this.out += this.indentedBodyText(node.body, (statement) => this.printStatement(statement as { type: string }))
    this.out += `${this.indent()}}`
  }

  private printTSImportEqualsDeclaration(node: TSImportEqualsDeclaration): void {
    this.out += `import ${flagText(node.importKind === 'type', 'type ')}${node.id.name} = ${
      this.moduleReferenceText(node.moduleReference as unknown as { type: string })
    };`
  }

  private moduleReferenceText(reference: { type: string }): string {
    switch (reference.type) {
      case 'TSExternalModuleReference': {
        const external = reference as unknown as { readonly expression: { readonly value: string } }
        return `require(${externalModuleArgumentText(external.expression.value)})`
      }
      default:
        return this.sequenceNodeText(reference)
    }
  }

  // -----------------------------------------------------------------------
  // TS Type printers
  // -----------------------------------------------------------------------

  printTSType(node: TSType): void {
    this.out += this.printTSTypeToString(node)
  }

  printTSTypeToString(node: TSType): string {
    const saved = this.out
    this.out = ''
    this.doPrintTSType(node)
    const result = this.out
    this.out = saved
    return result
  }

  private doPrintTSType(node: TSType): void {
    switch (node.type) {
      case 'TSAnyKeyword':
        this.out += 'any'
        break
      case 'TSStringKeyword':
        this.out += 'string'
        break
      case 'TSBooleanKeyword':
        this.out += 'boolean'
        break
      case 'TSNumberKeyword':
        this.out += 'number'
        break
      case 'TSBigIntKeyword':
        this.out += 'bigint'
        break
      case 'TSSymbolKeyword':
        this.out += 'symbol'
        break
      case 'TSVoidKeyword':
        this.out += 'void'
        break
      case 'TSUndefinedKeyword':
        this.out += 'undefined'
        break
      case 'TSNullKeyword':
        this.out += 'null'
        break
      case 'TSNeverKeyword':
        this.out += 'never'
        break
      case 'TSUnknownKeyword':
        this.out += 'unknown'
        break
      case 'TSObjectKeyword':
        this.out += 'object'
        break
      case 'TSIntrinsicKeyword':
        this.out += 'intrinsic'
        break
      case 'TSThisType':
        this.out += 'this'
        break
      case 'TSTypeReference': {
        const n = node as TSTypeReference
        this.printTSTypeName(n.typeName)
        this.out += this.typeArgumentsText(n.typeArguments)
        break
      }
      case 'TSUnionType': {
        const n = node as TSUnionType
        this.out += this.tSTypeListText(n.types, ' | ')
        break
      }
      case 'TSIntersectionType': {
        const n = node as TSIntersectionType
        this.out += this.tSTypeListText(n.types, ' & ')
        break
      }
      case 'TSArrayType': {
        const n = node as TSArrayType
        this.out += `${this.arrayElementTypeText(n.elementType)}[]`
        break
      }
      case 'TSTypeLiteral': {
        const n = node as unknown as { members: { type: string }[] }
        this.printTSTypeLiteral(n.members)
        break
      }
      case 'TSTupleType': {
        const n = node as TSTupleType
        this.printTupleType(n.elementTypes)
        break
      }
      case 'TSConditionalType': {
        const n = node as TSConditionalType
        this.doPrintTSType(n.checkType)
        this.out += ' extends '
        this.doPrintTSType(n.extendsType)
        this.out += ' ? '
        this.doPrintTSType(n.trueType)
        this.out += ' : '
        this.doPrintTSType(n.falseType)
        break
      }
      case 'TSInferType': {
        const n = node as TSInferType
        this.out += `infer ${n.typeParameter.name.name}`
        this.printTypeClause(' extends ', n.typeParameter.constraint)
        break
      }
      case 'TSTypeQuery': {
        const n = node as TSTypeQuery
        this.out += 'typeof '
        this.printTypeQueryName(n)
        this.out += this.typeArgumentsText(n.typeArguments)
        break
      }
      case 'TSImportType': {
        this.printTSImportType(node as TSImportType)
        break
      }
      case 'TSTypeOperator': {
        const n = node as TSTypeOperator
        this.out += `${n.operator} `
        this.doPrintTSType(n.typeAnnotation)
        break
      }
      case 'TSMappedType': {
        this.printMappedType(node as TSMappedType)
        break
      }
      case 'TSTemplateLiteralType': {
        this.printTSTemplateLiteral(node as TSTemplateLiteralType)
        break
      }
      case 'TSFunctionType': {
        this.printTSFunctionType(node as TSFunctionType)
        break
      }
      case 'TSConstructorType': {
        this.printTSConstructorType(node as TSConstructorType)
        break
      }
      case 'TSTypePredicate': {
        this.printTSTypePredicate(node as TSTypePredicate)
        break
      }
      case 'TSIndexedAccessType': {
        const n = node as TSIndexedAccessType
        this.doPrintTSType(n.objectType)
        this.out += '['
        this.doPrintTSType(n.indexType)
        this.out += ']'
        break
      }
      // TSTypeParameter is not a TSType — handled via declarations, not here

      case 'TSLiteralType': {
        this.printTSLiteralType((node as TSLiteralType).literal)
        break
      }
      case 'TSParenthesizedType': {
        const n = node as TSParenthesizedType
        this.out += '('
        this.doPrintTSType(n.typeAnnotation)
        this.out += ')'
        break
      }
      case 'TSJSDocNullableType': {
        this.printJSDocPostfixModifier(node as JSDocNullableType, '?')
        break
      }
      case 'TSJSDocNonNullableType': {
        this.printJSDocPostfixModifier(node as JSDocNonNullableType, '!')
        break
      }
      case 'TSJSDocUnknownType':
        this.out += '?'
        break
      default:
        this.out += `/* type:${(node as { type: string }).type} */`
        break
    }
  }

  private tSTypeListText(types: readonly TSType[], separator: string): string {
    return types.map((type) => this.printTSTypeToString(type)).join(separator)
  }

  private arrayElementTypeText(type: TSType): string {
    const printed = this.printTSTypeToString(type)
    switch (ARRAY_ELEMENT_WRAPPED_KINDS[type.type] === true) {
      case true:
        return `(${printed})`
      default:
        return printed
    }
  }

  private printTSTypeLiteral(members: readonly { type: string }[]): void {
    const rendered = members.map((member) => this.signatureText(member)).join('; ')
    switch (members.length) {
      case 0:
        this.out += '{}'
        break
      default:
        this.out += `{ ${rendered} }`
    }
  }

  private signatureText(member: { type: string }): string {
    const printed = this.capture(() => this.printTSSignature(member))
    switch (printed.endsWith(';')) {
      case true:
        return printed.slice(0, -1)
      default:
        return printed
    }
  }

  private printTupleType(elements: readonly unknown[]): void {
    this.out += `[${elements.map((element) => this.capture(() => this.printTupleElement(element))).join(', ')}]`
  }

  private printTupleElement(element: unknown): void {
    const tupleElement = element as { type: string }
    switch (tupleElement.type) {
      case 'TSRestType':
        this.out += '...'
        this.doPrintTSType((tupleElement as unknown as TSRestType).typeAnnotation)
        break
      case 'TSOptionalType':
        this.doPrintTSType((tupleElement as unknown as TSOptionalType).typeAnnotation)
        this.out += '?'
        break
      case 'TSNamedTupleMember':
        this.printNamedTupleMember(tupleElement as unknown as TSNamedTupleMember)
        break
      default:
        this.doPrintTSType(tupleElement as unknown as TSType)
    }
  }

  private printNamedTupleMember(member: TSNamedTupleMember): void {
    this.out += `${member.label.name}${flagText(member.optional, '?')}: `
    this.printTupleElement(member.elementType)
  }

  private printTypeClause(keyword: string, type: TSType | null | undefined): void {
    if (!type) return
    this.out += keyword
    this.doPrintTSType(type)
  }

  private printTypeQueryName(node: TSTypeQuery): void {
    switch (node.exprName.type) {
      case 'TSImportType':
        this.doPrintTSType(node.exprName as unknown as TSType)
        break
      default:
        this.printTSTypeName(node.exprName as unknown as IdentifierReference)
    }
  }

  private printTSImportType(node: TSImportType): void {
    this.printTSImportTypeSource(node)
    if (node.qualifier) {
      this.out += '.'
      this.printTSImportTypeQualifier(node.qualifier)
    }
    this.out += this.typeArgumentsText(node.typeArguments)
  }

  private printTSImportTypeSource(node: TSImportType): void {
    this.out += `import(${JSON.stringify(node.source.value)}`
    this.out += flagText(node.options, `, ${this.assignmentNodeText(node.options as unknown as { type: string })}`)
    this.out += ')'
  }

  private printMappedType(node: TSMappedType): void {
    this.out += '{ '
    this.printMappedTypeModifier(node.readonly, 'readonly ')
    this.out += `[${node.key.name} in `
    this.doPrintTSType(node.constraint)
    this.printTypeClause(' as ', node.nameType)
    this.out += ']'
    this.printMappedTypeModifier(node.optional, '?')
    this.printTypeClause(': ', node.typeAnnotation)
    this.out += ' }'
  }

  private printMappedTypeModifier(modifier: unknown, rendered: string): void {
    switch (modifier) {
      case true:
        this.out += rendered
        break
      case '+':
        this.out += `+${rendered}`
        break
      case '-':
        this.out += `-${rendered}`
        break
      default:
        break
    }
  }

  private printTSTemplateLiteral(node: TSTemplateLiteralType): void {
    this.out += `\`${
      node.quasis
        .map((quasi, index) => this.templateTypeQuasiText(quasi, node.types[index]!))
        .join('')
    }\``
  }

  private templateTypeQuasiText(quasi: TemplateElement, type: TSType): string {
    switch (quasi.tail) {
      case true:
        return quasi.value.raw
      default:
        return `${quasi.value.raw}\${${this.printTSTypeToString(type)}}`
    }
  }

  private printTSFunctionType(node: TSFunctionType): void {
    this.out += `${this.typeParametersText(node.typeParameters)}(${this.paramsText(node.params)}) => ${
      this.printTSTypeToString((node.returnType as TSTypeAnnotation).typeAnnotation)
    }`
  }

  private printTSConstructorType(node: TSConstructorType): void {
    this.out += `${flagText(node.abstract, 'abstract ')}new ${this.typeParametersText(node.typeParameters)}(${
      this.paramsText(node.params)
    }) => ${this.printTSTypeToString((node.returnType as TSTypeAnnotation).typeAnnotation)}`
  }

  private printTSTypePredicate(node: TSTypePredicate): void {
    this.out += flagText(node.asserts, 'asserts ')
    this.out += typePredicateParameterText(node.parameterName as unknown as { type: string })
    this.printPredicateAnnotation(node)
  }

  private printPredicateAnnotation(node: TSTypePredicate): void {
    if (!node.typeAnnotation) return
    this.printTypeClause(' is ', node.typeAnnotation.typeAnnotation)
  }

  private printTSLiteralType(literal: unknown): void {
    switch (nodeKind(literal as { type: string } | null)) {
      case 'Literal':
        this.printLiteral(literal as LiteralSource)
        break
      case 'TemplateLiteral':
        this.printTemplateLiteral(literal as unknown as TemplateLiteral)
        break
      case 'UnaryExpression':
        this.printTSLiteralUnary(literal as unknown as UnaryExpression)
        break
      default:
        this.printNode(literal as { type: string }, PREC.Sequence)
    }
  }

  private printTSLiteralUnary(unary: UnaryExpression): void {
    this.out += unary.operator
    this.printLiteral(unary.argument as unknown as LiteralSource)
  }

  private printJSDocPostfixModifier(
    node: { readonly postfix?: boolean | null; readonly typeAnnotation: TSType },
    marker: string,
  ): void {
    switch (Boolean(node.postfix)) {
      case true:
        this.doPrintTSType(node.typeAnnotation)
        this.out += marker
        break
      default:
        this.out += marker
        this.doPrintTSType(node.typeAnnotation)
    }
  }

  private printTSTypeName(name: IdentifierReference | TSQualifiedName | { type: string }): void {
    switch (nodeKind(name)) {
      case 'TSQualifiedName': {
        const qualified = name as TSQualifiedName
        this.printTSTypeName(qualified.left)
        this.out += `.${qualified.right.name}`
        break
      }
      default:
        this.out += this.tSTypeNameLeafText(name)
    }
  }

  private tSTypeNameLeafText(name: IdentifierReference | { type: string }): string {
    switch (nodeKind(name)) {
      case 'Identifier':
        return (name as IdentifierReference).name
      case 'ThisExpression':
        return 'this'
      default:
        return this.sequenceNodeText(name as { type: string })
    }
  }

  private printTSImportTypeQualifier(qualifier: TSImportType['qualifier']): void {
    switch (nodeKind(qualifier as { type: string } | null)) {
      case ABSENT_NODE_KIND:
        break
      case 'Identifier':
        this.out += (qualifier as IdentifierName).name
        break
      default: {
        const qualified = qualifier as unknown as {
          readonly left: TSImportType['qualifier']
          readonly right: IdentifierName
        }
        this.printTSImportTypeQualifier(qualified.left)
        this.out += `.${qualified.right.name}`
      }
    }
  }

  private printTSTypeAnnotation(node: TSTypeAnnotation): void {
    this.out += ': '
    this.doPrintTSType(node.typeAnnotation)
  }

  private printTSTypeParameterDeclaration(node: TSTypeParameterDeclaration): void {
    this.out += `<${node.params.map((param) => this.capture(() => this.printTSTypeParameter(param))).join(', ')}>`
  }

  private printTSTypeParameterInstantiation(node: TSTypeParameterInstantiation): void {
    this.out += `<${node.params.map((param) => this.printTSTypeToString(param)).join(', ')}>`
  }

  private printTSTypeParameter(node: TSTypeParameterFields): void {
    this.out += typeParameterModifiersText(node)
    this.out += node.name.name
    this.printTypeClause(' extends ', node.constraint)
    this.printTypeClause(' = ', node.default)
  }
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
