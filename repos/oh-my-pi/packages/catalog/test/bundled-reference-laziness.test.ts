import { describe, expect, test } from "bun:test";
import { TempDir } from "@oh-my-pi/pi-utils";
import { createReferenceResolver } from "../src/provider-models/bundled-references";
import type { ModelSpec } from "../src/types";

const FIXTURE = `${import.meta.dir}/fixtures/bundled-reference-laziness.ts`;

async function runFixture(fixture: string): Promise<string> {
	const tempDir = TempDir.createSync("@pi-catalog-bundled-reference-laziness-");
	const resultPath = tempDir.join("result.json");
	try {
		const result = Bun.spawnSync({
			cmd: [process.execPath, fixture],
			env: { ...process.env, OMP_CATALOG_LAZINESS_RESULT_PATH: resultPath },
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(result.exitCode, result.stderr.toString()).toBe(0);
		return await Bun.file(resultPath).text();
	} finally {
		tempDir.removeSync();
	}
}

describe("bundled reference laziness", () => {
	test("constructing bundled model-manager options retains less than 8 MiB of RSS", async () => {
		const { retainedRssBytes } = JSON.parse(await runFixture(FIXTURE)) as { retainedRssBytes: number };
		expect(retainedRssBytes).toBeLessThan(8 * 1024 * 1024);
	}, 60_000);

	test("a lazy provider-reference factory initializes on first resolution and only once", () => {
		const reference = {
			id: "fixture-model",
			name: "Fixture Model",
			api: "openai-completions",
			provider: "fixture",
			baseUrl: "https://example.test/v1",
			reasoning: false,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 8192,
			maxTokens: 1024,
		} satisfies ModelSpec<"openai-completions">;
		let factoryCalls = 0;
		const resolveReference = createReferenceResolver(() => {
			factoryCalls++;
			return new Map([[reference.id, reference]]);
		});

		expect(factoryCalls).toBe(0);
		expect(resolveReference(reference.id)).toBe(reference);
		expect(resolveReference(reference.id)).toBe(reference);
		expect(factoryCalls).toBe(1);
	});
});
