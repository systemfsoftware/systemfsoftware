package evidence

import (
  "encoding/json"
  "os"
  "path/filepath"
  "strings"
  "testing"

  shimast "github.com/microsoft/typescript-go/shim/ast"
  shimcore "github.com/microsoft/typescript-go/shim/core"
  shimparser "github.com/microsoft/typescript-go/shim/parser"

  "github.com/samchon/ttsc/packages/lint/rule"
)

func rootedTypeScriptProgram(
  t *testing.T,
  files map[string]string,
  programFiles []string,
  config string,
) (string, graphConfig, []*shimast.SourceFile) {
  t.Helper()
  workspace := t.TempDir()
  root := filepath.Join(workspace, "packages", "backend")
  if err := os.MkdirAll(root, 0o755); err != nil {
    t.Fatal(err)
  }
  for relative, content := range files {
    absolute := filepath.Join(workspace, filepath.FromSlash(relative))
    if err := os.MkdirAll(filepath.Dir(absolute), 0o755); err != nil {
      t.Fatal(err)
    }
    if err := os.WriteFile(absolute, []byte(content), 0o644); err != nil {
      t.Fatal(err)
    }
  }
  sources := make([]*shimast.SourceFile, 0, len(programFiles))
  for _, relative := range programFiles {
    content := files[relative]
    absolute := filepath.Join(workspace, filepath.FromSlash(relative))
    sources = append(sources, shimparser.ParseSourceFile(
      shimast.SourceFileParseOptions{FileName: filepath.ToSlash(absolute)},
      content,
      shimcore.ScriptKindTS,
    ))
  }
  decoded, problems := decodeGraphConfig(json.RawMessage(config))
  if len(problems) != 0 {
    t.Fatalf("configuration did not decode: %s", strings.Join(problems, "\n"))
  }
  resolveGraphBases(root, &decoded)
  return root, decoded, sources
}

/**
 * Verifies a TypeScript claim root addresses a sibling source already supplied
 * by ttsc, without changing its diagnostic location.
 *
 * A monorepo package needs claim files to be selected relative to their owning
 * sibling, while a diagnostic still needs the path a developer can open from
 * the active project. Keeping the population address and display path separate
 * prevents either concern from leaking into the other.
 *
 *  1. Supply one API DTO as an explicit Program source.
 *  2. Materialize it through a `../api` TypeScript claim root.
 *  3. Assert root-relative selection and project-relative locations.
 */
func TestTypeScriptClaimRootMaterializesAnExplicitSiblingProgramSource(t *testing.T) {
  root, config, sources := rootedTypeScriptProgram(
    t,
    map[string]string{
      "packages/api/src/structures/ISale.ts": "/** @evidence docs/spec.md#sale Required contract. */\nexport interface ISale {}",
    },
    []string{"packages/api/src/structures/ISale.ts"},
    `{"claims":[{
      "type":"typescript",
      "root":"../api",
      "files":["src/structures/**/*.ts"],
      "reference":{"type":"markdown","files":["docs/**/*.md"]}
    }]}`,
  )
  inventories := loadTypeScriptInventories(root, sources, config)
  base := config.Claims[0].Base
  key := base.address("src/structures/ISale.ts")
  inventory := inventories[key]
  if inventory == nil {
    t.Fatalf("root-relative inventory %q was not materialized", key)
  }
  if inventory.Path != "../api/src/structures/ISale.ts" {
    t.Fatalf("diagnostic path = %q, want sibling project path", inventory.Path)
  }
  if len(inventory.Units) != 1 || inventory.Units[0].Target != "ISale" {
    t.Fatalf("units = %+v, want rooted DTO type", inventory.Units)
  }
  if inventory.Units[0].Path != inventory.Path ||
    len(inventory.Declarations) != 1 ||
    inventory.Declarations[0].Path != inventory.Path {
    t.Fatalf("unit and declaration locations must retain %q", inventory.Path)
  }
  if paths := matchingInventoryPaths(inventories, base, config.Claims[0].Files); len(paths) != 1 || paths[0] != key {
    t.Fatalf("claim paths = %v, want only %q", paths, key)
  }
}

/**
 * Verifies a TypeScript claim root never discovers a sibling file that ttsc did
 * not supply.
 *
 * Reading a configured directory would silently widen the compiler Program and
 * make imported files, node_modules, and filesystem contents part of Evidence
 * by accident. The tsconfig root list must remain the only admission boundary.
 *
 *  1. Write a matching DTO under the configured sibling root.
 *  2. Supply no API source in `ctx.Sources`.
 *  3. Assert the on-disk file contributes no inventory.
 */
