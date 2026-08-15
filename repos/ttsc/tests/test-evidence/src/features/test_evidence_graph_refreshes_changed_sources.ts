import fs from "node:fs";
import path from "node:path";

import {
  type ITtscEvidenceProject,
  assertFailure,
  assertIncludes,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies repeated checks rebuild Markdown and TypeScript evidence
 * inventories.
 *
 * The linked lint binary is cached, but artifact inventories must not be.
 * Renaming a Markdown heading, namespace property, or class method between
 * compiler invocations must invalidate the old target and demand the new one.
 *
 * 1. Check a complete graph containing Markdown, namespace, and class targets.
 * 2. Rename each source target and assert the next check sees stale citations.
 * 3. Update the citations and assert both graph directions become complete.
 */
export const test_evidence_graph_refreshes_changed_sources = (): void => {
  const project: ITtscEvidenceProject = createProject({
    name: "source-refresh",
    lintConfig: [
      'import evidence from "@ttsc/evidence";',
      "",
      "export default {",
      '  plugins: { "evidence": evidence },',
      "  rules: {",
      '    "evidence/graph": ["error", {',
      "      claims: [",
      "        {",
      '          type: "typescript",',
      '          files: ["src/implementation.ts"],',
      '          symbol: "type",',
      '          reference: { type: "markdown", files: ["docs/spec.md"], symbol: "h2" },',
      "        },",
      "        {",
      '          type: "typescript",',
      '          files: ["src/ledger.ts"],',
      '          symbol: "type",',
      '          reference: { type: "typescript", files: ["src/contracts.ts"], symbol: ["function", "property"] },',
      "        },",
      "      ],",
      "    }],",
      "  },",
      "};",
      "",
    ].join("\n"),
    files: {
      "docs/spec.md": "## Alpha\n",
      "src/implementation.ts": implementationFor("alpha"),
      "src/contracts.ts": contractsFor("state", "run"),
      "src/ledger.ts": ledgerFor("state", "run"),
    },
  });
  try {
    assertStatus(
      runCheck(project.directory),
      0,
      "The initial graph must prove the fixture can pass before freshness is tested.",
    );

    write(project, "docs/spec.md", "## Beta\n");
    const staleMarkdown = runCheck(project.directory);
    assertFailure(
      staleMarkdown,
      "A renamed Markdown heading must invalidate its old citation on the next check.",
    );
    assertIncludes(
      staleMarkdown,
      "Unresolved evidence target 'docs/spec.md#alpha'",
      "The second check must not retain the first Markdown inventory.",
    );
    assertIncludes(
      staleMarkdown,
      "Missing acknowledgement for 'docs/spec.md#beta'",
      "The renamed Markdown unit must become the current obligation.",
    );

    write(project, "src/implementation.ts", implementationFor("beta"));
    assertStatus(
      runCheck(project.directory),
      0,
      "Updating the Markdown citation must restore the graph.",
    );

    write(project, "src/contracts.ts", contractsFor("status", "execute"));
    const staleTypeScript = runCheck(project.directory);
    assertFailure(
      staleTypeScript,
      "Renamed namespace and class members must invalidate old TypeScript targets.",
    );
    assertIncludes(
      staleTypeScript,
      "Unreachable evidence target '{@link Api.state}'",
      "The next Program must replace the old namespace property inventory.",
    );
    assertIncludes(
      staleTypeScript,
      "Missing acknowledgement for 'Service.prototype.execute'",
      "The renamed class method must become a current callable obligation.",
    );

    write(project, "src/ledger.ts", ledgerFor("status", "execute"));
    assertStatus(
      runCheck(project.directory),
      0,
      "Updating the TypeScript citations must restore the refreshed graph.",
    );
  } finally {
    project.cleanup();
  }
};

const implementationFor = (anchor: string): string =>
  [
    `/** @evidence docs/spec.md#${anchor} Implements the current specification section. */`,
    "export interface Implementation {}",
    "",
  ].join("\n");

const contractsFor = (property: string, method: string): string =>
  [
    "export namespace Api {",
    `  export const ${property} = "ready";`,
    "}",
    "",
    "export class Service {",
    `  ${method}(): void {}`,
    "}",
    "",
  ].join("\n");

const ledgerFor = (property: string, method: string): string =>
  [
    `import type { Api, Service } from "./contracts.js";`,
    "",
    "/**",
    ` * @evidence {@link Api.${property}} Documents the current namespace state.`,
    ` * @evidence {@link Service.prototype.${method}} Documents the current class operation.`,
    " */",
    "export interface ILedger {}",
    "",
  ].join("\n");

const write = (
  project: ITtscEvidenceProject,
  relative: string,
  content: string,
): void => {
  fs.writeFileSync(path.join(project.directory, relative), content, "utf8");
};
