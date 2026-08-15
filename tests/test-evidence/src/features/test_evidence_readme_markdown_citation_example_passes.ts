import {
  type ITtscEvidenceProject,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies the README's Markdown citation direction through the real binary.
 *
 * Markdown has no import scope and therefore cannot cite TypeScript evidence.
 * The public example instead binds a guide to a path-addressed requirements
 * section, so this fixture keeps the documented replacement executable rather
 * than relying on prose that can drift back to the prohibited direction.
 *
 * 1. Configure a Markdown claim over one requirements heading.
 * 2. Reproduce the README's guide citation exactly.
 * 3. Assert the real `ttsc check` closes the obligation.
 */
export const test_evidence_readme_markdown_citation_example_passes =
  (): void => {
    const project: ITtscEvidenceProject = createProject({
      name: "readme-markdown-citation",
      include: ["src"],
      lintConfig: [
        'import { evidence } from "@ttsc/evidence";',
        "",
        "export default {",
        '  plugins: { "evidence": evidence },',
        "  rules: {",
        '    "evidence/graph": ["error", { claims: [{',
        '      type: "markdown",',
        '      files: ["docs/guides/pricing.md"],',
        '      symbol: "h1",',
        '      reference: { type: "markdown", files: ["docs/requirements/pricing.md"], symbol: "h2" },',
        "    }] }],",
        "  },",
        "};",
        "",
      ].join("\n"),
      files: {
        "docs/guides/pricing.md": [
          "# Pricing Guide",
          "",
          "<!-- @evidence docs/requirements/pricing.md#sale-price Uses the approved sale-price definition. -->",
          "",
        ].join("\n"),
        "docs/requirements/pricing.md": "## Sale Price {#sale-price}\n",
        "src/index.ts": "export {};\n",
      },
    });
    try {
      assertStatus(
        runCheck(project.directory),
        0,
        "The README's Markdown-to-Markdown citation must satisfy its configured obligation.",
      );
    } finally {
      project.cleanup();
    }
  };