func TestTypeScriptClaimRootDoesNotScanFilesOutsideTheProgram(t *testing.T) {
  root, config, sources := rootedTypeScriptProgram(
    t,
    map[string]string{
      "packages/api/src/structures/ISale.ts": "export interface ISale {}",
    },
    nil,
    `{"claims":[{
      "type":"typescript",
      "root":"../api",
      "files":["src/structures/**/*.ts"],
      "reference":{"type":"markdown","files":["docs/**/*.md"]}
    }]}`,
  )
  if inventories := loadTypeScriptInventories(root, sources, config); len(inventories) != 0 {
    t.Fatalf("an on-disk source outside ctx.Sources was materialized: %v", inventories)
  }
}

/**
 * Verifies a rooted claim excludes Program sources outside its declared base.
 *
 * `ctx.Sources` is necessary but not sufficient: a backend lint Program can
 * contain backend, API, and tooling roots, while the DTO claim must select only
 * the API address space. A sibling prefix must not become a broad workspace
 * scan.
 *
 *  1. Supply API, backend, and unrelated sibling files in one Program.
 *  2. Configure only the API sibling as the TypeScript claim root.
 *  3. Assert only the source contained by that exact base materializes.
 */
func TestTypeScriptClaimRootKeepsOtherProgramRootsOutOfItsInventory(t *testing.T) {
  root, config, sources := rootedTypeScriptProgram(
    t,
    map[string]string{
      "packages/api/src/structures/ISale.ts": "export interface ISale {}",
      "packages/backend/src/controller.ts":   "export function controller(): void {}",
      "packages/tools/src/generate.ts":       "export function generate(): void {}",
    },
    []string{
      "packages/api/src/structures/ISale.ts",
      "packages/backend/src/controller.ts",
      "packages/tools/src/generate.ts",
    },
    `{"claims":[{
      "type":"typescript",
      "root":"../api",
      "files":["src/structures/**/*.ts"],
      "reference":{"type":"markdown","files":["docs/**/*.md"]}
    }]}`,
  )
  inventories := loadTypeScriptInventories(root, sources, config)
  if len(inventories) != 1 {
    t.Fatalf("rooted inventories = %v, want one API source", inventories)
  }
  if inventories[config.Claims[0].Base.address("src/structures/ISale.ts")] == nil {
    t.Fatal("the API source was not materialized through its configured base")
  }
}

/**
 * Verifies inline-link resolution keeps working when the claiming module lives
 * under a sibling TypeScript root.
 *
 * A rooted declaration is displayed as `../api/...`, while its imported module
 * may normalize back into the active backend root. Resolving both locations
 * through the physical project prevents separator and sibling-segment spelling
 * from breaking an otherwise valid citation.
 *
 *  1. Supply a rooted API claim and its imported backend contract in one Program.
 *  2. Cite the imported contract through an inline link.
 *  3. Assert the complete graph resolves without a diagnostic.
 */
func TestRootedTypeScriptClaimResolvesInlineLinksAcrossProgramRoots(t *testing.T) {
  root, config, sources := rootedTypeScriptProgram(
    t,
    map[string]string{
      "packages/api/src/structures/ISale.ts": "import type { IContract } from \"../../../backend/src/IContract\";\n/** @evidence {@link IContract} Implements the backend contract. */\nexport interface ISale {}",
      "packages/backend/src/IContract.ts":    "export interface IContract {}",
    },
    []string{
      "packages/api/src/structures/ISale.ts",
      "packages/backend/src/IContract.ts",
    },
    `{"claims":[{
      "type":"typescript",
      "root":"../api",
      "files":["src/structures/**/*.ts"],
      "reference":{
        "type":"typescript",
        "files":["src/IContract.ts"],
        "symbol":"type"
      }
    }]}`,
  )
  reporter := &capturedProjectReporter{}
  graphRule{}.Check(rule.NewProjectContext(
    rule.ProjectIdentity{PhysicalProjectRoot: root},
    sources,
    nil,
    rule.SeverityError,
    json.RawMessage(`{"claims":[{
      "type":"typescript",
      "root":"../api",
      "files":["src/structures/**/*.ts"],
      "reference":{
        "type":"typescript",
        "files":["src/IContract.ts"],
        "symbol":"type"
      }
    }]}`),
    reporter,
  ))
  if len(config.Claims) != 1 {
    t.Fatal("test configuration lost its rooted claim")
  }
  assertNoProblems(t, reporter.messages)
}
