import fs from "node:fs";
import path from "node:path";

/**
 * Materializes the implementation layer one claim needs before it can activate.
 *
 * A claim is inactive while no file matching its globs declares a host of its
 * selected symbol kind, and an inactive claim never loads its references — so
 * deleting `disabled` from a scaffold-only workspace proves nothing at all. The
 * Evidence arm's instruction says the same thing in prose: each unlock waits
 * until the layer that hosts it is complete.
 *
 * These layers are deliberately the smallest thing that hosts a claim, and none
 * of them carries an `@evidence` tag. That is the point. The obligations a case
 * asserts are the ones a workspace that has _not_ satisfied them still owes, so
 * a claim that goes quiet when enabled fails instead of passing.
 *
 * Every layer is written into the materialized temporary workspace. Nothing
 * here writes to `benchmarks/evidence/template/**`, which is frozen.
 */
export const materializeClaimLayer = (props: {
  readonly workspace: string;
  readonly claim: string;
}): void => {
  const layer: ((workspace: string) => void) | undefined = LAYERS[props.claim];
  if (layer === undefined)
    throw new Error(
      `No host layer is defined for claim '${props.claim}'. The template declares a claim this suite does not know how to activate, so its gate would open onto an inactive claim and assert nothing.`,
    );
  layer(props.workspace);
};

/**
 * The host layer each configured claim needs, keyed by claim name.
 *
 * Keying on the configured name rather than on a position is what makes a
 * renamed or added claim a loud failure in {@link materializeClaimLayer} instead
 * of a silently skipped obligation.
 */
const LAYERS: Readonly<Record<string, (workspace: string) => void>> = {
  // A Prisma claim hosts on models, and the scaffold schema declares only a
  // generator and a datasource.
  "schema-models": (workspace: string): void =>
    append(
      path.join(workspace, "packages/backend/prisma/schema/main.prisma"),
      [
        "",
        "/// Stores one probe row for the activation walk.",
        "model benchmark_probe {",
        "  /// Primary key.",
        "  id String @id",
        "  /// Human-readable label.",
        "  label String",
        "}",
        "",
      ].join("\n"),
    ),

  // A `type` claim over the authored DTO directory hosts on exported
  // interfaces; the scaffold ships only the exclusion carrier, which is a
  // `const` and therefore a property host.
  "dto-types": (workspace: string): void => declareProbeDto(workspace),

  // The same population under the `property` selector. The carrier already
  // hosts, so the layer this claim really waits for is its Prisma reference:
  // without a model there are no columns to owe.
  "dto-properties": (workspace: string): void => declareProbeDto(workspace),

  // Already hosted by the scaffold: `HealthController.get` is a public class
  // callable, which the `function` selector chooses.
  "api-operations": (): void => {},

  // Already hosted by the scaffold: `test_api_health` is an exported function
  // under `test/features/`.
  "backend-tests": (): void => {},

  // The hooks directory does not exist in the scaffold at all, so the claim
  // matches no file until a domain hook is written.
  "frontend-hooks": (workspace: string): void =>
    write(
      path.join(workspace, "packages/frontend/src/lib/probe/hooks.ts"),
      [
        "/** Returns the probe label rendered by the probe screen. */",
        "export function useProbeLabel(): string {",
        '  return "probe";',
        "}",
        "",
      ].join("\n"),
    ),

  // The screen population selects page components in domain folders; the
  // scaffold ships only the exclusion carrier, which is a property host.
  "frontend-screens": (workspace: string): void =>
    write(
      path.join(
        workspace,
        "packages/frontend/src/components/probe/probe-page.tsx",
      ),
      [
        'import { useProbeLabel } from "@/lib/probe/hooks";',
        "",
        "/** Renders the probe screen for the activation walk. */",
        "export function ProbePage() {",
        "  return <main>{useProbeLabel()}</main>;",
        "}",
        "",
      ].join("\n"),
    ),

  // Already hosted by the scaffold: `journey_scaffold_loads` is an exported
  // function under `tests/journeys/`.
  "frontend-journeys": (): void => {},
};

/**
 * Declares one authored DTO and publishes it from the flat structures barrel.
 *
 * The barrel export is not decoration. The backend Program reaches the API
 * package through its entry, so a structures file nothing re-exports is not in
 * the Program the claim populates from, and the claim would stay inactive with
 * the file sitting right there on disk.
 */
const declareProbeDto = (workspace: string): void => {
  const structures: string = path.join(
    workspace,
    "packages/api/src/structures",
  );
  write(
    path.join(structures, "IBenchmarkProbe.ts"),
    [
      "/** One probe contract used by the activation walk. */",
      "export interface IBenchmarkProbe {",
      "  /** Primary key mirrored from the probe model. */",
      "  id: string;",
      "",
      "  /** Human-readable label mirrored from the probe model. */",
      "  label: string;",
      "}",
      "",
    ].join("\n"),
  );
  const barrel: string = path.join(structures, "index.ts");
  const source: string = fs.readFileSync(barrel, "utf8");
  if (source.includes("./IBenchmarkProbe")) return;
  append(barrel, 'export * from "./IBenchmarkProbe";\n');
};

const write = (location: string, content: string): void => {
  fs.mkdirSync(path.dirname(location), { recursive: true });
  fs.writeFileSync(location, content, "utf8");
};

const append = (location: string, content: string): void =>
  fs.appendFileSync(location, content, "utf8");
