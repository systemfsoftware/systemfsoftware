# TS7 Native Preview API Recipe for `@stryker-js/typescript-checker`

_Target: TypeScript 7.0.2 (`typescript/unstable/sync`)_

---

## 1. Import Paths

```typescript
// Core sync API
import {
  API,
  type Diagnostic,
  type DiagnosticCategory,
  type FileChanges,
  type FileSystem,
  type Program,
  type Project,
  type Snapshot,
} from 'typescript/unstable/sync'

// Virtual FS helper (for tests / in-memory projects)
import { createVirtualFileSystem } from 'typescript/unstable/fs'

// AST (import extraction, traversal)
import {
  type FileReference,
  type LineAndCharacter,
  type Node,
  type SourceFile,
  SyntaxKind,
} from 'typescript/unstable/ast'
```

---

## 2. Construct API with Custom FileSystem

```typescript
const api = new API({
  cwd: '/project/root', // default: process.cwd()
  tsserverPath: '/usr/bin/tsgo', // optional; uses bundled binary by default
  fs: myFileSystem, // optional custom FileSystem
  collectTiming: false, // optional; enable for profiling
})
```

### FileSystem Interface

```typescript
interface FileSystem {
  /** Return string, null (file not found, no fallback), or undefined (fall back to real FS) */
  readFile?: (fileName: string) => string | null | undefined
  fileExists?: (fileName: string) => boolean | undefined
  directoryExists?: (directoryName: string) => boolean | undefined
  getAccessibleEntries?: (directoryName: string) => FileSystemEntries | undefined
  realpath?: (path: string) => string | undefined
  writeFile?: (path: string, content: string) => void
  removeFile?: (path: string) => void
}

interface FileSystemEntries {
  files: string[]
  directories: string[]
}
```

**Critical**: Only `readFile`, `fileExists`, `directoryExists`, `getAccessibleEntries`, `realpath` are delegated via IPC callback to the Go binary. `writeFile` and `removeFile` are _client-side only_ (used by `createVirtualFileSystem` for mutation tracking, no callback to the server).

### readFile Three-Way Semantics

| Return      | Meaning                                          |
| ----------- | ------------------------------------------------ |
| `string`    | File content (empty string `""` for empty files) |
| `null`      | File does not exist — **no fallback** to real FS |
| `undefined` | Fall back to real filesystem                     |

For mutation testing: return `null` for files you control, `undefined` for all others.

---

## 3. Open a Project — Parse Config + First Snapshot

```typescript
// Parse tsconfig to discover options + root files (does NOT open a project)
const config = api.parseConfigFile('/project/root/tsconfig.json')
// config: { options: Record<string, unknown>, fileNames: string[] }

// Create first snapshot (opens the project, compiles everything)
const snapshot: Snapshot = api.updateSnapshot({
  openProjects: ['/project/root/tsconfig.json'],
})

// Access projects
const projects: readonly Project[] = snapshot.getProjects()
const project: Project | undefined = snapshot.getProject('/project/root/tsconfig.json')
const fileProject: Project | undefined = snapshot.getDefaultProjectForFile('/project/root/src/index.ts')
```

---

## 4. Update Snapshots — Applying File Changes

```typescript
const snapshot2: Snapshot = api.updateSnapshot({
  openProjects: ['/project/root/tsconfig.json'],
  fileChanges: {
    changed: ['/project/root/src/index.ts'],
    created: ['/project/root/src/new-file.ts'],
    deleted: ['/project/root/src/old-file.ts'],
  },
})

// Invalidate ALL cached source files (full recompile)
const snapshot2b: Snapshot = api.updateSnapshot({
  openProjects: ['/project/root/tsconfig.json'],
  fileChanges: { invalidateAll: true },
})

// Full parameter shape:
export interface UpdateSnapshotParams {
  openProjects?: DocumentIdentifier[]
  closeProjects?: DocumentIdentifier[]
  openFiles?: DocumentIdentifier[]
  closeFiles?: DocumentIdentifier[]
  fileChanges?: FileChanges // { changed?, created?, deleted? } | { invalidateAll: true }
}
```

**Key**: Snapshots are automatically incremental — `updateSnapshot` returns a NEW `Snapshot`. The API internally ref-counts source file cache entries across snapshots. The OLD snapshot remains usable until `.dispose()`'d.

---

## 5. Getting Semantic Diagnostics

```typescript
const program: Program = project.program

// All diagnostic types (each optionally scoped to one file):
const semanticDiags = program.getSemanticDiagnostics() // type errors (main one)
const syntacticDiags = program.getSyntacticDiagnostics() // parse errors
const bindDiags = program.getBindDiagnostics() // binding errors
const suggestionDiags = program.getSuggestionDiagnostics() // suggestions
const declDiags = program.getDeclarationDiagnostics() // .d.ts emit errors
const configDiags = program.getConfigFileParsingDiagnostics() // tsconfig errors
const globalDiags = program.getGlobalDiagnostics() // non-file-specific
const programDiags = program.getProgramDiagnostics() // program-wide

// Scoped to a single file:
const fileSemDiags = program.getSemanticDiagnostics('/project/root/src/index.ts')
// URI form:
const uriSemDiags = program.getSemanticDiagnostics({ uri: 'file:///project/root/src/index.ts' })
```

