package evidence

import (
  "sort"
  "strings"
  "testing"
)

// hiddenTagCases are the three documentation tags that withdraw a declaration,
// run through every case so none of them can be wired up alone.
var hiddenTagCases = []string{"@internal", "@hidden", "@ignore"}

/**
 * Verifies each hiding tag removes its declaration and everything nested
 * inside it, while an untagged sibling in the same file is untouched.
 *
 * The three tags are equivalent statements that a declaration is not API, so
 * treating them separately would leave two of them silently inert. The
 * untagged sibling is the negative twin: without it, a collector that dropped
 * every declaration in a file carrying any tag would pass just as well.
 *
 *  1. Tag an interface, a namespace, a function, and a class in one file, each
 *     owning nested members.
 *  2. Collect the inventory once per tag.
 *  3. Assert only the untagged sibling and its members survive.
 */
func TestTypeScriptHidingTagsRemoveDeclarationsAndTheirMembers(t *testing.T) {
  for _, tag := range hiddenTagCases {
    t.Run(tag, func(t *testing.T) {
      inventory := parseTypeScriptInventory(t, "src/contracts.ts", `
/** `+tag+` Not part of the published surface. */
export interface IPrivate {
  id: string;
}

/** `+tag+` */
export namespace secret {
  export const run = (): void => {};
  export interface IInner {
    id: string;
  }
  export namespace deeper {
    export const nested = (): void => {};
  }
}

/** `+tag+` */
export function build(): void {}

/** `+tag+` */
export class Service {
  static create(): void {}
}

export interface IPublic {
  id: string;
}
`)
      units := []string{}
      for _, unit := range inventory.Units {
        if unit.Hidden != "" {
          continue
        }
        units = append(units, unit.Symbol+":"+unit.Target)
      }
      sort.Strings(units)
      want := []string{
        "property:IPublic.id",
        "type:IPublic",
      }
      if strings.Join(units, "\n") != strings.Join(want, "\n") {
        t.Fatalf(
          "surviving units:\n%s\nwant:\n%s",
          strings.Join(units, "\n"),
          strings.Join(want, "\n"),
        )
      }
    })
  }
}

/**
 * Verifies the tag has to open its own line.
 *
 * Prose describing something as internal is not a declaration that it is, and
 * a substring match would let a sentence delete an obligation nobody meant to
 * withdraw. The positive twin one line away is what keeps this from passing on
 * a collector that ignores the tag entirely.
 *
 *  1. Mention the tag mid-sentence on one declaration and write it as a tag on
 *     another.
 *  2. Collect the inventory.
 *  3. Assert only the tagged declaration is withdrawn.
 */
func TestTypeScriptHidingTagMustOpenItsLine(t *testing.T) {
  inventory := parseTypeScriptInventory(t, "src/contracts.ts", `
/** Superseded by the @internal registry, which this still mirrors. */
export interface IMentioned {
  id: string;
}

/** @internal Not part of the published surface. */
export interface ITagged {
  id: string;
}
`)
  hidden := map[string]string{}
  for _, unit := range inventory.Units {
    hidden[unit.Target] = unit.Hidden
  }
  if hidden["IMentioned"] != "" {
    t.Fatalf("prose mention withdrew the declaration as %q", hidden["IMentioned"])
  }
  if hidden["ITagged"] != "@internal" {
    t.Fatalf("expected the tagged declaration to be withdrawn, got %q", hidden["ITagged"])
  }
}

/**
 * Verifies a tag on either half of a merged identity withdraws the whole thing.
 *
 * `interface I` beside `namespace I` is one public identity and one unit, so
 * which declaration carries the comment is a matter of where the author wrote
 * it. Reading only the declaration in hand would leave the identity withdrawn
 * while its members stayed selected whenever the untagged half was written
 * first — a cascade that depended on source order.
 *
 *  1. Tag the second declaration of a merged identity and leave the first bare.
 *  2. Collect the inventory.
 *  3. Assert the identity and every member below either half are withdrawn.
 */
