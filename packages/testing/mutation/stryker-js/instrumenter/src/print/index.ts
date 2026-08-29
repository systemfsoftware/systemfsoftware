/**
 * Owned ESTree/TS-ESTree printer — renders oxc-parser ASTs back to source.
 *
 * Structural codegen: one case per node kind, precedence-aware, no span reliance.
 * Synthesized nodes without start/end print correctly.
 */

// oxlint-disable typescript/no-unsafe-type-assertion typescript/no-unnecessary-type-assertion typescript/no-non-null-assertion typescript/switch-exhaustiveness-check eslint/no-unused-vars @systemfsoftware/no-domain-branching-density @systemfsoftware/ban-classes

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
  ImportDefaultSpecifier,
  ImportNamespaceSpecifier,
  ImportSpecifier,
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

function logicalPrec(op: string): number {
  if (op === '??') return PREC.NullishCoalescing
  if (op === '||') return PREC.LogicalOR
  return PREC.LogicalAND
}

// ---------------------------------------------------------------------------
// Print state
// ---------------------------------------------------------------------------

class PrintState {
  private out = ''
  private indentLevel = 0
  private readonly comments: readonly Comment[]
  private readonly hashbang: Hashbang | null
  private commentIdx = 0
  // Comments sorted by start position for ordered emission
  private readonly sortedComments: readonly Comment[]

  constructor(opts: PrintOptions) {
    this.comments = opts.comments ?? []
    this.hashbang = opts.hashbang ?? null
    // oxc emits the hashbang as both Program.hashbang and a Line comment with
    // the same span. Deduplicate by span so a regular comment that merely
    // repeats the hashbang text survives.
    const filtered = this.hashbang
      ? this.comments.filter((c) => !(c.type === 'Line' && c.start === this.hashbang!.start))
      : this.comments
    this.sortedComments = [...filtered].sort((a, b) => a.start - b.start)
  }

  printProgram(program: Program): string {
    this.out = ''
    this.indentLevel = 0
    this.commentIdx = 0

    if (this.hashbang) {
      this.out += `#!${this.hashbang.value}\n`
    }

    // Emit leading comments before first statement
    this.emitCommentsBefore(this.firstStatementStart(program))

    for (let i = 0; i < program.body.length; i++) {
      const stmt = program.body[i] as { type: string; start?: number; end?: number }
      this.emitCommentsBefore(stmt.start ?? -1)
      this.printStatement(stmt as never)
      // Statement terminators: semicolons handled per-statement; ensure newline between statements
      if (i < program.body.length - 1) {
        this.out += '\n'
        // Add blank line handling: comments may be between statements
      } else {
        this.out += '\n'
      }
    }

    // Trailing comments
    this.emitRemainingComments()

    return this.out
  }

  printAnyNode(node: { type: string }): string {
    this.out = ''
    this.indentLevel = 0
    this.printNode(node, PREC.Sequence)
    return this.out
  }

  // ---- comment interleaving ----

  private firstStatementStart(program: Program): number {
    if (program.body.length === 0) return Number.POSITIVE_INFINITY
    const s = (program.body[0] as { start?: number }).start
    return s ?? Number.POSITIVE_INFINITY
  }

  private emitCommentsBefore(pos: number): void {
    if (pos < 0 || !Number.isFinite(pos)) return
    while (this.commentIdx < this.sortedComments.length) {
      const c = this.sortedComments[this.commentIdx]!
      if (c.start >= pos) break
      this.emitComment(c)
      this.commentIdx++
    }
  }