---

## 6. Diagnostic Type Shape

```typescript
interface Diagnostic {
  readonly fileName?: string | undefined // source file (undefined for global diags)
  readonly pos: number // UTF-16 code unit offset (start)
  readonly end: number // UTF-16 code unit offset (end)
  readonly code: number // TS error code (e.g. 2322)
  readonly category: DiagnosticCategory // 0=Warning, 1=Error, 2=Suggestion, 3=Message
  readonly text: string // *** .text, NOT .messageText! ***
  readonly reportsUnnecessary?: boolean
  readonly reportsDeprecated?: boolean
  readonly messageChain?: readonly Diagnostic[]
  readonly relatedInformation?: readonly Diagnostic[]
}

enum DiagnosticCategory {
  Warning = 0,
  Error = 1,
  Suggestion = 2,
  Message = 3,
}
```

**⚠️ Key difference from old TS API**:

| Old                                         | New                                              |
| ------------------------------------------- | ------------------------------------------------ |
| `diagnostic.messageText` (string \| chain)  | `diagnostic.text` (always string, pre-formatted) |
| `diagnostic.file` (SourceFile \| undefined) | `diagnostic.fileName` (string \| undefined)      |
| `diagnostic.start` (number)                 | `diagnostic.pos` (number)                        |
| `ts.formatDiagnostics(...)`                 | **No equivalent** — use `.text` directly         |

### Diagnostic Formatting Example

```typescript
function formatDiagnostic(diag: Diagnostic, sourceFile?: SourceFile): string {
  const severity = diag.category === DiagnosticCategory.Error
    ? 'error'
    : diag.category === DiagnosticCategory.Warning
    ? 'warning'
    : diag.category === DiagnosticCategory.Suggestion
    ? 'suggestion'
    : 'message'

  let loc = ''
  if (sourceFile && diag.fileName) {
    const lc = sourceFile.getLineAndCharacterOfPosition(diag.pos)
    loc = `${diag.fileName}(${lc.line + 1},${lc.character + 1}): `
  } else if (diag.fileName) {
    loc = `${diag.fileName}: `
  }

  let msg = `${loc}${severity} TS${diag.code}: ${diag.text}`
  if (diag.relatedInformation) {
    for (const related of diag.relatedInformation) {
      msg += `\n  Related: ${related.text} at ${related.fileName}:${related.pos}`
    }
  }
  return msg
}
```

---

## 7. Import Extraction & Dependency Graph

The old TS API had `program.getAllDependencies(sourceFile)` — **there is NO equivalent** in TS7. Instead:

```typescript
interface SourceFile extends Node {
  readonly imports: readonly Node[] // ImportDeclaration / ImportEqualsDeclaration nodes
  readonly referencedFiles: readonly FileReference[] // /// <reference path="..." />
  readonly typeReferenceDirectives: readonly FileReference[] // /// <reference types="..." />
  readonly libReferenceDirectives: readonly FileReference[] // /// <reference lib="..." />
  readonly moduleAugmentations: readonly Node[]
  readonly ambientModuleNames: readonly string[]
}

interface FileReference extends TextRange {
  readonly fileName: string // resolved file path or module name
  readonly resolutionMode: number // ModuleKind enum
  readonly preserve: boolean
}
```

### Extract Import Specifiers from SourceFile

```typescript
function extractImports(sourceFile: SourceFile): string[] {
  const result: string[] = []

  for (const node of sourceFile.imports) {
    if (node.kind === SyntaxKind.ImportDeclaration) {
      // Walk to find the StringLiteral moduleSpecifier child
      let spec: Node | undefined
      node.forEachChild(child => {
        if (child.kind === SyntaxKind.StringLiteral) spec = child
      })
      if (spec) result.push(spec.getText(sourceFile))
    } else if (node.kind === SyntaxKind.ImportEqualsDeclaration) {
      // Find moduleReference -> expression -> StringLiteral
      node.forEachChild(child => {
        if (child.kind === SyntaxKind.ExternalModuleReference) {
          child.forEachChild(refChild => {
            if (refChild.kind === SyntaxKind.StringLiteral) {
              result.push(refChild.getText(sourceFile))
            }
          })
        }
      })
    }
  }

  // Triple-slash directives
  for (const ref of sourceFile.referencedFiles) result.push(ref.fileName)
  for (const ref of sourceFile.typeReferenceDirectives) result.push(ref.fileName)

  return result
}
```

### Build Dependency Graph for Grouping