func TestTypeScriptHidingTagOnEitherMergedDeclarationWithdrawsTheIdentity(t *testing.T) {
  inventory := parseTypeScriptInventory(t, "src/contracts.ts", `
export interface ISale {
  id: string;
}

/** @internal Not part of the published surface. */
export namespace ISale {
  export interface ICreate {
    title: string;
  }
}

export interface IPublic {
  id: string;
}
`)
  for _, unit := range inventory.Units {
    withdrawn := strings.HasPrefix(unit.Target, "ISale")
    if withdrawn && unit.Hidden == "" {
      t.Fatalf("%s must be withdrawn with the identity it belongs to", unit.Target)
    }
    if !withdrawn && unit.Hidden != "" {
      t.Fatalf("%s must survive, got %q", unit.Target, unit.Hidden)
    }
  }
}

/**
 * Verifies a withdrawn declaration owes no acknowledgement as a reference unit.
 *
 * This is the obligation half of the issue: the population a reference selects
 * must not contain something the source already declared is not API, or the
 * author's only answers are a false citation or an exclusion whose reason
 * restates the tag. The untagged operation beside it stays owed, so the case
 * cannot pass by selecting nothing.
 *
 *  1. Publish one tagged and one untagged callable through an entry.
 *  2. Cite neither.
 *  3. Assert only the untagged one is reported as missing.
 */
func TestGraphOwesNoAcknowledgementForHiddenReferenceUnits(t *testing.T) {
  for _, tag := range hiddenTagCases {
    t.Run(tag, func(t *testing.T) {
      messages := runIndexRule(t, map[string]string{
        "src/api/health.ts": `
/** ` + tag + ` Internal plumbing. */
export function reset(): void {}

export function check(): void {}
`,
        "src/index.ts":   "export * from \"./api/health\";\n",
        "test/health.ts": "export function test_health(): void {}\n",
      }, `{"claims":[{
        "type":"typescript",
        "files":["test/**"],
        "symbol":"function",
        "reference":{"type":"typescript","files":["src/index.ts"],"symbol":["function"]}
      }]}`)
      assertProblemContains(t, messages, "Missing acknowledgement for 'check'")
      if count := countProblemsContaining(messages, "Missing acknowledgement"); count != 1 {
        t.Fatalf(
          "expected only the untagged operation to be owed, got %d:\n%s",
          count,
          strings.Join(messages, "\n"),
        )
      }
    })
  }
}

/**
 * Verifies a withdrawn declaration is not a selected claim host.
 *
 * The exclusion applies to both sides of the graph, so a tagged declaration
 * must be unable to carry a citation as well as unable to owe one. Reporting
 * the citation rather than ignoring it is what keeps the claim's obligation
 * visible instead of quietly discharged.
 *
 *  1. Put an `@evidence` tag on a declaration that also carries the hiding tag,
 *     beside an untagged host that keeps the claim active.
 *  2. Evaluate a claim selecting that host kind.
 *  3. Assert the host is refused and the cited target is still owed.
 */
func TestGraphRefusesAHiddenDeclarationAsAClaimHost(t *testing.T) {
  for _, tag := range hiddenTagCases {
    t.Run(tag, func(t *testing.T) {
      messages := runIndexRule(t, map[string]string{
        "docs/spec.md": "## Contract\n",
        "src/api/health.ts": `
/**
 * ` + tag + ` Internal plumbing.
 *
 * @evidence docs/spec.md#contract This hidden host claims the section.
 */
export function reset(): void {}

export function check(): void {}
`,
      }, `{"claims":[{
        "type":"typescript",
        "files":["src/api/health.ts"],
        "symbol":"function",
        "reference":{"type":"markdown","files":["docs/spec.md"],"symbol":"h2"}
      }]}`)
      assertProblemContains(
        t,
        messages,
        "host kind 'unsupported or non-exported declaration' is not selected",
      )
      assertProblemContains(
        t,
        messages,
        "Missing acknowledgement for 'docs/spec.md#contract'",
      )
    })
  }
}

