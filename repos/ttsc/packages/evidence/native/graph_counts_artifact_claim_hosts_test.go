package evidence

import (
  "strings"
  "testing"
)

const markdownClaimReferencePolicyConfig = `{"claims":[{
  "type":"markdown",
  "files":["claims/**"],
  "symbol":"h2",
  "reference":{
    "type":"markdown",
    "files":["docs/spec.md"],
    "symbol":"h2",
    "uniqueEvidence":true,
    "singleEvidencePerSymbol":true
  }
}]}`

/**
 * Verifies Markdown claim headings retain semantic host identities for policy counts.
 *
 * Markdown declarations already carried a physical outline host, but cardinality also needs every selected heading that carries no HTML comment. Exercising the complete project rule proves the scanner's heading unit ID is the same semantic ID used by both policy directions.
 *
 *  1. Select one silent H2 and one positively citing H2 as claim hosts.
 *  2. Assert only the silent host fails single-evidence cardinality.
 *  3. Make two headings cite one unit, then give each its own, and assert unique evidence rejects the first and accepts the second.
 */
func TestMarkdownClaimHostsParticipateInReferencePolicyCounts(t *testing.T) {
  messages := runIndexRule(t, map[string]string{
    "claims/positive.md": `## Positive {#positive}

<!-- @evidence docs/spec.md#contract Implements the contract. -->
`,
    "claims/untagged.md": "## Untagged {#untagged}\n",
    "docs/spec.md":       "## Contract {#contract}\n",
  }, markdownClaimReferencePolicyConfig)
  if count := countProblemsContaining(messages, "singleEvidencePerSymbol"); count != 1 {
    t.Fatalf("expected only the silent Markdown host to fail cardinality, got %d:\n%s", count, strings.Join(messages, "\n"))
  }
  assertProblemContains(t, messages, "Markdown H2 'Untagged'")
  assertProblemContains(t, messages, "cites 0 distinct selected evidence unit(s)")
  if strings.Contains(strings.Join(messages, "\n"), "Markdown H2 'Positive'") {
    t.Fatalf("the positive Markdown host failed cardinality:\n%s", strings.Join(messages, "\n"))
  }

  shared := runIndexRule(t, map[string]string{
    "claims/first.md": `## First {#first}

<!-- @evidence docs/spec.md#contract First proof. -->
`,
    "claims/second.md": `## Second {#second}

<!-- @evidence docs/spec.md#contract Second proof. -->
`,
    "docs/spec.md": "## Contract {#contract}\n",
  }, markdownClaimReferencePolicyConfig)
  assertProblemContains(t, shared, "has 2 distinct positive evidence host(s); uniqueEvidence allows at most 1")

  passing := runIndexRule(t, map[string]string{
    "claims/first.md": `## First {#first}

<!-- @evidence docs/spec.md#contract Implements the contract. -->
`,
    "claims/second.md": `## Second {#second}

<!-- @evidence docs/spec.md#pricing Implements the pricing rule. -->
`,
    "docs/spec.md": "## Contract {#contract}\n\n## Pricing {#pricing}\n",
  }, markdownClaimReferencePolicyConfig)
  assertNoProblems(t, passing)
}

const prismaClaimReferencePolicyConfig = `{"claims":[{
  "type":"prisma",
  "files":["prisma/schema.prisma"],
  "symbol":"model",
  "reference":{
    "type":"markdown",
    "files":["docs/spec.md"],
    "symbol":"h2",
    "uniqueEvidence":true,
    "singleEvidencePerSymbol":true
  }
}]}`

/**
 * Verifies Prisma claim models retain semantic host identities for policy counts.
 *
 * Prisma units come from the native parser bridge while their comments and locations come from a separate scanner. A model with no documentation must still enter cardinality as zero, and a parsed `///` citation must map back to the same model identity for both host and unit counts.
 *
 *  1. Parse one silent model and one positively citing model through the real bridge and project rule.
 *  2. Assert only the silent model fails single-evidence cardinality.
 *  3. Make two models cite one unit, then give each its own, and assert unique evidence rejects the first and accepts the second.
 */
func TestPrismaClaimHostsParticipateInReferencePolicyCounts(t *testing.T) {
  run := func(document string, schema string) []string {
    root := prismaBridgeRoot(t, nil)
    return runIndexRuleAtRoot(t, root, map[string]string{
      "docs/spec.md":         document,
      "prisma/schema.prisma": schema,
    }, prismaClaimReferencePolicyConfig)
  }
  const oneSection = "## Contract {#contract}\n"
  messages := run(oneSection, `datasource db {
  provider = "sqlite"
}

model Untagged {
  id Int @id
}

/// @evidence docs/spec.md#contract Implements the contract.
model Positive {
  id Int @id
}
`)
  if count := countProblemsContaining(messages, "singleEvidencePerSymbol"); count != 1 {
    t.Fatalf("expected only the silent Prisma host to fail cardinality, got %d:\n%s", count, strings.Join(messages, "\n"))
  }
  assertProblemContains(t, messages, "Prisma model 'Untagged'")
  assertProblemContains(t, messages, "cites 0 distinct selected evidence unit(s)")
  if strings.Contains(strings.Join(messages, "\n"), "Prisma model 'Positive'") {
    t.Fatalf("the positive Prisma host failed cardinality:\n%s", strings.Join(messages, "\n"))
  }

  shared := run(oneSection, `datasource db {
  provider = "sqlite"
}

/// @evidence docs/spec.md#contract First proof.
model First {
  id Int @id
}

/// @evidence docs/spec.md#contract Second proof.
model Second {
  id Int @id
}
`)
  assertProblemContains(t, shared, "has 2 distinct positive evidence host(s); uniqueEvidence allows at most 1")

  passing := run("## Contract {#contract}\n\n## Pricing {#pricing}\n", `datasource db {
  provider = "sqlite"
}

/// @evidence docs/spec.md#contract Implements the contract.
model First {
  id Int @id
}

/// @evidence docs/spec.md#pricing Implements the pricing rule.
model Second {
  id Int @id
}
`)
  assertNoProblems(t, passing)
}
