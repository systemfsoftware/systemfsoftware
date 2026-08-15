import {
  type ICreateProjectProps,
  type IRunResult,
  type ITtscEvidenceProject,
  assertExcludes,
  assertFailure,
  assertIncludes,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

const lintConfig: string = [
  'import type { ITtscLintConfig } from "@ttsc/lint";',
  'import { evidence } from "@ttsc/evidence";',
  "",
  "export default {",
  "  plugins: { evidence },",
  "  rules: {",
  '    "evidence/graph": ["error", {',
  "      claims: [{",
  '        name: "tests",',
  '        type: "typescript",',
  '        files: ["src/*.ts"],',
  '        symbol: "function",',
  "        reference: {",
  '          type: "markdown",',
  '          files: ["docs/spec.md"],',
  '          symbol: ["h2", "h3"],',
  "        },",
  "      }],",
  "    }],",
  "  },",
  "} satisfies ITtscLintConfig;",
  "",
].join("\n");

const runProject = (
  props: Omit<ICreateProjectProps, "lintConfig">,
): IRunResult => {
  const project: ITtscEvidenceProject = createProject({ ...props, lintConfig });
  try {
    return runCheck(project.directory);
  } finally {
    project.cleanup();
  }
};

/**
 * Verifies acknowledgement intent cardinality through the published package.
 *
 * Native tests prove the evaluator branches. These consumers prove the same
 * intent distinction survives descriptor compilation, contributor linking,
 * project dispatch, and rendered diagnostics.
 *
 * 1. Accept repeated and hierarchically overlapping positive evidence.
 * 2. Reject one host repeating an identical positive edge.
 * 3. Reject exclusions duplicated across hosts.
 * 4. Reject opposite intents on overlapping scopes.
 * 5. Render the concise missing-acknowledgement repair.
 */
export const test_evidence_graph_distinguishes_repeated_evidence_from_exclusions =
  (): void => {
    const repeated = runProject({
      name: "repeated-positive-evidence",
      files: {
        "docs/spec.md": [
          "## Contract {#contract}",
          "### Validation {#validation}",
          "",
        ].join("\n"),
        "src/success.ts": [
          "/** @evidence docs/spec.md#contract Proves the success behavior. */",
          "export function success(): void {}",
          "",
        ].join("\n"),
        "src/refusal.ts": [
          "/** @evidence docs/spec.md#contract Proves the refusal behavior. */",
          "/** @evidence docs/spec.md#validation Proves validation. */",
          "export function refusal(): void {}",
          "",
        ].join("\n"),
      },
    });
    assertStatus(
      repeated,
      0,
      "Independent positive evidence must remain valid.",
    );
    assertExcludes(
      repeated,
      "Duplicate",
      "Overlapping positive evidence must not become a duplicate.",
    );

    const sameHost = runProject({
      name: "same-host-duplicate-evidence",
      files: {
        "docs/spec.md": "## Contract {#contract}\n",
        "src/claim.ts": [
          "/**",
          " * @evidence docs/spec.md#contract First reason.",
          " * @evidence docs/spec.md#contract Second reason.",
          " */",
          "export function claim(): void {}",
          "",
        ].join("\n"),
      },
    });
    assertFailure(sameHost, "One host must not repeat one positive edge.");
    assertIncludes(
      sameHost,
      "Duplicate @evidence for 'docs/spec.md#contract' on the same host",
      "The duplicate must name its tag, target, and host boundary.",
    );

    const duplicateExclusions = runProject({
      name: "duplicate-exclusions",
      files: {
        "docs/spec.md": "## Contract {#contract}\n",
        "src/first.ts": [
          "/** @evidenceExclude docs/spec.md#contract First exclusion. */",
          "export function first(): void {}",
          "",
        ].join("\n"),
        "src/second.ts": [
          "/** @evidenceExclude docs/spec.md#contract Second exclusion. */",
          "export function second(): void {}",
          "",
        ].join("\n"),
      },
    });
    assertFailure(
      duplicateExclusions,
      "One claim-reference scope must own one exclusion decision.",
    );
    assertIncludes(
      duplicateExclusions,
      "Duplicate @evidenceExclude for 'docs/spec.md#contract'",
      "The duplicate exclusion must reach the real consumer.",
    );

    const conflict = runProject({
      name: "evidence-exclusion-conflict",
      files: {
        "docs/spec.md": [
          "## Contract {#contract}",
          "### Validation {#validation}",
          "",
        ].join("\n"),
        "src/implementation.ts": [
          "/** @evidence docs/spec.md#contract Implements the contract. */",
          "export function implementation(): void {}",
          "",
        ].join("\n"),
        "src/exclusion.ts": [
          "/** @evidenceExclude docs/spec.md#validation Excludes validation. */",
          "export function exclusion(): void {}",
          "",
        ].join("\n"),
      },
    });
    assertFailure(conflict, "Opposite intents must not cover one unit.");
    assertIncludes(
      conflict,
      "Conflicting acknowledgements for 'docs/spec.md#validation'",
      "The conflict must name the exact overlapping unit.",
    );

    const missing = runProject({
      name: "missing-acknowledgement-repair",
      files: {
        "docs/spec.md": "## Contract {#contract}\n",
        "src/claim.ts": "export function claim(): void {}\n",
      },
    });
    assertFailure(missing, "Missing evidence must fail the consumer build.");
    assertIncludes(
      missing,
      "with @evidence on a selected typescript host, building that artifact first when none does, or write @evidenceExclude on an eligible carrier when nothing here owes it.",
      "The missing diagnostic must retain both repairs without prescribing filler.",
    );
    assertExcludes(
      missing,
      "Add '@evidence",
      "The replaced verbose repair must not survive packaging.",
    );
  };