/**
 * Verifies a citation of a withdrawn target names the tag as the cause.
 *
 * This is the decision the issue asked to be made explicit. The target does
 * resolve to a real declaration, so a bare unresolved-target message would send
 * the author hunting for a typo that is not there. Both repairs are named,
 * because which one is right depends on which statement is wrong — the tag or
 * the citation.
 *
 *  1. Withdraw a callable and cite it from a claim host anyway.
 *  2. Evaluate the graph.
 *  3. Assert the diagnostic names the tag, the withdrawn declaration, and both
 *     repairs.
 */
func TestGraphNamesTheTagWhenACitationTargetsAHiddenDeclaration(t *testing.T) {
  messages := runIndexRule(t, map[string]string{
    "src/api/health.ts": `
/** @internal Internal plumbing. */
export function reset(): void {}

export function check(): void {}
`,
    "src/index.ts": "export * from \"./api/health\";\n",
    "test/health.ts": `import type * as api from "../src/index";

/**
 * @evidence {@link api.reset} Exercises the reset path.
 * @evidence {@link api.check} Exercises the check path.
 */
export function test_health(): void {}
`,
  }, `{"claims":[{
    "type":"typescript",
    "files":["test/**"],
    "symbol":"function",
    "reference":{"type":"typescript","files":["src/index.ts"],"symbol":["function"]}
  }]}`)
  assertProblemContains(t, messages, "Hidden evidence target '{@link api.reset}'")
  assertProblemContains(t, messages, "carries '@internal' in its documentation comment")
  assertProblemContains(t, messages, "Remove the tag if the declaration is public contract")
  if count := countProblemsContaining(messages, "Hidden evidence target"); count != 1 {
    t.Fatalf(
      "expected one hidden-target diagnostic, got %d:\n%s",
      count,
      strings.Join(messages, "\n"),
    )
  }
}

/**
 * Verifies `evidence/documented` stops demanding a block on a withdrawn export.
 *
 * A `documented` obligation that survived the population would be the worst of
 * both: the declaration is not citable, not selectable, and still reported.
 * The untagged sibling proves the rule still fires.
 *
 *  1. Withdraw one undocumented export and leave another bare beside it.
 *  2. Run the documented rule over function hosts.
 *  3. Assert only the untagged export is reported.
 */
func TestDocumentedSkipsHiddenExports(t *testing.T) {
  for _, tag := range hiddenTagCases {
    t.Run(tag, func(t *testing.T) {
      assertReported(t, runDocumentedRule(t, "src/health.ts", `
/** `+tag+` Internal plumbing. */
export function reset(): void {}

export function check(): void {}
`, `{"symbol":["function"]}`), "Missing JSDoc on exported function 'check'")
    })
  }
}

/**
 * Verifies a Prisma model or field carrying the tag leaves the population, and
 * that a tagged model takes its members with it.
 *
 * A schema author marking a model internal has made the same declaration a
 * TypeScript author makes with the same tag, and honoring one artifact kind
 * while ignoring the other would make the rule depend on where a declaration
 * happens to live. The untagged column beside the tagged one is what proves the
 * cascade is the model's doing rather than the file's.
 *
 *  1. Materialize a model whose own documentation carries the tag.
 *  2. Materialize an untagged model with one tagged column.
 *  3. Assert the whole first model is withdrawn and only the tagged column of
 *     the second.
 */
