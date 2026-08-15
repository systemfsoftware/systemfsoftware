package evidence

import (
  "sort"
  "strings"
  "testing"
)

/**
 * Verifies TypeScript namespace and variable materialization: public namespaces
 * are types, and exported non-function const or mutable variables are properties.
 *
 * Module-level data and namespace state are public contract units just as type
 * properties are. Callable const variables retain the existing function kind
 * so one target never materializes as two selected kinds.
 *
 *  1. Declare public and private namespaces, variables, and callable variables.
 *  2. Collect every materialized target with its kind.
 *  3. Assert the exact public semantic inventory.
 */
func TestTypeScriptMaterializesNamespacesAndDataVariables(t *testing.T) {
  inventory := parseTypeScriptInventory(t, "src/contracts.ts", `
export namespace Orders {
  export const count = 1;
  export let state = "open";
  export var legacy = false;
  export const run = (): void => {};
  const hidden = 0;

  export interface Input {
    id: string;
  }

  export namespace Retry {
    export const enabled = true;
  }
}

export namespace Outer.Inner {
  export let value = 1;
}

export const version = 1;
export declare const declaredCallback: () => void;
export let mutableCallback = (): void => {};
export const execute = (): void => {};
const local = 1;

namespace Private {
  export const member = 1;
}
`)
  units := []string{}
  for _, unit := range inventory.Units {
    units = append(units, unit.Symbol+":"+unit.Target)
  }
  sort.Strings(units)
  want := []string{
    "function:Orders.run",
    "function:execute",
    "property:Orders.Input.id",
    "property:Orders.Retry.enabled",
    "property:Orders.count",
    "property:Orders.legacy",
    "property:Orders.state",
    "property:Outer.Inner.value",
    "property:declaredCallback",
    "property:mutableCallback",
    "property:version",
    "type:Orders",
    "type:Orders.Input",
    "type:Orders.Retry",
    "type:Outer",
    "type:Outer.Inner",
  }
  sort.Strings(want)
  if strings.Join(units, "\n") != strings.Join(want, "\n") {
    t.Fatalf("TypeScript namespace/data units:\n%s\nwant:\n%s", strings.Join(units, "\n"), strings.Join(want, "\n"))
  }
}

/**
 * Verifies namespace and variable claim hosts: their JSDoc declarations are
 * accepted by the type and property selectors respectively.
 *
 * Materializing a target without making its declaration a legal claim host
 * creates a one-way graph surface. The two claims prove both new kinds can own
 * outgoing evidence edges through the complete rule.
 *
 *  1. Cite one Markdown section from an exported namespace and one variable.
 *  2. Select the matching host kind in two independent claims.
 *  3. Assert both graphs are complete.
 */
func TestTypeScriptNamespaceAndVariableDeclarationsAreClaimHosts(t *testing.T) {
  files := map[string]string{
    "docs/namespace.md": "## Namespace\n",
    "docs/property.md":  "## Property\n",
    "src/namespace.ts": `
/** @evidence docs/namespace.md#namespace The namespace owns this contract. */
export namespace Api {}
`,
    "src/property.ts": `
/** @evidence docs/property.md#property This value exposes the documented state. */
export const state = "ready";
`,
  }
  config := `{"claims":[
    {
      "type":"typescript",
      "files":["src/namespace.ts"],
      "symbol":"type",
      "reference":{"type":"markdown","files":["docs/namespace.md"],"symbol":"h2"}
    },
    {
      "type":"typescript",
      "files":["src/property.ts"],
      "symbol":"property",
      "reference":{"type":"markdown","files":["docs/property.md"],"symbol":"h2"}
    }
  ]}`
  assertNoProblems(t, runIndexRule(t, files, config))
}

/**
 * Verifies mixed variable statements expose every resident host kind.
 *
 * TypeScript attaches one leading JSDoc block to the statement around all
 * declarators. Choosing only the first discovered kind would make the same
 * source legal under one selector and spuriously out of scope under the other.
 *
 *  1. Put a scalar and callable const in one exported statement.
 *  2. Run the same JSDoc declaration under property-only and function-only claims.
 *  3. Assert both selectors accept the mixed statement host.
 */
func TestMixedVariableStatementSupportsPropertyAndFunctionClaimHosts(t *testing.T) {
  files := map[string]string{
    "docs/spec.md": "## Contract\n",
    "src/ref.ts": `
const source = { state: "ready" };
/** @evidence docs/spec.md#contract The exported statement carries this contract. */
export const { state } = source, run = (): void => {};
`,
  }
  for _, symbol := range []string{"property", "function"} {
    t.Run(symbol, func(t *testing.T) {
      messages := runIndexRule(t, files, `{"claims":[{
        "type":"typescript",
        "files":["src/ref.ts"],
        "symbol":"`+symbol+`",
        "reference":{"type":"markdown","files":["docs/spec.md"],"symbol":"h2"}
      }]}`)
      assertNoProblems(t, messages)
    })
  }
}