  private emitRemainingComments(): void {
    while (this.commentIdx < this.sortedComments.length) {
      const c = this.sortedComments[this.commentIdx]!
      // Avoid emitting comments that were already at EOF position
      this.emitComment(c)
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

  // ---- precedence-aware parens ----

  private needsParens(childPrec: number, parentPrec: number, isRight: boolean, op?: string): boolean {
    if (childPrec < parentPrec) return true
    if (childPrec > parentPrec) return false
    // Equal precedence — associativity decides
    if (op === '**') {
      // right-associative: a ** (b ** c) needs no parens on right, but (a ** b) ** c does
      return !isRight
    }
    // For left-assoc operators, right child with same prec needs parens: a - (b - c) vs a - b - c
    // For assignment (right-assoc), left child with same prec needs parens
    // We call this for binary/logical/conditional/assignment right children as isRight=true
    return isRight
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
    const saved = this.out
    this.out = ''
    this.printNode(node as unknown as { type: string }, prec)
    const result = this.out
    this.out = saved
    return result
  }

  // ---- generic dispatch ----

  private printNode(node: { type: string } | null | undefined, prec: number): void {
    if (!node) return
    const t = node.type
    // oxc uses "Literal" for all literal kinds; delegate to literal printer
    if (t === 'Literal') {
      this.printLiteral(node as never)
      return
    }
    switch (t) {
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
        this.printMemberExpression(node as MemberExpression)
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
        if ((node as unknown as { argument: unknown }).argument === null) {
          // never for await, but keep structure
        }
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
        this.out += 'continue'
        if ((node as ContinueStatement).label) {
          this.out += ` ${(node as ContinueStatement).label!.name}`
        }
        this.out += ';'
        break
      case 'BreakStatement':
        this.out += 'break'
        if ((node as BreakStatement).label) {
          this.out += ` ${(node as BreakStatement).label!.name}`
        }
        this.out += ';'
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
      default: {
        // Attempt to handle TS type nodes via dedicated printer
        if (isTSTypeNode(t)) {
          this.printTSType(node as unknown as TSType)
        } else if (t === 'TSTypeAnnotation') {
          this.out += ': '
          this.printTSType((node as TSTypeAnnotation).typeAnnotation)
        } else if (t === 'TSTypeParameterDeclaration') {
          this.printTSTypeParameterDeclaration(node as TSTypeParameterDeclaration)
        } else if (t === 'TSTypeParameterInstantiation') {
          this.printTSTypeParameterInstantiation(node as TSTypeParameterInstantiation)
        } else if (t === 'TSTypeParameter') {
          this.printTSTypeParameter(node as never)
        } else {
          // Unknown node — emit as comment for debuggability, still valid enough to not crash corpus run
          this.out += `/* unknown:${t} */`
        }
        break
      }
    }
  }

  // -----------------------------------------------------------------------
  // Literals
  // -----------------------------------------------------------------------

  private printLiteral(node: {
    type: 'Literal'
    value: unknown
    raw: string | null
    bigint?: string
    regex?: { pattern: string; flags: string }
  }): void {
    if (node.raw != null) {
      this.out += node.raw
      return
    }
    // Synthesized nodes without raw
    if (node.regex) {
      this.out += `/${node.regex.pattern}/${node.regex.flags}`
      return
    }
    if (node.bigint != null) {
      this.out += node.bigint
      return
    }
    const v = node.value
    if (v === null) this.out += 'null'
    else if (typeof v === 'string') this.out += JSON.stringify(v)
    else if (typeof v === 'number') this.out += String(v)
    else if (typeof v === 'boolean') this.out += v ? 'true' : 'false'
    else if (typeof v === 'bigint') this.out += `${v}n`
    else this.out += 'null'
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
    this.out += '['
    for (let i = 0; i < node.elements.length; i++) {
      if (i > 0) this.out += ', '
      const el = node.elements[i]
      if (el === null) {
        // hole — emit nothing (just the comma already added)
        continue
      }
      this.printNode(el as unknown as { type: string }, PREC.Assignment)
    }
    this.out += ']'
  }

  private printObjectExpression(node: ObjectExpression): void {
    if (node.properties.length === 0) {
      this.out += '{}'
      return
    }
    this.out += '{ '
    for (let i = 0; i < node.properties.length; i++) {
      if (i > 0) this.out += ', '
      this.printNode(node.properties[i] as unknown as { type: string }, PREC.Sequence)
    }
    this.out += ' }'
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
    const n = node as unknown as Record<string, unknown>
    const kind = n['kind'] as string | undefined
    const method = n['method'] as boolean | undefined
    const shorthand = n['shorthand'] as boolean | undefined
    const computed = n['computed'] as boolean | undefined
    const key = n['key'] as { type: string }
    const value = n['value'] as { type: string } | null

    if (kind === 'get' || kind === 'set') {
      this.out += `${kind} `
      this.printPropertyKey(key, !!computed)
      this.printFunctionValue(value as never)
      return
    }
    if (method) {
      // method shorthand: key(params) { body }
      if (n['async']) this.out += 'async '
      if (n['generator']) this.out += '*'
      this.printPropertyKey(key, !!computed)
      this.printFunctionValue(value as never)
      return
    }
    if (shorthand && key.type === 'Identifier' && value && value.type === 'Identifier') {
      // Check if same name
      const kName = (key as IdentifierName).name
      const vName = (value as IdentifierName).name
      if (kName === vName) {
        this.out += kName
        return
      }
    }
    const defaultPattern = value as unknown as AssignmentPattern | undefined
    if (
      shorthand && key.type === 'Identifier' && defaultPattern && defaultPattern.type === 'AssignmentPattern' &&
      (defaultPattern.left as IdentifierName).type === 'Identifier' &&
      (defaultPattern.left as IdentifierName).name === (key as IdentifierName).name
    ) {
      // shorthand with default: { maxDepth = 2 }
      const kName = (key as IdentifierName).name
      const savedOut = this.out
      this.out = ''
      this.printNode(defaultPattern.right as unknown as { type: string }, PREC.Assignment)
      const rightStr = this.out
      this.out = savedOut
      this.out += `${kName} = ${rightStr}`
      return
    }
    // computed or shorthand=false
    this.printPropertyKey(key, !!computed)
    this.out += ': '
    if (value) this.printNode(value, PREC.Assignment)
  }

  private printPropertyKey(key: { type: string }, computed: boolean): void {
    if (computed) {
      this.out += '['
      this.printNode(key, PREC.Assignment)
      this.out += ']'
    } else if (key.type === 'Identifier') {
      this.out += (key as IdentifierName).name
    } else if (key.type === 'PrivateIdentifier') {
      this.out += `#${(key as PrivateIdentifier).name}`
    } else if (key.type === 'Literal') {
      this.printLiteral(key as never)
    } else {
      this.printNode(key, PREC.Assignment)
    }
  }

  private printFunctionValue(fn: FunctionNode): void {
    // fn is a Function node used as method value
    if (!fn) return
    if (fn.typeParameters) this.printTSTypeParameterDeclaration(fn.typeParameters)
    this.out += '('
    this.printParams(fn.params)
    this.out += ')'
    if (fn.returnType) this.printTSTypeAnnotation(fn.returnType)
    if (fn.body) {
      this.out += ' '
      this.printBlockStatement(fn.body as BlockStatement)
    } else {
      this.out += ';'
    }
  }

  private printTemplateLiteral(node: TemplateLiteral): void {
    this.out += '`'
    for (let i = 0; i < node.quasis.length; i++) {
      const q = node.quasis[i]!
      this.out += q.value.raw
      if (!q.tail) {
        this.out += '${'
        this.printNode(node.expressions[i] as unknown as { type: string }, PREC.Sequence)
        this.out += '}'
      }
    }
    this.out += '`'
  }

  private printTaggedTemplate(node: TaggedTemplateExpression): void {
    this.printNode(node.tag as unknown as { type: string }, PREC.Member)
    if (node.typeArguments) this.printTSTypeParameterInstantiation(node.typeArguments)
    this.printTemplateLiteral(node.quasi)
  }

  private printMemberExpression(node: MemberExpression, prec: number = PREC.Member): void {
    // MemberExpression covers computed, static, and private
    const n = node as unknown as Record<string, unknown>
    const computed = n['computed'] as boolean
    const optional = n['optional'] as boolean
    const object = n['object'] as { type: string }
    const property = n['property'] as { type: string }

    // Print object with appropriate precedence
    const objStr = this.printExpressionToString(object as unknown as Expression, PREC.Member)
    const needsParen = needsParensForMemberObject(object as unknown as Expression)
    const objOut = needsParen ? `(${objStr})` : objStr

    if (optional) {
      if (computed) {
        this.out += `${objOut}?.[`
        this.printNode(property, PREC.Sequence)
        this.out += ']'
      } else {
        const propName = property.type === 'Identifier'
          ? (property as IdentifierName).name
          : property.type === 'PrivateIdentifier'
          ? `#${(property as PrivateIdentifier).name}`
          : ''
        if (propName) {
          this.out += `${objOut}?.${propName}`
        } else {
          this.out += `${objOut}?.`
          this.printNode(property, PREC.Sequence)
        }
      }
    } else {
      if (computed) {
        this.out += `${objOut}[`
        this.printNode(property, PREC.Sequence)
        this.out += ']'
      } else {
        const propName = property.type === 'Identifier'
          ? (property as IdentifierName).name
          : property.type === 'PrivateIdentifier'
          ? `#${(property as PrivateIdentifier).name}`
          : ''
        if (propName) {
          this.out += `${objOut}.${propName}`
        } else {
          this.out += `${objOut}.`
          this.printNode(property, PREC.Sequence)
        }
      }
    }
  }

  private printCallExpression(node: CallExpression, prec: number): void {
    const calleePrec = PREC.Member
    // Callee may need parens if it's not a simple member/call
    const calleeStr = this.printExpressionToString(node.callee as Expression, calleePrec)
    const calleeNeedsParen = node.callee.type === 'SequenceExpression' || node.callee.type === 'ConditionalExpression'
    this.out += calleeNeedsParen ? `(${calleeStr})` : calleeStr
    if (node.optional) this.out += '?.'
    if (node.typeArguments) this.printTSTypeParameterInstantiation(node.typeArguments)
    this.out += '('
    for (let i = 0; i < node.arguments.length; i++) {
      if (i > 0) this.out += ', '
      this.printNode(node.arguments[i] as unknown as { type: string }, PREC.Assignment)
    }
    this.out += ')'
  }

  private printNewExpression(node: NewExpression, prec: number): void {
    this.out += 'new '
    const calleeStr = this.printExpressionToString(node.callee as Expression, PREC.Member)
    // new callee with member chain: new Foo.Bar()
    this.out += calleeStr
    if (node.typeArguments) this.printTSTypeParameterInstantiation(node.typeArguments)
    this.out += '('
    for (let i = 0; i < node.arguments.length; i++) {
      if (i > 0) this.out += ', '
      this.printNode(node.arguments[i] as unknown as { type: string }, PREC.Assignment)
    }
    this.out += ')'
  }

  private printMetaProperty(node: MetaProperty): void {
    this.out += `${node.meta.name}.${node.property.name}`
  }

  private printV8Intrinsic(node: { name: IdentifierName; arguments: unknown[] }): void {
    this.out += `%${node.name.name}(`
    for (let i = 0; i < node.arguments.length; i++) {
      if (i > 0) this.out += ', '
      this.printNode(node.arguments[i] as { type: string }, PREC.Assignment)
    }
    this.out += ')'
  }

  private printImportExpression(node: { source: Expression; options: Expression | null; phase: string | null }): void {
    this.out += 'import'
    if (node.phase) this.out += `.${node.phase}`
    this.out += '('
    this.printNode(node.source as unknown as { type: string }, PREC.Assignment)
    if (node.options) {
      this.out += ', '
      this.printNode(node.options as unknown as { type: string }, PREC.Assignment)
    }
    this.out += ')'
  }

  private printUpdateExpression(node: UpdateExpression, prec: number): void {
    const myPrec = PREC.Update
    if (node.prefix) {
      this.out += node.operator
      const argStr = this.printExpressionToString(node.argument as unknown as Expression, myPrec)
      const needsParen = needsParensForMemberObject(node.argument as unknown as Expression)
      this.out += needsParen ? `(${argStr})` : argStr
    } else {
      const argStr = this.printExpressionToString(node.argument as unknown as Expression, myPrec)
      const needsParen = needsParensForMemberObject(node.argument as unknown as Expression)
      this.out += needsParen ? `(${argStr})` : argStr
      this.out += node.operator
    }
  }

  private printUnaryExpression(node: UnaryExpression, prec: number): void {
    const myPrec = PREC.Unary
    const op = node.operator
    const needsSpace = op === 'typeof' || op === 'void' || op === 'delete'
    this.out += op + (needsSpace ? ' ' : '')
    const argStr = this.printExpressionToString(node.argument, myPrec)
    // Unary argument with lower prec needs parens — but our print adds via prec check
    // For simplicity, wrap if argument is binary/logical/conditional
    const argNeedsParen = node.argument.type === 'BinaryExpression' ||
      node.argument.type === 'LogicalExpression' ||
      node.argument.type === 'ConditionalExpression' ||
      node.argument.type === 'SequenceExpression'
    this.out += argNeedsParen ? `(${argStr})` : argStr
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
    const leftStr = this.printExpressionToString(node.left as unknown as Expression, PREC.Assignment)
    const annotation = (node.left as unknown as { typeAnnotation?: TSTypeAnnotation | null }).typeAnnotation
    const rightStr = this.printExpressionToString(node.right, PREC.Assignment)
    let whole = leftStr
    if (annotation) {
      const saved = this.out
      this.out = ''
      this.printTSTypeAnnotation(annotation)
      whole += this.out
      this.out = saved
    }
    whole += ` = ${rightStr}`
    if (PREC.Assignment < prec) this.out += `(${whole})`
    else this.out += whole
  }

  private printObjectPattern(node: { properties: unknown[] }): void {
    if (node.properties.length === 0) {
      this.out += '{}'
      return
    }
    this.out += '{ '
    for (let i = 0; i < node.properties.length; i++) {
      if (i > 0) this.out += ', '
      this.printNode(node.properties[i] as { type: string }, PREC.Sequence)
    }
    this.out += ' }'
  }

  private printArrayPattern(node: ArrayPattern): void {
    this.out += '['
    for (let i = 0; i < node.elements.length; i++) {
      if (i > 0) this.out += ', '
      const el = node.elements[i]
      if (el === null) continue
      this.printNode(el as unknown as { type: string }, PREC.Assignment)
    }
    this.out += ']'
  }

  private printSequenceExpression(node: SequenceExpression, prec: number): void {
    const myPrec = PREC.Sequence
    const parts: string[] = []
    for (const expr of node.expressions) {
      parts.push(this.printExpressionToString(expr, myPrec))
    }
    const whole = parts.join(', ')
    if (myPrec < prec) this.out += `(${whole})`
    else this.out += whole
  }

  private printYieldExpression(node: YieldExpression, prec: number): void {
    const myPrec = PREC.Unary // yield is like unary
    if (node.delegate) this.out += 'yield*'
    else this.out += 'yield'
    if (node.argument) {
      this.out += ' '
      this.printNode(node.argument as unknown as { type: string }, PREC.Assignment)
    }
  }

  private printArrowFunction(node: ArrowFunctionExpression, prec: number): void {
    const myPrec = PREC.Assignment
    let arrow = ''
    if (node.async) arrow += 'async '
    if (node.typeParameters) {
      const saved = this.out
      this.out = ''
      this.printTSTypeParameterDeclaration(node.typeParameters)
      const tp = this.out
      this.out = saved
      arrow += tp
    }
    // params: single identifier without parens if one param and no types/returnType
    const singleParam = node.params[0] as IdentifierName & { typeAnnotation?: unknown } | undefined
    if (
      node.params.length === 1 &&
      singleParam?.type === 'Identifier' &&
      !singleParam.typeAnnotation &&
      !node.returnType
    ) {
      arrow += singleParam.name
    } else {
      arrow += '('
      const saved = this.out
      this.out = ''
      this.printParams(node.params)
      const p = this.out
      this.out = saved
      arrow += p + ')'
    }
    if (node.returnType) {
      const saved = this.out
      this.out = ''
      this.printTSTypeAnnotation(node.returnType)
      const rt = this.out
      this.out = saved
      arrow += rt
    }
    arrow += ' => '
    if (
      typeof node.body === 'object' && node.body !== null && (node.body as { type: string }).type === 'BlockStatement'
    ) {
      const saved = this.out
      this.out = ''
      this.printBlockStatement(node.body as BlockStatement)
      const b = this.out
      this.out = saved
      arrow += b
    } else {
      const saved = this.out
      this.out = ''
      this.printNode(node.body as unknown as { type: string }, PREC.Assignment)
      const b = this.out
      this.out = saved
      arrow += b
    }
    if (myPrec < prec) this.out += `(${arrow})`
    else this.out += arrow
  }

  private printFunction(node: FunctionNode, _prec: number): void {
    if (node.declare) this.out += 'declare '
    if (node.async) this.out += 'async '
    this.out += 'function'
    if (node.generator) this.out += '*'
    if (node.id) this.out += ` ${node.id.name}`
    if (node.typeParameters) this.printTSTypeParameterDeclaration(node.typeParameters)
    this.out += '('
    this.printParams(node.params)
    this.out += ')'
    if (node.returnType) this.printTSTypeAnnotation(node.returnType)
    if (node.body) {
      this.out += ' '
      this.printBlockStatement(node.body as BlockStatement)
    } else {
      this.out += ';'
    }
  }

  private printClass(node: Class, _prec: number): void {
    this.printDecorators(node.decorators as Decorator[])
    if (node.declare) this.out += 'declare '
    if (node.abstract) this.out += 'abstract '
    this.out += 'class'
    if (node.id) this.out += ` ${node.id.name}`
    if (node.typeParameters) this.printTSTypeParameterDeclaration(node.typeParameters)
    if (node.superClass) {
      this.out += ' extends '
      this.printNode(node.superClass as unknown as { type: string }, PREC.Assignment)
      if (node.superTypeArguments) this.printTSTypeParameterInstantiation(node.superTypeArguments)
    }
    if (node.implements && node.implements.length > 0) {
      this.out += ' implements '
      for (let i = 0; i < node.implements.length; i++) {
        if (i > 0) this.out += ', '
        const impl = node.implements[i]!
        this.printNode(impl.expression as unknown as { type: string }, PREC.Assignment)
        if (impl.typeArguments) this.printTSTypeParameterInstantiation(impl.typeArguments)
      }
    }
    this.out += ' '
    this.printClassBody(node.body)
  }

  private printDecorators(decorators: readonly Decorator[] | undefined): void {
    if (!decorators || decorators.length === 0) return
    for (const d of decorators) {
      this.out += '@'
      this.printNode(d.expression as unknown as { type: string }, PREC.Member)
      this.out += ' '
    }
  }

  // -----------------------------------------------------------------------
  // JSX
  // -----------------------------------------------------------------------

  private printJSXElement(node: JSXElement): void {
    this.printJSXOpeningElement(node.openingElement)
    for (const child of node.children) {
      this.printJSXChild(child)
    }
    if (node.closingElement) {
      this.out += `</`
      this.printJSXElementName(node.closingElement.name)
      this.out += '>'
    }
  }

  private printJSXFragment(node: JSXFragment): void {
    this.out += '<>'
    for (const child of node.children) {
      this.printJSXChild(child)
    }
    this.out += '</>'
  }

  private printJSXOpeningElement(node: JSXOpeningElement): void {
    this.out += '<'
    this.printJSXElementName(node.name)
    if (node.typeArguments) this.printTSTypeParameterInstantiation(node.typeArguments)
    for (const attr of node.attributes) {
      this.out += ' '
      this.printNode(attr as unknown as { type: string }, PREC.Sequence)
    }
    this.out += node.selfClosing ? ' />' : '>'
  }

  private printJSXElementName(
    name: JSXIdentifier | JSXNamespacedName | JSXMemberExpression,
  ): void {
    if (name.type === 'JSXIdentifier') {
      this.out += (name as JSXIdentifier).name
    } else if (name.type === 'JSXNamespacedName') {
      this.out += `${(name as JSXNamespacedName).namespace.name}:${(name as JSXNamespacedName).name.name}`
    } else {
      this.printJSXMemberExpression(name as JSXMemberExpression)
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
    const n = node.name
    if (n.type === 'JSXIdentifier') this.out += (n as JSXIdentifier).name
    else this.out += `${(n as JSXNamespacedName).namespace.name}:${(n as JSXNamespacedName).name.name}`
    if (node.value) {
      this.out += '='
      if (node.value.type === 'Literal') {
        this.printLiteral(node.value as never)
      } else if (node.value.type === 'JSXExpressionContainer') {
        this.out += '{'
        this.printNode(
          (node.value as JSXExpressionContainer).expression as unknown as { type: string },
          PREC.Sequence,
        )
        this.out += '}'
      } else {
        this.printNode(node.value as unknown as { type: string }, PREC.Sequence)
      }
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
        // Try as expression statement fallback or TS type node
        if (isTSTypeNode(n.type)) {
          this.printTSType(n as unknown as TSType)
          this.out += ';'
        } else {
          // Silent corruption is worse than a loud failure: instrumented code
          // that dropped a statement would downgrade runs, not crash them.
          throw new Error(`Printer: unhandled statement kind ${n.type}`)
        }
        break
    }
    this.printAttachedComments(n, 'trailingComments')
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
    for (const comment of comments as Array<{ type: string; value: string }>) {
      if (field === 'leadingComments') this.out += this.indent()
      if (comment.type === 'Block') {
        this.out += `/*${comment.value}*/`
      } else {
        this.out += `//${comment.value}`
      }
      this.out += field === 'leadingComments' ? '\n' : ' '
    }
  }

  private printBlockStatement(node: BlockStatement): void {
    if (node.body.length === 0) {
      this.out += '{}'
      return
    }
    this.out += '{\n'
    this.indentLevel++
    for (const stmt of node.body) {
      this.out += this.indent()
      this.printStatement(stmt as unknown as { type: string })
      this.out += '\n'
    }
    this.indentLevel--
    this.out += `${this.indent()}}`
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
    if (node.init) {
      if ((node.init as { type: string }).type === 'VariableDeclaration') {
        this.printVariableDeclaration(node.init as VariableDeclaration)
      } else {
        this.printNode(node.init as unknown as { type: string }, PREC.Sequence)
      }
    }
    this.out += '; '
    if (node.test) this.printNode(node.test as unknown as { type: string }, PREC.Sequence)
    this.out += '; '
    if (node.update) this.printNode(node.update as unknown as { type: string }, PREC.Sequence)
    this.out += ') '
    this.printStatementOrBlock(node.body as unknown as { type: string })
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
    this.out += node.await ? 'for await (' : 'for ('
    if ((node.left as { type: string }).type === 'VariableDeclaration') {
      this.printVariableDeclaration(node.left as VariableDeclaration)
    } else {
      this.printNode(node.left as unknown as { type: string }, PREC.Sequence)
    }
    this.out += ' of '
    this.printNode(node.right as unknown as { type: string }, PREC.Sequence)
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
    this.out += 'switch ('
    this.printNode(node.discriminant as unknown as { type: string }, PREC.Sequence)
    this.out += ') {\n'
    this.indentLevel++
    for (const c of node.cases) {
      this.out += this.indent()
      if (c.test) {
        this.out += 'case '
        this.printNode(c.test as unknown as { type: string }, PREC.Sequence)
        this.out += ':\n'
      } else {
        this.out += 'default:\n'
      }
      this.indentLevel++
      for (const stmt of c.consequent) {
        this.out += this.indent()
        this.printStatement(stmt as unknown as { type: string })
        this.out += '\n'
      }
      this.indentLevel--
    }
    this.indentLevel--
    this.out += `${this.indent()}}`
  }

  private printLabeledStatement(node: LabeledStatement): void {
    this.out += `${node.label.name}: `
    this.printStatement(node.body as unknown as { type: string })
  }

  private printTryStatement(node: TryStatement): void {
    this.out += 'try '
    this.printBlockStatement(node.block)
    if (node.handler) {
      this.out += ' catch'
      if (node.handler.param) {
        this.out += ' ('
        // An Identifier carries the TS type annotation (`catch (e: unknown)`);
        // printIdentifierWithOptional renders name + optional + annotation.
        if (node.handler.param.type === 'Identifier') {
          this.printIdentifierWithOptional(node.handler.param as never)
        } else {
          this.printNode(node.handler.param as unknown as { type: string }, PREC.Sequence)
        }
        this.out += ')'
      }
      this.out += ' '
      this.printBlockStatement(node.handler.body)
    }
    if (node.finalizer) {
      this.out += ' finally '
      this.printBlockStatement(node.finalizer)
    }
  }

  private printVariableDeclaration(node: VariableDeclaration): void {
    if (node.declare) this.out += 'declare '
    this.out += `${node.kind} `
    for (let i = 0; i < node.declarations.length; i++) {
      if (i > 0) this.out += ', '
      this.printVariableDeclarator(node.declarations[i]!)
    }
  }

  private printVariableDeclarator(node: VariableDeclarator): void {
    const idWithType = node.id as unknown as {
      type?: string
      name?: string
      typeAnnotation?: unknown
      optional?: boolean
      definite?: boolean
    }
    if (idWithType.type === 'Identifier' && idWithType.name) {
      this.out += idWithType.name
      if (idWithType.optional) this.out += '?'
      if ((node as unknown as Record<string, unknown>)['definite']) this.out += '!'
      if (idWithType.typeAnnotation) {
        this.printTSTypeAnnotation(idWithType.typeAnnotation as import('@oxc-project/types').TSTypeAnnotation)
      }
    } else if (idWithType.type === 'Identifier' && idWithType.optional) {
      this.out += '?'
      if ((node as unknown as Record<string, unknown>)['definite']) this.out += '!'
      if (idWithType.typeAnnotation) {
        this.printTSTypeAnnotation(idWithType.typeAnnotation as import('@oxc-project/types').TSTypeAnnotation)
      }
    } else {
      this.printNode(node.id as unknown as { type: string }, PREC.Sequence)
      if ((node as unknown as Record<string, unknown>)['definite']) this.out += '!'
      if (idWithType.typeAnnotation) {
        this.printTSTypeAnnotation(idWithType.typeAnnotation as import('@oxc-project/types').TSTypeAnnotation)
      }
    }
    if (node.init) {
      this.out += ' = '
      this.printNode(node.init as unknown as { type: string }, PREC.Assignment)
    }
  }

  private printParams(params: readonly unknown[]): void {
    for (let i = 0; i < params.length; i++) {
      if (i > 0) this.out += ', '
      const p = params[i] as Record<string, unknown>
      if (p['type'] === 'RestElement') {
        this.out += '...'
        this.printNode(p['argument'] as { type: string }, PREC.Assignment)
        if (p['typeAnnotation']) {
          this.printTSTypeAnnotation(p['typeAnnotation'] as TSTypeAnnotation)
        }
      } else if (p['type'] === 'TSParameterProperty') {
        const pp = p as unknown as {
          accessibility: string | null
          readonly: boolean
          override: boolean
          static: boolean
          decorators: Decorator[]
          parameter: unknown
        }
        this.printDecorators(pp.decorators)
        if (pp.accessibility) this.out += `${pp.accessibility} `
        if (pp.readonly) this.out += 'readonly '
        if (pp.override) this.out += 'override '
        if (pp.static) this.out += 'static '
        const inner = pp.parameter as Record<string, unknown>
        if (inner['type'] === 'Identifier') {
          this.printIdentifierWithOptional(inner as never)
        } else {
          this.printNode(inner as { type: string }, PREC.Sequence)
        }
      } else {
        // FormalParameter — may have decorators, accessibility handled via TSParameterProperty
        const fp = p as Record<string, unknown>
        if (fp['decorators'] && (fp['decorators'] as Decorator[]).length > 0) {
          this.printDecorators(fp['decorators'] as Decorator[])
        }
        // Identifier or pattern with optional, typeAnnotation
        // Print binding pattern
        if (fp['type'] === 'Identifier') {
          this.printIdentifierWithOptional(fp as unknown as never)
        } else {
          this.printNode(fp as unknown as { type: string }, PREC.Assignment)
          if (fp['typeAnnotation']) {
            this.printTSTypeAnnotation(fp['typeAnnotation'] as TSTypeAnnotation)
          }
        }
      }
    }
  }

  private printIdentifierWithOptional(
    node: BindingIdentifier & {
      optional?: boolean
      typeAnnotation?: TSTypeAnnotation | null
      decorators?: Decorator[]
    },
  ): void {
    this.out += node.name
    if (node.optional) this.out += '?'
    if (node.typeAnnotation) this.printTSTypeAnnotation(node.typeAnnotation)
  }

  private printClassBody(node: ClassBody): void {
    if (node.body.length === 0) {
      this.out += '{}'
      return
    }
    this.out += '{\n'
    this.indentLevel++
    for (const el of node.body) {
      this.out += this.indent()
      this.printNode(el as unknown as { type: string }, PREC.Sequence)
      this.out += '\n'
    }
    this.indentLevel--
    this.out += `${this.indent()}}`
  }

  private printMethodDefinition(node: MethodDefinition): void {
    this.printDecorators(node.decorators)
    if (node.accessibility) this.out += `${node.accessibility} `
    if (node.static) this.out += 'static '
    if (node.override) this.out += 'override '
    const fn = node.value as unknown as FunctionNode
    if (fn.async) this.out += 'async '
    if (fn.generator) this.out += '*'
    // AccessorProperty vs MethodDefinition — kind
    const kind = node.kind
    if (kind === 'get' || kind === 'set') {
      this.out += `${kind} `
    } else if (kind === 'constructor') {
      // no prefix
    }
    if (node.computed) {
      this.out += '['
      this.printNode(node.key as unknown as { type: string }, PREC.Sequence)
      this.out += ']'
    } else {
      this.printPropertyKeyForClass(node.key)
    }
    if (node.optional) this.out += '?'
    // fn already declared above
    if (fn.typeParameters) this.printTSTypeParameterDeclaration(fn.typeParameters)
    this.out += '('
    this.printParams(fn.params)
    this.out += ')'
    if (fn.returnType) this.printTSTypeAnnotation(fn.returnType)
    if (fn.body) {
      this.out += ' '
      this.printBlockStatement(fn.body as BlockStatement)
    } else {
      this.out += ';'
    }
  }

  private printPropertyDefinition(node: PropertyDefinition): void {
    this.printDecorators(node.decorators)
    if (node.declare) this.out += 'declare '
    if (node.accessibility) this.out += `${node.accessibility} `
    if (node.static) this.out += 'static '
    if (node.readonly) this.out += 'readonly '
    if (node.override) this.out += 'override '
    if (node.computed) {
      this.out += '['
      this.printNode(node.key as unknown as { type: string }, PREC.Sequence)
      this.out += ']'
    } else {
      this.printPropertyKeyForClass(node.key)
    }
    if (node.optional) this.out += '?'
    if (node.definite) this.out += '!'
    if (node.typeAnnotation) this.printTSTypeAnnotation(node.typeAnnotation)
    if (node.value) {
      this.out += ' = '
      this.printNode(node.value as unknown as { type: string }, PREC.Assignment)
    }
    this.out += ';'
  }

  private printAccessorProperty(node: AccessorProperty): void {
    this.printDecorators(node.decorators)
    if (node.accessibility) this.out += `${node.accessibility} `
    if (node.static) this.out += 'static '
    if (node.override) this.out += 'override '
    this.out += 'accessor '
    if (node.computed) {
      this.out += '['
      this.printNode(node.key as unknown as { type: string }, PREC.Sequence)
      this.out += ']'
    } else {
      this.printPropertyKeyForClass(node.key)
    }
    if (node.definite) this.out += '!'
    if (node.typeAnnotation) this.printTSTypeAnnotation(node.typeAnnotation)
    if (node.value) {
      this.out += ' = '
      this.printNode(node.value as unknown as { type: string }, PREC.Assignment)
    }
    this.out += ';'
  }

  private printPropertyKeyForClass(key: { type: string }, computed = false): void {
    if (computed) {
      this.out += '['
      this.printNode(key, PREC.Sequence)
      this.out += ']'
      return
    }
    if (key.type === 'Identifier') this.out += (key as IdentifierName).name
    else if (key.type === 'PrivateIdentifier') this.out += `#${(key as PrivateIdentifier).name}`
    else if (key.type === 'Literal') this.printLiteral(key as never)
    else this.printNode(key, PREC.Assignment)
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
    const kind = node.importKind === 'type' ? 'type ' : ''
    if (node.specifiers.length === 0) {
      // side-effect import: import "foo"
      this.out += `import ${kind}${this.printImportSource(node.source, node.attributes)};`
      return
    }
    // Check for namespace / default patterns
    const specs = node.specifiers
    // Detect: import * as ns, import default, import { ... }
    const defaultSpec = specs.find((s) => s.type === 'ImportDefaultSpecifier') as
      | ImportDefaultSpecifier
      | undefined
    const namespaceSpec = specs.find((s) => s.type === 'ImportNamespaceSpecifier') as
      | ImportNamespaceSpecifier
      | undefined
    const namedSpecs = specs.filter((s) => s.type === 'ImportSpecifier') as ImportSpecifier[]

    this.out += `import ${kind}`
    const parts: string[] = []
    if (defaultSpec) parts.push(defaultSpec.local.name)
    if (namespaceSpec) parts.push(`* as ${namespaceSpec.local.name}`)
    if (namedSpecs.length > 0) {
      const named = namedSpecs
        .map((s) => {
          const imported = s.imported
          const importedName = imported.type === 'Identifier'
            ? (imported as IdentifierName).name
            : (imported as { value: string }).value
          const inlineType = s.importKind === 'type' ? 'type ' : ''
          if (importedName === s.local.name) return `${inlineType}${importedName}`
          return `${inlineType}${importedName} as ${s.local.name}`
        })
        .join(', ')
      parts.push(`{ ${named} }`)
    }
    this.out += parts.join(', ')
    this.out += ` from ${this.printImportSource(node.source, node.attributes)};`
  }

  private printImportSource(source: { value: string; raw: string | null }, attrs: readonly ImportAttribute[]): string {
    const raw = source.raw ?? JSON.stringify(source.value)
    if (attrs.length === 0) return raw
    const attrStr = attrs.map((a) => `${this.printImportAttrKey(a.key)}: ${JSON.stringify(a.value.value)}`).join(', ')
    return `${raw} with { ${attrStr} }`
  }

  private printImportAttrKey(key: ImportAttribute['key']): string {
    if (key.type === 'Identifier') return (key as IdentifierName).name
    return JSON.stringify((key as { value: string }).value)
  }

  private printExportNamedDeclaration(node: ExportNamedDeclaration): void {
    if (node.declaration) {
      this.out += 'export '
      this.printStatement(node.declaration as unknown as { type: string })
      // declaration already has semicolon/block — avoid double
      return
    }
    this.out += 'export '
    if (node.exportKind === 'type') this.out += 'type '
    this.out += '{ '
    for (let i = 0; i < node.specifiers.length; i++) {
      if (i > 0) this.out += ', '
      const s = node.specifiers[i]!
      const localName = exportNameToString(s.local)
      const exportedName = exportNameToString(s.exported)
      const inlineType = s.exportKind === 'type' ? 'type ' : ''
      if (localName === exportedName) this.out += `${inlineType}${localName}`
      else this.out += `${inlineType}${localName} as ${exportedName}`
    }
    this.out += ' }'
    if (node.source) {
      this.out += ` from ${JSON.stringify(node.source.value)}`
      if (node.attributes.length > 0) {
        const attrStr = node.attributes
          .map((a) => `${this.printImportAttrKey(a.key)}: ${JSON.stringify(a.value.value)}`)
          .join(', ')
        this.out += ` with { ${attrStr} }`
      }
    }
    this.out += ';'
  }

  private printExportDefaultDeclaration(node: ExportDefaultDeclaration): void {
    this.out += 'export default '
    const decl = node.declaration as { type: string }
    if (
      decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration' || decl.type === 'TSInterfaceDeclaration'
    ) {
      this.printStatement(decl as unknown as { type: string })
    } else {
      this.printNode(decl, PREC.Assignment)
      this.out += ';'
    }
  }

  private printExportAllDeclaration(node: ExportAllDeclaration): void {
    this.out += 'export '
    if (node.exportKind === 'type') this.out += 'type '
    this.out += '*'
    if (node.exported) {
      this.out += ` as ${exportNameToString(node.exported)}`
    }
    this.out += ` from ${JSON.stringify(node.source.value)}`
    if (node.attributes.length > 0) {
      const attrStr = node.attributes
        .map((a) => `${this.printImportAttrKey(a.key)}: ${JSON.stringify(a.value.value)}`)
        .join(', ')
      this.out += ` with { ${attrStr} }`
    }
    this.out += ';'
  }

  // -----------------------------------------------------------------------
  // TS Declarations
  // -----------------------------------------------------------------------

  private printTSTypeAliasDeclaration(node: TSTypeAliasDeclaration): void {
    if (node.declare) this.out += 'declare '
    this.out += `type ${node.id.name}`
    if (node.typeParameters) this.printTSTypeParameterDeclaration(node.typeParameters)
    this.out += ` = ${this.printTSTypeToString(node.typeAnnotation)};`
  }

  private printTSInterfaceDeclaration(node: TSInterfaceDeclaration): void {
    if (node.declare) this.out += 'declare '
    this.out += `interface ${node.id.name}`
    if (node.typeParameters) this.printTSTypeParameterDeclaration(node.typeParameters)
    if (node.extends.length > 0) {
      this.out += ' extends '
      for (let i = 0; i < node.extends.length; i++) {
        if (i > 0) this.out += ', '
        const ex = node.extends[i]!
        this.printNode(ex.expression as unknown as { type: string }, PREC.Assignment)
        if (ex.typeArguments) this.printTSTypeParameterInstantiation(ex.typeArguments)
      }
    }
    this.out += ' '
    this.printTSInterfaceBody(node.body)
  }

  private printTSInterfaceBody(node: TSInterfaceBody): void {
    if (node.body.length === 0) {
      this.out += '{}'
      return
    }
    this.out += '{\n'
    this.indentLevel++
    for (const m of node.body) {
      this.out += this.indent()
      this.printTSSignature(m as never)
      this.out += '\n'
    }
    this.indentLevel--
    this.out += `${this.indent()}}`
  }

  private printTSSignature(sig: { type: string }): void {
    switch (sig.type) {
      case 'TSPropertySignature': {
        const n = sig as unknown as TSPropertySignature
        if (n.readonly) this.out += 'readonly '
        this.printPropertyKeyForClass(n.key as unknown as { type: string }, n.computed === true)
        if (n.optional) this.out += '?'
        if (n.typeAnnotation) this.printTSTypeAnnotation(n.typeAnnotation)
        this.out += ';'
        break
      }
      case 'TSIndexSignature': {
        const n = sig as unknown as TSIndexSignature
        if (n.readonly) this.out += 'readonly '
        if (n.static) this.out += 'static '
        this.out += '['
        for (let i = 0; i < n.parameters.length; i++) {
          if (i > 0) this.out += ', '
          const p = n.parameters[i]!
          this.out += `${p.name}: `
          this.printTSType((p.typeAnnotation as TSTypeAnnotation).typeAnnotation)
        }
        this.out += ']'
        this.printTSTypeAnnotation(n.typeAnnotation)
        this.out += ';'
        break
      }
      case 'TSCallSignatureDeclaration': {
        const n = sig as unknown as TSCallSignatureDeclaration
        if (n.typeParameters) this.printTSTypeParameterDeclaration(n.typeParameters)
        this.out += '('
        this.printParams(n.params)
        this.out += ')'
        if (n.returnType) this.printTSTypeAnnotation(n.returnType)
        this.out += ';'
        break
      }
      case 'TSConstructSignatureDeclaration': {
        const n = sig as unknown as TSConstructSignatureDeclaration
        this.out += 'new '
        if (n.typeParameters) this.printTSTypeParameterDeclaration(n.typeParameters)
        this.out += '('
        this.printParams(n.params)
        this.out += ')'
        if (n.returnType) this.printTSTypeAnnotation(n.returnType)
        this.out += ';'
        break
      }
      case 'TSMethodSignature': {
        const n = sig as unknown as TSMethodSignature
        if (n.kind === 'get' || n.kind === 'set') this.out += `${n.kind} `
        this.printPropertyKeyForClass(n.key as unknown as { type: string }, n.computed === true)
        if (n.optional) this.out += '?'
        if (n.typeParameters) this.printTSTypeParameterDeclaration(n.typeParameters)
        this.out += '('
        this.printParams(n.params)
        this.out += ')'
        if (n.returnType) this.printTSTypeAnnotation(n.returnType)
        this.out += ';'
        break
      }
      default:
        this.out += `/* sig:${sig.type} */;`
        break
    }
  }

  private printTSEnumDeclaration(node: TSEnumDeclaration): void {
    if (node.declare) this.out += 'declare '
    if (node.const) this.out += 'const '
    this.out += `enum ${node.id.name} `
    this.out += '{\n'
    this.indentLevel++
    for (const m of node.body.members) {
      this.out += this.indent()
      if (m.id.type === 'Identifier') this.out += (m.id as IdentifierName).name
      else if (m.id.type === 'Literal') this.printLiteral(m.id as unknown as never)
      else this.printNode(m.id as unknown as { type: string }, PREC.Sequence)
      if (m.initializer) {
        this.out += ' = '
        this.printNode(m.initializer as unknown as { type: string }, PREC.Assignment)
      }
      this.out += ',\n'
    }
    this.indentLevel--
    this.out += `${this.indent()}}`
  }

  private printTSModuleDeclaration(node: TSModuleDeclaration): void {
    if (node.declare) this.out += 'declare '
    if ((node as unknown as { global: boolean }).global) {
      this.out += 'global '
      // TSGlobalDeclaration id is always "global" — don't emit it again
    } else {
      const kind = node.kind
      this.out += `${kind} `
      const id = node.id as unknown as { type: string }
      if (id.type === 'Identifier') this.out += (id as IdentifierName).name
      else if (id.type === 'Literal') this.printLiteral(id as never)
      else this.printNode(id, PREC.Sequence)
    }
    if (node.body) {
      this.out += ' '
      this.printTSModuleBlock(node.body)
    } else {
      this.out += ';'
    }
  }

  private printTSModuleBlock(node: TSModuleBlock): void {
    this.out += '{\n'
    this.indentLevel++
    for (const stmt of node.body) {
      this.out += this.indent()
      this.printStatement(stmt as unknown as { type: string })
      this.out += '\n'
    }
    this.indentLevel--
    this.out += `${this.indent()}}`
  }

  private printTSImportEqualsDeclaration(node: TSImportEqualsDeclaration): void {
    this.out += `import ${node.importKind === 'type' ? 'type ' : ''}${node.id.name} = `
    const ref = node.moduleReference as unknown as { type: string }
    if (ref.type === 'TSExternalModuleReference') {
      this.out += `require(${
        (ref as unknown as { expression: { value: string } }).expression.value
          ? JSON.stringify((ref as unknown as { expression: { value: string } }).expression.value)
          : '""'
      })`
    } else {
      this.printNode(ref, PREC.Sequence)
    }
    this.out += ';'
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
        if (n.typeArguments) this.printTSTypeParameterInstantiation(n.typeArguments)
        break
      }
      case 'TSUnionType': {
        const n = node as TSUnionType
        for (let i = 0; i < n.types.length; i++) {
          if (i > 0) this.out += ' | '
          this.doPrintTSType(n.types[i]!)
        }
        break
      }
      case 'TSIntersectionType': {
        const n = node as TSIntersectionType
        for (let i = 0; i < n.types.length; i++) {
          if (i > 0) this.out += ' & '
          this.doPrintTSType(n.types[i]!)
        }
        break
      }
      case 'TSArrayType': {
        const n = node as TSArrayType
        // Need parens if element is union/intersection
        const needsParens = n.elementType.type === 'TSUnionType' || n.elementType.type === 'TSIntersectionType'
        if (needsParens) this.out += '('
        this.doPrintTSType(n.elementType)
        if (needsParens) this.out += ')'
        this.out += '[]'
        break
      }
      case 'TSTypeLiteral': {
        const n = node as unknown as { members: { type: string }[] }
        if (n.members.length === 0) {
          this.out += '{}'
        } else {
          this.out += '{ '
          for (let i = 0; i < n.members.length; i++) {
            if (i > 0) this.out += '; '
            this.printTSSignature(n.members[i] as never)
            // strip trailing ; added by printTSSignature — we use ; as separator
            if (this.out.endsWith(';')) this.out = this.out.slice(0, -1)
          }
          this.out += ' }'
        }
        break
      }
      case 'TSTupleType': {
        const n = node as TSTupleType
        this.out += '['
        for (let i = 0; i < n.elementTypes.length; i++) {
          if (i > 0) this.out += ', '
          const el = n.elementTypes[i]!
          if (el.type === 'TSRestType') {
            this.out += '...'
            this.doPrintTSType((el as TSRestType).typeAnnotation)
          } else if (el.type === 'TSOptionalType') {
            this.doPrintTSType((el as TSOptionalType).typeAnnotation)
            this.out += '?'
          } else if (el.type === 'TSNamedTupleMember') {
            const m = el as TSNamedTupleMember
            this.out += `${m.label.name}${m.optional ? '?' : ''}: `
            const inner = m.elementType
            if (inner.type === 'TSRestType') {
              this.out += '...'
              this.doPrintTSType((inner as TSRestType).typeAnnotation)
            } else if (inner.type === 'TSOptionalType') {
              this.doPrintTSType((inner as TSOptionalType).typeAnnotation)
              this.out += '?'
            } else {
              this.doPrintTSType(inner as TSType)
            }
          } else {
            this.doPrintTSType(el as TSType)
          }
        }
        this.out += ']'
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
        if (n.typeParameter.constraint) {
          this.out += ' extends '
          this.doPrintTSType(n.typeParameter.constraint)
        }
        break
      }
      case 'TSTypeQuery': {
        const n = node as TSTypeQuery
        this.out += 'typeof '
        if (n.exprName.type === 'TSImportType') {
          this.doPrintTSType(n.exprName as unknown as TSType)
        } else {
          this.printTSTypeName(n.exprName as unknown as Parameters<PrintState['printTSTypeName']>[0])
        }
        if (n.typeArguments) this.printTSTypeParameterInstantiation(n.typeArguments)
        break
      }
      case 'TSImportType': {
        const n = node as TSImportType
        if (n.options) {
          this.out += `import(${JSON.stringify(n.source.value)}, `
          this.printNode(n.options as unknown as { type: string }, PREC.Assignment)
          this.out += ')'
        } else {
          this.out += `import(${JSON.stringify(n.source.value)})`
        }
        if (n.qualifier) {
          this.out += '.'
          this.printTSImportTypeQualifier(n.qualifier)
        }
        if (n.typeArguments) this.printTSTypeParameterInstantiation(n.typeArguments)
        break
      }
      case 'TSTypeOperator': {
        const n = node as TSTypeOperator
        this.out += `${n.operator} `
        this.doPrintTSType(n.typeAnnotation)
        break
      }
      case 'TSMappedType': {
        const n = node as TSMappedType
        this.out += '{ '
        if (n.readonly) this.out += n.readonly === true ? 'readonly ' : `${n.readonly}readonly `
        this.out += `[${n.key.name} in `
        this.doPrintTSType(n.constraint)
        if (n.nameType) {
          this.out += ' as '
          this.doPrintTSType(n.nameType)
        }
        this.out += ']'
        if (n.optional) this.out += n.optional === true ? '?' : `${n.optional}?`
        if (n.typeAnnotation) {
          this.out += ': '
          this.doPrintTSType(n.typeAnnotation)
        }
        this.out += ' }'
        break
      }
      case 'TSTemplateLiteralType': {
        const n = node as TSTemplateLiteralType
        this.out += '`'
        for (let i = 0; i < n.quasis.length; i++) {
          this.out += n.quasis[i]!.value.raw
          if (!n.quasis[i]!.tail) {
            this.out += '${'
            this.doPrintTSType(n.types[i]!)
            this.out += '}'
          }
        }
        this.out += '`'
        break
      }
      case 'TSFunctionType': {
        const n = node as TSFunctionType
        if (n.typeParameters) this.printTSTypeParameterDeclaration(n.typeParameters)
        this.out += '('
        this.printParams(n.params)
        this.out += ') => '
        this.doPrintTSType((n.returnType as TSTypeAnnotation).typeAnnotation)
        break
      }
      case 'TSConstructorType': {
        const n = node as TSConstructorType
        if (n.abstract) this.out += 'abstract '
        this.out += 'new '
        if (n.typeParameters) this.printTSTypeParameterDeclaration(n.typeParameters)
        this.out += '('
        this.printParams(n.params)
        this.out += ') => '
        this.doPrintTSType((n.returnType as TSTypeAnnotation).typeAnnotation)
        break
      }
      case 'TSTypePredicate': {
        const n = node as TSTypePredicate
        if (n.asserts) this.out += 'asserts '
        if (n.parameterName.type === 'TSThisType') this.out += 'this'
        else this.out += (n.parameterName as IdentifierName).name
        if (n.typeAnnotation) {
          this.out += ' is '
          this.doPrintTSType(n.typeAnnotation.typeAnnotation)
        }
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
        const n = node as TSLiteralType
        const lit = n.literal as unknown as { type: string }
        if (lit.type === 'Literal') this.printLiteral(lit as never)
        else if (lit.type === 'TemplateLiteral') this.printTemplateLiteral(lit as unknown as TemplateLiteral)
        else if (lit.type === 'UnaryExpression') {
          const u = lit as unknown as UnaryExpression
          this.out += u.operator
          this.printLiteral((u.argument as unknown as { value: unknown; raw: string | null; type: string }) as never)
        } else {
          this.printNode(lit, PREC.Sequence)
        }
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
        const n = node as JSDocNullableType
        if (n.postfix) {
          this.doPrintTSType(n.typeAnnotation)
          this.out += '?'
        } else {
          this.out += '?'
          this.doPrintTSType(n.typeAnnotation)
        }
        break
      }
      case 'TSJSDocNonNullableType': {
        const n = node as JSDocNonNullableType
        if (n.postfix) {
          this.doPrintTSType(n.typeAnnotation)
          this.out += '!'
        } else {
          this.out += '!'
          this.doPrintTSType(n.typeAnnotation)
        }
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

  private printTSTypeName(name: IdentifierReference | TSQualifiedName | { type: string }): void {
    if (!name) return
    if (name.type === 'Identifier') {
      this.out += (name as IdentifierReference).name
    } else if (name.type === 'TSQualifiedName') {
      this.printTSTypeName((name as TSQualifiedName).left)
      this.out += '.'
      this.out += (name as TSQualifiedName).right.name
    } else if ((name as { type: string }).type === 'ThisExpression') {
      this.out += 'this'
    } else {
      this.printNode(name as { type: string }, PREC.Sequence)
    }
  }

  private printTSImportTypeQualifier(q: TSImportType['qualifier']): void {
    if (!q) return
    if (q.type === 'Identifier') {
      this.out += (q as IdentifierName).name
    } else {
      const qq = q as { left: unknown; right: IdentifierName }
      this.printTSImportTypeQualifier(qq.left as TSImportType['qualifier'])
      this.out += `.${qq.right.name}`
    }
  }

  private printTSTypeAnnotation(node: TSTypeAnnotation): void {
    this.out += ': '
    this.doPrintTSType(node.typeAnnotation)
  }

  private printTSTypeParameterDeclaration(node: TSTypeParameterDeclaration): void {
    this.out += '<'
    for (let i = 0; i < node.params.length; i++) {
      if (i > 0) this.out += ', '
      this.printTSTypeParameter(node.params[i]!)
    }
    this.out += '>'
  }

  private printTSTypeParameterInstantiation(node: TSTypeParameterInstantiation): void {
    this.out += '<'
    for (let i = 0; i < node.params.length; i++) {
      if (i > 0) this.out += ', '
      this.doPrintTSType(node.params[i]!)
    }
    this.out += '>'
  }

  private printTSTypeParameter(
    node: {
      name: BindingIdentifier
      constraint: TSType | null
      default: TSType | null
      in: boolean
      out: boolean
      const: boolean
    },
  ): void {
    if (node.in) this.out += 'in '
    if (node.out) this.out += 'out '
    if (node.const) this.out += 'const '
    this.out += node.name.name
    if (node.constraint) {
      this.out += ' extends '
      this.doPrintTSType(node.constraint)
    }
    if (node.default) {
      this.out += ' = '
      this.doPrintTSType(node.default)
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function exportNameToString(name: { type: string; name?: string; value?: string }): string {
  if (name.type === 'Identifier') return (name as IdentifierName).name
  return (name as { value: string }).value ?? ''
}

function isTSTypeNode(t: string): boolean {
  return (
    t === 'TSAnyKeyword' ||
    t === 'TSStringKeyword' ||
    t === 'TSBooleanKeyword' ||
    t === 'TSNumberKeyword' ||
    t === 'TSBigIntKeyword' ||
    t === 'TSSymbolKeyword' ||
    t === 'TSVoidKeyword' ||
    t === 'TSUndefinedKeyword' ||
    t === 'TSNullKeyword' ||
    t === 'TSNeverKeyword' ||
    t === 'TSUnknownKeyword' ||
    t === 'TSObjectKeyword' ||
    t === 'TSIntrinsicKeyword' ||
    t === 'TSThisType' ||
    t === 'TSTypeReference' ||
    t === 'TSUnionType' ||
    t === 'TSIntersectionType' ||
    t === 'TSArrayType' ||
    t === 'TSTypeLiteral' ||
    t === 'TSTupleType' ||
    t === 'TSNamedTupleMember' ||
    t === 'TSOptionalType' ||
    t === 'TSRestType' ||
    t === 'TSConditionalType' ||
    t === 'TSInferType' ||
    t === 'TSTypeQuery' ||
    t === 'TSImportType' ||
    t === 'TSTypeOperator' ||
    t === 'TSMappedType' ||
    t === 'TSTemplateLiteralType' ||
    t === 'TSFunctionType' ||
    t === 'TSConstructorType' ||
    t === 'TSTypePredicate' ||
    t === 'TSIndexedAccessType' ||
    t === 'TSLiteralType' ||
    t === 'TSParenthesizedType' ||
    t === 'TSJSDocNullableType' ||
    t === 'TSJSDocNonNullableType' ||
    t === 'TSJSDocUnknownType'
  )
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

function needsParensForMemberObject(node: Expression): boolean {
  return (
    node.type === 'SequenceExpression' ||
    node.type === 'AssignmentExpression' ||
    node.type === 'ConditionalExpression' ||
    node.type === 'LogicalExpression' ||
    node.type === 'BinaryExpression' ||
    node.type === 'UnaryExpression' ||
    node.type === 'UpdateExpression' ||
    node.type === 'AwaitExpression' ||
    node.type === 'YieldExpression'
  )
}