func TestPrismaHidingTagsWithdrawModelsAndColumns(t *testing.T) {
  for _, tag := range hiddenTagCases {
    t.Run(tag, func(t *testing.T) {
      for _, unit := range prismaModelUnits(prismaModel{
        Name:          "Ledger",
        Documentation: tag + " Internal bookkeeping.",
        Fields: []prismaField{
          {Name: "amount", Symbol: "column"},
          {Name: "sale", Symbol: "relation"},
        },
      }) {
        if unit.Hidden != tag {
          t.Fatalf("%s must be withdrawn by %s, got %q", unit.Target, tag, unit.Hidden)
        }
      }

      hidden := map[string]string{}
      for _, unit := range prismaModelUnits(prismaModel{
        Name: "Sale",
        Fields: []prismaField{
          {Name: "price", Symbol: "column"},
          {
            Name:          "secret",
            Symbol:        "column",
            Documentation: tag + " Internal bookkeeping.",
          },
        },
      }) {
        hidden[unit.Target] = unit.Hidden
      }
      if hidden["prisma:Sale"] != "" || hidden["prisma:Sale.price"] != "" {
        t.Fatalf("an untagged model and column must stay: %v", hidden)
      }
      if hidden["prisma:Sale.secret"] != tag {
        t.Fatalf("the tagged column must be withdrawn, got %q", hidden["prisma:Sale.secret"])
      }
    })
  }
}

/**
 * Verifies a withdrawn Prisma model leaves the graph's population, not only the
 * materializer's.
 *
 * A Prisma reference selects its units on a different code path than a
 * TypeScript one, so materializing the tag correctly proves nothing about what
 * a reference then owes. The tagged model also hosts a citation and is cited by
 * one, which exercises both sides through the real parser bridge.
 *
 *  1. Tag one model internal and leave another beside it.
 *  2. Run a TypeScript claim referencing the schema, citing both models.
 *  3. Assert only the untagged model is owed, and the citation of the tagged
 *     one names the tag.
 */
func TestPrismaHiddenModelsLeaveTheGraphPopulation(t *testing.T) {
  root := prismaBridgeRoot(t, nil)
  messages := runIndexRuleAtRoot(t, root, map[string]string{
    "prisma/schema.prisma": `datasource db {
  provider = "sqlite"
}

/// @internal Internal bookkeeping.
model Ledger {
  id Int @id
}

model Sale {
  id Int @id
}
`,
    "src/providers/sale.ts": `/**
 * @evidence prisma:Ledger Persists the ledger.
 */
export function persist(): void {}
`,
  }, `{"claims":[{
    "type":"typescript",
    "files":["src/providers/**/*.ts"],
    "symbol":"function",
    "reference":{"type":"prisma","files":["prisma/schema.prisma"],"symbol":["model","column"]}
  }]}`)
  assertProblemContains(t, messages, "Hidden evidence target 'prisma:Ledger'")
  assertProblemContains(t, messages, "carries '@internal' in its documentation comment")
  assertProblemContains(t, messages, "Missing acknowledgement for 'prisma:Sale'")
  if countProblemsContaining(messages, "Missing acknowledgement for 'prisma:Ledger") != 0 {
    t.Fatalf(
      "a withdrawn model must owe nothing:\n%s",
      strings.Join(messages, "\n"),
    )
  }
}

/**
 * Verifies a withdrawn Prisma unit hosts nothing.
 *
 * Host eligibility is what decides whether a declaration may carry `@evidence`
 * at all, and an empty host set is also what stops it from being an exclusion
 * carrier. Both follow from the same answer, so it is pinned directly.
 *
 *  1. Ask for the host kinds of a withdrawn unit and of an ordinary one.
 *  2. Assert the withdrawn unit offers none.
 *  3. Assert the ordinary unit still offers its own symbol.
 */
func TestPrismaHiddenUnitsHostNothing(t *testing.T) {
  if symbols := prismaHostSymbols(&evidenceUnit{
    Symbol: "model",
    Hidden: "@internal",
  }); len(symbols) != 0 {
    t.Fatalf("a withdrawn Prisma unit must host nothing, got %v", symbols)
  }
  if symbols := prismaHostSymbols(&evidenceUnit{Symbol: "model"}); !symbols["model"] {
    t.Fatalf("an ordinary model must host a model citation, got %v", symbols)
  }
}