```typescript
function buildDependencyGraph(program: Program): Map<string, FileNode> {
  const nodes = new Map<string, FileNode>()
  for (const name of program.getSourceFileNames()) {
    if (name.endsWith('.d.ts') || name.includes('node_modules')) continue
    nodes.set(name, { fileName: name, imports: [], children: [], parents: [] })
  }
  for (const [name, node] of nodes) {
    const sf = program.getSourceFile(name)
    if (!sf) continue
    for (const spec of extractImports(sf)) {
      const resolved = resolveModuleSpecifier(name, spec)
      if (resolved && nodes.has(resolved)) {
        node.imports.push(resolved)
        nodes.get(resolved)!.parents.push(node)
      }
    }
  }
  return nodes
}
```

**⚠️ No automatic module resolution**: `SourceFile.imports` nodes contain _source-text_ specifier strings (e.g. `"./foo"`), not resolved paths. You must resolve them yourself (simple relative path joining suffices for stryker's grouping needs).

---

## 8. Lifecycle & Cleanup

```typescript
// Create API once per process
const api = new API({ fs: myFS })

// Each check() iteration:
const snap1 = api.updateSnapshot({ openProjects: ['tsconfig.json'] })
// ... use snap1 ...
const snap2 = api.updateSnapshot({ openProjects: ['tsconfig.json'], fileChanges: { changed: ['src/index.ts'] } })
snap1.dispose() // release old snapshot

// Disposal also via Symbol.dispose for using()
{
  using snap = api.updateSnapshot({ openProjects: ['tsconfig.json'] })
}

// Teardown
api.close() // disposes ALL active snapshots + closes IPC channel
```

**Cleanup discipline**:

1. `API` once per process.
2. Each `check()`: `updateSnapshot(...)` → get diagnostics → consume results.
3. Dispose old snapshots promptly to free server-side refs.
4. `API.close()` on shutdown.

---

## 9. Minimal Checker Loop Skeleton

```typescript
function createChecker(tsconfigPath: string, fs?: FileSystem) {
  const api = new API({ fs })
  let snapshot = api.updateSnapshot({ openProjects: [tsconfigPath] })
  const depGraph = buildDependencyGraph(snapshot.getProject(tsconfigPath)!.program)

  return {
    check(mutatedFiles: string[]): { [id: string]: { status: string; reason?: string } } {
      snapshot.dispose()
      snapshot = api.updateSnapshot({ openProjects: [tsconfigPath], fileChanges: { changed: mutatedFiles } })
      const program = snapshot.getProject(tsconfigPath)!.program

      const allDiags = [
        ...program.getSemanticDiagnostics(),
        ...program.getProgramDiagnostics(),
      ]
      if (allDiags.length === 0) return {}

      // Map errors to mutants using depGraph (see §10)
      return mapErrors(allDiags, depGraph, mutants)
    },
    close() {
      snapshot.dispose()
      api.close()
    },
  }
}
```

---

## 10. Mapping Errors to Mutants (Grouping Strategy)

Same bidirectional parent/child graph as upstream:

- `getAllParentReferencesIncludingSelf()` — walk UP to find which file's mutation could cause an error
- `getMutantsWithReferenceToChildrenOrSelf()` — walk DOWN from the error file to find matching mutants

With TS7 the graph is built from `SourceFile.imports` (§7); the error-mutant mapping logic is **identical** to upstream.

---

## 11. Missing Capabilities vs Old TS API

| Capability                                | Old API         | TS7 Native                   | Workaround                                            |
| ----------------------------------------- | --------------- | ---------------------------- | ----------------------------------------------------- |
| `program.getAllDependencies(sf)`          | Yes             | **No**                       | Extract from `SourceFile.imports` + `referencedFiles` |
| `ts.formatDiagnostics(...)`               | Yes             | **No**                       | Use `diagnostic.text` directly                        |
| `diagnostic.messageText`                  | yes             | **No** — `.text: string`     | Use `.text`                                           |
| `diagnostic.file`                         | yes             | **No** — `.fileName: string` | `program.getSourceFile(diag.fileName)`                |
| `diagnostic.start`                        | yes             | `.pos`                       | Use `.pos`                                            |
| `createProgram` / `createSolutionBuilder` | Yes             | **No**                       | `api.parseConfigFile()` + `api.updateSnapshot()`      |
| `ts.sys`                                  | Full FS overlay | Partial `FileSystem`         | Only 5 IPC callbacks; no `watchFile`, `createHash`    |
| Program emit                              | Yes             | **No**                       | Not needed for type-checking                          |
| Module resolution                         | Yes             | **No**                       | Custom implementation needed                          |

---

## 12. Edge Cases & Gotchas

- **`readFile` `null` vs `undefined`**: `null` = "confirmed not found, don't fall back". `undefined` = "check real FS".
- **Empty files**: `readFile` returning `""` is valid content, not "not found".
- **`parseConfigFile` does NOT open a project** — you still need `updateSnapshot`.
- **`Snapshot.dispose()` is ref-counted per snapshot** — call when done; old snapshots are safe while in use.
- **Diagnostic offsets are relative to ORIGINAL content** — since mutations are applied before `updateSnapshot`, offsets are correct.
- **`SourceFile` is lazy-materialized** — cheap to call for many files in a loop.
- **No `watchFile` / `watchDirectory`** — not needed for mutation testing's apply-check-repeat model.
