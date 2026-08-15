import {
  type ITtscEvidenceProject,
  assertExcludes,
  assertStatus,
  createProject,
  runCheck,
} from "../internal/index";

/**
 * Verifies the `symbol` option survives the trip from `lint.config.ts` into the
 * Go rule.
 *
 * Nothing checks that a Go `json:` tag matches its TypeScript field name, and a
 * mismatch yields the zero value — which here silently restores the widest
 * selection. A project believing it had narrowed the rule to types would be
 * running it over every property and callable, and the only visible symptom is
 * diagnostics it did not ask for.
 *
 * 1. Leave a callable and a property undocumented beside a documented type.
 * 2. Select `"type"` alone through the typed options slot.
 * 3. Assert a clean exit, which is only possible if the narrowing arrived.
 */
export const test_evidence_documented_narrows_to_selected_symbols =
  (): void => {
    const project: ITtscEvidenceProject = createProject({
      name: "documented-symbols",
      include: ["src"],
      lintConfig: [
        'import type { ITtscLintConfig } from "@ttsc/lint";',
        'import { evidence, type ITtscEvidenceDocumentedConfig } from "@ttsc/evidence";',
        "",
        "const documented: ITtscEvidenceDocumentedConfig = {",
        '  symbol: "type",',
        "};",
        "",
        "export default {",
        '  plugins: { "evidence": evidence },',
        "  rules: {",
        '    "evidence/documented": ["error", documented],',
        "  },",
        "} satisfies ITtscLintConfig;",
        "",
      ].join("\n"),
      files: {
        "src/ISale.ts": [
          "/** A sale offered to a customer. */",
          "export interface ISale {",
          "  price: number;",
          "}",
          "",
          "export function total(sale: ISale): number {",
          "  return sale.price;",
          "}",
          "",
        ].join("\n"),
      },
    });
    try {
      const result = runCheck(project.directory);
      assertStatus(
        result,
        0,
        "Selecting only types must exempt the undocumented callable and property.",
      );
      assertExcludes(
        result,
        "evidence/documented",
        "A narrowed selection must produce no finding outside it.",
      );
    } finally {
      project.cleanup();
    }
  };
